import { Coord3D, CoordDistance3D, SubCoord3D } from '../geometry/coord3d.js';
import { DegRad, Direction, IsEqual } from '../geometry/geometry.js';
import { ColorComponentToFloat } from '../model/color.js';
import { CreateHighlightMaterials, ShadingType, GetObjectHeight } from '../threejs/threeutils.js';
import { Camera, NavigationMode, ProjectionMode } from './camera.js';
import { GetDomElementInnerDimensions } from './domutils.js';
import { Navigation } from './navigation.js';
import { ShadingModel } from './shadingmodel.js';
import { ViewerModel, ViewerMainModel } from './viewermodel.js';
import { InitializeMasks } from './repere.js';
import gsap from 'gsap';

import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';

export function GetDefaultCamera (direction)
{
    let fieldOfView = 45.0;
    if (direction === Direction.X) {
        return new Camera (
            new Coord3D (2.0, -3.0, 1.5),
            new Coord3D (0.0, 0.0, 0.0),
            new Coord3D (1.0, 0.0, 0.0),
            fieldOfView
        );
    } else if (direction === Direction.Y) {
        return new Camera (
            new Coord3D (-1.5, 2.0, 3.0),
            new Coord3D (0.0, 0.0, 0.0),
            new Coord3D (0.0, 1.0, 0.0),
            fieldOfView
        );
    } else if (direction === Direction.Z) {
        return new Camera (
            new Coord3D (-1.5, -3.0, 2.0),
            new Coord3D (0.0, 0.0, 0.0),
            new Coord3D (0.0, 0.0, 1.0),
            fieldOfView
        );
    }
    return null;
}

export function TraverseThreeObject (object, processor)
{
    if (!processor (object)) {
        return false;
    }
    for (let child of object.children) {
        if (!TraverseThreeObject (child, processor)) {
            return false;
        }
    }
    return true;
}

export function GetShadingTypeOfObject (mainObject)
{
    let shadingType = null;
    TraverseThreeObject (mainObject, (obj) => {
        if (obj.isMesh) {
            for (const material of obj.material) {
                if (material.type === 'MeshPhongMaterial') {
                    shadingType = ShadingType.Phong;
                } else if (material.type === 'MeshStandardMaterial') {
                    shadingType = ShadingType.Physical;
                }
                return false;
            }
        }
        return true;
    });
    return shadingType;
}

export class CameraValidator
{
    constructor ()
    {
        this.eyeCenterDistance = 0.0;
        this.forceUpdate = true;
    }

    ForceUpdate ()
    {
        this.forceUpdate = true;
    }

    ValidatePerspective ()
    {
        if (this.forceUpdate) {
            this.forceUpdate = false;
            return false;
        }
        return true;
    }

    ValidateOrthographic (eyeCenterDistance)
    {
        if (this.forceUpdate || !IsEqual (this.eyeCenterDistance, eyeCenterDistance)) {
            this.eyeCenterDistance = eyeCenterDistance;
            this.forceUpdate = false;
            return false;
        }
        return true;
    }
}

export class UpVector
{
    constructor ()
    {
        this.direction = Direction.Y;
        this.isFixed = true;
        this.isFlipped = false;
    }

    SetDirection (newDirection, oldCamera)
    {
        this.direction = newDirection;
        this.isFlipped = false;
        console.log("set direction", typeof this.direction);
        console.log("set direction", this.direction);
        let defaultCamera = GetDefaultCamera (this.direction);
        let defaultDir = SubCoord3D (defaultCamera.eye, defaultCamera.center);

        let distance = CoordDistance3D (oldCamera.center, oldCamera.eye);
        let newEye = oldCamera.center.Clone ().Offset (defaultDir, distance);

        let newCamera = oldCamera.Clone ();
        if (this.direction === Direction.X) {
            newCamera.up = new Coord3D (1.0, 0.0, 0.0);
            newCamera.eye = newEye;
        } else if (this.direction === Direction.Y) {
            newCamera.up = new Coord3D (0.0, 1.0, 0.0);
            newCamera.eye = newEye;
        } else if (this.direction === Direction.Z) {
            newCamera.up = new Coord3D (0.0, 0.0, 1.0);
            newCamera.eye = newEye;
        }
        return newCamera;
    }

    SetFixed (isFixed, oldCamera)
    {
        this.isFixed = isFixed;
        if (this.isFixed) {
            return this.SetDirection (this.direction, oldCamera);
        }
        return null;
    }

    Flip (oldCamera)
    {
        this.isFlipped = !this.isFlipped;
        let newCamera = oldCamera.Clone ();
        newCamera.up.MultiplyScalar (-1.0);
        return newCamera;
    }
}

