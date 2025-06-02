import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

// Create scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cdcd4); // Matching the HTML background color

// Add a grid helper to visualize the scene
const gridHelper = new THREE.GridHelper(10, 10);
scene.add(gridHelper);

// Add axes helper to visualize orientation
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// Create ground plane
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4caf50,
    roughness: 0.8,
    metalness: 0.2
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
ground.position.y = 0; // Position at y=0
scene.add(ground);

// Create camera
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 2, 5); // Position camera higher and closer
camera.lookAt(0, 0, 0);

// Create renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Add lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// Create a group to hold our model
const modelGroup = new THREE.Group();
scene.add(modelGroup);

// Add animation mixer
let mixer = null;

// Animation state
let currentAction = null;

// Setup loaders
const textureLoader = new THREE.TextureLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// Loading manager
const loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    console.log(`Loading file: ${url} (${itemsLoaded}/${itemsTotal})`);
};
loadingManager.onError = (url) => {
    console.error('Error loading:', url);
};

// Function to apply overlay texture to model
function applyTexture(model, texturePath, mixFactor = 0.5) {
    // Validate parameters
    if (typeof texturePath !== 'string') {
        console.error('Invalid texture path:', texturePath);
        return;
    }
    if (typeof mixFactor !== 'number' || mixFactor < 0 || mixFactor > 1) {
        console.error('Invalid mix factor:', mixFactor);
        return;
    }

    console.log('Attempting to load texture from:', texturePath, 'with mix factor:', mixFactor);
    
    // Create a new texture loader with the loading manager
    const loader = new THREE.TextureLoader(loadingManager);
    
    // Try to load the texture with explicit error handling
    try {
        loader.load(
            texturePath,
            (overlayTexture) => {
                console.log('Overlay texture loaded successfully');
                overlayTexture.colorSpace = THREE.SRGBColorSpace;
                overlayTexture.flipY = false;
                
                // Apply texture to all meshes in the model
                model.traverse((child) => {
                    if (child.isMesh) {
                        console.log('Applying overlay to mesh:', child.name);
                        if (child.material) {
                            const originalMaterial = child.material;
                            
                            // Create a new material that preserves the original texture
                            const newMaterial = new THREE.MeshStandardMaterial({
                                map: originalMaterial.map,
                                color: 0xffffff,
                                metalness: originalMaterial.metalness,
                                roughness: originalMaterial.roughness,
                                normalMap: originalMaterial.normalMap,
                                aoMap: originalMaterial.aoMap,
                                aoMapIntensity: originalMaterial.aoMapIntensity,
                                transparent: true,
                                opacity: 1.0
                            });

                            // Add the overlay texture as an emissive map
                            newMaterial.emissiveMap = overlayTexture;
                            newMaterial.emissiveIntensity = mixFactor;
                            newMaterial.emissive = new THREE.Color(0xffffff);
                            
                            // Ensure the material is properly configured
                            newMaterial.needsUpdate = true;
                            
                            child.material = newMaterial;
                            console.log('Overlay material created for mesh:', child.name);
                        }
                    }
                });
            },
            // Progress callback
            (xhr) => {
                console.log((xhr.loaded / xhr.total * 100) + '% loaded');
            },
            // Error callback with more detailed error information
            (error) => {
                console.error('Error loading texture:', error);
                console.error('Texture path attempted:', texturePath);
            }
        );
    } catch (error) {
        console.error('Exception while loading texture:', error);
    }
}

