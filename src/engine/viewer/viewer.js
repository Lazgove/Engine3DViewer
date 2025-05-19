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
        this.shadowPlaneUpdated = false;
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
        
        this.meshChildren = [];
        this.initialPositions = [];
        this.newPositions = [];
        this.directionVectors = [];
        this.lastSliderValue = null;

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
    
        // Key Light (Main Shadow Light)
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
        keyLight.name = "KeyLight"; // <-- Name it
        keyLight.castShadow = true;
    
        // Position the key light offset from center
        keyLight.position.set(
            center.x + maxDimension * 100,
            center.y + maxDimension * 100,
            center.z + maxDimension * 10
        );
    
        // Target the object center
        const lightTarget = new THREE.Object3D();
        lightTarget.position.copy(center);
        this.scene.add(lightTarget);
        keyLight.target = lightTarget;
    
        // === Shadow Settings ===
        const shadowCam = keyLight.shadow.camera;
    
        // Frustum size to cover object nicely (padding included)
        const frustumExtent = maxDimension * 1.5;
    
        shadowCam.left = -frustumExtent;
        shadowCam.right = frustumExtent;
        shadowCam.top = frustumExtent;
        shadowCam.bottom = -frustumExtent;
    
        shadowCam.near = 0.1;
        shadowCam.far = maxDimension * 1000; // Ensure depth coverage
    
        keyLight.shadow.mapSize.set(4096, 4096);
        keyLight.shadow.radius = 5; // Works with PCFSoftShadowMap
        keyLight.shadow.bias = -0.001;
        keyLight.shadow.normalBias = 0.005;
    
        this.scene.add(keyLight); // Optional: or add to scene if camera-relative isn't needed
    
        // Fill Light (softer, no shadows)
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
        fillLight.position.set(
            center.x - maxDimension,
            center.y + maxDimension,
            center.z + maxDimension
        );
        fillLight.name = "FillLight"; // <-- Name it
        fillLight.castShadow = false;
        this.scene.add(fillLight);
    
        // Back Light (subtle)
        const backLight = new THREE.DirectionalLight(0xffffff, 0.1);
        backLight.position.set(
            center.x,
            center.y + maxDimension,
            center.z - maxDimension
        );
        backLight.name = "BackLight"; // <-- Name it
        backLight.castShadow = false;
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
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: for softer shadows
        this.renderer.shadowMap.autoUpdate = true;

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

        // Add the shadow plane
        this.AddShadowPlane();
        this.UpdateShadowPlane();

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
        // Set up main object and shading model
        this.mainModel.SetMainObject(object);
        this.shadingModel.SetShadingType(GetShadingTypeOfObject(object));
        this.initialCameraView = this.navigation.GetCamera().Clone();
    
        let group = this.scene.getObjectByName('mainGroup') || new THREE.Group();
        group.name = 'mainGroup';
        group.clear();
        this.scene.add(group);
    
        // Initialize storage arrays
        this.meshChildren = [];
        this.initialPositions = [];
        this.directionVectors = [];
    
        // Center object by adjusting its position to its bounding box center
        this.boundingBox = new THREE.Box3().setFromObject(object);
        const center = this.boundingBox.getCenter(new THREE.Vector3());
        object.position.sub(center);
    
        group.add(object);
        this.mainObject = group;
    
        // Compute bounding sphere
        this.boundingSphere = this.boundingBox.getBoundingSphere(new THREE.Sphere());
    
        // Prepare explosion data (based on mesh size)
        let minSize = Infinity, maxSize = 0;
    
        // Traverse the object once for both explosion calculation and shadow settings
        object.traverse((child) => {
            if (child.isMesh && !child.userData.isAnnotation) {
                // Get the mesh size and store the data
                const size = new THREE.Box3().setFromObject(child).getSize(new THREE.Vector3()).length();
                this.meshChildren.push({ child, size });
                this.initialPositions.push(child.position.clone());
                minSize = Math.min(minSize, size);
                maxSize = Math.max(maxSize, size);
    
                // Enable shadows for this mesh
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    
        if (this.meshChildren.length === 0) return; // Early exit if no meshes
    
        const numChildren = this.meshChildren.length;
    
        // Generate explosion directions using Fibonacci Sphere (calculated once)
        this.directionVectors.length = 0; // Reset the array for reuse
        for (let i = 0; i < numChildren; i++) {
            const theta = Math.acos(1 - (2 * (i + 0.5)) / numChildren); // Vertical angle
            const phi = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5); // Horizontal angle
            this.directionVectors.push(
                new THREE.Vector3(
                    Math.sin(theta) * Math.cos(phi),
                    Math.sin(theta) * Math.sin(phi),
                    Math.cos(theta)
                ).normalize()
            );
        }
    
        // Calculate explosion distances
        const objectSize = this.boundingBox.getSize(new THREE.Vector3()).length();
        const maxExplosionDistance = objectSize * 0.5; // Max explosion distance based on the object's size
    
        // Loop through meshes and calculate new positions (explosion effect)
        this.meshChildren.forEach((meshData, i) => {
            const { child, size } = meshData;
            const initialPos = this.initialPositions[i].clone();
    
            // Normalize the size of the mesh between 0.1 and 1
            const normalizedSize = THREE.MathUtils.clamp((size - minSize) / (maxSize - minSize), 0.1, 1);
    
            // Calculate explosion distance for this mesh
            const explosionDistance = normalizedSize * maxExplosionDistance;
    
            // Store explosion factor for use when the slider changes (not applied here)
            child.userData.explosionDistance = explosionDistance;
        });
    
        // Ensure shadow plane also receives shadows
        this.shadowPlane.receiveShadow = true;
    
        // Set up scene lighting and bounding boxes
        this.SetupThreePointLighting();
        this.CreateBoundingBoxMesh();
        this.CreateBoundingBoxesAndAnnotations();
        
        // Render the scene
        this.Render();
    }
    
    SetMainObjectBefore(object) {
        this.mainModel.SetMainObject(object);
        this.shadingModel.SetShadingType(GetShadingTypeOfObject(object));
        this.initialCameraView = this.navigation.GetCamera().Clone();
    
        let group = this.scene.getObjectByName('mainGroup') || new THREE.Group();
        group.name = 'mainGroup';
        group.clear();
        this.scene.add(group);
    
        // Initialize storage
        this.meshChildren = [];
        this.initialPositions = [];
        this.newPositions = [];
        this.directionVectors = [];
    
        // Center object
        console.log(object);
        console.log(typeof object);
        this.boundingBox = new THREE.Box3().setFromObject(object);
        const center = boundingBox.getCenter(new THREE.Vector3());
        object.position.sub(center);
    
        group.add(object);
        this.mainObject = group;
    
        const radius = this.boundingBox.getSize(new THREE.Vector3()).length() / 2;
        this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
    
        // Prepare explosion data
        let minSize = Infinity, maxSize = 0;
    
        object.traverse((child) => {
            if (child.isMesh && !child.userData.isAnnotation) {
                const size = new THREE.Box3().setFromObject(child).getSize(new THREE.Vector3()).length();
                this.meshChildren.push({ child, size });
                this.initialPositions.push(child.position.clone());
                minSize = Math.min(minSize, size);
                maxSize = Math.max(maxSize, size);
            }
        });
    
        if (this.meshChildren.length === 0) return;
    
        const numChildren = this.meshChildren.length;
    
        // Generate explosion directions using Fibonacci Sphere
        for (let i = 0; i < numChildren; i++) {
            const theta = Math.acos(1 - (2 * (i + 0.5)) / numChildren);
            const phi = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
            this.directionVectors.push(new THREE.Vector3(
                Math.sin(theta) * Math.cos(phi),
                Math.sin(theta) * Math.sin(phi),
                Math.cos(theta)
            ).normalize());
        }
    
        // Compute explosion distances
        for (let i = 0; i < numChildren; i++) {
            const { child, size } = this.meshChildren[i];
            const normalizedSize = (size - minSize) / (maxSize - minSize);
            const explosionFactor = THREE.MathUtils.lerp(0.1, 1, normalizedSize) * radius * 0.1;
            this.newPositions.push(this.initialPositions[i].clone().add(this.directionVectors[i].multiplyScalar(explosionFactor)));
        }
    
        // Enable shadows
        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    
        this.shadowPlane.receiveShadow = true;
    
        // Setup scene
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
        console.log("scene", this.scene);

        let canvasElem = this.renderer.domElement;
        this.navigation = new Navigation (canvasElem, camera, {
            onUpdate : () => {
                this.Render ();
            }
        });

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

        if (this.isRotating && this.mainObject) {
            if (this.upVector.direction === Direction.Y) {
                this.mainObject.rotation.z = 0;
                this.mainObject.rotation.y += (this.rotationSpeed * Math.PI / 180) * (1 / 60);
            } else if (this.upVector.direction === Direction.Z) {
                this.mainObject.rotation.y = 0;
                this.mainObject.rotation.z += (this.rotationSpeed * Math.PI / 180) * (1 / 60);
            }
        }

        if (this.scene && this.camera) {
            this.GetScene().traverse((child) => {
                if (child.userData && child.userData.viewCam && child.userData.isAnnotation) {
                    child.lookAt(this.camera.position);
                }
            });
        }

        // Update the shadow plane position and orientation
        
    // One-time shadow plane update when mainObject is ready
    if (!this.shadowPlaneUpdated && this.mainObject) {
        this.UpdateShadowPlane();
        this.shadowPlaneUpdated = true;
    }
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
    
    /**
     * Handles explosion effect efficiently.
     */
    ExplodeModel(factor, duration = 0.5) {
        if (!this.mainObject || !this.meshChildren.length) {
            console.error("Main object is not set.");
            return;
        }

        // Compute explosion distance
        const minMultiplier = 0.2, maxMultiplier = 1.5;
        const maxExplosionDistance = THREE.MathUtils.clamp(
            this.boundingSphere.radius * 1.5,
            this.boundingSphere.radius * minMultiplier,
            this.boundingSphere.radius * maxMultiplier
        );
        const explosionDistance = (factor / 100) * maxExplosionDistance;

        // If the factor change is too small, ignore animation
        if (this.lastFactor !== null && Math.abs(factor - this.lastFactor) < 2) return;
        this.lastFactor = factor;

        // Apply instant position while sliding
        this.ApplyInstantPosition(explosionDistance);

        // // Clear previous timeout and apply smooth animation after sliding stops
        // if (this.sliderTimeout) clearTimeout(this.sliderTimeout);
        // this.sliderTimeout = setTimeout(() => {
        //     this.ApplySmoothAnimation(explosionDistance, duration);
        // }, 100);
    }

    /**
     * Instantly moves objects while sliding.
     */
    ApplyInstantPosition(explosionDistance) {
        for (let i = 0; i < this.meshChildren.length; i++) {
            const newPosition = this.initialPositions[i].clone().add(
                this.directionVectors[i].clone().multiplyScalar(explosionDistance)
            );
            this.meshChildren[i].child.position.set(newPosition.x, newPosition.y, newPosition.z);
        }
        this.ThrottledCameraUpdate();
    }

    /**
     * Applies smooth animation after the user stops moving the slider.
     */
    ApplySmoothAnimation(explosionDistance, duration) {
        const animations = [];

        for (let i = 0; i < this.meshChildren.length; i++) {
            const newPosition = this.initialPositions[i].clone().add(
                this.directionVectors[i].clone().multiplyScalar(explosionDistance)
            );

            gsap.killTweensOf(this.meshChildren[i].child.position);
            animations.push(gsap.to(this.meshChildren[i].child.position, {
                x: newPosition.x,
                y: newPosition.y,
                z: newPosition.z,
                duration: duration,
                ease: "power2.out"
            }));
        }

        gsap.timeline().add(animations).eventCallback("onComplete", () => {
            this.OptimizedCameraUpdate();
        });
    }

    /**
     * Optimized camera update with requestAnimationFrame
     */
    OptimizedCameraUpdate() {
        if (this.cameraUpdatePending) return;

        this.cameraUpdatePending = true;
        requestAnimationFrame(() => {
            this.UpdateCameraAndControls();
            this.cameraUpdatePending = false;
        });
    }

    /**
     * Camera update with throttling.
     */
    ThrottledCameraUpdate() {
        if (this.cameraUpdatePending) return;
        this.cameraUpdatePending = true;
        requestAnimationFrame(() => {
            this.UpdateCameraAndControls();
            this.cameraUpdatePending = false;
        });
    }
    
    CreateBoundingBoxMesh() {
        const mainGroup = this.scene.getObjectByName('mainGroup');
    
        // Create bounding box in local space of mainGroup
        const boundingBox = new THREE.Box3().setFromObject(mainGroup);
        console.log("computed bounding box", boundingBox);
    
        const size = boundingBox.getSize(new THREE.Vector3());
        const center = boundingBox.getCenter(new THREE.Vector3());
    
        // Store it if you want to reuse
        this.boundingBox = boundingBox;
    
        // Optional: scale shadowPlane based on bounding box
        this.shadowPlane.scale.set(size.x * 5, size.y * 5, size.z * 5);
    
        // Create the box mesh
        const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
        const boxMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const boundingBoxHelper = new THREE.LineSegments(
            new THREE.EdgesGeometry(boxGeometry),
            boxMaterial
        );
    
        boundingBoxHelper.name = 'boundingBoxHelper';
        boundingBoxHelper.userData.isAnnotation = true;
    
        // Scale and position to match bounding box
        boundingBoxHelper.scale.set(size.x, size.y, size.z);
        boundingBoxHelper.position.copy(center);
    
        const cotationCheckbox = document.getElementById('cotationCheckbox');
        boundingBoxHelper.visible = cotationCheckbox.checked;
    
        mainGroup.add(boundingBoxHelper);
    }

    CreateBoundingBoxesAndAnnotations() {

        //const mainObject = this.mainModel.GetMainObject().GetRootObject();
        const boundingBox = this.boundingBox;
        console.log("bounding box annotations", boundingBox);
        const size = boundingBox.getSize(new THREE.Vector3());
        const objectHeight = Math.max(size.x, size.y, size.z);  // Get the largest dimension
        
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

    // Create text sprite
    CreateTextSprite(label, position, scale = 1) {

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "64px Arial";
    
        // Shadow text
        ctx.fillStyle = "black";
        ctx.fillText(label, canvas.width / 2 + 3, canvas.height / 2 + 3);
    
        // Main text
        ctx.fillStyle = "red";
        ctx.fillText(label, canvas.width / 2, canvas.height / 2);
    
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(scale * 2, scale, 1);
        sprite.position.copy(position);
        sprite.quaternion.copy(this.camera.quaternion);
        sprite.renderOrder = 999;
        sprite.frustumCulled = false;

        return sprite;
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

        const midPoint = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.5);
        // Add text sprite near cube
        const text = this.CreateTextSprite(label, midPoint, 0.5);
        this.scene.add(text);

        // const loader = new FontLoader();
        // loader.load(
        //     'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_regular.typeface.json',
        //     function (font) {
        //         const textSize = objectHeight * textSizePercent;
        //         const textGeometry = new TextGeometry(label, {
        //             font: font,
        //             size: textSize,
        //             depth: 0.02,
        //             curveSegments: 12,
        //         });

        //         const textMaterial = new THREE.MeshBasicMaterial({ color });
        //         const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        //         const midPoint = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.5);
        //         textMesh.position.copy(midPoint);
        //         textMesh.userData.isAnnotation = true;
        //         textMesh.userData.viewCam = true;
        //         textMesh.name = 'textMesh';
        //         const cotationCheckbox = document.getElementById('cotationCheckbox');
        //         if (cotationCheckbox.checked) {
        //             textMesh.visible = true;
        //         } else {
        //             textMesh.visible = false;
        //         }
        //         textMeshes.push(textMesh);
        //         mainGroup.add(textMesh);
        //     },
        //     undefined,
        //     function (error) {
        //         console.error('Error loading font:', error);
        //     }
        // );
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

    AddShadowPlane() {
        // Remove existing shadow plane if it exists
        const existingShadowPlane = this.scene.getObjectByName('shadowPlane');
        if (existingShadowPlane) {
            this.camera.remove(existingShadowPlane);
        }
    
        // Create the plane geometry and material
        const planeGeometry = new THREE.PlaneGeometry(10000, 10000);
        const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.5 }); // Use ShadowMaterial for receiving shadows
        //const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xD5D5D5, side: THREE.DoubleSide });
        this.shadowPlane = new THREE.Mesh(planeGeometry, planeMaterial);
        this.shadowPlane.receiveShadow = true; // Enable shadow receiving
        this.shadowPlane.name = 'shadowPlane';
        this.shadowPlane.visible = true; // Make it visible
    
        // Add the plane to the scene
        this.scene.add(this.shadowPlane);
    
        // Calculate the distance from the camera to the origin (0, 0, 0)
        const distanceToOrigin = this.camera.position.length();
    
        // Set the plane's position to (0, 0, -distanceToOrigin) relative to the camera
        this.shadowPlane.position.set(0, 0, -distanceToOrigin);
    }

    UpdateShadowPlane() {
        if (!this.shadowPlane || !this.mainObject) return;

        // Get the bounding box of the main object
        const boundingBox = new THREE.Box3().setFromObject(this.mainObject);
        const boundingSphere = new THREE.Sphere();
        boundingBox.getBoundingSphere(boundingSphere);

        // Calculate the distance from the camera to the origin (0, 0, 0)
        const distanceToOrigin = this.camera.position.length();

        // Set the plane's position to (0, 0, -distanceToOrigin - boundingSphere.radius) relative to the camera
        this.shadowPlane.position.set(0, 0, -distanceToOrigin - boundingSphere.radius);

        // // Ensure the plane is perpendicular to the camera
        // const cameraDirection = new THREE.Vector3();
        // this.camera.getWorldDirection(cameraDirection);
        // this.shadowPlane.lookAt(this.camera.position.clone().add(cameraDirection));
    }
}
