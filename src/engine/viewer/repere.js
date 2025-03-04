import * as THREE from 'three';

export function InitializeMasks(scene, resizable) {
    const viewerContainer = document.getElementById('3d-viewer');
    const maskGeometry = new THREE.PlaneGeometry(2, 2);
    const maskMaterial = new THREE.ShaderMaterial({
        uniforms: {
            resolution: { value: new THREE.Vector2(viewerContainer.clientWidth, viewerContainer.clientHeight) },
            radiusX: { value: 0.45 },
            radiusY: { value: 0.45 },
            edgeFade: { value: 0.1 },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec2 resolution;
            uniform float radiusX; // Horizontal radius
            uniform float radiusY; // Vertical radius
            uniform float edgeFade;
            varying vec2 vUv;

            void main() {
                // Normalize coordinates to fit the canvas
                vec2 uv = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0); // Maintain aspect ratio
                //vec2 uv = (vUv - 0.5) * vec2(1.0, 1.0);
                // Adjusted distance calculation for the oval shape
                float dist = length(vec2(uv.x / radiusX, uv.y / radiusY)); // Scale by radii

                // Calculate fade region using smoothstep for soft edges
                float oval = smoothstep(1.0 - edgeFade, 1.0 + edgeFade, dist);

                // Inside the oval is visible (transparent), outside is black with smooth fade
                gl_FragColor = vec4(0.0, 0.0, 0.0, oval);
            }
        `,
        transparent: true,
    });

    const vignette = new THREE.Mesh(maskGeometry, maskMaterial);
    vignette.name = "vignette";
    vignette.visible = true;

    const maskGeometrySquare = new THREE.PlaneGeometry(2, 2);
    const maskMaterialSquare = new THREE.ShaderMaterial({
        uniforms: {
            resolution: { value: new THREE.Vector2(viewerContainer.clientWidth, viewerContainer.clientHeight) },
            squareSize: { value: 0.99 },
            borderThickness: { value: 0.01 },
            borderColor: { value: new THREE.Color(1.0, 0.0, 0.0) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec2 resolution;
            uniform float squareSize;
            uniform float borderThickness;
            uniform vec3 borderColor;
            varying vec2 vUv;

            void main() {
                // Normalize coordinates to fit the canvas
                vec2 uv = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0); // Maintain aspect ratio

                // Calculate square bounds
                float halfSize = squareSize / 2.0;  // Half the size of the square
                float halfThickness = borderThickness / 2.0; // Half thickness for the border

                // Check if the current pixel is within the border area
                bool insideBorder = (
                    (uv.x > -halfSize - halfThickness && uv.x < -halfSize + halfThickness && uv.y > -halfSize && uv.y < halfSize) || // Left border
                    (uv.x > halfSize - halfThickness && uv.x < halfSize + halfThickness && uv.y > -halfSize && uv.y < halfSize) || // Right border
                    (uv.y > -halfSize - halfThickness && uv.y < -halfSize + halfThickness && uv.x > -halfSize && uv.x < halfSize) || // Bottom border
                    (uv.y > halfSize - halfThickness && uv.y < halfSize + halfThickness && uv.x > -halfSize && uv.x < halfSize)    // Top border
                );

                if (insideBorder) {
                    // Inside the border area: color it with the border color
                    gl_FragColor = vec4(borderColor, 1.0); // Opaque border color
                } else {
                    // Outside the square and border: fully transparent
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                }
            }
        `,
        transparent: true,
    });

    const repere = new THREE.Mesh(maskGeometrySquare, maskMaterialSquare);
    repere.name = "repere";
    repere.visible = false;

    return {vignette, repere};
}