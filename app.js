/**
 * GOD OF PARTICLES - Main Application
 * Three.js Particle System with MediaPipe Hand Tracking
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    particles: {
        maxCount: 50000,
        baseSize: 3,
        createRate: 500,      // particles per second when creating
        destroyRate: 1000,    // particles per second when destroying
        initialCount: 5000,
    },
    physics: {
        attractForce: 0.15,
        repelForce: 0.25,
        spinForce: 0.08,
        friction: 0.98,
        maxSpeed: 2,
    },
    colors: {
        cosmic: [
            new THREE.Color(0x00f5ff),  // Cyan
            new THREE.Color(0xbf00ff),  // Magenta
            new THREE.Color(0xff006e),  // Pink
            new THREE.Color(0xffd700),  // Gold
        ],
        fire: [
            new THREE.Color(0xff4500),
            new THREE.Color(0xff6600),
            new THREE.Color(0xff8c00),
            new THREE.Color(0xffd700),
        ],
        ocean: [
            new THREE.Color(0x0077be),
            new THREE.Color(0x00bfff),
            new THREE.Color(0x00f5ff),
            new THREE.Color(0x7fdbff),
        ],
        nature: [
            new THREE.Color(0x00ff88),
            new THREE.Color(0x00cc6a),
            new THREE.Color(0x88ff00),
            new THREE.Color(0xccff00),
        ],
        void: [
            new THREE.Color(0x1a1a2e),
            new THREE.Color(0x4a4a6e),
            new THREE.Color(0x8a8aae),
            new THREE.Color(0xffffff),
        ],
    }
};

// ============================================
// GLOBAL STATE
// ============================================

// Helper to create hand state
function createHandState() {
    return {
        active: false,
        gesture: 'NONE',
        powerLevel: 'IDLE',
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        previousPosition: new THREE.Vector3(),
        fingerSpread: 0,
        pinchDistance: 0,
        handedness: 'unknown',
        // Motion tracking for circular detection
        motionHistory: [],
        speed: 0,
        isCircularMotion: false,
        extendedFingers: 0,
    };
}

const state = {
    isInitialized: false,
    activeColorScheme: 'cosmic',
    particleCount: 0,
    hands: [createHandState(), createHandState()],
    displayGesture: 'NONE',
    displayPower: 'IDLE',
};

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
    loadingScreen: document.getElementById('loading-screen'),
    permissionScreen: document.getElementById('permission-screen'),
    enableCameraBtn: document.getElementById('enable-camera'),
    canvasContainer: document.getElementById('canvas-container'),
    cameraFeed: document.getElementById('camera-feed'),
    handCanvas: document.getElementById('hand-canvas'),
    hud: document.getElementById('hud'),
    particleCount: document.getElementById('particle-count'),
    powerLevel: document.getElementById('power-level'),
    currentGesture: document.getElementById('current-gesture'),
    colorBtns: document.querySelectorAll('.color-btn'),
};

// ============================================
// THREE.JS SETUP
// ============================================
let scene, camera, renderer, composer;
let particleSystem, particleGeometry, particleMaterial;
let positions, velocities, colors, sizes, lifetimes;
let clock = new THREE.Clock();

function initThreeJS() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.0008);

    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        2000
    );
    camera.position.z = 500;

    // Renderer
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    elements.canvasContainer.appendChild(renderer.domElement);

    // Post-processing
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5,  // strength
        0.4,  // radius
        0.85  // threshold
    );
    composer.addPass(bloomPass);

    // Initialize particles
    initParticles();

    // Add ambient stars
    createStarField();

    // Handle resize
    window.addEventListener('resize', onWindowResize);
}

function initParticles() {
    const count = CONFIG.particles.maxCount;

    // Create geometry
    particleGeometry = new THREE.BufferGeometry();

    // Initialize arrays
    positions = new Float32Array(count * 3);
    velocities = new Float32Array(count * 3);
    colors = new Float32Array(count * 3);
    sizes = new Float32Array(count);
    lifetimes = new Float32Array(count);

    // Initialize with some particles
    for (let i = 0; i < CONFIG.particles.initialCount; i++) {
        createParticle(i);
    }
    state.particleCount = CONFIG.particles.initialCount;

    // Fill rest with inactive particles
    for (let i = CONFIG.particles.initialCount; i < count; i++) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = -10000; // Far away = inactive
        sizes[i] = 0;
        lifetimes[i] = 0;
    }

    // Set attributes
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Shader material for beautiful particles
    particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
        vertexShader: `
            attribute float size;
            attribute vec3 color;
            varying vec3 vColor;
            varying float vAlpha;
            uniform float uTime;
            uniform float uPixelRatio;
            
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Size attenuation
                float sizeAttenuation = (300.0 / -mvPosition.z);
                gl_PointSize = size * sizeAttenuation * uPixelRatio;
                
                // Fade based on distance
                vAlpha = smoothstep(2000.0, 200.0, -mvPosition.z);
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vAlpha;
            
            void main() {
                // Circular particle with soft edges
                vec2 center = gl_PointCoord - 0.5;
                float dist = length(center);
                
                if (dist > 0.5) discard;
                
                // Soft glow effect
                float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                alpha *= vAlpha;
                
                // Core brightness
                float core = 1.0 - smoothstep(0.0, 0.2, dist);
                vec3 finalColor = vColor + core * 0.5;
                
                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);
}

function createParticle(index, position = null, velocity = null) {
    const i3 = index * 3;
    const colorScheme = CONFIG.colors[state.activeColorScheme];
    const color = colorScheme[Math.floor(Math.random() * colorScheme.length)];

    if (position) {
        // Create at specific position (hand position)
        positions[i3] = position.x + (Math.random() - 0.5) * 50;
        positions[i3 + 1] = position.y + (Math.random() - 0.5) * 50;
        positions[i3 + 2] = position.z + (Math.random() - 0.5) * 50;

        // Initial velocity based on hand velocity
        const vel = velocity || new THREE.Vector3();
        velocities[i3] = vel.x * 0.3 + (Math.random() - 0.5) * 2;
        velocities[i3 + 1] = vel.y * 0.3 + (Math.random() - 0.5) * 2;
        velocities[i3 + 2] = vel.z * 0.3 + (Math.random() - 0.5) * 2;
    } else {
        // Random position in sphere
        const radius = 300 + Math.random() * 200;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi);

        velocities[i3] = (Math.random() - 0.5) * 0.5;
        velocities[i3 + 1] = (Math.random() - 0.5) * 0.5;
        velocities[i3 + 2] = (Math.random() - 0.5) * 0.5;
    }

    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[index] = CONFIG.particles.baseSize + Math.random() * 3;
    lifetimes[index] = 1.0;
}

function createStarField() {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
        const i3 = i * 3;
        const radius = 800 + Math.random() * 500;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        starPositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        starPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        starPositions[i3 + 2] = radius * Math.cos(phi);
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));

    const starMaterial = new THREE.PointsMaterial({
        size: 1,
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
    });

    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    particleMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
}

// ============================================
// MEDIAPIPE HAND TRACKING
// ============================================
let hands;
let handCamera;
const handCanvasCtx = elements.handCanvas.getContext('2d');

async function initHandTracking() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2,  // DUAL HAND POWER!
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
    });

    hands.onResults(onHandResults);
}

function onHandResults(results) {
    // Clear hand canvas
    handCanvasCtx.clearRect(0, 0, elements.handCanvas.width, elements.handCanvas.height);

    // Reset all hands to inactive
    state.hands.forEach(hand => {
        hand.active = false;
    });

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Process each detected hand
        results.multiHandLandmarks.forEach((landmarks, index) => {
            if (index < 2) { // Max 2 hands
                const handedness = results.multiHandedness[index]?.label || 'unknown';
                const handColors = ['#00f5ff', '#ff006e']; // Cyan for first, Pink for second

                // Draw hand skeleton with unique color
                drawHandSkeleton(landmarks, handColors[index]);

                // Process hand data
                processHandData(landmarks, index, handedness);
            }
        });
    }

    // Update display values for HUD
    updateDisplayState();
    updateHUD();
}

function updateDisplayState() {
    // Find the most "powerful" gesture to display
    const priorities = ['PINCH', 'OPEN_PALM', 'FIST', 'POINT', 'PEACE', 'NEUTRAL', 'NONE'];
    let displayGesture = 'NONE';
    let displayPower = 'IDLE';
    let activeCount = 0;

    state.hands.forEach(hand => {
        if (hand.active) {
            activeCount++;
            const currentPriority = priorities.indexOf(hand.gesture);
            const displayPriority = priorities.indexOf(displayGesture);

            if (currentPriority !== -1 && (displayPriority === -1 || currentPriority < displayPriority)) {
                displayGesture = hand.gesture;
                displayPower = hand.powerLevel;
            }
        }
    });

    // Special dual-hand gestures
    if (activeCount === 2) {
        const [hand1, hand2] = state.hands;

        // Both hands doing same gesture = amplified power
        if (hand1.gesture === hand2.gesture && hand1.gesture !== 'NONE') {
            displayPower = `DUAL ${hand1.powerLevel}`;
        }

        // One creating, one destroying = CHAOS
        if ((hand1.gesture === 'OPEN_PALM' && hand2.gesture === 'FIST') ||
            (hand1.gesture === 'FIST' && hand2.gesture === 'OPEN_PALM')) {
            displayGesture = 'CHAOS';
            displayPower = 'CREATION & DESTRUCTION';
        }

        // Both pinching = SUPERNOVA
        if (hand1.gesture === 'PINCH' && hand2.gesture === 'PINCH') {
            displayGesture = 'SUPERNOVA';
            displayPower = 'DUAL GALAXY SPIN';
        }
    }

    state.displayGesture = displayGesture;
    state.displayPower = displayPower;
}

function drawHandSkeleton(landmarks, color = '#00f5ff') {
    const ctx = handCanvasCtx;
    const w = elements.handCanvas.width;
    const h = elements.handCanvas.height;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillStyle = color;

    // Finger connections
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],     // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8],     // Index
        [0, 9], [9, 10], [10, 11], [11, 12], // Middle
        [0, 13], [13, 14], [14, 15], [15, 16], // Ring
        [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
        [5, 9], [9, 13], [13, 17],           // Palm
    ];

    ctx.beginPath();
    connections.forEach(([start, end]) => {
        ctx.moveTo(landmarks[start].x * w, landmarks[start].y * h);
        ctx.lineTo(landmarks[end].x * w, landmarks[end].y * h);
    });
    ctx.stroke();

    // Draw landmarks
    landmarks.forEach((lm, i) => {
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, 3, 0, Math.PI * 2);
        ctx.fill();
    });
}

function processHandData(landmarks, handIndex, handedness) {
    const hand = state.hands[handIndex];
    hand.active = true;
    hand.handedness = handedness;

    // Get palm center (average of wrist and finger bases)
    const palmPoints = [0, 5, 9, 13, 17];
    let palmX = 0, palmY = 0, palmZ = 0;
    palmPoints.forEach(i => {
        palmX += landmarks[i].x;
        palmY += landmarks[i].y;
        palmZ += landmarks[i].z;
    });
    palmX /= palmPoints.length;
    palmY /= palmPoints.length;
    palmZ /= palmPoints.length;

    // Convert to 3D space (centered, scaled)
    const newPosition = new THREE.Vector3(
        (palmX - 0.5) * -800,  // Flip X for mirror effect
        (palmY - 0.5) * -600,
        palmZ * 500
    );

    // Calculate hand velocity
    hand.velocity.subVectors(newPosition, hand.position);
    hand.previousPosition.copy(hand.position);
    hand.position.copy(newPosition);

    // Detect gestures for this hand
    detectGesture(landmarks, handIndex);
}

function detectGesture(landmarks, handIndex) {
    const hand = state.hands[handIndex];

    // Calculate finger spread (how open is the hand)
    const fingertips = [4, 8, 12, 16, 20];
    const palm = landmarks[0]; // Wrist

    let spreadSum = 0;
    fingertips.forEach(i => {
        const dx = landmarks[i].x - palm.x;
        const dy = landmarks[i].y - palm.y;
        spreadSum += Math.sqrt(dx * dx + dy * dy);
    });
    hand.fingerSpread = spreadSum / fingertips.length;

    // Pinch distance (thumb to index)
    const thumb = landmarks[4];
    const index = landmarks[8];
    hand.pinchDistance = Math.sqrt(
        Math.pow(thumb.x - index.x, 2) +
        Math.pow(thumb.y - index.y, 2)
    );

    // Check if fingers are extended
    const fingerExtended = [];

    // Thumb
    if (hand.handedness === 'Right') {
        fingerExtended[0] = landmarks[4].x < landmarks[3].x;
    } else {
        fingerExtended[0] = landmarks[4].x > landmarks[3].x;
    }

    // Other fingers - tip y is less than pip y (higher on screen)
    fingerExtended[1] = landmarks[8].y < landmarks[6].y;   // Index
    fingerExtended[2] = landmarks[12].y < landmarks[10].y; // Middle
    fingerExtended[3] = landmarks[16].y < landmarks[14].y; // Ring
    fingerExtended[4] = landmarks[20].y < landmarks[18].y; // Pinky

    const extendedCount = fingerExtended.filter(Boolean).length;

    // ===== SIMPLE GESTURE RECOGNITION =====
    if (hand.pinchDistance < 0.05) {
        hand.gesture = 'PINCH';
        hand.powerLevel = 'GALAXY SPIN';
    } else if (extendedCount >= 4 && hand.fingerSpread > 0.18) {
        hand.gesture = 'OPEN_PALM';
        hand.powerLevel = 'CREATING';
    } else if (extendedCount <= 1) {
        hand.gesture = 'FIST';
        hand.powerLevel = 'DESTROYING';
    } else if (fingerExtended[1] && !fingerExtended[2] && !fingerExtended[3] && !fingerExtended[4]) {
        hand.gesture = 'POINT';
        hand.powerLevel = 'ATTRACT';
    } else if (fingerExtended[1] && fingerExtended[2] && !fingerExtended[3] && !fingerExtended[4]) {
        hand.gesture = 'PEACE';
        hand.powerLevel = 'REPEL';
    } else {
        hand.gesture = 'NEUTRAL';
        hand.powerLevel = 'IDLE';
    }
}

// ============================================
// PARTICLE PHYSICS
// ============================================
function updateParticles(delta) {
    const positionAttr = particleGeometry.attributes.position;
    const colorAttr = particleGeometry.attributes.color;
    const sizeAttr = particleGeometry.attributes.size;

    const colorScheme = CONFIG.colors[state.activeColorScheme];

    // Check for dual-hand effects
    const bothHandsActive = state.hands[0].active && state.hands[1].active;
    const dualPinch = bothHandsActive &&
        state.hands[0].gesture === 'PINCH' &&
        state.hands[1].gesture === 'PINCH';

    for (let i = 0; i < CONFIG.particles.maxCount; i++) {
        const i3 = i * 3;

        // Skip inactive particles
        if (positions[i3 + 2] < -5000) continue;

        // Get particle position
        const px = positions[i3];
        const py = positions[i3 + 1];
        const pz = positions[i3 + 2];

        // Apply forces from EACH active hand
        state.hands.forEach((hand, handIndex) => {
            if (!hand.active || hand.gesture === 'NONE' || hand.gesture === 'NEUTRAL') return;

            // Calculate distance to this hand
            const dx = hand.position.x - px;
            const dy = hand.position.y - py;
            const dz = hand.position.z - pz;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (distance < 400) {
                const force = 1 - (distance / 400); // Stronger when closer
                const dirX = dx / (distance + 0.001);
                const dirY = dy / (distance + 0.001);
                const dirZ = dz / (distance + 0.001);

                // Amplify force if both hands are doing the same gesture
                const amplifier = (bothHandsActive && state.hands[0].gesture === state.hands[1].gesture) ? 1.5 : 1.0;

                switch (hand.gesture) {
                    case 'POINT': // Attract
                        velocities[i3] += dirX * CONFIG.physics.attractForce * force * amplifier;
                        velocities[i3 + 1] += dirY * CONFIG.physics.attractForce * force * amplifier;
                        velocities[i3 + 2] += dirZ * CONFIG.physics.attractForce * force * amplifier;
                        break;

                    case 'PEACE': // Repel
                        velocities[i3] -= dirX * CONFIG.physics.repelForce * force * amplifier;
                        velocities[i3 + 1] -= dirY * CONFIG.physics.repelForce * force * amplifier;
                        velocities[i3 + 2] -= dirZ * CONFIG.physics.repelForce * force * amplifier;
                        break;

                    case 'PINCH': // Galaxy spin
                        const tangentX = -dy;
                        const tangentY = dx;
                        const spinMultiplier = dualPinch ? 2.0 : 1.0;
                        velocities[i3] += tangentX * CONFIG.physics.spinForce * force * 0.01 * spinMultiplier;
                        velocities[i3 + 1] += tangentY * CONFIG.physics.spinForce * force * 0.01 * spinMultiplier;

                        // Pull slightly inward
                        velocities[i3] += dirX * CONFIG.physics.attractForce * force * 0.3;
                        velocities[i3 + 1] += dirY * CONFIG.physics.attractForce * force * 0.3;
                        break;

                    case 'FIST': // Destroy nearby particles
                        if (distance < 100) {
                            lifetimes[i] -= delta * 3 * amplifier;
                            if (lifetimes[i] <= 0) {
                                positions[i3 + 2] = -10000;
                                sizes[i] = 0;
                                state.particleCount = Math.max(0, state.particleCount - 1);
                            } else {
                                sizes[i] *= 0.95;
                            }
                        }
                        break;
                }
            }
        });

        // Special: if dual pinch (SUPERNOVA), pull particles toward center between hands
        if (dualPinch) {
            const centerX = (state.hands[0].position.x + state.hands[1].position.x) / 2;
            const centerY = (state.hands[0].position.y + state.hands[1].position.y) / 2;
            const centerZ = (state.hands[0].position.z + state.hands[1].position.z) / 2;

            const dx = centerX - px;
            const dy = centerY - py;
            const dz = centerZ - pz;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < 500) {
                const pullForce = 0.05 * (1 - dist / 500);
                velocities[i3] += (dx / dist) * pullForce;
                velocities[i3 + 1] += (dy / dist) * pullForce;
                velocities[i3 + 2] += (dz / dist) * pullForce;
            }
        }

        // Apply friction
        velocities[i3] *= CONFIG.physics.friction;
        velocities[i3 + 1] *= CONFIG.physics.friction;
        velocities[i3 + 2] *= CONFIG.physics.friction;

        // Clamp velocity
        const speed = Math.sqrt(
            velocities[i3] * velocities[i3] +
            velocities[i3 + 1] * velocities[i3 + 1] +
            velocities[i3 + 2] * velocities[i3 + 2]
        );

        if (speed > CONFIG.physics.maxSpeed) {
            const scale = CONFIG.physics.maxSpeed / speed;
            velocities[i3] *= scale;
            velocities[i3 + 1] *= scale;
            velocities[i3 + 2] *= scale;
        }

        // Update position
        positions[i3] += velocities[i3];
        positions[i3 + 1] += velocities[i3 + 1];
        positions[i3 + 2] += velocities[i3 + 2];

        // Boundary check - wrap around
        const boundary = 700;
        if (Math.abs(positions[i3]) > boundary) positions[i3] *= -0.9;
        if (Math.abs(positions[i3 + 1]) > boundary) positions[i3 + 1] *= -0.9;
        if (Math.abs(positions[i3 + 2]) > boundary) positions[i3 + 2] *= -0.9;
    }

    // Create new particles with open palm - from EACH hand that's creating
    state.hands.forEach(hand => {
        if (hand.active && hand.gesture === 'OPEN_PALM') {
            const rateMultiplier = (bothHandsActive && state.hands[0].gesture === 'OPEN_PALM' && state.hands[1].gesture === 'OPEN_PALM') ? 0.75 : 1.0;
            const toCreate = Math.floor(CONFIG.particles.createRate * delta * rateMultiplier);

            for (let i = 0; i < toCreate && state.particleCount < CONFIG.particles.maxCount; i++) {
                for (let j = 0; j < CONFIG.particles.maxCount; j++) {
                    if (positions[j * 3 + 2] < -5000) {
                        createParticle(j, hand.position, hand.velocity);
                        state.particleCount++;
                        break;
                    }
                }
            }
        }
    });

    // Mark attributes for update
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
}

// ============================================
// HUD UPDATE
// ============================================
function updateHUD() {
    elements.particleCount.textContent = state.particleCount.toLocaleString();
    elements.powerLevel.textContent = state.displayPower;

    // Count active hands
    const activeHands = state.hands.filter(h => h.active).length;
    let gestureDisplay = state.displayGesture.replace('_', ' ');
    if (activeHands === 2) {
        gestureDisplay = `✋✋ ${gestureDisplay}`;
    } else if (activeHands === 1) {
        gestureDisplay = `✋ ${gestureDisplay}`;
    }
    elements.currentGesture.textContent = gestureDisplay;

    // Update power level color
    const powerColors = {
        'IDLE': '#888',
        'CREATING': '#00ff88',
        'DUAL CREATING': '#00ff88',
        'DESTROYING': '#ff006e',
        'DUAL DESTROYING': '#ff006e',
        'ATTRACT': '#00f5ff',
        'DUAL ATTRACT': '#00f5ff',
        'REPEL': '#ffd700',
        'DUAL REPEL': '#ffd700',
        'GALAXY SPIN': '#bf00ff',
        'DUAL GALAXY SPIN': '#ff00ff',
        'CREATION & DESTRUCTION': '#ff8800',
    };
    elements.powerLevel.style.color = powerColors[state.displayPower] || '#00f5ff';
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Update shader time
    if (particleMaterial) {
        particleMaterial.uniforms.uTime.value = clock.elapsedTime;
    }

    // Update particles
    updateParticles(delta);

    // Subtle camera movement based on average of active hands
    let avgX = 0, avgY = 0, activeCount = 0;
    state.hands.forEach(hand => {
        if (hand.active) {
            avgX += hand.position.x;
            avgY += hand.position.y;
            activeCount++;
        }
    });
    if (activeCount > 0) {
        avgX /= activeCount;
        avgY /= activeCount;
    }
    camera.position.x += (avgX * 0.05 - camera.position.x) * 0.02;
    camera.position.y += (avgY * 0.05 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);

    // Render
    composer.render();
}

// ============================================
// CAMERA SETUP
// ============================================
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                facingMode: 'user',
            }
        });

        elements.cameraFeed.srcObject = stream;
        elements.cameraFeed.classList.add('active');

        // Set canvas dimensions
        elements.handCanvas.width = 240;
        elements.handCanvas.height = 180;

        // Start MediaPipe camera
        handCamera = new Camera(elements.cameraFeed, {
            onFrame: async () => {
                await hands.send({ image: elements.cameraFeed });
            },
            width: 640,
            height: 480,
        });

        await handCamera.start();

        console.log('Camera started successfully');
        return true;
    } catch (error) {
        console.error('Camera access error:', error);
        alert('Camera access is required for hand tracking. Please allow camera access and refresh.');
        return false;
    }
}

// ============================================
// COLOR SCHEME HANDLING
// ============================================
function setupColorButtons() {
    elements.colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.colorBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeColorScheme = btn.dataset.color;

            // Gradually update existing particle colors
            const colorScheme = CONFIG.colors[state.activeColorScheme];
            for (let i = 0; i < CONFIG.particles.maxCount; i++) {
                if (positions[i * 3 + 2] > -5000 && Math.random() < 0.3) {
                    const color = colorScheme[Math.floor(Math.random() * colorScheme.length)];
                    colors[i * 3] = color.r;
                    colors[i * 3 + 1] = color.g;
                    colors[i * 3 + 2] = color.b;
                }
            }
        });
    });
}

// ============================================
// INITIALIZATION
// ============================================
async function init() {
    // Update loading text
    const loadingText = document.querySelector('.loading-text');

    loadingText.textContent = 'Initializing Three.js...';
    await new Promise(r => setTimeout(r, 300));
    initThreeJS();

    loadingText.textContent = 'Loading hand tracking model...';
    await initHandTracking();

    loadingText.textContent = 'Preparing cosmic powers...';
    await new Promise(r => setTimeout(r, 500));

    setupColorButtons();

    // Hide loading, show permission
    elements.loadingScreen.classList.add('hidden');
    elements.permissionScreen.classList.remove('hidden');

    // Start animation loop
    animate();

    // Handle camera enable button
    elements.enableCameraBtn.addEventListener('click', async () => {
        elements.enableCameraBtn.textContent = 'AWAKENING...';
        elements.enableCameraBtn.disabled = true;

        const success = await startCamera();

        if (success) {
            elements.permissionScreen.classList.add('hidden');
            elements.hud.classList.remove('hidden');
            state.isInitialized = true;
        } else {
            elements.enableCameraBtn.textContent = 'RETRY';
            elements.enableCameraBtn.disabled = false;
        }
    });
}

// Start everything
init().catch(console.error);
