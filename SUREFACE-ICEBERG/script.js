import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";

const container = document.getElementById("scene-container");
const scene = new THREE.Scene();

const skyColor = new THREE.Color(0x8ecae6);
const horizonFogColor = new THREE.Color(0xbde0fe);

scene.background = skyColor.clone();
scene.fog = new THREE.FogExp2(0xbde0fe, 0.015);

const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    500
);
camera.position.set(0, 3.2, 26);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
container.appendChild(renderer.domElement);

// תאורת יום טבעית
const hemiLight = new THREE.HemisphereLight(0xf0f9ff, 0x073b4c, 1.35);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.5);
sunLight.position.set(14, 24, 16);
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.05);
rimLight.position.set(-14, 6, -14);
scene.add(rimLight);

// כיפת שמיים ריאליסטית ועדינה עם גרדיאנט ועננים נעים לאט
const skyUniforms = {
    topColor: { value: new THREE.Color(0x4ea8de) },
    horizonColor: { value: new THREE.Color(0xbde0fe) },
    sunDir: { value: sunLight.position.clone().normalize() },
    time: { value: 0 }
};

const skyGeo = new THREE.SphereGeometry(260, 48, 32);
const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,
    fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDir;
        uniform float time;
        varying vec3 vWorldPosition;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
                u.y
            );
        }

        float fbm(vec2 p) {
            float val = 0.0;
            float amp = 0.5;
            for (int i = 0; i < 4; i++) {
                val += amp * noise(p);
                p *= 2.03;
                amp *= 0.5;
            }
            return val;
        }

        void main() {
            vec3 dir = normalize(vWorldPosition);
            float h = clamp(dir.y, 0.0, 1.0);

            vec3 col = mix(horizonColor, topColor, pow(h, 0.65));

            float sunAmt = max(dot(dir, normalize(sunDir)), 0.0);
            col += vec3(1.0, 0.96, 0.85) * pow(sunAmt, 14.0) * 0.14;

            if (dir.y > 0.02) {
                vec2 cloudUV = dir.xz / (dir.y + 0.18) * 1.35;
                cloudUV += vec2(time * 0.012, time * 0.005);
                float n = fbm(cloudUV);
                float cloudMask = smoothstep(0.52, 0.78, n) * smoothstep(0.02, 0.25, dir.y);
                vec3 cloudColor = mix(vec3(0.95, 0.98, 1.0), vec3(1.0, 0.99, 0.95), pow(sunAmt, 4.0));
                col = mix(col, cloudColor, cloudMask * 0.42);
            }

            gl_FragColor = vec4(col, 1.0);
        }
    `
});

const skyDome = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyDome);

// מפת נורמלים מרובת-שכבות למים ריאליסטיים יותר
function createDetailedWaterNormals() {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(size, size);

    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = (x / size) * Math.PI * 2;
            const v = (y / size) * Math.PI * 2;

            const swell =
                Math.sin(u * 2 + Math.cos(v * 2) * 1.1) * 0.45 +
                Math.cos(v * 3 - Math.sin(u * 2) * 1.0) * 0.35;

            const ripples =
                Math.sin(u * 9 + v * 6 + Math.cos(u * 5 - v * 7) * 1.4) * 0.14 +
                Math.cos(u * 14 - v * 11 + Math.sin(v * 8) * 1.2) * 0.08;

            heights[y * size + x] = swell + ripples;
        }
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const xl = (x - 1 + size) % size;
            const xr = (x + 1) % size;
            const yu = (y - 1 + size) % size;
            const yd = (y + 1) % size;

            const dx = (heights[y * size + xr] - heights[y * size + xl]) * 2.4;
            const dy = (heights[yd * size + x] - heights[yu * size + x]) * 2.4;
            const nz = 1.0;
            const len = Math.hypot(dx, dy, nz);

            const idx = (y * size + x) * 4;
            imgData.data[idx] = Math.floor(((-dx / len) * 0.5 + 0.5) * 255);
            imgData.data[idx + 1] = Math.floor(((-dy / len) * 0.5 + 0.5) * 255);
            imgData.data[idx + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
            imgData.data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

const waterNormals = createDetailedWaterNormals();
const waterGeo = new THREE.PlaneGeometry(340, 340);

// כחול כהה חזק + השתקפות הכי חלשה שאפשר (עדיין עם טקסטורת גלים חיה)
const deepWaterHex = 0x021224;
const deepWaterVec = new THREE.Color(deepWaterHex);

const water = new Water(waterGeo, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals,
    sunDirection: sunLight.position.clone().normalize(),
    sunColor: 0x0ea5e9,
    waterColor: deepWaterHex,
    distortionScale: 0.35,
    fog: scene.fog !== undefined
});
water.rotation.x = -Math.PI / 2;
if (water.material.uniforms["size"]) {
    water.material.uniforms["size"].value = 1.5;
}
water.material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
        "gl_FragColor = vec4( color, 1.0 );",
        `
        vec3 baseDeep = vec3(${deepWaterVec.r.toFixed(4)}, ${deepWaterVec.g.toFixed(4)}, ${deepWaterVec.b.toFixed(4)});
        float waveDetail = clamp(dot(surfaceNormal, normalize(vec3(0.3, 1.0, 0.25))), 0.0, 1.0);
        vec3 sculptedWater = baseDeep * (0.72 + waveDetail * 0.65);
        color = mix(sculptedWater, color, 0.025);
        gl_FragColor = vec4( color, 1.0 );
        `
    );
};
scene.add(water);

const icebergGroup = new THREE.Group();
scene.add(icebergGroup);

const TIP_START_Y = -0.2;
const ABOVE_WATER_Y = 3.15;

/**
 * בניית הקרחון המדויק מתוך הלוגו שלך עם החלקת שוליים (ללא שינוי בחומר)
 */
function buildExactSmoothLogo(img) {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, size, size);

    const { data } = ctx.getImageData(0, 0, size, size);

    const cols = 160;
    const rows = 160;
    const worldScale = 5.4;
    const threshold = 36;

    const sampleAt = (u, v) => {
        const fx = Math.min(size - 1.001, Math.max(0, u * (size - 1)));
        const fy = Math.min(size - 1.001, Math.max(0, v * (size - 1)));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;

        const getPx = (px, py) => {
            const idx = (py * size + px) * 4;
            return [data[idx], data[idx + 1], data[idx + 2]];
        };

        const c00 = getPx(x0, y0);
        const c10 = getPx(x0 + 1, y0);
        const c01 = getPx(x0, y0 + 1);
        const c11 = getPx(x0 + 1, y0 + 1);

        const r = (c00[0] * (1 - tx) + c10[0] * tx) * (1 - ty) + (c01[0] * (1 - tx) + c11[0] * tx) * ty;
        const g = (c00[1] * (1 - tx) + c10[1] * tx) * (1 - ty) + (c01[1] * (1 - tx) + c11[1] * tx) * ty;
        const b = (c00[2] * (1 - tx) + c10[2] * tx) * (1 - ty) + (c01[2] * (1 - tx) + c11[2] * tx) * ty;

        const maxCh = Math.max(r, g, b);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        return {
            r: r / 255,
            g: g / 255,
            b: b / 255,
            lum,
            strength: maxCh,
            active: maxCh > threshold
        };
    };

    const grid = Array.from({ length: rows + 1 }, () => new Array(cols + 1));

    for (let gy = 0; gy <= rows; gy++) {
        for (let gx = 0; gx <= cols; gx++) {
            const u = gx / cols;
            const v = gy / rows;
            const s = sampleAt(u, v);

            const radialFade = Math.max(0, 1 - Math.hypot((u - 0.5) * 1.85, (v - 0.5) * 1.85));
            const rawDepth = s.active ? (0.1 + s.lum * 0.32 + radialFade * 0.42) : 0;

            grid[gy][gx] = {
                x: (u - 0.5) * worldScale,
                y: -(v - 0.5) * worldScale,
                u,
                v,
                r: s.r,
                g: s.g,
                b: s.b,
                strength: s.strength,
                active: s.active,
                depth: rawDepth
            };
        }
    }

    for (let pass = 0; pass < 2; pass++) {
        const nextDepths = Array.from({ length: rows + 1 }, () => new Float32Array(cols + 1));
        const nextR = Array.from({ length: rows + 1 }, () => new Float32Array(cols + 1));
        const nextG = Array.from({ length: rows + 1 }, () => new Float32Array(cols + 1));
        const nextB = Array.from({ length: rows + 1 }, () => new Float32Array(cols + 1));

        for (let gy = 1; gy < rows; gy++) {
            for (let gx = 1; gx < cols; gx++) {
                const cell = grid[gy][gx];
                if (!cell.active) continue;

                const neighbors = [
                    grid[gy - 1][gx],
                    grid[gy + 1][gx],
                    grid[gy][gx - 1],
                    grid[gy][gx + 1]
                ];

                let dSum = cell.depth * 2;
                let rSum = cell.r * 2;
                let gSum = cell.g * 2;
                let bSum = cell.b * 2;
                let weight = 2;

                for (const n of neighbors) {
                    if (n.active) {
                        dSum += n.depth;
                        rSum += n.r;
                        gSum += n.g;
                        bSum += n.b;
                        weight += 1;
                    }
                }

                nextDepths[gy][gx] = dSum / weight;
                nextR[gy][gx] = rSum / weight;
                nextG[gy][gx] = gSum / weight;
                nextB[gy][gx] = bSum / weight;
            }
        }

        for (let gy = 1; gy < rows; gy++) {
            for (let gx = 1; gx < cols; gx++) {
                const cell = grid[gy][gx];
                if (cell.active) {
                    cell.depth = nextDepths[gy][gx];
                    cell.r = nextR[gy][gx];
                    cell.g = nextG[gy][gx];
                    cell.b = nextB[gy][gx];
                }
            }
        }
    }

    const snapped = Array.from({ length: rows + 1 }, (_, gy) =>
        Array.from({ length: cols + 1 }, (_, gx) => ({ ...grid[gy][gx] }))
    );

    for (let gy = 1; gy < rows; gy++) {
        for (let gx = 1; gx < cols; gx++) {
            const p = grid[gy][gx];
            if (p.active) continue;

            const neighbors = [
                grid[gy - 1][gx],
                grid[gy + 1][gx],
                grid[gy][gx - 1],
                grid[gy][gx + 1],
                grid[gy - 1][gx - 1],
                grid[gy - 1][gx + 1],
                grid[gy + 1][gx - 1],
                grid[gy + 1][gx + 1]
            ].filter((n) => n.active);

            if (neighbors.length === 0) continue;

            let best = neighbors[0];
            for (const n of neighbors) {
                if (n.strength > best.strength) best = n;
            }

            const denom = Math.max(1, best.strength - p.strength);
            const t = Math.min(1, Math.max(0, (threshold - p.strength) / denom));

            snapped[gy][gx].x = p.x + (best.x - p.x) * t;
            snapped[gy][gx].y = p.y + (best.y - p.y) * t;
            snapped[gy][gx].r = best.r;
            snapped[gy][gx].g = best.g;
            snapped[gy][gx].b = best.b;
            snapped[gy][gx].depth = 0.03;
            snapped[gy][gx].onBoundary = true;
        }
    }

    const positions = [];
    const colors = [];

    const pushTriangle = (v1, v2, v3) => {
        positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);

        [v1, v2, v3].forEach((v) => {
            const c = new THREE.Color(v.r, v.g, v.b);
            c.convertSRGBToLinear();
            colors.push(c.r, c.g, c.b);
        });
    };

    for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
            const p00 = snapped[gy][gx];
            const p10 = snapped[gy][gx + 1];
            const p01 = snapped[gy + 1][gx];
            const p11 = snapped[gy + 1][gx + 1];

            const valid = (p) => p.active || p.onBoundary;
            const hasActive = p00.active || p10.active || p01.active || p11.active;
            if (!hasActive || !valid(p00) || !valid(p10) || !valid(p01) || !valid(p11)) {
                continue;
            }

            const f00 = { ...p00, z: p00.depth };
            const f10 = { ...p10, z: p10.depth };
            const f01 = { ...p01, z: p01.depth };
            const f11 = { ...p11, z: p11.depth };

            const b00 = { ...f00, z: -f00.z };
            const b10 = { ...f10, z: -f10.z };
            const b01 = { ...f01, z: -f01.z };
            const b11 = { ...f11, z: -f11.z };

            pushTriangle(f00, f01, f11);
            pushTriangle(f00, f11, f10);

            pushTriangle(b00, b11, b01);
            pushTriangle(b00, b10, b11);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.16,
        metalness: 0.05,
        clearcoat: 0.55,
        clearcoatRoughness: 0.16,
        flatShading: false
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = TIP_START_Y;
    icebergGroup.add(mesh);
}

const img = new Image();
img.onload = () => buildExactSmoothLogo(img);
img.src = "sureface-iceberg-mark-transparent.png";
if (img.complete && img.naturalWidth > 0) {
    buildExactSmoothLogo(img);
}

// חלקיקי אווירה עדינים
const ambientCount = 90;
const ambientGeo = new THREE.IcosahedronGeometry(0.022, 0);
const ambientMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.35
});
const ambientParticles = new THREE.InstancedMesh(ambientGeo, ambientMat, ambientCount);
const ambientPositions = [];
const dummy = new THREE.Object3D();

for (let i = 0; i < ambientCount; i++) {
    ambientPositions.push({
        x: (Math.random() - 0.5) * 20,
        y: (Math.random() - 0.5) * 10,
        z: (Math.random() - 0.5) * 20,
        speed: 0.14 + Math.random() * 0.2
    });
}
scene.add(ambientParticles);

const APPROACH_END = 1.6;
const TIP_HOLD_END = 3.6;
const RISE_END = 4.4;

let elapsedSceneTime = 0;
const currentLookAt = new THREE.Vector3(0, 0.45, 0);
const targetCamPos = new THREE.Vector3();
const targetLookAt = new THREE.Vector3();

const surfaceRevealEl = document.getElementById("surface-reveal");
let hasRevealedSurfaceText = false;

function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
}

function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function updateSceneSequence(dt, totalElapsed) {
    elapsedSceneTime += dt;

    let baseIceY = TIP_START_Y;
    const isUpAboveWater = elapsedSceneTime >= RISE_END;

    if (elapsedSceneTime < APPROACH_END) {
        const p = easeOutCubic(elapsedSceneTime / APPROACH_END);
        targetCamPos.lerpVectors(
            new THREE.Vector3(0, 4.5, 44),
            new THREE.Vector3(0.45, 1.35, 7.8),
            p
        );
        targetLookAt.set(0, 0.45, 0);
        baseIceY = TIP_START_Y;
    } else if (elapsedSceneTime < TIP_HOLD_END) {
        targetCamPos.set(0.45, 1.35, 7.8);
        targetLookAt.set(0, 0.45, 0);
        baseIceY = TIP_START_Y;
    } else if (elapsedSceneTime < RISE_END) {
        const p = easeInOutCubic((elapsedSceneTime - TIP_HOLD_END) / (RISE_END - TIP_HOLD_END));
        targetCamPos.lerpVectors(
            new THREE.Vector3(0.45, 1.35, 7.8),
            new THREE.Vector3(0, 3.1, 13.5),
            p
        );
        targetLookAt.lerpVectors(
            new THREE.Vector3(0, 0.45, 0),
            new THREE.Vector3(0, 2.55, 0),
            p
        );
        baseIceY = THREE.MathUtils.lerp(TIP_START_Y, ABOVE_WATER_Y, p);
    } else {
        targetCamPos.set(0, 3.1, 13.5);
        targetLookAt.set(0, 2.55, 0);
        baseIceY = ABOVE_WATER_Y;
    }

    if (isUpAboveWater && !hasRevealedSurfaceText && surfaceRevealEl) {
        hasRevealedSurfaceText = true;
        surfaceRevealEl.classList.add("is-visible");
    }

    camera.position.lerp(targetCamPos, 0.14);
    currentLookAt.lerp(targetLookAt, 0.14);
    camera.lookAt(currentLookAt);

    const mesh = icebergGroup.children[0];
    if (mesh) {
        if (!isUpAboveWater) {
            const swayY = Math.sin(totalElapsed * 1.8) * 0.025;
            mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, baseIceY + swayY, 0.14);
            mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, Math.sin(totalElapsed * 1.2) * 0.012, 0.1);
            mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, Math.cos(totalElapsed * 1.0) * 0.01, 0.1);
            mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, Math.sin(totalElapsed * 0.8) * 0.03, 0.1);
        } else {
            const calmFloatY = Math.sin(totalElapsed * 1.5) * 0.04;
            mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, baseIceY + calmFloatY, 0.14);
            mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, 0, 0.14);
            mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0, 0.14);
            mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, 0, 0.14);
        }
    }
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    skyUniforms.time.value = elapsed;
    water.material.uniforms["time"].value += dt * 0.65;

    for (let i = 0; i < ambientCount; i++) {
        const p = ambientPositions[i];
        p.y += dt * p.speed;
        if (p.y > 5) p.y = -5;
        dummy.position.set(p.x + Math.sin(elapsed + i) * 0.08, p.y, p.z);
        dummy.updateMatrix();
        ambientParticles.setMatrixAt(i, dummy.matrix);
    }
    ambientParticles.instanceMatrix.needsUpdate = true;

    updateSceneSequence(dt, elapsed);
    renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});