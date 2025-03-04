import * as Engine from './engine/main.js';
import { EmbeddedViewer } from './engine/viewer/embeddedviewer.js';
import * as THREE from 'three';
import { setupEventListeners } from './engine/viewer/eventListeners.js';

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
    // Setup event listeners
    setupEventListeners(viewer);

    // Handle window resizing
    window.addEventListener('resize', () => {
        const viewerContainer = document.getElementById('3d-viewer');
        if (viewerContainer && viewerContainer.viewerInstance) {
            viewerContainer.viewerInstance.Resize();
        }
    });

    window.cleanAndLoadItem = async function cleanAndLoadItem(selectedItem) {
        if (selectedItem) {
            const files = await fetchDynamoData(false, selectedItem);
            const fileData = files[0];
            console.log(fileData);

            // Create the modelUrls array
            const modelUrls = [];
            if (fileData.objectsUrls) {
                modelUrls.push(fileData.objectsUrls);
            }
            if (fileData.texturesUrls) {
                modelUrls.push(...fileData.texturesUrls.split(','));
            }
            if (fileData.mtlUrls) {
                modelUrls.push(...fileData.mtlUrls.split(','));
            }

            // Load the model using the modelUrls array
            viewerContainer.viewerInstance.LoadModelFromUrlList(modelUrls);
        }
    };

    async function fetchDynamoData(init, selectedItem) {    
        const lambdaUrl = "https://2uhjohkckl.execute-api.eu-west-3.amazonaws.com/production/fetchDynamoDB";
    
        try {
            const response = await fetch(lambdaUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ userID: userID, selectedItem: selectedItem }),
            });
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            const data = await response.json();
            console.log("Data received from Lambda:", data);
    
            const items = JSON.parse(data.body);
    
            if (init) {
                populateDropdown(items);
            } else {
                return items;
            }
        } catch (error) {
            console.error("Error calling Lambda function:", error);
            throw error;
        }
    }

});
