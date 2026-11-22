import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";

const container = document.getElementById("scene-container");
const scene = new THREE.Scene();

const skyColor = new THREE.Color(0x8ecae6);
const horizonFogColor = new THREE.Color(0xbde0fe);

scene.background = skyColor.clone();
scene.fog = new THREE.FogExp2(0xbde0fe, 0.0068);

const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    1200
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// תאורת יום טבעית
const hemiLight = new THREE.HemisphereLight(0xf0f9ff, 0x073b4c, 1.35);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.5);
sunLight.position.set(14, 24, 16);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 2;
sunLight.shadow.camera.far = 80;
sunLight.shadow.camera.left = -16;
sunLight.shadow.camera.right = 16;
sunLight.shadow.camera.top = 16;
sunLight.shadow.camera.bottom = -16;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.05);
rimLight.position.set(-14, 6, -14);
scene.add(rimLight);

// כיפת שמיים חיה עם עננים דו-שכבתיים נעים ואור שמש רך
const skyUniforms = {
    topColor: { value: new THREE.Color(0x4ea8de) },
    horizonColor: { value: new THREE.Color(0xbde0fe) },
    sunDir: { value: sunLight.position.clone().normalize() },
    time: { value: 0 }
};

const skyGeo = new THREE.SphereGeometry(520, 48, 32);
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
                p *= 2.04;
                amp *= 0.5;
            }
            return val;
        }

        void main() {
            vec3 dir = normalize(vWorldPosition);
            vec3 sDir = normalize(sunDir);
            float h = clamp(dir.y, 0.0, 1.0);

            vec3 col = mix(horizonColor, topColor, pow(h, 0.62));

            float sunAmt = max(dot(dir, sDir), 0.0);
            col += vec3(1.0, 0.96, 0.85) * pow(sunAmt, 16.0) * 0.18;

            if (dir.y > 0.015) {
                vec2 wind = normalize(sDir.xz + vec2(0.0001));

                vec2 uv1 = dir.xz / (dir.y + 0.17) * 1.25;
                uv1 += wind * (time * 0.045) + vec2(0.0, time * 0.012);
                float n1 = fbm(uv1);

                vec2 uv2 = dir.xz / (dir.y + 0.28) * 2.1;
                uv2 += wind * (time * 0.075) - vec2(time * 0.015, 0.0);
                float n2 = fbm(uv2);

                float combinedNoise = n1 * 0.72 + n2 * 0.28;
                float cloudMask = smoothstep(0.49, 0.77, combinedNoise) * smoothstep(0.015, 0.24, dir.y);
                vec3 cloudColor = mix(vec3(0.94, 0.98, 1.0), vec3(1.0, 0.99, 0.94), pow(sunAmt, 2.5));
                col = mix(col, cloudColor, cloudMask * 0.52);
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
const waterGeo = new THREE.PlaneGeometry(980, 980);

const deepWaterHex = 0x021224;
const deepWaterVec = new THREE.Color(deepWaterHex);
const horizonLinear = horizonFogColor.clone().convertSRGBToLinear();
const sunSparkleDir = sunLight.position.clone().normalize();

const water = new Water(waterGeo, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals,
    sunDirection: sunSparkleDir,
    sunColor: 0x38bdf8,
    waterColor: deepWaterHex,
    distortionScale: 0.35,
    fog: scene.fog !== undefined
});
water.rotation.x = -Math.PI / 2;
if (water.material.uniforms["size"]) {
    water.material.uniforms["size"].value = 1.5;
}
water.material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vWaterWorldPos;
        `
    );
    shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vWaterWorldPos;
        `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
        "gl_FragColor = vec4( color, 1.0 );",
        `
        vec3 baseDeep = vec3(${deepWaterVec.r.toFixed(4)}, ${deepWaterVec.g.toFixed(4)}, ${deepWaterVec.b.toFixed(4)});
        vec3 nWave = normalize(surfaceNormal);
        float waveDetail = clamp(dot(nWave, normalize(vec3(0.3, 1.0, 0.25))), 0.0, 1.0);
        vec3 sculptedWater = baseDeep * (0.72 + waveDetail * 0.65);

        vec3 sunDirNorm = normalize(vec3(${sunSparkleDir.x.toFixed(4)}, ${sunSparkleDir.y.toFixed(4)}, ${sunSparkleDir.z.toFixed(4)}));
        float sunGlint = pow(clamp(dot(nWave, normalize(sunDirNorm + vec3(0.0, 1.0, 0.0))), 0.0, 1.0), 18.0);
        sculptedWater += vec3(0.35, 0.72, 0.95) * sunGlint * 0.26;

        float iceRefMask = smoothstep(0.05, 0.26, length(color - baseDeep));
        vec3 softReflection = mix(sculptedWater, color * 0.78, 0.55);
        color = mix(sculptedWater, softReflection, clamp(0.015 + iceRefMask * 0.22, 0.0, 0.24));

        // דעיכה חלקה לקצוות ולמרחק כדי שהאוקיינוס ייראה אינסופי ולא מרובע
        float distFromCenter = length(vWaterWorldPos.xz);
        float radialEdge = smoothstep(140.0, 440.0, distFromCenter);
        vec3 horizonTint = vec3(${horizonLinear.r.toFixed(4)}, ${horizonLinear.g.toFixed(4)}, ${horizonLinear.b.toFixed(4)});
        color = mix(color, horizonTint, clamp(radialEdge * 0.88, 0.0, 0.92));

        gl_FragColor = vec4( color, 1.0 );
        `
    );
};
scene.add(water);

