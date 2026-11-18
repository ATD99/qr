import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/UnrealBloomPass.js";

const websiteURL = "https://ofirsec.co.il";

new QRCode(document.getElementById("qrcode"), {
    text: websiteURL,
    width: 220,
    height: 220,
    colorDark: "#001233",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
});

const sceneContainer = document.getElementById("scene-container");
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    45,
    sceneContainer.clientWidth / sceneContainer.clientHeight,
    0.1,
    1000
);
camera.position.set(0, 0, 7.0);

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneContainer.appendChild(renderer.domElement);

// תאורה
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0x80ffea, 1.8);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);

const backLight = new THREE.DirectionalLight(0x1E8BC3, 1.2);
backLight.position.set(-5, 4, -6);
scene.add(backLight);

// זוהר עדין
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(sceneContainer.clientWidth, sceneContainer.clientHeight),
    0.35,
    0.4,
    0.88
));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);

// יעדי מיקום מצלמה חלקים למצבים השונים
const camPos3D = new THREE.Vector3(0, 0, 7.0);
const camPosQR = new THREE.Vector3(0, 6.2, 0.001); // מבט עליון ישר ונקי לברקוד
const targetCamPos = new THREE.Vector3(0, 0, 7.0);

// הפרדה חכמה בין גרירה (סיבוב) ללחיצה נקייה
let pointerDownPos = { x: 0, y: 0 };
let isQrState = false;
let morphProgress = 0;

sceneContainer.addEventListener("pointerdown", (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
});

sceneContainer.addEventListener("pointerup", (e) => {
    const moveDist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
    );
    if (moveDist < 5) {
        isQrState = !isQrState;
        if (isQrState) {
            targetCamPos.copy(camPosQR);
        } else {
            targetCamPos.copy(camPos3D);
        }
    }
});

let logoBlocks = null;
let qrBlocks = null;
let instancedMesh = null;
let currentTransforms = null;
let blockCount = 0;

const dummy = new THREE.Object3D();
const tempColor = new THREE.Color();

function initVoxelSystem() {
    if (!logoBlocks || !qrBlocks) return;

    blockCount = Math.max(logoBlocks.length, qrBlocks.length);
    currentTransforms = [];

    const boxGeo = new THREE.BoxGeometry(0.052, 0.052, 0.052);
    const boxMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.2
    });

    instancedMesh = new THREE.InstancedMesh(boxGeo, boxMat, blockCount);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    for (let i = 0; i < blockCount; i++) {
        const l = logoBlocks[i % logoBlocks.length];
        currentTransforms.push({
            x: l.x,
            y: l.y,
            z: l.z,
            scaleY: l.scaleY,
            r: l.color.r,
            g: l.color.g,
            b: l.color.b
        });

        dummy.position.set(l.x, l.y, l.z);
        dummy.scale.set(1, l.scaleY, 1);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
        instancedMesh.setColorAt(i, l.color);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
    scene.add(instancedMesh);
}

// 1. רשת ה-QR
setTimeout(() => {
    const qrCanvas = document.querySelector("#qrcode canvas");
    if (!qrCanvas) return;

    const ctx = qrCanvas.getContext("2d");
    const data = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height).data;
    const blocks = [];
    const step = Math.max(1, Math.floor(qrCanvas.width / 75));
    const scale = 3.6 / qrCanvas.width;

    const qrBaseColor = new THREE.Color(0x00f5d4);
    const qrEdgeColor = new THREE.Color(0x1E8BC3);

    for (let y = 0; y < qrCanvas.height; y += step) {
        for (let x = 0; x < qrCanvas.width; x += step) {
            const index = (y * qrCanvas.width + x) * 4;
            if (data[index] < 128) {
                const posX = (x - qrCanvas.width / 2) * scale;
                const posZ = (y - qrCanvas.height / 2) * scale;
                const dist = Math.hypot(posX, posZ);

                blocks.push({
                    x: posX,
                    y: -0.8,
                    z: posZ,
                    scaleY: 0.35,
                    color: qrBaseColor.clone().lerp(qrEdgeColor, Math.min(1, dist / 2.2))
                });
            }
        }
    }
    qrBlocks = blocks;
    initVoxelSystem();
}, 500);

// 2. הלוגו העומד
const img = new Image();
img.src = "logo.PNG";

img.onload = () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const blocks = [];
    const step = Math.max(1, Math.floor(canvas.width / 95));
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const scale = 3.0 / Math.max(canvas.width, canvas.height);

    const bottomColor = new THREE.Color(0x0d47a1);
    const topColor = new THREE.Color(0x64dfdf);

    for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
            const index = (y * canvas.width + x) * 4;
            if (data[index + 3] > 128) {
                const posX = (x - centerX) * scale;
                const posY = -(y - centerY) * scale; 
                const heightRatio = THREE.MathUtils.clamp((posY + 1.5) / 3.0, 0, 1);

                for (let z = -0.06; z <= 0.06; z += 0.06) {
                    blocks.push({
                        x: posX,
                        y: posY,
                        z: z,
                        scaleY: 1.0,
                        color: bottomColor.clone().lerp(topColor, heightRatio)
                    });
                }
            }
        }
    }
    logoBlocks = blocks;
    initVoxelSystem();
};

function animate() {
    requestAnimationFrame(animate);

    const target = isQrState ? 1 : 0;
    morphProgress += (target - morphProgress) * 0.08;

    // מעבר חלק של מיקום המצלמה שמונע גליצ'ים בבקרים
    camera.position.lerp(targetCamPos, 0.08);

    if (instancedMesh && logoBlocks && qrBlocks && currentTransforms) {
        for (let i = 0; i < blockCount; i++) {
            const l = logoBlocks[i % logoBlocks.length];
            const q = qrBlocks[i % qrBlocks.length];
            const curr = currentTransforms[i];

            const waveOffset = Math.sin(morphProgress * Math.PI) * Math.sin(i * 0.05) * 0.25;

            const tx = THREE.MathUtils.lerp(l.x, q.x, morphProgress);
            const ty = THREE.MathUtils.lerp(l.y, q.y, morphProgress) + waveOffset;
            const tz = THREE.MathUtils.lerp(l.z, q.z, morphProgress);
            const tScaleY = THREE.MathUtils.lerp(l.scaleY, q.scaleY, morphProgress);

            curr.x += (tx - curr.x) * 0.14;
            curr.y += (ty - curr.y) * 0.14;
            curr.z += (tz - curr.z) * 0.14;
            curr.scaleY += (tScaleY - curr.scaleY) * 0.14;

            dummy.position.set(curr.x, curr.y, curr.z);
            dummy.scale.set(1, curr.scaleY, 1);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);

            const tr = THREE.MathUtils.lerp(l.color.r, q.color.r, morphProgress);
            const tg = THREE.MathUtils.lerp(l.color.g, q.color.g, morphProgress);
            const tb = THREE.MathUtils.lerp(l.color.b, q.color.b, morphProgress);

            curr.r += (tr - curr.r) * 0.14;
            curr.g += (tg - curr.g) * 0.14;
            curr.b += (tb - curr.b) * 0.14;

            tempColor.setRGB(curr.r, curr.g, curr.b);
            instancedMesh.setColorAt(i, tempColor);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
    }

    controls.update();
    composer.render();
}

animate();

window.addEventListener("resize", () => {
    const width = sceneContainer.clientWidth;
    const height = sceneContainer.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
});
