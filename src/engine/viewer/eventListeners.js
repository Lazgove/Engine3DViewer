export function setupEventListeners(viewer) {
    const resetButton = document.getElementById('reset-button');
    const autoRotateCheckbox = document.getElementById('auto-rotate');
    const cotationCheckbox = document.getElementById('cotationCheckbox');
    const blackModeCheckbox = document.getElementById('blackMode');
    const repereCheckbox = document.getElementById('repereCheckbox');
    const manuelCheckbox = document.getElementById('manuelCheckbox');
    const recenterButton = document.getElementById('recenter-button');
    const slider = document.getElementById("mySlider");

    autoRotateCheckbox.checked = true;
    cotationCheckbox.checked = false;
    blackModeCheckbox.checked = true;
    repereCheckbox.checked = false;
    manuelCheckbox.checked = false;

    // Add click event to each dropdown item for selection
    function addDropdownItemEventListeners() {
        const dropdownItems = document.querySelectorAll('.dropdown-item');
        const dropdownButton = document.querySelector('.dropdown-toggle');
        dropdownItems.forEach(item => {
            item.addEventListener('click', async (event) => {
                const selectedItem = item.querySelector('span').textContent;
                dropdownButton.textContent = selectedItem; // Update button text
                document.querySelector('.dropdown-list').style.display = 'none'; // Close dropdown
                await window.cleanAndLoadItem(selectedItem);
                updateTimestamp(userID, selectedItem); // Update timestamp
            });
        });
    }

    // Add click event to remove buttons
    function addRemoveButtonEventListeners() {
        const removeButtons = document.querySelectorAll('.remove-button');
        removeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (item) {
                    removeItemFromLambda(item);
                    item.remove(); // Remove item from dropdown
                    updateUrlAfterRemoval(item.dataset.value);  // Update URL after item removal
                }
                e.stopPropagation(); // Prevent event from propagating to item selection
            });
        });
    }

    repereCheckbox.addEventListener('change', function () {
        const repere = viewer.GetViewer().GetRepere();
        if (repereCheckbox.checked && blackModeCheckbox.checked) {
            repere.visible = true;
        } else {
            repere.visible = false;
        }
        viewer.GetViewer().UpdateRepere();
    });

    blackModeCheckbox.addEventListener('change', function () {
        const repere = viewer.GetViewer().GetRepere();
        const vignette = viewer.GetViewer().GetVignette();
        
        if (blackModeCheckbox.checked) {
            viewer.GetViewer().GetRenderer().setClearColor(0x000000, 1);
            vignette.visible = true;
            viewer.GetViewer().UpdateVignette();
            if (repereCheckbox.checked) {
                repere.visible = true;
                viewer.GetViewer().UpdateRepere();
            }
        } else {
            viewer.GetViewer().GetRenderer().setClearColor(0xffffff, 1);
            repere.visible = false;
            vignette.visible = false;
            viewer.GetViewer().UpdateVignette();
            viewer.GetViewer().UpdateRepere();
        }
    });

    autoRotateCheckbox.addEventListener('change', function () {
        console.log(`Checkbox state: ${autoRotateCheckbox.checked}`);
        if (autoRotateCheckbox.checked) {
            viewer.GetViewer().isRotating = true;
            console.log('ease in');
            viewer.GetViewer().EaseInRotation();
        } else {
            viewer.GetViewer().isRotating = false;
            console.log('ease out');
            viewer.GetViewer().EaseOutRotation();
        }
    });

    cotationCheckbox.addEventListener('change', function() {
        const scene = viewer.GetViewer().GetScene();
        scene.traverse((child) => {
            if (child.userData.isAnnotation) {
                if (cotationCheckbox.checked) {
                    child.visible = true;
                } else {
                    child.visible = false;
                }
            }
        });
    });

    manuelCheckbox.addEventListener('change', function () {
        console.log(`Checkbox state: ${manuelCheckbox.checked}`);
        if (manuelCheckbox.checked) {
            slider.style.display = 'none';
            slider.value = 0;
            console.log(0);
            updateSliderProgress(slider);
            viewer.GetViewer().ExplodeModel(0, 0.5, viewer.GetViewer());
            viewer.GetViewer().addInteractionListeners();
        } else {
            slider.style.display = 'block';
            updateSliderProgress(slider);
            viewer.GetViewer().ExplodeModel(slider.value, 0.5, viewer.GetViewer());
            viewer.GetViewer().removeInteractionListeners();
        }
    });

    resetButton.addEventListener('click', function () {
        slider.value = 0;
        console.log(0);
        updateSliderProgress(slider);
        viewer.GetViewer().ExplodeModel(0, 0.5, viewer.GetViewer());
    });

    recenterButton.addEventListener('click', function () {
        viewer.GetViewer().RecenterCamera();
    });

    // Ensure the slider value is set to 0 when the page is loaded
    window.onload = function() {
        slider.value = 0;
        updateSliderProgress(slider);
        console.log("Slider initialized to 0");
    };

    slider.addEventListener("input", (event) => {
        const factor = event.target.value;
        viewer.GetViewer().ExplodeModel(factor, 0.5, viewer.GetViewer()); // Lower duration for a smooth effect
    });
    

    // // Update the hidden slider value and trigger the function
    // slider.addEventListener("input", function() {
    //     const value = this.value;
    //     updateSliderProgress(this);
    //     viewer.GetViewer().ExplodeModel(value, 0.5, viewer.GetViewer());
    // });

    // Function to update the slider progress color
    function updateSliderProgress(slider) {
        const progress = (slider.value - slider.min) / (slider.max - slider.min) * 100;
        slider.style.setProperty('--slider-progress', `${progress}%`);
    };
}