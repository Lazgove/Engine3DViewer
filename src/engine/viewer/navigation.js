import { Coord2D, CoordDistance2D, SubCoord2D } from '../geometry/coord2d.js';
import { CoordDistance3D, CrossVector3D, SubCoord3D, VectorAngle3D } from '../geometry/coord3d.js';
import { DegRad, IsGreater, IsLower, IsZero } from '../geometry/geometry.js';
import { ParabolicTweenFunction, TweenCoord3D } from '../geometry/tween.js';
import { CameraIsEqual3D, NavigationMode } from './camera.js';
import { GetDomElementClientCoordinates } from './domutils.js';
import * as THREE from 'three';

export class MouseInteraction {
    constructor() {
        this.prev = new Coord2D(0.0, 0.0);
        this.curr = new Coord2D(0.0, 0.0);
        this.diff = new Coord2D(0.0, 0.0);
        this.buttons = [];
    }

    Down(canvas, ev) {
        this.buttons.push(ev.which);
        this.curr = this.GetPositionFromEvent(canvas, ev);
        this.prev = this.curr.Clone();
    }

    Move(canvas, ev) {
        this.curr = this.GetPositionFromEvent(canvas, ev);
        this.diff = SubCoord2D(this.curr, this.prev);
        this.prev = this.curr.Clone();
    }

    Up(canvas, ev) {
        let buttonIndex = this.buttons.indexOf(ev.which);
        if (buttonIndex !== -1) {
            this.buttons.splice(buttonIndex, 1);
        }
        this.curr = this.GetPositionFromEvent(canvas, ev);
    }

    Leave(canvas, ev) {
        this.buttons = [];
        this.curr = this.GetPositionFromEvent(canvas, ev);
    }

    IsButtonDown() {
        return this.buttons.length > 0;
    }

    GetButton() {
        let length = this.buttons.length;
        if (length === 0) {
            return 0;
        }
        return this.buttons[length - 1];
    }

    GetPosition() {
        return this.curr;
    }

    GetMoveDiff() {
        return this.diff;
    }

    GetPositionFromEvent(canvas, ev) {
        return GetDomElementClientCoordinates(canvas, ev.clientX, ev.clientY);
    }
}

export class TouchInteraction {
    constructor() {
        this.prevPos = new Coord2D(0.0, 0.0);
        this.currPos = new Coord2D(0.0, 0.0);
        this.diffPos = new Coord2D(0.0, 0.0);
        this.prevDist = 0.0;
        this.currDist = 0.0;
        this.diffDist = 0.0;
        this.fingers = 0;
    }

    Start(canvas, ev) {
        if (ev.touches.length === 0) {
            return;
        }

        this.fingers = ev.touches.length;

        this.currPos = this.GetPositionFromEvent(canvas, ev);
        this.prevPos = this.currPos.Clone();

        this.currDist = this.GetTouchDistanceFromEvent(canvas, ev);
        this.prevDist = this.currDist;
    }

    Move(canvas, ev) {
        if (ev.touches.length === 0) {
            return;
        }

        this.currPos = this.GetPositionFromEvent(canvas, ev);
        this.diffPos = SubCoord2D(this.currPos, this.prevPos);
        this.prevPos = this.currPos.Clone();

        this.currDist = this.GetTouchDistanceFromEvent(canvas, ev);
        this.diffDist = this.currDist - this.prevDist;
        this.prevDist = this.currDist;
    }

    End(canvas, ev) {
        if (ev.touches.length === 0) {
            return;
        }

        this.fingers = 0;
        this.currPos = this.GetPositionFromEvent(canvas, ev);
        this.currDist = this.GetTouchDistanceFromEvent(canvas, ev);
    }

    IsFingerDown() {
        return this.fingers !== 0;
    }

    GetFingerCount() {
        return this.fingers;
    }

    GetPosition() {
        return this.currPos;
    }

    GetMoveDiff() {
        return this.diffPos;
    }

    GetDistanceDiff() {
        return this.diffDist;
    }

    GetPositionFromEvent(canvas, ev) {
        let coord = null;
        if (ev.touches.length !== 0) {
            let touchEv = ev.touches[0];
            coord = GetDomElementClientCoordinates(canvas, touchEv.pageX, touchEv.pageY);
        }
        return coord;
    }