// קרחונים קטנים "שחקני משנה" — צורה גיאומטרית שחוקה שונה מהלוגו וקטנים משמעותית
const secondaryIcebergs = [];
const secondaryMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8f3ff,
    roughness: 0.24,
    metalness: 0.04,
    clearcoat: 0.45,
    clearcoatRoughness: 0.22,
    flatShading: true
});

function createSecondaryChunkGeo(seed, sx, sy, sz) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n1 = Math.sin(v.x * 2.7 + seed) * Math.cos(v.z * 2.3 - seed * 0.7);
        const n2 = Math.cos(v.y * 3.4 + v.x * 1.9 + seed * 1.3);
        const factor = 1 + n1 * 0.24 + n2 * 0.14;
        v.multiplyScalar(factor);
        if (v.y < -0.25) v.y *= 0.55;
        v.x *= sx;
        v.y *= sy;
        v.z *= sz;
        pos.setXYZ(i, v.x, v.y, v.z);
    }

    geo.computeVertexNormals();
    return geo;
}

const secondaryConfigs = [
    { x: -15, z: -16, sx: 1.15, sy: 0.55, sz: 0.95, rotY: 0.8, seed: 1.1 },
    { x: 18, z: -22, sx: 1.4, sy: 0.62, sz: 1.1, rotY: 2.1, seed: 2.4 },
    { x: -28, z: 12, sx: 0.95, sy: 0.45, sz: 0.85, rotY: 1.4, seed: 3.7 },
    { x: 24, z: 14, sx: 1.25, sy: 0.5, sz: 1.0, rotY: 4.2, seed: 5.0 },
    { x: -9, z: -38, sx: 1.6, sy: 0.68, sz: 1.2, rotY: 0.3, seed: 6.3 },
    { x: 34, z: -10, sx: 0.9, sy: 0.42, sz: 0.8, rotY: 2.9, seed: 7.6 }
];

secondaryConfigs.forEach((cfg, idx) => {
    const geo = createSecondaryChunkGeo(cfg.seed, cfg.sx, cfg.sy, cfg.sz);
    const mesh = new THREE.Mesh(geo, secondaryMat);
    const baseY = 0.06 * cfg.sy;
    mesh.position.set(cfg.x, baseY, cfg.z);
    mesh.rotation.y = cfg.rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    secondaryIcebergs.push({
        mesh,
        baseY,
        phase: idx * 1.15,
        speed: 0.65 + (idx % 3) * 0.15
    });
});

// אדוות וקצף עדין סביב בסיס הקרחון בקו המים + פעימה בעת התרוממות
const rippleUniforms = {
    uTime: { value: 0 },
    uLiftPulse: { value: 0 },
    uColor: { value: new THREE.Color(0xe0f2fe) }
};

const rippleGeo = new THREE.RingGeometry(1.15, 4.4, 96, 1);
rippleGeo.rotateX(-Math.PI / 2);

const rippleMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: rippleUniforms,
    vertexShader: `
        varying vec3 vLocalPos;
        void main() {
            vLocalPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uTime;
        uniform float uLiftPulse;
        uniform vec3 uColor;
        varying vec3 vLocalPos;

        void main() {
            float r = length(vLocalPos.xz);
            float pulseReach = 1.0 + uLiftPulse * 0.28;
            float radialMask = smoothstep(1.15, 1.65, r) * (1.0 - smoothstep(2.3 * pulseReach, 4.35 * pulseReach, r));

            float ringSpeed = 2.1 + uLiftPulse * 1.4;
            float ring1 = smoothstep(0.72, 0.98, sin(r * 7.5 - uTime * ringSpeed));
            float ring2 = smoothstep(0.76, 0.99, sin(r * 13.0 - uTime * (ringSpeed * 1.45) + 1.4));
            float foamCore = exp(-pow((r - (1.55 + sin(uTime * 1.4) * 0.14 + uLiftPulse * 0.18)) * 3.8, 2.0));

            float pulseBoost = 1.0 + uLiftPulse * 0.55;
            float alpha = (ring1 * 0.14 + ring2 * 0.09 + foamCore * 0.24) * radialMask * pulseBoost;
            gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.55));
        }
    `
});

const waterlineRipples = new THREE.Mesh(rippleGeo, rippleMat);
waterlineRipples.position.y = 0.015;
scene.add(waterlineRipples);

// בועות רק בתוך המים סביב הקרחון, שמתפוגגות בצורה חלקה לפני פני המים וכשהקרחון עולה
const bubbleCount = 65;
const bubbleGeo = new THREE.SphereGeometry(0.028, 12, 12);
const bubbleMat = new THREE.MeshPhysicalMaterial({
    color: 0xe0f2fe,
    roughness: 0.08,
    metalness: 0.05,
    transmission: 0.45,
    transparent: true,
    opacity: 0.62
});
const bubbleMesh = new THREE.InstancedMesh(bubbleGeo, bubbleMat, bubbleCount);
const bubbles = [];
const bubbleDummy = new THREE.Object3D();

const BUBBLE_MIN_Y = -0.75;
const BUBBLE_MAX_Y = -0.03;

for (let i = 0; i < bubbleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.75 + Math.random() * 2.35;
    bubbles.push({
        baseX: Math.cos(angle) * radius,
        baseZ: Math.sin(angle) * radius,
        y: BUBBLE_MIN_Y + Math.random() * (BUBBLE_MAX_Y - BUBBLE_MIN_Y),
        scale: 0.45 + Math.random() * 0.95,
        riseSpeed: 0.16 + Math.random() * 0.24,
        wobbleSpeed: 1.3 + Math.random() * 1.6,
        wobbleAmp: 0.035 + Math.random() * 0.065,
        phase: Math.random() * Math.PI * 2
    });
}
scene.add(bubbleMesh);

const icebergGroup = new THREE.Group();
scene.add(icebergGroup);

const TIP_START_Y = -0.15;
const ABOVE_WATER_Y = 3.25;

