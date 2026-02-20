// ============================================
// ABB PARTICLE SYSTEM - Three.js + MediaPipe
// ============================================

// Global Variables
let scene, camera, renderer;
let particleSystem, starField;
let hands, cameraUtils;
let videoElement;

// State
const state = {
    handPosition: new THREE.Vector3(0, 0, 0),
    currentGesture: 'none',
    customText: 'I LOVE U',
    isForcedShape: false,
    forcedShapeTimer: null,
    time: 0,
    particleCount: window.innerWidth < 768 ? 2000 : 4000
};

// Gesture Types
const GESTURES = {
    NONE: 'none',
    FIST: 'fist',      // Saturn
    OPEN: 'open',      // Open palm
    PEACE: 'peace',    // Two fingers - text
    METAL: 'metal'     // Heart
};

// ============================================
// THREE.JS SETUP
// ============================================

function initThree() {
    const container = document.getElementById('canvas-container');
    
    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.0005);
    
    // Camera
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 2000);
    camera.position.z = 500;
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    
    // Create starfield background
    createStarField();
    
    // Create particle system
    createParticleSystem();
    
    // Handle resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Update particle count based on device
    state.particleCount = window.innerWidth < 768 ? 2000 : 4000;
    createParticleSystem();
}

// ============================================
// STARFIELD BACKGROUND
// ============================================