    GetTouchDistanceFromEvent(canvas, ev) {
        if (ev.touches.length !== 2) {
            return 0.0;
        }
        let touchEv1 = ev.touches[0];
        let touchEv2 = ev.touches[1];
        let distance = CoordDistance2D(
            GetDomElementClientCoordinates(canvas, touchEv1.pageX, touchEv1.pageY),
            GetDomElementClientCoordinates(canvas, touchEv2.pageX, touchEv2.pageY)
        );
        return distance;
    }
}

export class ClickDetector {
    constructor() {
        this.isClick = false;
        this.startPosition = null;
    }

    Start(startPosition) {
        this.isClick = true;
        this.startPosition = startPosition;
    }

    Move(currentPosition) {
        if (!this.isClick) {
            return;
        }

        if (this.startPosition !== null) {
            const maxClickDistance = 3.0;
            const currentDistance = CoordDistance2D(this.startPosition, currentPosition);
            if (currentDistance > maxClickDistance) {
                this.Cancel();
            }
        } else {
            this.Cancel();
        }
    }

    End() {
        this.startPosition = null;
    }

    Cancel() {
        this.isClick = false;
        this.startPosition = null;
    }

    IsClick() {
        return this.isClick;
    }
}

export const NavigationType = {
    None: 0,
    Orbit: 1,
    Pan: 2,
    Zoom: 3
};

export class Navigation {
    constructor(canvas, camera, callbacks) {
        this.canvas = canvas;
        this.camera = camera;
        this.callbacks = callbacks;
        this.navigationMode = NavigationMode.FixedUpVector;

        this.mouse = new MouseInteraction();
        this.touch = new TouchInteraction();
        this.clickDetector = new ClickDetector();

        this.onMouseClick = null;
        this.onMouseMove = null;
        this.onContext = null;
        this.distance = null;

        this.minimumDistance = 0; // Default minimum distance
        this.maximumDistance = 0; // Default maximum distance
        this.minimumDistanceInit = 0; // Initial minimum distance
        this.cameraMoveCallback = null; // Camera movement callback

        this.isAnimating = false; // Animation flag

        if (this.canvas.addEventListener) {
            this.canvas.addEventListener('mousedown', this.OnMouseDown.bind(this));
            this.canvas.addEventListener('wheel', this.OnMouseWheel.bind(this));
            this.canvas.addEventListener('touchstart', this.OnTouchStart.bind(this));
            this.canvas.addEventListener('touchmove', this.OnTouchMove.bind(this));
            this.canvas.addEventListener('touchcancel', this.OnTouchEnd.bind(this));
            this.canvas.addEventListener('touchend', this.OnTouchEnd.bind(this));
            this.canvas.addEventListener('contextmenu', this.OnContextMenu.bind(this));
        }
        if (document.addEventListener) {
            document.addEventListener('mousemove', this.OnMouseMove.bind(this));
            document.addEventListener('mouseup', this.OnMouseUp.bind(this));
            document.addEventListener('mouseleave', this.OnMouseLeave.bind(this));
        }
    }

    SetMouseClickHandler(onMouseClick) {
        this.onMouseClick = onMouseClick;
    }

    SetMouseMoveHandler(onMouseMove) {
        this.onMouseMove = onMouseMove;
    }

    SetContextMenuHandler(onContext) {
        this.onContext = onContext;
    }

    GetNavigationMode() {
        return this.navigationMode;
    }

    SetNavigationMode(navigationMode) {
        this.navigationMode = navigationMode;
    }

    GetCamera() {
        return this.camera;
    }

    SetCamera(camera) {
        this.camera = camera;
    }

    MoveCamera(newCamera, stepCount) {
        function Step(obj, steps, count, index) {
            obj.camera.eye = steps.eye[index];
            obj.camera.center = steps.center[index];
            obj.camera.up = steps.up[index];
            obj.Update();

            if (index < count - 1) {
                requestAnimationFrame(() => {
                    Step(obj, steps, count, index + 1);
                });
            }
        }

        if (newCamera === null) {
            return;
        }

        if (stepCount === 0 || CameraIsEqual3D(this.camera, newCamera)) {
            this.camera = newCamera;
        } else {
            let tweenFunc = ParabolicTweenFunction;
            let steps = {
                eye: TweenCoord3D(this.camera.eye, newCamera.eye, stepCount, tweenFunc),
                center: TweenCoord3D(this.camera.center, newCamera.center, stepCount, tweenFunc),
                up: TweenCoord3D(this.camera.up, newCamera.up, stepCount, tweenFunc)
            };
            requestAnimationFrame(() => {
                Step(this, steps, stepCount, 0);
            });
        }

        this.Update();
    }