/**
 * בניית הקרחון המדויק מתוך הלוגו שלך עם החלקת שוליים + רטיבות עדינה באזור התחתון
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

    // רטיבות עדינה באזור התחתון של הקרחון הקרוב לקו המים
    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            "#include <common>",
            `
            #include <common>
            varying vec3 vIceLocalPos;
            `
        );
        shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            `
            #include <begin_vertex>
            vIceLocalPos = position;
            `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <common>",
            `
            #include <common>
            varying vec3 vIceLocalPos;
            `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            `
            #include <color_fragment>
            float wetBand = 1.0 - smoothstep(-1.8, 0.55, vIceLocalPos.y);
            diffuseColor.rgb *= mix(1.0, 0.78, wetBand * 0.65);
            `
        );
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = TIP_START_Y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    icebergGroup.add(mesh);
}

const img = new Image();
img.onload = () => buildExactSmoothLogo(img);
img.src = "sureface-iceberg-mark-transparent.png";
if (img.complete && img.naturalWidth > 0) {
    buildExactSmoothLogo(img);
}

// חלקיקי אווירה ורסיסי ים עדינים במרחב
const ambientCount = 110;
const ambientGeo = new THREE.IcosahedronGeometry(0.022, 0);
const ambientMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.34
});
const ambientParticles = new THREE.InstancedMesh(ambientGeo, ambientMat, ambientCount);
const ambientPositions = [];
const dummy = new THREE.Object3D();

for (let i = 0; i < ambientCount; i++) {
    ambientPositions.push({
        x: (Math.random() - 0.5) * 56,
        y: Math.random() * 8.5,
        z: -30 + Math.random() * 110,
        speed: 0.12 + Math.random() * 0.18,
        scale: 0.65 + Math.random() * 0.9
    });
}
scene.add(ambientParticles);

// תזמון: סיור חלק במבט-על רחוק -> התקרבות -> שהייה -> עלייה כבדה
const SCOUT_END = 3.2;
const APPROACH_END = 5.0;
const TIP_HOLD_END = 6.5;
const RISE_END = 7.7;

let elapsedSceneTime = 0;
let bubbleVisibility = 1.0;

function getScoutPosition(p) {
    // קשת חלקה ונקייה במבט-על רחוק ללא התקרבות פנימה
    const angle = THREE.MathUtils.lerp(-0.42, 0.32, p);
    const radius = 92;
    return new THREE.Vector3(
        Math.sin(angle) * radius,
        THREE.MathUtils.lerp(36, 32, p),
        Math.cos(angle) * radius
    );
}

const scoutStartPos = getScoutPosition(0);
const scoutEndPos = getScoutPosition(1);
const currentLookAt = new THREE.Vector3(0, 0.4, 0);
const targetCamPos = scoutStartPos.clone();
const targetLookAt = new THREE.Vector3(0, 0.4, 0);

camera.position.copy(scoutStartPos);
camera.lookAt(currentLookAt);

const surfaceRevealEl = document.getElementById("surface-reveal");
let hasRevealedSurfaceText = false;

function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
}

function easeInOutSine(x) {
    const t = Math.min(1, Math.max(0, x));
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeHeavyLift(x) {
    const t = Math.min(1, Math.max(0, x));
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function updateSceneSequence(dt, totalElapsed) {
    elapsedSceneTime += dt;

    let baseIceY = TIP_START_Y;
    const isUpAboveWater = elapsedSceneTime >= RISE_END;

    // פעימה עדינה לאדוות בקו המים בזמן שהקרחון מתחיל להתרומם
    let targetLiftPulse = 0;
    if (elapsedSceneTime > TIP_HOLD_END && elapsedSceneTime < RISE_END) {
        const riseProgress = (elapsedSceneTime - TIP_HOLD_END) / (RISE_END - TIP_HOLD_END);
        targetLiftPulse = Math.sin(riseProgress * Math.PI);
    }
    rippleUniforms.uLiftPulse.value = THREE.MathUtils.lerp(
        rippleUniforms.uLiftPulse.value,
        targetLiftPulse,
        0.12
    );

    if (elapsedSceneTime < SCOUT_END) {
        // מסלול סיור ישיר וחלק ללא פיגור/זיגזג
        const p = easeInOutSine(elapsedSceneTime / SCOUT_END);
        const pos = getScoutPosition(p);
        camera.position.copy(pos);
        currentLookAt.set(0, 0.4, 0);
        camera.lookAt(currentLookAt);
        baseIceY = TIP_START_Y;
    } else if (elapsedSceneTime < APPROACH_END) {
        const p = easeOutCubic((elapsedSceneTime - SCOUT_END) / (APPROACH_END - SCOUT_END));
        targetCamPos.lerpVectors(
            scoutEndPos,
            new THREE.Vector3(0.45, 1.35, 7.8),
            p
        );
        targetLookAt.set(0, 0.45, 0);
        camera.position.lerp(targetCamPos, 0.11);
        currentLookAt.lerp(targetLookAt, 0.11);
        camera.lookAt(currentLookAt);
        baseIceY = TIP_START_Y;
    } else if (elapsedSceneTime < TIP_HOLD_END) {
        targetCamPos.set(0.45, 1.35, 7.8);
        targetLookAt.set(0, 0.45, 0);
        camera.position.lerp(targetCamPos, 0.11);
        currentLookAt.lerp(targetLookAt, 0.11);
        camera.lookAt(currentLookAt);
        baseIceY = TIP_START_Y;
    } else if (elapsedSceneTime < RISE_END) {
        const p = easeHeavyLift((elapsedSceneTime - TIP_HOLD_END) / (RISE_END - TIP_HOLD_END));
        targetCamPos.lerpVectors(
            new THREE.Vector3(0.45, 1.35, 7.8),
            new THREE.Vector3(0, 2.25, 14.2),
            p
        );
        targetLookAt.lerpVectors(
            new THREE.Vector3(0, 0.45, 0),
            new THREE.Vector3(0, 2.85, 0),
            p
        );
        camera.position.lerp(targetCamPos, 0.11);
        currentLookAt.lerp(targetLookAt, 0.11);
        camera.lookAt(currentLookAt);
        baseIceY = THREE.MathUtils.lerp(TIP_START_Y, ABOVE_WATER_Y, p);
    } else {
        const driftX = Math.sin(totalElapsed * 0.42) * 0.22;
        const driftY = Math.cos(totalElapsed * 0.35) * 0.08;
        const driftZ = Math.sin(totalElapsed * 0.28) * 0.28;
        targetCamPos.set(driftX, 2.25 + driftY, 14.2 + driftZ);
        targetLookAt.set(0, 2.85, 0);
        camera.position.lerp(targetCamPos, 0.11);
        currentLookAt.lerp(targetLookAt, 0.11);
        camera.lookAt(currentLookAt);
        baseIceY = ABOVE_WATER_Y;
    }

    // התפוגגות הדרגתית של הבועות כשהקרחון מתחיל לעלות מעל המים
    const targetBubbleVis = elapsedSceneTime <= TIP_HOLD_END
        ? 1.0
        : Math.max(0, 1.0 - (elapsedSceneTime - TIP_HOLD_END) / 0.85);
    bubbleVisibility = THREE.MathUtils.lerp(bubbleVisibility, targetBubbleVis, 0.12);

    if (isUpAboveWater && !hasRevealedSurfaceText && surfaceRevealEl) {
        hasRevealedSurfaceText = true;
        surfaceRevealEl.classList.add("is-visible");
    }

    // תנועת ציפה עדינה לקרחונים הקטנים ("שחקני משנה")
    for (let i = 0; i < secondaryIcebergs.length; i++) {
        const item = secondaryIcebergs[i];
        item.mesh.position.y = item.baseY + Math.sin(totalElapsed * item.speed + item.phase) * 0.035;
        item.mesh.rotation.z = Math.sin(totalElapsed * 0.5 + item.phase) * 0.018;
        item.mesh.rotation.x = Math.cos(totalElapsed * 0.42 + item.phase) * 0.015;
    }

    const mesh = icebergGroup.children[0];
    if (mesh) {
        if (!isUpAboveWater) {
            const swayY = Math.sin(totalElapsed * 1.4) * 0.022;
            mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, baseIceY + swayY, 0.11);
            mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, Math.sin(totalElapsed * 0.9) * 0.015, 0.09);
            mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, Math.cos(totalElapsed * 0.75) * 0.012, 0.09);
            mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, Math.sin(totalElapsed * 0.6) * 0.03, 0.09);
        } else {
            const heavyFloatY = Math.sin(totalElapsed * 0.72) * 0.055;
            const heavyTiltZ = Math.sin(totalElapsed * 0.55) * 0.014;
            const heavyTiltX = Math.cos(totalElapsed * 0.45) * 0.01;
            mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, baseIceY + heavyFloatY, 0.07);
            mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, heavyTiltZ, 0.06);
            mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, heavyTiltX, 0.06);
            mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, 0, 0.06);
        }
    }
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    skyUniforms.time.value = elapsed;
    rippleUniforms.uTime.value = elapsed;
    water.material.uniforms["time"].value += dt * 0.65;

    bubbleMat.opacity = 0.62 * bubbleVisibility;
    bubbleMesh.visible = bubbleVisibility > 0.005;

    for (let i = 0; i < bubbleCount; i++) {
        const b = bubbles[i];
        b.y += dt * b.riseSpeed;
        if (b.y > BUBBLE_MAX_Y) {
            b.y = BUBBLE_MIN_Y;
        }

        const surfaceFade = 1.0 - THREE.MathUtils.smoothstep(b.y, BUBBLE_MAX_Y - 0.22, BUBBLE_MAX_Y);
        const finalScale = Math.max(0.0001, b.scale * surfaceFade * bubbleVisibility);

        const wx = Math.sin(elapsed * b.wobbleSpeed + b.phase) * b.wobbleAmp;
        const wz = Math.cos(elapsed * b.wobbleSpeed * 0.85 + b.phase) * b.wobbleAmp;
        bubbleDummy.position.set(b.baseX + wx, b.y, b.baseZ + wz);
        bubbleDummy.scale.setScalar(finalScale);
        bubbleDummy.updateMatrix();
        bubbleMesh.setMatrixAt(i, bubbleDummy.matrix);
    }
    bubbleMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < ambientCount; i++) {
        const p = ambientPositions[i];
        p.y += dt * p.speed;
        if (p.y > 8.5) p.y = 0.1;
        dummy.position.set(p.x + Math.sin(elapsed + i) * 0.12, p.y, p.z);
        dummy.scale.setScalar(p.scale);
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
