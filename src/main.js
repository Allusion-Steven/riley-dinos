import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

// Create scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cdcd4); // Matching the HTML background color

// Create camera
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 5;

// Create renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Add lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// Create a group to hold our model
const modelGroup = new THREE.Group();
scene.add(modelGroup);

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
                overlayTexture.encoding = THREE.sRGBEncoding;
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
                            });

                            // Add the overlay texture as an emissive map
                            newMaterial.emissiveMap = overlayTexture;
                            newMaterial.emissiveIntensity = mixFactor;
                            newMaterial.emissive = new THREE.Color(0xffffff);
                            
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
            
            // Center the model
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
            
            // Scale the model to a reasonable size
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 2 / maxDim;
            model.scale.multiplyScalar(scale);
            
            // Add the model to the scene
            modelGroup.add(model);
            
            // Apply texture if provided
            if (texturePath) {
                console.log('Applying texture during model load:', texturePath);
                const loader = new THREE.TextureLoader(loadingManager);
                loader.load(
                    texturePath,
                    (overlayTexture) => {
                        console.log('Texture loaded successfully');
                        overlayTexture.encoding = THREE.sRGBEncoding;
                        overlayTexture.flipY = false;
                        
                        model.traverse((child) => {
                            if (child.isMesh) {
                                console.log('Applying texture to mesh:', child.name);
                                if (child.material) {
                                    const originalMaterial = child.material;
                                    const newMaterial = new THREE.MeshStandardMaterial({
                                        map: originalMaterial.map,
                                        color: 0xffffff,
                                        metalness: originalMaterial.metalness,
                                        roughness: originalMaterial.roughness,
                                        normalMap: originalMaterial.normalMap,
                                        aoMap: originalMaterial.aoMap,
                                        aoMapIntensity: originalMaterial.aoMapIntensity,
                                    });

                                    newMaterial.emissiveMap = overlayTexture;
                                    newMaterial.emissiveIntensity = mixFactor;
                                    newMaterial.emissive = new THREE.Color(0xffffff);
                                    
                                    child.material = newMaterial;
                                }
                            }
                        });
                    },
                    (xhr) => {
                        console.log((xhr.loaded / xhr.total * 100) + '% texture loaded');
                    },
                    (error) => {
                        console.error('Error loading texture:', error);
                    }
                );
            }
            
            // Adjust camera to fit model
            const radius = Math.max(size.x, size.y, size.z) * 2;
            camera.position.z = radius;
            controls.target.set(0, 0, 0);
            controls.update();
            
            console.log('Model loaded successfully');
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

// Animation state
let time = 0;
const walkRadius = 3; // Radius of the walking circle
const walkSpeed = 0.3; // Slower speed for more natural movement
let currentRotation = 0; // Track current rotation for smooth turning
const rotationSpeed = 0.05; // How quickly the dinosaur turns

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update time
    time += 0.016; // Approximately 60fps
    
    if (modelGroup.children.length > 0) {
        // Calculate new position on the circle
        const x = Math.cos(time * walkSpeed) * walkRadius;
        const z = Math.sin(time * walkSpeed) * walkRadius;
        
        // Calculate target rotation (where the dinosaur should face)
        const targetRotation = Math.atan2(z, x) + Math.PI/2;
        
        // Smoothly interpolate current rotation to target rotation
        const rotationDiff = targetRotation - currentRotation;
        
        // Normalize the rotation difference to be between -PI and PI
        const normalizedDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
        
        // Gradually adjust current rotation
        currentRotation += normalizedDiff * rotationSpeed;
        
        // Move the model
        modelGroup.position.x = x;
        modelGroup.position.z = z;
        
        // Apply the smoothed rotation
        modelGroup.rotation.y = currentRotation;
    }
    
    controls.update();
    renderer.render(scene, camera);
}

animate();

// Load the dinosaur model with texture
loadModel('/models/dino-1.glb', 'textures/dino-1.png', 0.8);

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

// Apply the overlay texture after a short delay
setTimeout(() => {
    console.log('Attempting to apply overlay texture...');
    // Make sure we're passing the correct parameters
    applyTexture('textures/dino-1.png', 0.8);
}, 1000); 