    GetFitToSphereCamera(center, radius, init = false) {
        if (IsZero(radius)) return null;
    
        const fitCamera = this.camera.Clone();
        const centerEyeDirection = SubCoord3D(fitCamera.eye, center).Normalize();
        const aspectRatio = this.canvas.width / this.canvas.height;
        const fieldOfView = (this.camera.fov / 2) * (aspectRatio < 1 ? aspectRatio : 1);
        const distance = radius / Math.sin(fieldOfView * DegRad);
        
        const currentDistance = this.GetCameraDistanceFromCenter(center);
        //console.log(`distance: ${distance}, minimumDistance: ${this.minimumDistance}, currentCamera: ${currentDistance}`);
    
        if (init) {
            this.minimumDistanceInit = distance;
            this.maximumDistance = distance * 5; // Set maximum distance to twice the initial distance
            console.log("maximumDistance: " + this.maximumDistance);
        }
    
        if (distance >= currentDistance) {
            fitCamera.eye = fitCamera.center.Clone().Offset(centerEyeDirection, distance);
            this.minimumDistance = distance;
            return fitCamera;
        }
    
        this.minimumDistance = distance;
        return this.camera;
    }
    
    GetCameraDistanceFromCenter(center) {
        return new THREE.Vector3(this.camera.eye.x, this.camera.eye.y, this.camera.eye.z)
            .distanceTo(new THREE.Vector3(center.x, center.y, center.z));
    }

    OnMouseDown(ev) {
        ev.preventDefault();

        this.mouse.Down(this.canvas, ev);
        this.clickDetector.Start(this.mouse.GetPosition());
    }

    OnMouseMove(ev) {
        this.mouse.Move(this.canvas, ev);
        this.clickDetector.Move(this.mouse.GetPosition());
        if (this.onMouseMove) {
            let mouseCoords = GetDomElementClientCoordinates(this.canvas, ev.clientX, ev.clientY);
            this.onMouseMove(mouseCoords);
        }

        if (!this.mouse.IsButtonDown()) {
            return;
        }

        let moveDiff = this.mouse.GetMoveDiff();
        let mouseButton = this.mouse.GetButton();

        let navigationType = NavigationType.None;
        if (mouseButton === 1) {
            if (ev.ctrlKey) {
                navigationType = NavigationType.Zoom;
            } else {
                navigationType = NavigationType.Orbit;
            }
        } else if (mouseButton === 2 || mouseButton === 3) {
            // Disable panning
            // navigationType = NavigationType.Pan;
        }

        if (navigationType === NavigationType.Orbit) {
            let orbitRatio = 0.5;
            this.Orbit(moveDiff.x * orbitRatio, moveDiff.y * orbitRatio);
        } else if (navigationType === NavigationType.Zoom) {
            let zoomRatio = 0.005;
            this.Zoom(-moveDiff.y * zoomRatio);
        }

        this.Update();
    }

    OnMouseUp(ev) {
        this.mouse.Up(this.canvas, ev);
        this.clickDetector.End();

        if (this.clickDetector.IsClick()) {
            let mouseCoords = this.mouse.GetPosition();
            this.Click(ev.which, mouseCoords);
        }
    }

    OnMouseLeave(ev) {
        this.mouse.Leave(this.canvas, ev);
        this.clickDetector.Cancel();
    }

    OnTouchStart(ev) {
        ev.preventDefault();

        this.touch.Start(this.canvas, ev);
        this.clickDetector.Start(this.touch.GetPosition());
    }

    OnTouchMove(ev) {
        ev.preventDefault();

        this.touch.Move(this.canvas, ev);
        this.clickDetector.Move(this.touch.GetPosition());
        if (!this.touch.IsFingerDown()) {
            return;
        }

        let moveDiff = this.touch.GetMoveDiff();
        let distanceDiff = this.touch.GetDistanceDiff();
        let fingerCount = this.touch.GetFingerCount();

        let navigationType = NavigationType.None;
        if (fingerCount === 1) {
            navigationType = NavigationType.Orbit;
        } else if (fingerCount === 2) {
            navigationType = NavigationType.Zoom;
        }

        if (navigationType === NavigationType.Orbit) {
            let orbitRatio = 0.5;
            this.Orbit(moveDiff.x * orbitRatio, moveDiff.y * orbitRatio);
        } else if (navigationType === NavigationType.Zoom) {
            let zoomRatio = 0.005;
            console.log("CALLED BY TOUCH");
            this.Zoom(distanceDiff * zoomRatio);
        }

        this.Update();
    }