export class Viewer
{
    constructor ()
    {
        THREE.ColorManagement.enabled = false;

        this.canvas = null;
        this.renderer = null;
        this.scene = null;
        this.mainModel = null;
        this.extraModel = null;
        this.camera = null;
        this.defaultCameraParameters = null;
        this.projectionMode = null;
        this.cameraValidator = null;
        this.shadingModel = null;
        this.navigation = null;
        this.upVector = null;
        this.repere = null;
        this.vignette = null;
        this.settings = {
            animationSteps : 40
        };

        this.mainObject = null;
        this.boundingSphere = null;
        this.boundingBox = null;
        this.centerBbox = null;
        this.size = null;
        this.rotationSpeed = 0; // Rotation speed in radians per frame
        this.isEasing = false;
        this.isAnimating = false;
        this.isRotating = true;
        this.targetSpeed = 20;
        this.easingFactor = 0.05;
        this.raycaster = new THREE.Raycaster();
        this.dragPlane = new THREE.Plane();
        this.intersectionPoint = new THREE.Vector3();
        this.dragOffset = new THREE.Vector3();
        this.targetPosition = new THREE.Vector3();

        this.initialCameraView = null; // Property to store the initial camera view

        this.animate = this.animate.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);

        this.controls = null;
        this.selectedObject = null;
        this.originalMaterial = null;
    }

    SetupThreePointLighting() {
        const mainObject = this.mainModel.GetMainObject().GetRootObject();
        const boundingBox = new THREE.Box3().setFromObject(mainObject);
        const center = boundingBox.getCenter(new THREE.Vector3());
        const size = boundingBox.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z);

        // Key Light
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
        keyLight.position.set(center.x + maxDimension, center.y + maxDimension, center.z + maxDimension);
        keyLight.castShadow = true;
        this.scene.add(keyLight);

        // Fill Light
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
        fillLight.position.set(center.x - maxDimension, center.y + maxDimension, center.z + maxDimension);
        this.scene.add(fillLight);

        // Back Light (Red)
        const backLight = new THREE.DirectionalLight(0xffffff, 0.1);
        backLight.position.set(center.x, center.y + maxDimension, center.z - maxDimension);
        this.scene.add(backLight);
    }

    Init (canvas)
    {
        this.canvas = canvas;
        this.canvas.id = 'viewer';

        let parameters = {
            canvas : this.canvas,
            antialias : true
        };

        this.renderer = new THREE.WebGLRenderer (parameters);
        this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

        if (window.devicePixelRatio) {
            this.renderer.setPixelRatio (window.devicePixelRatio);
        }
        this.renderer.setClearColor ('#ffffff', 1.0);
        this.renderer.setSize (this.canvas.width, this.canvas.height);

        this.scene = new THREE.Scene ();
        this.mainModel = new ViewerMainModel (this.scene);
        this.extraModel = new ViewerModel (this.scene);

        this.activeTweens = new Map(); // Store active animations per mesh

        this.InitNavigation ();
        this.InitShading ();
        this.InitMasks ();
        this.InitPostProcessing();

        this.Render ();

        // Start the animation loop after initialization
        this.animate();
    }

    SetBoudingSphere(boundingSphere) {
        this.boundingSphere = boundingSphere;
    }

    SetMouseClickHandler (onMouseClick)
    {
        this.navigation.SetMouseClickHandler (onMouseClick);
    }

    SetMouseMoveHandler (onMouseMove)
    {
        this.navigation.SetMouseMoveHandler (onMouseMove);
    }

    SetContextMenuHandler (onContext)
    {
        this.navigation.SetContextMenuHandler (onContext);
    }

    SetEdgeSettings (edgeSettings)
    {
        let newEdgeSettings = edgeSettings.Clone ();
        this.mainModel.SetEdgeSettings (newEdgeSettings);
        this.Render ();
    }

    SetEnvironmentMapSettings (environmentSettings)
    {
        let newEnvironmentSettings = environmentSettings.Clone ();
        this.shadingModel.SetEnvironmentMapSettings (newEnvironmentSettings, () => {
            this.Render ();
        });
        this.shadingModel.UpdateShading ();
        this.Render ();
    }

    SetBackgroundColor (color)
    {
        let bgColor = new THREE.Color (
            ColorComponentToFloat (color.r),
            ColorComponentToFloat (color.g),
            ColorComponentToFloat (color.b)
        );
        let alpha = ColorComponentToFloat (color.a);
        this.renderer.setClearColor (bgColor, alpha);
        this.Render ();
    }

    GetCanvas ()
    {
        return this.canvas;
    }

    GetScene () {
        return this.scene;
    }

    GetObject () {
        return this.mainModel.GetMainObject().GetRootObject();
    }

    GetRenderer ()
    {
        return this.renderer;
    }

    GetRepere ()
    {
        return this.repere;
    }

    GetVignette ()
    {
        return this.vignette;
    }

    GetCamera ()
    {
        return this.navigation.GetCamera ();
    }

    GetProjectionMode ()
    {
        return this.projectionMode;
    }

    SetCamera (camera)
    {
        this.navigation.SetCamera (camera);
        this.cameraValidator.ForceUpdate ();
        this.Render ();
    }

    SetDefaultCameraParmeters (cameraParameters) {
        this.defaultCameraParameters = cameraParameters;
    }

    SetProjectionMode (projectionMode)
    {
        if (this.projectionMode === projectionMode) {
            return;
        }

        this.scene.remove (this.camera);
        if (projectionMode === ProjectionMode.Perspective) {
            this.camera = new THREE.PerspectiveCamera (45.0, 1.0, 0.1, 1000.0);
        } else if (projectionMode === ProjectionMode.Orthographic) {
			this.camera = new THREE.OrthographicCamera (-1.0, 1.0, 1.0, -1.0, 0.1, 1000.0);
        }
        this.scene.add (this.camera);

        this.projectionMode = projectionMode;
        this.shadingModel.SetProjectionMode (projectionMode);
        this.cameraValidator.ForceUpdate ();

        this.AdjustClippingPlanes ();
        this.Render ();
    }

    RecenterCamera ()
    {
        this.navigation.MoveCamera (this.defaultCameraParameters, 20 ? this.settings.animationSteps : 20);
        this.Render();
    }

    Resize (width, height)
    {
        let innerSize = GetDomElementInnerDimensions (this.canvas, width, height);
        this.ResizeRenderer (innerSize.width, innerSize.height);
    }

    ResizeRenderer (width, height)
    {
        if (window.devicePixelRatio) {
            this.renderer.setPixelRatio (window.devicePixelRatio);
        }
        this.renderer.setSize (width, height);
        this.cameraValidator.ForceUpdate ();
        this.Render ();
    }

    FitSphereToWindow(boundingSphere, animation, duration = 0, init = false) {
        if (!boundingSphere) return;
    
        const center = init 
            ? new Coord3D(boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z) 
            : new Coord3D(0, 0, 0);
    
        const radius = boundingSphere.radius;
        const newCamera = this.navigation.GetFitToSphereCamera(center, radius, init);
    
        this.defaultCameraParameters = newCamera.Clone();
        this.navigation.MoveCamera(newCamera, animation ? this.settings.animationSteps : duration);
    }

    AdjustClippingPlanes ()
    {
        let boundingSphere = this.GetBoundingSphere ((meshUserData) => {
            return true;
        });
        this.AdjustClippingPlanesToSphere (boundingSphere);
    }

    AdjustClippingPlanesToSphere (boundingSphere)
    {
        if (boundingSphere === null) {
            return;
        }
        if (boundingSphere.radius < 10.0) {
            this.camera.near = 0.01;
            this.camera.far = 100.0;
        } else if (boundingSphere.radius < 100.0) {
            this.camera.near = 0.1;
            this.camera.far = 1000.0;
        } else if (boundingSphere.radius < 1000.0) {
            this.camera.near = 10.0;
            this.camera.far = 10000.0;
        } else {
            this.camera.near = 100.0;
            this.camera.far = 1000000.0;
        }

        this.cameraValidator.ForceUpdate ();
        this.Render ();
    }

    GetNavigationMode ()
    {
        return this.navigation.GetNavigationMode ();
    }

    SetNavigationMode (navigationMode)
    {
        let oldCamera = this.navigation.GetCamera ();
        let newCamera = this.upVector.SetFixed (navigationMode === NavigationMode.FixedUpVector, oldCamera);
        this.navigation.SetNavigationMode (navigationMode);
        if (newCamera !== null) {
            this.navigation.MoveCamera (newCamera, this.settings.animationSteps);
        }
        this.Render ();
    }

    SetUpVector (upDirection, animate)
    {
        let oldCamera = this.navigation.GetCamera ();
        let newCamera = this.upVector.SetDirection (upDirection, oldCamera);
        let animationSteps = animate ? this.settings.animationSteps : 0;
        this.navigation.MoveCamera (newCamera, animationSteps);
        this.Render ();
    }

    FlipUpVector ()
    {
        let oldCamera = this.navigation.GetCamera ();
        let newCamera = this.upVector.Flip (oldCamera);
        this.navigation.MoveCamera (newCamera, 0);
        this.Render ();
    }

    InitPostProcessing() {
        const composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        composer.addPass(renderPass);
    
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        bloomPass.threshold = 0;
        bloomPass.strength = 0.1;
        bloomPass.radius = 0;
        composer.addPass(bloomPass);
    
        const filmPass = new FilmPass(0.35, 0.025, 648, false);
        composer.addPass(filmPass);
    
        this.composer = composer;
    }

    Render ()
    {
        let navigationCamera = this.navigation.GetCamera ();

        this.camera.position.set (navigationCamera.eye.x, navigationCamera.eye.y, navigationCamera.eye.z);
        this.camera.up.set (navigationCamera.up.x, navigationCamera.up.y, navigationCamera.up.z);
        this.camera.lookAt (new THREE.Vector3 (navigationCamera.center.x, navigationCamera.center.y, navigationCamera.center.z));

        if (this.projectionMode === ProjectionMode.Perspective) {
            if (!this.cameraValidator.ValidatePerspective ()) {
                this.camera.aspect = this.canvas.width / this.canvas.height;
                this.camera.fov = navigationCamera.fov;
                this.camera.updateProjectionMatrix ();
            }
        } else if (this.projectionMode === ProjectionMode.Orthographic) {
            let eyeCenterDistance = CoordDistance3D (navigationCamera.eye, navigationCamera.center);
            if (!this.cameraValidator.ValidateOrthographic (eyeCenterDistance)) {
                let aspect = this.canvas.width / this.canvas.height;
                let eyeCenterDistance = CoordDistance3D (navigationCamera.eye, navigationCamera.center);
                let frustumHalfHeight = eyeCenterDistance * Math.tan (0.5 * navigationCamera.fov * DegRad);
                this.camera.left = -frustumHalfHeight * aspect;
                this.camera.right = frustumHalfHeight * aspect;
                this.camera.top = frustumHalfHeight;
                this.camera.bottom = -frustumHalfHeight;
                this.camera.updateProjectionMatrix ();
            }
        }

        this.shadingModel.UpdateByCamera (navigationCamera);
        this.renderer.render (this.scene, this.camera);
        //this.composer.render();
    }

    SetMainObject(object) {
        const shadingType = GetShadingTypeOfObject(object);
        this.mainModel.SetMainObject(object);
        console.log("mainModel", this.mainModel);
        this.shadingModel.SetShadingType(shadingType);
    
        // Store the initial camera view
        this.initialCameraView = this.navigation.GetCamera().Clone();
    
        // Create a new group and set its position to (0, 0, 0)
        const boundingBox = new THREE.Box3().setFromObject(object);
        const center = boundingBox.getCenter(new THREE.Vector3());
        const group = new THREE.Group();
        group.position.set(0, 0, 0);
        this.scene.add(group);
        group.name = 'mainGroup';
    
        // Adjust the position of the mainObject and add it to the group
        object.position.sub(center);
        group.add(object);
    
        this.isAnimating = true;
        this.mainObject = group;
        const newBoundingBox = new THREE.Box3().setFromObject(object);
        this.boundingBox = newBoundingBox;
        const radius = this.boundingBox.getSize(new THREE.Vector3()).length() / 2;
    
        // Create the bounding sphere
        this.centerBbox = new THREE.Vector3(0, 0, 0);
        this.boundingSphere = new THREE.Sphere(this.centerBbox, radius);
        this.size = this.boundingBox.getSize(new THREE.Vector3());
    
        // Store initial positions and generate evenly spaced direction vectors
        this.initialPositions = [];
        this.directionVectors = [];
    
        let numChildren = 0;
        this.mainObject.traverse((child) => {
            if (child.isMesh && !child.userData.isAnnotation) {
                numChildren++;
            }
        });
    
        // Generate evenly spaced directions using Fibonacci Sphere
        for (let i = 0; i < numChildren; i++) {
            const theta = Math.acos(1 - (2 * (i + 0.5)) / numChildren); // Polar angle
            const phi = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5); // Azimuthal angle
    
            const x = Math.sin(theta) * Math.cos(phi);
            const y = Math.sin(theta) * Math.sin(phi);
            const z = Math.cos(theta);
    
            this.directionVectors.push(new THREE.Vector3(x, y, z).normalize());
        }
    
        let index = 0;
        this.mainObject.traverse((child) => {
            if (child.isMesh && !child.userData.isAnnotation) {
                this.initialPositions.push(child.position.clone());
                index++;
            }
        });
    
        console.log("Initial Positions:", this.initialPositions);
        console.log("Direction Vectors:", this.directionVectors);
    
        // Setup three-point lighting
        this.SetupThreePointLighting();
        this.CreateBoundingBoxMesh();
        this.CreateBoundingBoxesAndAnnotations();
        this.Render();
    }
    

    AddExtraObject (object)
    {
        this.extraModel.AddObject (object);
        this.Render ();
    }

    Clear ()
    {
        this.mainModel.Clear ();
        this.extraModel.Clear ();
        this.Render ();
    }

    ClearExtra ()
    {
        this.extraModel.Clear ();
        this.Render ();
    }

    SetMeshesVisibility (isVisible)
    {
        this.mainModel.EnumerateMeshesAndLines ((mesh) => {
            let visible = isVisible (mesh.userData);
            if (mesh.visible !== visible) {
                mesh.visible = visible;
            }
        });
        this.mainModel.EnumerateEdges ((edge) => {
            let visible = isVisible (edge.userData);
            if (edge.visible !== visible) {
                edge.visible = visible;
            }
        });
        this.Render ();
    }

    SetMeshesHighlight (highlightColor, isHighlighted)
    {
        let withPolygonOffset = this.mainModel.HasLinesOrEdges ();
        this.mainModel.EnumerateMeshesAndLines ((mesh) => {
            let highlighted = isHighlighted (mesh.userData);
            if (highlighted) {
                if (mesh.userData.threeMaterials === null) {
                    mesh.userData.threeMaterials = mesh.material;
                    mesh.material = CreateHighlightMaterials (mesh.userData.threeMaterials, highlightColor, withPolygonOffset);
                }
            } else {
                if (mesh.userData.threeMaterials !== null) {
                    mesh.material = mesh.userData.threeMaterials;
                    mesh.userData.threeMaterials = null;
                }
            }
        });

        this.Render ();
    }

    GetMeshUserDataUnderMouse (intersectionMode, mouseCoords)
    {
        let intersection = this.GetMeshIntersectionUnderMouse (intersectionMode, mouseCoords);
        if (intersection === null) {
            return null;
        }
        return intersection.object.userData;
    }

    GetMeshIntersectionUnderMouse (intersectionMode, mouseCoords)
    {
        let canvasSize = this.GetCanvasSize ();
        let intersection = this.mainModel.GetMeshIntersectionUnderMouse (intersectionMode, mouseCoords, this.camera, canvasSize.width, canvasSize.height);
        if (intersection === null) {
            return null;
        }
        return intersection;
    }

    GetBoundingBox (needToProcess)
    {
        return this.mainModel.GetBoundingBox (needToProcess);
    }

    GetBoundingSphere (needToProcess)
    {
        return this.mainModel.GetBoundingSphere (needToProcess);
    }

    EnumerateMeshesAndLinesUserData (enumerator)
    {
        this.mainModel.EnumerateMeshesAndLines ((mesh) => {
            enumerator (mesh.userData);
        });
    }

    InitNavigation ()
    {
        let camera = GetDefaultCamera (Direction.Y);
        this.camera = new THREE.PerspectiveCamera (45.0, 1.0, 0.1, 1000.0);
        this.projectionMode = ProjectionMode.Perspective;
        this.cameraValidator = new CameraValidator ();
        this.scene.add (this.camera);

        let canvasElem = this.renderer.domElement;
        this.navigation = new Navigation (canvasElem, camera, {
            onUpdate : () => {
                this.Render ();
            }
        });

        // // Set the camera movement callback
        // this.navigation.setCameraMoveCallback(() => {
        //     this.onCameraMove();
        // });

        this.upVector = new UpVector();
    }

    onCameraMove() {
        //this.UpdateCameraAndControls();
        console.log('Camera moved');
        // Add any additional logic you want to execute when the camera moves
    }

    InitShading  ()
    {
        this.shadingModel = new ShadingModel (this.scene);
    }

    GetShadingType ()
    {
        return this.shadingModel.type;
    }

    InitMasks () {
        const { vignette, repere } = InitializeMasks(this.GetScene(), this.GetCanvas());
        this.vignette = vignette;
        this.repere = repere;
        this.GetScene().add(this.vignette);
        this.GetScene().add(this.repere);
    }

    UpdateRepere() {
        this.GetScene().getObjectByName("repere").visible = this.repere.visible;
    }

    UpdateVignette() {
        this.GetScene().getObjectByName("vignette").visible = this.vignette.visible;
    }

    GetImageSize ()
    {
        let originalSize = new THREE.Vector2 ();
        this.renderer.getSize (originalSize);
        return {
            width : parseInt (originalSize.x, 10),
            height : parseInt (originalSize.y, 10)
        };
    }

    GetCanvasSize ()
    {
        let width = this.canvas.width;
        let height = this.canvas.height;
        if (window.devicePixelRatio) {
            width /= window.devicePixelRatio;
            height /= window.devicePixelRatio;
        }
        return {
            width : width,
            height : height
        };
    }

    GetImageAsDataUrl (width, height, isTransparent)
    {
        let originalSize = this.GetImageSize ();
        let renderWidth = width;
        let renderHeight = height;
        if (window.devicePixelRatio) {
            renderWidth /= window.devicePixelRatio;
            renderHeight /= window.devicePixelRatio;
        }
        let clearAlpha = this.renderer.getClearAlpha ();
        if (isTransparent) {
            this.renderer.setClearAlpha (0.0);
        }
        this.ResizeRenderer (renderWidth, renderHeight);
        this.Render ();
        let url = this.renderer.domElement.toDataURL ();
        this.ResizeRenderer (originalSize.width, originalSize.height);
        this.renderer.setClearAlpha (clearAlpha);
        return url;
    }

    Destroy ()
    {
        this.Clear ();
        this.renderer.dispose ();
    }

    animate() {
        requestAnimationFrame(this.animate);
    
        if (this.isAnimating && this.mainObject) {
            this.mainObject.rotation.y += (this.rotationSpeed * Math.PI / 180) * (1 / 60);
        }
    
        this.GetScene().traverse((child) => {
            if (child.userData.viewCam && child.userData.isAnnotation) {
                child.lookAt(this.camera.position);
            }
        });
    
        this.Render();
    }

    EaseInRotation() {
        this.isEasing = true;
        const easeIn = () => {
        if (this.rotationSpeed < this.targetSpeed && this.isRotating) {
            this.rotationSpeed += this.easingFactor * (this.targetSpeed - this.rotationSpeed);
            requestAnimationFrame(easeIn); 
        } else {
            this.rotationSpeed = this.targetSpeed; 
            this.isEasing = false;
        }
        };
        easeIn();
    }

    EaseOutRotation() {
        this.isEasing = true;
        const easeOut = () => {
        if (this.rotationSpeed > 0 && !this.isRotating) {
            this.rotationSpeed -= this.easingFactor * this.rotationSpeed;
            requestAnimationFrame(easeOut);
        } else {
            this.rotationSpeed = 0;
            this.isEasing = false;
            }
        };
        easeOut();
    }
    
    ExplodeModel(factor, duration = 0.5) {
        if (!this.mainObject) {
            console.error("Main object is not defined.");
            return;
        }
    
        // Define minimum and maximum explosion multipliers
        const minMultiplier = 0.2;
        const maxMultiplier = 1.5;
    
        // Compute max explosion distance and clamp it
        const maxExplosionDistance = THREE.MathUtils.clamp(
            this.boundingSphere.radius * 1.5,
            this.boundingSphere.radius * minMultiplier,
            this.boundingSphere.radius * maxMultiplier
        );
    
        // Scale explosion distance based on slider factor (0 to 100)
        const explosionDistance = (factor / 100) * maxExplosionDistance;
    
        if (!this.initialPositions || !this.directionVectors) {
            console.error("Initial positions or direction vectors are not defined.");
            return;
        }
    
        let index = 0;
        let totalMeshes = 0;
        let completedMeshes = 0;
        let animations = [];
    
        this.mainObject.traverse((child) => {
            if (child.userData.isAnnotation) {
                console.log("Annotation found, skipping:", child.name);
                return; // Skip annotations entirely
            }
        
            if (child.isMesh && !child.userData.isAnnotation) {
                console.log("Processing mesh:", child.name, "Index:", index);
        
                if (index >= this.directionVectors.length) {
                    console.log(`Index ${index} exceeds directionVectors array length (${this.directionVectors.length})`);
                    return; // Stop processing further to prevent errors
                }
        
                totalMeshes++;
        
                const direction = this.directionVectors[index].clone();
                const newPosition = this.initialPositions[index].clone().add(direction.multiplyScalar(explosionDistance));
                gsap.killTweensOf(child.position);
                animations.push(new Promise(resolve => {
                    gsap.to(child.position, {
                        x: newPosition.x,
                        y: newPosition.y,
                        z: newPosition.z,
                        duration: duration,
                        ease: "power2.out",
                        onComplete: resolve
                    });
                }));
        
                index++; // Only increment if we actually move the mesh
            }
        });
        Promise.all(animations).then(() => {
            console.log("All animations are complete");
            this.OptimizedCameraUpdate();
        });        
    }

    // Optimized camera update with throttling
    OptimizedCameraUpdate() {
        if (this.cameraUpdatePending) return;

        this.cameraUpdatePending = true;
        setTimeout(() => {
            this.UpdateCameraAndControls();
            this.cameraUpdatePending = false;
        }, 100);
    }
    
    // Throttled function to prevent excessive camera updates
    ThrottledCameraUpdate() {
        if (!this.cameraUpdatePending) {
            this.cameraUpdatePending = true;
            requestAnimationFrame(() => {
                this.UpdateCameraAndControls();
                this.cameraUpdatePending = false;
            });
        }
    }
    
    CreateBoundingBoxMesh() {

        const centerBbox = this.boundingBox.getCenter(new THREE.Vector3());
        console.log("bounding box", this.boundingBox);
        const size = this.boundingBox.getSize(new THREE.Vector3());
        const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
        const boxMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const boundingBoxHelper = new THREE.LineSegments(
            new THREE.EdgesGeometry(boxGeometry),
            boxMaterial
        );
        const cotationCheckbox = document.getElementById('cotationCheckbox');
        boundingBoxHelper.name = 'boundingBoxHelper';
        boundingBoxHelper.scale.set(size.x, size.y, size.z);
        if (cotationCheckbox.checked) {
            boundingBoxHelper.visible = true;
        } else {
            boundingBoxHelper.visible = false;
        }
        boundingBoxHelper.userData.isAnnotation = true;
        const mainGroup = this.scene.getObjectByName('mainGroup');
        mainGroup.add(boundingBoxHelper);
        //boundingBoxHelper.position.set(0, 0, 0);
    }

    CreateBoundingBoxesAndAnnotations() {

        //const mainObject = this.mainModel.GetMainObject().GetRootObject();
        const boundingBox = this.boundingBox;
        console.log("bounding box annotations", boundingBox);
        const objectHeight = GetObjectHeight(this.mainObject);
        const size = boundingBox.getSize(new THREE.Vector3());
        this.CreateDoubleSidedArrow(
            new THREE.Vector3(boundingBox.min.x, boundingBox.min.y, boundingBox.min.z),
            new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.min.z),
            `${size.x.toFixed(2)} cm`,
            objectHeight
        );

        this.CreateDoubleSidedArrow(
            new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.min.z),
            new THREE.Vector3(boundingBox.max.x, boundingBox.max.y, boundingBox.min.z),
            `${size.y.toFixed(2)} cm`,
            objectHeight
        );

        this.CreateDoubleSidedArrow(
            new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.min.z),
            new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.max.z),
            `${size.z.toFixed(2)} cm`,
            objectHeight
        );
    }

    CreateDoubleSidedArrow(startPoint, endPoint, label, objectHeight, color = 0x37b6ff, textSizePercent = 0.07) {
        const mainGroup = this.scene.getObjectByName('mainGroup');
        const direction = new THREE.Vector3().subVectors(endPoint, startPoint).normalize();
        const reverseDirection = new THREE.Vector3().subVectors(startPoint, endPoint).normalize();
        const arrowLength = startPoint.distanceTo(endPoint);
        const arrowHelper1 = new THREE.ArrowHelper(direction, startPoint, arrowLength, color);
        const textMeshes = [];

        arrowHelper1.userData.isAnnotation = true;
        arrowHelper1.name = 'arrowHelper1';
        if (cotationCheckbox.checked) {
            arrowHelper1.visible = true;
        } else {
            arrowHelper1.visible = false;
        }
        mainGroup.add(arrowHelper1);

        const arrowHelper2 = new THREE.ArrowHelper(reverseDirection, endPoint, arrowLength, color);
        arrowHelper2.userData.isAnnotation = true;
        arrowHelper2.name = 'arrowHelper2';
        if (cotationCheckbox.checked) {
            arrowHelper2.visible = true;
        } else {
            arrowHelper2.visible = false;
        }
        mainGroup.add(arrowHelper2);

        const loader = new FontLoader();
        loader.load(
            'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_regular.typeface.json',
            function (font) {
                const textSize = objectHeight * textSizePercent;
                const textGeometry = new TextGeometry(label, {
                    font: font,
                    size: textSize,
                    depth: 0.02,
                    curveSegments: 12,
                });

                const textMaterial = new THREE.MeshBasicMaterial({ color });
                const textMesh = new THREE.Mesh(textGeometry, textMaterial);
                const midPoint = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.5);
                textMesh.position.copy(midPoint);
                textMesh.userData.isAnnotation = true;
                textMesh.userData.viewCam = true;
                textMesh.name = 'textMesh';
                const cotationCheckbox = document.getElementById('cotationCheckbox');
                if (cotationCheckbox.checked) {
                    textMesh.visible = true;
                } else {
                    textMesh.visible = false;
                }
                textMeshes.push(textMesh);
                mainGroup.add(textMesh);
            },
            undefined,
            function (error) {
                console.error('Error loading font:', error);
            }
        );
    }

    onMouseDown(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.navigation.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.navigation.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
        this.raycaster.setFromCamera(this.navigation.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.mainModel.GetMainObject().GetRootObject().children, true);
    
        if (intersects.length > 0) {
            this.selectedObject = intersects[0].object;
            this.originalMaterial = this.selectedObject.material;
    
            this.selectedObject.material = new THREE.MeshStandardMaterial({
                color: 0xffff00,
                emissive: 0xffd700,
            });
    
            // Set the drag plane perpendicular to the camera view and at the intersection point
            const intersectionPoint = intersects[0].point;
            const cameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDirection);
            this.dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, intersectionPoint);
    
            if (this.raycaster.ray.intersectPlane(this.dragPlane, this.intersectionPoint)) {
                const parentInverseMatrix = new THREE.Matrix4().copy(this.scene.getObjectByName('mainGroup').matrixWorld).invert();
                const localIntersectionPoint = this.intersectionPoint.clone().applyMatrix4(parentInverseMatrix);
                const localObjectPosition = this.selectedObject.position.clone();
    
                this.dragOffset.copy(localObjectPosition).sub(localIntersectionPoint);
            }
            this.navigation.SetNavigationMode(0);
            //this.controls.enabled = false;
        }
    }
    
    onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.navigation.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.navigation.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
        if (this.selectedObject) {
            this.raycaster.setFromCamera(this.navigation.mouse, this.camera);
    
            if (this.raycaster.ray.intersectPlane(this.dragPlane, this.intersectionPoint)) {
                const parentInverseMatrix = new THREE.Matrix4().copy(this.scene.getObjectByName('mainGroup').matrixWorld).invert();
                const localIntersectionPoint = this.intersectionPoint.clone().applyMatrix4(parentInverseMatrix);
    
                const newPosition = localIntersectionPoint.add(this.dragOffset);
    
                const mainObject = this.mainModel.GetMainObject().GetRootObject();
                const boundingBox = new THREE.Box3().setFromObject(mainObject);
                const boxCenter = new THREE.Vector3();
                boundingBox.getCenter(boxCenter);
    
                const boxSize = new THREE.Vector3();
                boundingBox.getSize(boxSize);
    
                const maxDimension = Math.max(boxSize.x, boxSize.y, boxSize.z);
                const scaledHalfSize = (maxDimension * 3) / 2;
    
                const movementLimits = {
                    min: boxCenter.clone().subScalar(scaledHalfSize),
                    max: boxCenter.clone().addScalar(scaledHalfSize),
                };
    
                newPosition.x = THREE.MathUtils.clamp(newPosition.x, movementLimits.min.x, movementLimits.max.x);
                newPosition.y = THREE.MathUtils.clamp(newPosition.y, movementLimits.min.y, movementLimits.max.y);
                newPosition.z = THREE.MathUtils.clamp(newPosition.z, movementLimits.min.z, movementLimits.max.z);
    
                this.selectedObject.position.copy(newPosition);
            }
        }
    }
    
    onMouseUp(event) {
        if (this.selectedObject) {
            if (this.originalMaterial) {
                this.selectedObject.material = this.originalMaterial;
            }
            this.navigation.SetNavigationMode(1);
        }
    66
        this.selectedObject = null;
    }
    
    addInteractionListeners() {
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
    
        this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
        this.renderer.domElement.addEventListener('mousemove', this.onMouseMove);
        this.renderer.domElement.addEventListener('mouseup', this.onMouseUp);
    }
    
    removeInteractionListeners() {
        this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
        this.renderer.domElement.removeEventListener('mousemove', this.onMouseMove);
        this.renderer.domElement.removeEventListener('mouseup', this.onMouseUp);
    };

    UpdateCameraAndControls() {

        // Calculate the bounding box of the main object
        const boundingBox = new THREE.Box3().setFromObject(this.mainObject, true);
        const boundingSphere = new THREE.Sphere();
        boundingBox.getBoundingSphere(boundingSphere);
        this.FitSphereToWindow(boundingSphere, false, 20, false);
        // if (boundingSphere.radius < this.navigation.minimumDistance) {
        //     this.FitSphereToWindow(boundingSphere, false, 30, true), false;
        // }
    }
}