function createStarField() {
    const geometry = new THREE.BufferGeometry();
    const count = 3000;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
        // Random positions in a sphere around the scene
        const r = 800 + Math.random() * 1000;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
        
        sizes[i] = Math.random() * 2 + 0.5;
        opacities[i] = Math.random();
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(0xffffff) }
        },
        vertexShader: `
            attribute float size;
            attribute float opacity;
            varying float vOpacity;
            uniform float time;
            
            void main() {
                vOpacity = opacity * (0.5 + 0.5 * sin(time * 2.0 + position.x * 0.01));
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            varying float vOpacity;
            
            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                float alpha = (1.0 - dist * 2.0) * vOpacity;
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending
    });
    
    starField = new THREE.Points(geometry, material);
    scene.add(starField);
}

// ============================================
// PARTICLE SYSTEM
// ============================================

function createParticleSystem() {
    if (particleSystem) {
        scene.remove(particleSystem);
        particleSystem.geometry.dispose();
        particleSystem.material.dispose();
    }
    
    const geometry = new THREE.BufferGeometry();
    const count = state.particleCount;
    
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count * 4); // For various random values
    
    const color = new THREE.Color();
    
    for (let i = 0; i < count; i++) {
        // Initial random positions
        positions[i * 3] = (Math.random() - 0.5) * 1000;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 1000;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 1000;
        
        // Cyan/blue default color
        color.setHSL(0.5 + Math.random() * 0.1, 1, 0.5);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        
        sizes[i] = Math.random() * 3 + 1;
        
        // Random values for animation variety
        randoms[i * 4] = Math.random();     // offset
        randoms[i * 4 + 1] = Math.random(); // speed
        randoms[i * 4 + 2] = Math.random(); // phase
        randoms[i * 4 + 3] = Math.random(); // type selector
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('random', new THREE.BufferAttribute(randoms, 4));
    
    // Store original positions for morphing
    geometry.userData = {
        originalPositions: positions.slice(),
        velocities: new Float32Array(count * 3),
        targetPositions: new Float32Array(count * 3)
    };
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            handPos: { value: new THREE.Vector3(0, 0, 0) },
            gesture: { value: 0 } // 0:none, 1:fist, 2:open, 3:peace, 4:metal
        },
        vertexShader: getParticleVertexShader(),
        fragmentShader: getParticleFragmentShader(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
}

function getParticleVertexShader() {
    return `
        attribute float size;
        attribute vec3 color;
        attribute vec4 random;
        
        uniform float time;
        uniform vec3 handPos;
        uniform int gesture;
        
        varying vec3 vColor;
        varying float vAlpha;
        
        // Noise function
        float noise(vec3 p) {
            return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        }
        
        void main() {
            vColor = color;
            
            vec3 pos = position;
            vec3 target = vec3(0.0);
            float t = time * 2.0;
            float r = random.x;
            float speed = random.y * 0.5 + 0.5;
            float phase = random.z * 6.28318;
            
            // Convert hand position to world space
            vec3 hand = handPos * 500.0;
            hand.z = 0.0;
            
            float blend = 0.0;
            
            if (gesture == 1) { // FIST - Saturn
                // Create ring and planet
                float ringAngle = r * 6.28318 + t * 0.3;
                float ringRadius = 120.0 + r * 80.0;
                float isRing = step(0.3, random.w);
                
                if (isRing > 0.5) {
                    // Ring particles - flattened
                    target.x = hand.x + cos(ringAngle) * ringRadius;
                    target.y = hand.y + sin(ringAngle) * ringRadius * 0.2;
                    target.z = hand.z + sin(ringAngle) * ringRadius * 0.5;
                } else {
                    // Planet body
                    float planetR = r * 60.0;
                    float theta = random.w * 3.14159;
                    float phi = r * 6.28318;
                    target.x = hand.x + planetR * sin(theta) * cos(phi + t * 0.5);
                    target.y = hand.y + planetR * sin(theta) * sin(phi + t * 0.5);
                    target.z = hand.z + planetR * cos(theta);
                }
                blend = 0.95;
                
            } else if (gesture == 2) { // OPEN PALM
                // Central sphere with wandering particles
                float isCenter = step(0.3, random.w);
                float sphereR = r * 50.0;
                
                if (isCenter > 0.5) {
                    float theta = r * 3.14159;
                    float phi = random.w * 6.28318;
                    target.x = hand.x + sphereR * sin(theta) * cos(phi);
                    target.y = hand.y + sphereR * sin(theta) * sin(phi);
                    target.z = hand.z + sphereR * cos(theta);
                } else {
                    // Wandering particles
                    float wanderR = 200.0 + r * 200.0;
                    float angle = t * 0.2 + phase;
                    target.x = hand.x + cos(angle) * wanderR;
                    target.y = hand.y + sin(angle * 1.3) * wanderR;
                    target.z = hand.z + sin(t + r * 10.0) * 100.0;
                }
                blend = 0.9;
                
            } else if (gesture == 3) { // PEACE - Text
                // Text formation using mathematical approximation
                float charIndex = floor(r * 7.0); // Up to 7 characters
                float charX = (charIndex - 3.0) * 40.0;
                
                // Simple letter shapes using noise and patterns
                float yOffset = sin(r * 20.0 + t) * 5.0;
                target.x = hand.x + charX + (random.w - 0.5) * 30.0;
                target.y = hand.y + yOffset + (r - 0.5) * 60.0;
                target.z = hand.z + sin(t * 2.0 + r * 10.0) * 20.0;
                blend = 0.92;
                
            } else if (gesture == 4) { // METAL - Heart
                // Heart shape parametric
                float heartT = r * 6.28318;
                float beat = 1.0 + sin(t * 8.0) * 0.1; // Heartbeat
                
                float heartX = 16.0 * pow(sin(heartT), 3.0);
                float heartY = 13.0 * cos(heartT) - 5.0 * cos(2.0 * heartT) 
                             - 2.0 * cos(3.0 * heartT) - cos(4.0 * heartT);
                
                float scale = 5.0 * beat;
                target.x = hand.x + heartX * scale;
                target.y = hand.y - heartY * scale + 20.0;
                target.z = hand.z + sin(heartT * 3.0 + t) * 30.0;
                blend = 0.94;
                
            } else { // NONE - Default floating
                target.x = pos.x + sin(t * speed + phase) * 50.0;
                target.y = pos.y + cos(t * speed * 0.7 + phase) * 50.0;
                target.z = pos.z + sin(t * 0.3 + r * 10.0) * 30.0;
                blend = 0.02;
            }
            
            // Smooth interpolation
            pos = mix(pos, target, blend * 0.1);
            
            // Add some noise movement
            pos += vec3(
                sin(t + r * 10.0) * 2.0,
                cos(t + r * 10.0) * 2.0,
                sin(t * 0.5 + r * 10.0) * 2.0
            );
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = size * (400.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
            
            vAlpha = 1.0;
        }
    `;
}

function getParticleFragmentShader() {
    return `
        varying vec3 vColor;
        varying float vAlpha;
        
        void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            
            // Soft glow
            float glow = 1.0 - dist * 2.0;
            glow = pow(glow, 1.5);
            
            gl_FragColor = vec4(vColor, glow * vAlpha);
        }
    `;
}

// ============================================
// ANIMATION LOOP
// ============================================

function animate() {
    requestAnimationFrame(animate);
    
    state.time += 0.016;
    
    // Update starfield
    if (starField) {
        starField.material.uniforms.time.value = state.time;
        starField.rotation.y += 0.0002;
    }
    
    // Update particles
    if (particleSystem) {
        const material = particleSystem.material;
        material.uniforms.time.value = state.time;
        material.uniforms.handPos.value.copy(state.handPosition);
        
        // Map gesture to uniform value
        const gestureMap = {
            'none': 0,
            'fist': 1,
            'open': 2,
            'peace': 3,
            'metal': 4
        };
        material.uniforms.gesture.value = gestureMap[state.currentGesture] || 0;
        
        // Update colors based on gesture
        updateParticleColors();
    }
    
    // Camera gentle movement
    camera.position.x += (state.handPosition.x * 100 - camera.position.x) * 0.02;
    camera.position.y += (state.handPosition.y * 100 - camera.position.y) * 0.02;
    
    renderer.render(scene, camera);
}

function updateParticleColors() {
    const colors = particleSystem.geometry.attributes.color.array;
    const count = state.particleCount;
    
    let hueBase = 0.5; // Cyan/blue default
    let hueRange = 0.1;
    
    switch (state.currentGesture) {
        case 'fist': // Saturn - gold/orange
            hueBase = 0.08;
            hueRange = 0.1;
            break;
        case 'open': // Green/cyan
            hueBase = 0.4;
            hueRange = 0.15;
            break;
        case 'peace': // Blue/purple
            hueBase = 0.6;
            hueRange = 0.2;
            break;
        case 'metal': // Pink/red heart
            hueBase = 0.95;
            hueRange = 0.1;
            break;
    }
    
    const color = new THREE.Color();
    let needsUpdate = false;
    
    // Update every 10th particle for performance
    const updateInterval = Math.max(1, Math.floor(count / 300));
    
    for (let i = 0; i < count; i += updateInterval) {
        const idx = i * 3;
        const hue = hueBase + (Math.random() - 0.5) * hueRange;
        color.setHSL(hue, 1, 0.5);
        
        colors[idx] = color.r;
        colors[idx + 1] = color.g;
        colors[idx + 2] = color.b;
    }
    
    particleSystem.geometry.attributes.color.needsUpdate = true;
}

// ============================================
// MEDIAPIPE HANDS SETUP
// ============================================

function initMediaPipe() {
    videoElement = document.getElementById('inputVideo');
    
    hands = new Hands({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});
    
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    hands.onResults(onHandResults);
    
    // Initialize camera
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({image: videoElement});
        },
        width: 320,
        height: 240
    });
    
    camera.start()
        .then(() => {
            document.getElementById('loading').classList.add('hidden');
        })
        .catch(err => {
            console.error('Camera error:', err);
            document.getElementById('loading').innerHTML = 
                '<p>Error mengakses kamera.<br>Pastikan izin kamera diberikan.</p>';
        });
}

function onHandResults(results) {
    const statusEl = document.getElementById('status');
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        // Calculate hand position (center of palm)
        const wrist = landmarks[0];
        const middleBase = landmarks[9];
        
        // Map to Three.js coordinates (-1 to 1)
        state.handPosition.x = (1 - (wrist.x + middleBase.x) / 2) * 2 - 1; // Mirror X
        state.handPosition.y = -((wrist.y + middleBase.y) / 2 * 2 - 1); // Invert Y
        
        // Detect gesture if not forced
        if (!state.isForcedShape) {
            state.currentGesture = detectGesture(landmarks);
        }
        
        statusEl.textContent = `Terdeteksi: ${getGestureDisplayName(state.currentGesture)}`;
        statusEl.classList.add('detected');
    } else {
        if (!state.isForcedShape) {
            state.currentGesture = GESTURES.NONE;
        }
        statusEl.textContent = 'Menunggu tangan...';
        statusEl.classList.remove('detected');
    }
}

function detectGesture(landmarks) {
    // Finger states
    const fingers = {
        thumb: isThumbExtended(landmarks),
        index: isFingerExtended(landmarks, 8, 5),
        middle: isFingerExtended(landmarks, 12, 9),
        ring: isFingerExtended(landmarks, 16, 13),
        pinky: isFingerExtended(landmarks, 20, 17)
    };
    
    // Metal/Rock: index + pinky extended, middle + ring folded
    if (fingers.index && !fingers.middle && !fingers.ring && fingers.pinky) {
        return GESTURES.METAL;
    }
    
    // Peace: index + middle extended, ring + pinky folded
    if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) {
        return GESTURES.PEACE;
    }
    
    // Fist: all fingers folded
    if (!fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
        return GESTURES.FIST;
    }
    
    // Open: all fingers extended
    if (fingers.index && fingers.middle && fingers.ring && fingers.pinky) {
        return GESTURES.OPEN;
    }
    
    return state.currentGesture;
}

function isFingerExtended(landmarks, tipIdx, baseIdx) {
    const tip = landmarks[tipIdx];
    const base = landmarks[baseIdx];
    // Y increases downward, so tip.y < base.y means finger is up
    return tip.y < base.y - 0.05;
}

function isThumbExtended(landmarks) {
    const tip = landmarks[4];
    const base = landmarks[2];
    // Check x distance for thumb
    return Math.abs(tip.x - base.x) > 0.05;
}

function getGestureDisplayName(gesture) {
    const names = {
        'none': 'Tidak ada',
        'fist': 'Saturnus ✊',
        'open': 'Terbuka ✋',
        'peace': 'Teks ✌️',
        'metal': 'Hati 🤘'
    };
    return names[gesture] || gesture;
}

// ============================================
// UI FUNCTIONS
// ============================================

// Menu toggle
const menuBtn = document.getElementById('menuBtn');
const menuDropdown = document.getElementById('menuDropdown');

menuBtn.addEventListener('click', () => {
    menuBtn.classList.toggle('active');
    menuDropdown.classList.toggle('active');
});

function toggleSubmenu(id) {
    const submenu = document.getElementById(id);
    submenu.classList.toggle('active');
}

// Modal functions
function showTutorial() {
    closeAllMenus();
    document.getElementById('tutorialModal').classList.add('active');
}

function showTextEdit() {
    closeAllMenus();
    document.getElementById('textEditModal').classList.add('active');
    document.getElementById('textInput').value = state.customText;
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function closeAllMenus() {
    menuBtn.classList.remove('active');
    menuDropdown.classList.remove('active');
    document.querySelectorAll('.submenu').forEach(s => s.classList.remove('active'));
}

function saveText() {
    const newText = document.getElementById('textInput').value.trim().toUpperCase();
    if (newText) {
        state.customText = newText;
        closeModal('textEditModal');
    }
}

function forceShape(shape) {
    closeAllMenus();
    state.currentGesture = shape;
    state.isForcedShape = true;
    
    // Clear previous timer
    if (state.forcedShapeTimer) {
        clearTimeout(state.forcedShapeTimer);
    }
    
    // Reset after 5 seconds
    state.forcedShapeTimer = setTimeout(() => {
        state.isForcedShape = false;
        state.currentGesture = GESTURES.NONE;
    }, 5000);
    
    // Update status
    const statusEl = document.getElementById('status');
    statusEl.textContent = `Manual: ${getGestureDisplayName(shape)}`;
    statusEl.classList.add('detected');
}

// Event listeners
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-btn') && !e.target.closest('.menu-dropdown')) {
        closeAllMenus();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    }
});

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initThree();
    initMediaPipe();
});