    OnTouchEnd(ev) {
        ev.preventDefault();

        this.touch.End(this.canvas, ev);
        this.clickDetector.End();

        if (this.clickDetector.IsClick()) {
            let touchCoords = this.touch.GetPosition();
            if (this.touch.GetFingerCount() === 1) {
                this.Click(1, touchCoords);
            }
        }
    }

    OnContextMenu(ev) {
        ev.preventDefault();

        if (this.clickDetector.IsClick()) {
            this.Context(ev.clientX, ev.clientY);
            this.clickDetector.Cancel();
        }
    }

    Orbit(angleX, angleY) {
        let radAngleX = angleX * DegRad;
        let radAngleY = angleY * DegRad;

        let viewDirection = SubCoord3D(this.camera.center, this.camera.eye).Normalize();
        let horizontalDirection = CrossVector3D(viewDirection, this.camera.up).Normalize();

        if (this.navigationMode === NavigationMode.FixedUpVector) {
            let originalAngle = VectorAngle3D(viewDirection, this.camera.up);
            let newAngle = originalAngle + radAngleY;
            if (IsGreater(newAngle, 0.0) && IsLower(newAngle, Math.PI)) {
                this.camera.eye.Rotate(horizontalDirection, -radAngleY, this.camera.center);
            }
            this.camera.eye.Rotate(this.camera.up, -radAngleX, this.camera.center);
        } else if (this.navigationMode === NavigationMode.FreeOrbit) {
            let verticalDirection = CrossVector3D(horizontalDirection, viewDirection).Normalize();
            this.camera.eye.Rotate(horizontalDirection, -radAngleY, this.camera.center);
            this.camera.eye.Rotate(verticalDirection, -radAngleX, this.camera.center);
            this.camera.up = verticalDirection;
        }
    }

    // Disable the Pan method
    // Pan(moveX, moveY) {
    //     let viewDirection = SubCoord3D(this.camera.center, this.camera.eye).Normalize();
    //     let horizontalDirection = CrossVector3D(viewDirection, this.camera.up).Normalize();
    //     let verticalDirection = CrossVector3D(horizontalDirection, viewDirection).Normalize();

    //     this.camera.eye.Offset(horizontalDirection, -moveX);
    //     this.camera.center.Offset(horizontalDirection, -moveX);

    //     this.camera.eye.Offset(verticalDirection, moveY);
    //     this.camera.center.Offset(verticalDirection, moveY);
    // }

    OnMouseWheel(ev) {
        let params = ev || window.event;
        params.preventDefault();
        
        if (this.isAnimating) return; // Prevent new zoom while animating
        
        let delta = -params.deltaY / 40;
        let ratio = delta < 0 ? -0.1 : 0.1; // Adjust zoom in/out
        
        this.Zoom(ratio);
    }
    
    Zoom(ratio) {
        if (this.isAnimating) return;
    
        let direction = SubCoord3D(this.camera.center, this.camera.eye);
        let distance = direction.Length();
        let move = distance * ratio;
    
        // // Ensure the new minimum distance accounts for bounding sphere size
        // let effectiveMinDistance = Math.max(this.minimumDistance, this.minimumDistanceInit); 
    
        if (distance - move <= this.minimumDistance) {
            move = distance - this.minimumDistance;
            //if (move <= 0) return; // Prevent zooming in too much
        }

        if (distance - move >= this.maximumDistance) {
            move = distance - this.maximumDistance;
            //if (move <= 0) return; // Prevent zooming in too much
        }
    
        if (Math.abs(move) > 0.0001) {
            this.camera.eye.Offset(direction, move);
            this.Update();
        }
    }
    
    setMinimumDistance(minDistance) {
        this.minimumDistance = minDistance;
    }

    setCameraMoveCallback(callback) {
        this.cameraMoveCallback = callback;
    }

    Update() {
        this.callbacks.onUpdate();
    }

    Click(button, mouseCoords) {
        if (this.onMouseClick) {
            this.onMouseClick(button, mouseCoords);
        }
    }

    Context(clientX, clientY) {
        if (this.onContext) {
            let globalCoords = {
                x: clientX,
                y: clientY
            };
            let localCoords = GetDomElementClientCoordinates(this.canvas, clientX, clientY);
            this.onContext(globalCoords, localCoords);
        }
    }
}

function LinearTweenFunction(t) {
    return t;
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