// Function to load a model
function loadModel(modelPath, texturePath = null, mixFactor = 0.5) {
    console.log('Loading model:', modelPath, 'with texture:', texturePath);
    
    gltfLoader.load(
        modelPath,
        (gltf) => {
            // Clear any existing models
            while(modelGroup.children.length > 0) { 
                modelGroup.remove(modelGroup.children[0]); 
            }

            const model = gltf.scene;
            
            // Debug: Log model structure
            console.log('Model loaded, structure:', model);
            model.traverse((child) => {
                if (child.isMesh) {
                    console.log('Mesh found:', child.name, 'position:', child.position, 'visible:', child.visible);
                    // Make sure the mesh is visible and has a material
                    child.visible = true;
                    if (!child.material) {
                        child.material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
                    }
                }
            });
            
            // Check for animations
            if (gltf.animations && gltf.animations.length > 0) {
                console.log('Found animations:', gltf.animations.length);
                mixer = new THREE.AnimationMixer(model);
                // Store the first animation but don't play it yet
                if (gltf.animations[0]) {
                    currentAction = mixer.clipAction(gltf.animations[0]);
                    currentAction.stop(); // Ensure it's not playing initially
                }
            } else {
                console.log('No animations found in the model');
            }
            
            // Get the bounding box before any transformations
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            console.log('Original model size:', size);
            
            // Make the model much smaller - scale to fit within 1 unit
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 0.1 / maxDim; // Make model very small
            model.scale.set(scale, scale, scale);
            
            // Reset position and rotation
            model.position.set(0, 0, 0);
            model.rotation.set(0, 0, 0);
            
            // Get new bounding box after scaling
            const newBox = new THREE.Box3().setFromObject(model);
            const newSize = newBox.getSize(new THREE.Vector3() );
            console.log('Scaled model size:', newSize);
            
            // Center the model
            const center = newBox.getCenter(new THREE.Vector3());
            model.position.sub(center);
            
            // Add the model to the scene
            modelGroup.add(model);
            
            // Position the model slightly above the ground
            modelGroup.position.y = 0.5;
            modelGroup.scale.set(10, 10, 10);
            
            // Update camera to look at the model
            camera.position.set(0, 2, 5);
            
            // Apply texture if provided
            if (texturePath) {
                console.log('Applying texture:', texturePath);
                applyTexture(model, texturePath, mixFactor);
            }
            
            console.log('Model loaded and positioned:', {
                position: modelGroup.position,
                scale: model.scale,
                rotation: modelGroup.rotation,
                camera: camera.position
            });
        },
        (progress) => {
            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading model:', error);
        }
    );
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Movement state
const moveSpeed = 0.01;
const turnSpeed = 0.05;
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

// Camera settings
const cameraOffset = new THREE.Vector3(0, 0.3, 0.8); // Increased height for downward angle
const cameraLookOffset = new THREE.Vector3(0, 0.1, 0); // Lower look target to look down at model

// Handle keyboard input
window.addEventListener('keydown', (event) => {
    switch(event.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
            keys.forward = true;
            break;
        case 's':
        case 'arrowdown':
            keys.backward = true;
            break;
        case 'a':
        case 'arrowleft':
            keys.left = true;
            break;
        case 'd':
        case 'arrowright':
            keys.right = true;
            break;
    }
});

window.addEventListener('keyup', (event) => {
    switch(event.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
            keys.forward = false;
            break;
        case 's':
        case 'arrowdown':
            keys.backward = false;
            break;
        case 'a':
        case 'arrowleft':
            keys.left = false;
            break;
        case 'd':
        case 'arrowright':
            keys.right = false;
            break;
    }
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update animation mixer if it exists
    if (mixer) {
        mixer.update(0.016);
    }
    
    if (modelGroup.children.length > 0) {
        // Handle rotation
        if (keys.left) {
            modelGroup.rotation.y += turnSpeed;
        }
        if (keys.right) {
            modelGroup.rotation.y -= turnSpeed;
        }
        
        // Handle movement and animation
        if (keys.forward || keys.backward) {
            const direction = keys.forward ? 1 : -1;
            modelGroup.position.x += Math.sin(modelGroup.rotation.y) * moveSpeed * direction;
            modelGroup.position.z += Math.cos(modelGroup.rotation.y) * moveSpeed * direction;
            
            // Play animation when moving
            if (currentAction && !currentAction.isRunning()) {
                currentAction.reset();
                currentAction.play();
            }
        } else {
            // Stop animation when not moving
            if (currentAction && currentAction.isRunning()) {
                currentAction.stop();
            }
        }
        
        // Update camera position to follow character
        const cameraPosition = new THREE.Vector3();
        cameraPosition.copy(modelGroup.position);
        
        // Add fixed offset without rotation
        cameraPosition.add(cameraOffset);
        
        // Update camera
        camera.position.copy(cameraPosition);
        
        // Calculate look target
        const lookTarget = new THREE.Vector3();
        lookTarget.copy(modelGroup.position);
        lookTarget.add(cameraLookOffset);
        camera.lookAt(lookTarget);
    }
    
    renderer.render(scene, camera);
}

animate();

// Load the dinosaur model with texture
loadModel('/models/trex_v3.glb', 'textures/dino-1.png', 0.1);

// Export the functions to the console
window.loadModel = loadModel;
window.applyTexture = (texturePath, mixFactor = 0.5) => {
    if (modelGroup.children.length > 0) {
        console.log('Model found, applying overlay texture...');
        applyTexture(modelGroup.children[0], texturePath, mixFactor);
    } else {
        console.error('No model loaded to apply texture to');
    }
};

// Add function to control animations
window.playAnimation = (index = 0) => {
    if (mixer && mixer._actions.length > 0) {
        const action = mixer._actions[index];
        if (action) {
            action.reset();
            action.play();
            console.log('Playing animation:', action.getClip().name);
        } else {
            console.error('Animation index out of range');
        }
    } else {
        console.error('No animations available');
    }
};

