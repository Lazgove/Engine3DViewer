import * as Engine from './engine/main.js';
import { EmbeddedViewer } from './engine/viewer/embeddedviewer.js';
import * as THREE from 'three';

// Export the Engine and EmbeddedViewer modules
export { Engine, EmbeddedViewer };

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const viewerContainer = document.getElementById('3d-viewer');
    
    if (!viewerContainer) {
        console.error("Viewer container not found!");
        return;
    }

    const parameters = {
        backgroundColor: { r: 255, g: 255, b: 255, a: 1 }, // Optional parameters
        defaultColor: { r: 200, g: 200, b: 200 },
        onModelLoaded: () => {
            console.log('Model loaded successfully');
        }
    };

    const viewer = new EmbeddedViewer(viewerContainer, parameters);
    
    // Store the viewer instance in the container for later access
    viewerContainer.viewerInstance = viewer;

    // Create a simple cube and add it to the viewer
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);

    viewer.GetViewer().scene.add(cube);
    console.log(viewer.GetViewer.scene);
    console.log('Cube added to the viewer');
});

// Handle window resizing
window.addEventListener('resize', () => {
    const viewerContainer = document.getElementById('3d-viewer');
    
    if (viewerContainer && viewerContainer.viewerInstance) {
        viewerContainer.viewerInstance.Resize();
    }
});
