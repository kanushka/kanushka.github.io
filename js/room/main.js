import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/RoundedBoxGeometry.js";
import { profile, panels } from "./content.js";
import { LofiRadio } from "./audio.js";

const $ = (s) => document.querySelector(s);
const body = document.body;

// ---------------------------------------------------------------- boot

function webglOK() {
    try {
        const c = document.createElement("canvas");
        return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) {
        return false;
    }
}

if (webglOK()) {
    body.classList.add("room");
    start().catch((err) => {
        console.error(err);
        body.classList.remove("room");
    });
}

// ---------------------------------------------------------------- palette

const C = {
    wallBack: 0x4b4078,
    wallLeft: 0x41376b,
    trim: 0x2d2550,
    floor: 0x8a6656,
    wood: 0xa9785f,
    woodDark: 0x6e4b3f,
    cream: 0xfff1dc,
    pink: 0xff8fab,
    peach: 0xffb38a,
    lamp: 0xffb36b,
    teal: 0x7bdff2,
    mint: 0x9be3c3,
    lilac: 0xb8a4f0,
    navy: 0x232046,
    charcoal: 0x2b2838,
    leaf: 0x5fae7f,
    leafDark: 0x3f8a63,
    terracotta: 0xd9785b,
    cat: 0xf2a65a,
};

// sky follows the visitor's local time
function timeOfDay() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 6.5 && h < 16.5) return "day";
    if ((h >= 16.5 && h < 19) || (h >= 5 && h < 6.5)) return "sunset";
    return "night";
}

// ---------------------------------------------------------------- helpers

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

function mesh(geo, material, pos = [0, 0, 0], parent) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
}

const box = (w, h, d, color, pos, parent, r = 0) =>
    mesh(r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), typeof color === "number" ? mat(color) : color, pos, parent);

const cyl = (rt, rb, h, color, pos, parent, seg = 24) =>
    mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === "number" ? mat(color) : color, pos, parent);

const sphere = (r, color, pos, parent, seg = 20) =>
    mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), typeof color === "number" ? mat(color) : color, pos, parent);

function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData = { canvas: c, ctx };
    return t;
}

function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// seeded random so the room looks the same every visit
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// ---------------------------------------------------------------- main

async function start() {
    const loaderText = $("#loader-text");
    const tod = timeOfDay();

    // fonts are used inside canvas textures, so wait for them (but not forever)
    await Promise.race([
        Promise.all([
            document.fonts.load('40px "Major Mono Display"'),
            document.fonts.load('20px "Courier Prime"'),
            document.fonts.load('800 20px "Nunito"'),
        ]),
        new Promise((r) => setTimeout(r, 2500)),
    ]).catch(() => {});

    // film grain for the overlay
    const grain = document.createElement("canvas");
    grain.width = grain.height = 160;
    const gctx = grain.getContext("2d");
    const img = gctx.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
    }
    gctx.putImageData(img, 0, 0);
    $(".grain").style.backgroundImage = `url(${grain.toDataURL()})`;

    // ------------------------------------------------ renderer, scene, camera

    const container = $("#scene");
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bg = { night: 0x1b1a2e, sunset: 0x2e2140, day: 0x3a3360 }[tod];
    scene.background = new THREE.Color(bg);
    scene.fog = new THREE.Fog(bg, 22, 40);

    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 45;
    controls.minAzimuthAngle = 0.05;
    controls.maxAzimuthAngle = 1.52;
    controls.minPolarAngle = 0.45;
    controls.maxPolarAngle = 1.5;
    controls.rotateSpeed = 0.6;

    // ------------------------------------------------ lights

    const L = {
        night: { hemi: 0.55, moon: 0.9, lamp: 9, sky: 0x8f88ff },
        sunset: { hemi: 0.8, moon: 1.4, lamp: 7, sky: 0xffa07a },
        day: { hemi: 1.3, moon: 2.2, lamp: 4, sky: 0xcfe6ff },
    }[tod];

    scene.add(new THREE.HemisphereLight(L.sky, 0x3b2a3a, L.hemi));
    scene.add(new THREE.AmbientLight(0x6a5a9a, 0.35));

    const moon = new THREE.DirectionalLight(L.sky, L.moon);
    moon.position.set(-9, 9, 3);
    moon.target.position.set(0, 0, -1);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -7;
    moon.shadow.camera.right = 7;
    moon.shadow.camera.top = 7;
    moon.shadow.camera.bottom = -7;
    moon.shadow.bias = -0.0015;
    moon.shadow.normalBias = 0.03;
    scene.add(moon, moon.target);

    const fill = new THREE.DirectionalLight(0xffc9b0, L.hemi * 0.55);
    fill.position.set(8, 6, 10);
    scene.add(fill);

    const room = new THREE.Group();
    scene.add(room);

    // ------------------------------------------------ the room shell

    const floorTex = canvasTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = "#8a6656";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) {
            ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
            ctx.fillRect(0, i * 64, w, 64);
            ctx.fillStyle = "rgba(0,0,0,0.22)";
            ctx.fillRect(0, i * 64, w, 2);
            ctx.fillRect(((i * 197) % 400) + 40, i * 64, 2, 64);
        }
    });
    const floor = box(8, 0.3, 8, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }), [0, -0.15, 0], room);
    floor.castShadow = false;

    const wallMatB = mat(C.wallBack);
    const wallMatL = mat(C.wallLeft);
    const backWall = box(8.3, 5, 0.3, wallMatB, [-0.15, 2.5, -4.15], room);
    const leftWall = box(0.3, 5, 8, wallMatL, [-4.15, 2.5, 0], room);
    backWall.castShadow = leftWall.castShadow = false;
    // skirting boards
    box(8, 0.18, 0.06, C.trim, [0, 0.09, -3.98], room);
    box(0.06, 0.18, 8, C.trim, [-3.98, 0.09, 0], room);
    // chunky diorama edges
    box(8.3, 0.3, 0.3, C.trim, [-0.15, -0.15, 4.15], room).castShadow = false;
    box(0.3, 0.3, 8.3, C.trim, [4.15, -0.15, -0.15], room).castShadow = false;

    // rug
    cyl(2.3, 2.3, 0.03, C.lilac, [0.7, 0.015, -0.6], room, 48).castShadow = false;
    cyl(1.8, 1.8, 0.035, 0xd6c6ff, [0.7, 0.02, -0.6], room, 48).castShadow = false;
    cyl(1.0, 1.0, 0.04, C.pink, [0.7, 0.025, -0.6], room, 48).castShadow = false;

    // ------------------------------------------------ window with live rain

    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 512;
    skyCanvas.height = 400;
    {
        const ctx = skyCanvas.getContext("2d");
        const W = 512, H = 400;
        const g = ctx.createLinearGradient(0, 0, 0, H);
        const stops = {
            night: ["#0d0d2b", "#2a2257", "#5a3d7a"],
            sunset: ["#5b3d8f", "#ff8a7a", "#ffc58a"],
            day: ["#8fd0f5", "#c9e8ff", "#ffe9d6"],
        }[tod];
        stops.forEach((c, i) => g.addColorStop(i / 2, c));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        if (tod !== "day") {
            for (let i = 0; i < 70; i++) {
                ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.6})`;
                ctx.fillRect(rand() * W, rand() * H * 0.55, 2, 2);
            }
        }
        // moon or sun
        ctx.fillStyle = tod === "night" ? "#fff4d6" : tod === "sunset" ? "#ffdf8a" : "#fff7c2";
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.arc(390, 95, tod === "night" ? 34 : 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (tod === "night") {
            ctx.fillStyle = "#0d0d2b";
            ctx.beginPath();
            ctx.arc(405, 85, 30, 0, Math.PI * 2);
            ctx.fill();
        }
        // two layers of city
        const layers = [
            { col: tod === "day" ? "#9aa6d6" : "#3a2d66", base: 290, max: 110, win: 0.15 },
            { col: tod === "day" ? "#6c75a8" : "#1f1a40", base: 330, max: 160, win: tod === "day" ? 0.05 : 0.5 },
        ];
        for (const l of layers) {
            let x = -10;
            while (x < W) {
                const bw = 30 + rand() * 50;
                const bh = 40 + rand() * l.max;
                ctx.fillStyle = l.col;
                ctx.fillRect(x, H - (H - l.base) - bh, bw, bh + (H - l.base));
                for (let wy = H - (H - l.base) - bh + 8; wy < H - 6; wy += 14) {
                    for (let wx = x + 6; wx < x + bw - 8; wx += 11) {
                        if (rand() < l.win) {
                            ctx.fillStyle = rand() < 0.7 ? "#ffd38a" : "#ff9ec4";
                            ctx.fillRect(wx, wy, 5, 7);
                        }
                    }
                }
                x += bw + 2;
            }
        }
    }

    const drops = Array.from({ length: 90 }, () => ({ x: Math.random() * 512, y: Math.random() * 400, v: 380 + Math.random() * 300, l: 10 + Math.random() * 18 }));
    const beads = Array.from({ length: 26 }, () => ({ x: Math.random() * 512, y: Math.random() * 400, r: 2 + Math.random() * 3, v: Math.random() < 0.3 ? 8 + Math.random() * 20 : 0 }));
    const windowTex = canvasTex(512, 400, () => {});
    function drawWindow(dt) {
        const { ctx } = windowTex.userData;
        ctx.drawImage(skyCanvas, 0, 0);
        ctx.strokeStyle = "rgba(200,210,255,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const d of drops) {
            d.y += d.v * dt;
            d.x -= d.v * dt * 0.12;
            if (d.y > 410) { d.y = -20; d.x = Math.random() * 560; }
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x + d.l * 0.12, d.y - d.l);
        }
        ctx.stroke();
        for (const b of beads) {
            b.y += b.v * dt;
            if (b.y > 410) { b.y = -5; b.x = Math.random() * 512; }
            ctx.fillStyle = "rgba(230,235,255,0.35)";
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
        }
        windowTex.needsUpdate = true;
    }
    drawWindow(0);

    const win = new THREE.Group();
    win.position.set(-3.98, 3.0, -1.4);
    win.rotation.y = Math.PI / 2;
    room.add(win);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.9), new THREE.MeshBasicMaterial({ map: windowTex, toneMapped: false }));
    glass.position.z = 0.01;
    win.add(glass);
    const frameM = mat(C.cream);
    box(2.64, 0.12, 0.12, frameM, [0, 1.01, 0.05], win);
    box(2.64, 0.12, 0.12, frameM, [0, -1.01, 0.05], win);
    box(0.12, 2.0, 0.12, frameM, [-1.26, 0, 0.05], win);
    box(0.12, 2.0, 0.12, frameM, [1.26, 0, 0.05], win);
    box(0.06, 1.9, 0.06, frameM, [0, 0, 0.04], win);
    box(2.4, 0.06, 0.06, frameM, [0, 0.15, 0.04], win);
    box(2.9, 0.1, 0.35, frameM, [0, -1.1, 0.16], win, 0.03); // sill
    // curtains
    const curtainM = mat(C.peach, { roughness: 1 });
    for (const s of [-1, 1]) {
        const cg = new THREE.Group();
        cg.position.set(s * 1.6, -0.15, 0.2);
        win.add(cg);
        for (let i = 0; i < 4; i++) cyl(0.11, 0.13, 2.7, curtainM, [i * 0.17 * -s, 0, 0.0 + (i % 2) * 0.05], cg, 10);
    }
    cyl(0.04, 0.04, 3.9, C.woodDark, [0, 1.3, 0.25], win).rotation.z = Math.PI / 2;
    // little cactus on the sill
    cyl(0.12, 0.09, 0.2, C.terracotta, [0.8, -0.95, 0.18], win);
    const cactus = sphere(0.1, C.leaf, [0.8, -0.75, 0.18], win, 10);
    cactus.scale.set(1, 1.7, 1);

    // ------------------------------------------------ desk

    const deskM = mat(C.wood);
    box(3.6, 0.12, 1.4, deskM, [0.4, 1.5, -3.15], room, 0.04);
    for (const [x, z] of [[-1.3, -3.75], [2.1, -3.75], [-1.3, -2.55], [2.1, -2.55]]) box(0.1, 1.44, 0.1, C.woodDark, [x, 0.72, z], room);
    // drawers
    box(0.9, 1.0, 1.2, C.cream, [-0.8, 0.85, -3.2], room, 0.04);
    box(0.5, 0.06, 0.03, C.lamp, [-0.8, 1.12, -2.58], room);
    box(0.5, 0.06, 0.03, C.lamp, [-0.8, 0.7, -2.58], room);

    // keyboard + mouse
    box(1.05, 0.05, 0.34, C.cream, [0.45, 1.585, -2.85], room, 0.02);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 12; k++) box(0.06, 0.03, 0.055, r === 3 && k > 3 && k < 9 ? C.lilac : 0xe8dccb, [0.05 + k * 0.073, 1.62, -2.96 + r * 0.075], room);
    box(0.13, 0.05, 0.2, C.cream, [1.15, 1.585, -2.82], room, 0.025);

    // mug + steam
    const mug = new THREE.Group();
    mug.position.set(-0.15, 1.56, -2.75);
    room.add(mug);
    cyl(0.12, 0.11, 0.26, C.pink, [0, 0.13, 0], mug);
    cyl(0.1, 0.1, 0.01, 0x5a3626, [0, 0.25, 0], mug);
    const handle = mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 16), mat(C.pink), [0.13, 0.13, 0], mug);
    handle.rotation.y = 0;
    const steamM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
    const steam = Array.from({ length: 5 }, (_, i) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), steamM.clone());
        s.userData.offset = i / 5;
        mug.add(s);
        return s;
    });

    // succulent
    cyl(0.12, 0.1, 0.18, C.cream, [1.95, 1.65, -3.55], room);
    for (let i = 0; i < 7; i++) {
        const leaf = sphere(0.06, C.mint, [1.95 + Math.cos(i) * 0.06, 1.8, -3.55 + Math.sin(i) * 0.06], room, 8);
        leaf.scale.set(0.7, 1.4, 0.7);
        leaf.rotation.set(Math.sin(i) * 0.6, 0, Math.cos(i) * 0.6);
    }

    // ------------------------------------------------ hotspots

    const hotspots = []; // { key, group, label }
    const hitTargets = [];
    function hotspot(key, label, group) {
        group.userData.spot = key;
        group.traverse((o) => {
            if (o.isMesh) {
                o.userData.spot = key;
                hitTargets.push(o);
            }
        });
        hotspots.push({ key, group, label, baseScale: group.scale.clone(), hover: 0 });
    }

    // monitor -> about
    const screenTex = canvasTex(768, 432, () => {});
    let cursorOn = true;
    function drawScreen() {
        const { ctx } = screenTex.userData;
        const W = 768, H = 432;
        ctx.fillStyle = "#1e1b33";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#2b2647";
        ctx.fillRect(0, 0, W, 34);
        ["#ff8fab", "#ffd38a", "#9be3c3"].forEach((c, i) => {
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(22 + i * 22, 17, 7, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.font = '18px "Courier Prime", monospace';
        ctx.fillStyle = "#c9bfe0";
        ctx.fillText("about-me.js", 100, 23);
        const lines = [
            [["#ff8fab", "const "], ["#7bdff2", "kanushka"], ["#fff1dc", " = {"]],
            [["#fff1dc", "  role: "], ["#ffd38a", `"${profile.role.toLowerCase()}"`], ["#fff1dc", ","]],
            [["#fff1dc", "  makes: ["], ["#ffd38a", '"web"'], ["#fff1dc", ", "], ["#ffd38a", '"mobile"'], ["#fff1dc", "],"]],
            [["#fff1dc", "  loves: "], ["#ffd38a", '"ML"'], ["#fff1dc", ","]],
            [["#fff1dc", "  coffee: "], ["#b8a4f0", "Infinity"], ["#fff1dc", ","]],
            [["#fff1dc", "  status: "], ["#ffd38a", '"vibing"'], ["#fff1dc", ","]],
            [["#fff1dc", "};"]],
            [],
            [["#6f6890", "// click me to say hi"]],
        ];
        ctx.font = '24px "Courier Prime", monospace';
        lines.forEach((parts, i) => {
            const y = 78 + i * 36;
            ctx.fillStyle = "#5c5580";
            ctx.fillText(String(i + 1).padStart(2, " "), 18, y);
            let x = 64;
            for (const [col, txt] of parts) {
                ctx.fillStyle = col;
                ctx.fillText(txt, x, y);
                x += ctx.measureText(txt).width;
            }
            if (i === 8 && cursorOn) {
                ctx.fillStyle = "#fff1dc";
                ctx.fillRect(x + 4, y - 20, 12, 26);
            }
        });
        screenTex.needsUpdate = true;
    }
    drawScreen();
    setInterval(() => { cursorOn = !cursorOn; drawScreen(); }, 600);

    const monitor = new THREE.Group();
    monitor.position.set(0.45, 1.56, -3.45);
    room.add(monitor);
    box(0.5, 0.04, 0.3, C.charcoal, [0, 0.02, 0], monitor, 0.015);
    box(0.08, 0.5, 0.06, C.charcoal, [0, 0.27, -0.03], monitor);
    box(1.72, 1.0, 0.08, C.charcoal, [0, 0.85, 0.02], monitor, 0.04);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
    screen.position.set(0, 0.85, 0.065);
    monitor.add(screen);
    const screenGlow = new THREE.PointLight(0x8fa8ff, 1.4, 4, 2);
    screenGlow.position.set(0, 0.9, 0.6);
    monitor.add(screenGlow);
    hotspot("about", "about me", monitor);

    // desk lamp
    const lamp = new THREE.Group();
    lamp.position.set(-1.05, 1.56, -3.45);
    room.add(lamp);
    cyl(0.2, 0.22, 0.06, C.teal, [0, 0.03, 0], lamp);
    sphere(0.05, C.teal, [0, 0.07, 0], lamp, 10);
    const arm1 = cyl(0.03, 0.03, 0.85, C.teal, [0, 0.48, 0.05], lamp, 8);
    arm1.rotation.x = 0.12;
    sphere(0.045, C.teal, [0, 0.9, 0.1], lamp, 10);
    const arm2 = cyl(0.03, 0.03, 0.42, C.teal, [0, 0.93, 0.3], lamp, 8);
    arm2.rotation.x = Math.PI / 2 - 0.15;
    const shade = mesh(new THREE.ConeGeometry(0.2, 0.28, 20, 1, true), mat(C.teal, { side: THREE.DoubleSide }), [0, 0.92, 0.55], lamp);
    shade.rotation.x = -0.55;
    const bulbM = new THREE.MeshBasicMaterial({ color: 0xfff0c2 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), bulbM);
    bulb.position.set(0, 0.83, 0.6);
    lamp.add(bulb);
    const lampLight = new THREE.PointLight(C.lamp, L.lamp, 9, 1.6);
    lampLight.position.set(0, 0.6, 0.8);
    lamp.add(lampLight);
    let lampOn = true;
    hotspot("lamp", "lamp", lamp);

    // phone on a stand -> contact
    const phoneTex = canvasTex(256, 480, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#ff9ec4");
        g.addColorStop(1, "#7a6cf0");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff";
        ctx.font = '800 54px "Nunito", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }), w / 2, 100);
        ctx.font = '700 22px "Nunito", sans-serif';
        ctx.fillText("1 new message", w / 2, 140);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        rrect(ctx, 24, 190, w - 48, 110, 22);
        ctx.fill();
        ctx.fillStyle = "#3a2d66";
        ctx.textAlign = "left";
        ctx.font = '800 22px "Nunito", sans-serif';
        ctx.fillText("you", 44, 228);
        ctx.font = '700 22px "Nunito", sans-serif';
        ctx.fillText("say hi to", 44, 262);
        ctx.fillText("kanushka!", 44, 288);
        const icons = ["#fff1dc", "#7bdff2", "#ffd38a", "#9be3c3"];
        icons.forEach((c, i) => {
            ctx.fillStyle = c;
            rrect(ctx, 30 + i * 52, 380, 40, 40, 12);
            ctx.fill();
        });
    });
    const phone = new THREE.Group();
    phone.position.set(1.6, 1.56, -3.05);
    phone.rotation.y = -0.35;
    room.add(phone);
    box(0.36, 0.05, 0.22, C.charcoal, [0, 0.025, 0], phone, 0.02);
    const handset = new THREE.Group();
    handset.position.set(0, 0.32, -0.02);
    handset.rotation.x = -0.25;
    phone.add(handset);
    box(0.32, 0.6, 0.035, C.navy, [0, 0, 0], handset, 0.03);
    const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.54), new THREE.MeshBasicMaterial({ map: phoneTex, toneMapped: false }));
    phoneScreen.position.z = 0.019;
    handset.add(phoneScreen);
    hotspot("contact", "contact", phone);

    // ------------------------------------------------ chair + cat

    const chair = new THREE.Group();
    chair.position.set(0.9, 0, -1.55);
    chair.rotation.y = -2.2;
    room.add(chair);
    cyl(0.05, 0.05, 0.75, C.charcoal, [0, 0.5, 0], chair, 10);
    for (let i = 0; i < 5; i++) {
        const leg = box(0.45, 0.05, 0.07, C.charcoal, [Math.cos((i * Math.PI * 2) / 5) * 0.22, 0.1, Math.sin((i * Math.PI * 2) / 5) * 0.22], chair);
        leg.rotation.y = (-i * Math.PI * 2) / 5;
        sphere(0.05, C.charcoal, [Math.cos((i * Math.PI * 2) / 5) * 0.42, 0.05, Math.sin((i * Math.PI * 2) / 5) * 0.42], chair, 8);
    }
    box(1.0, 0.16, 0.95, C.pink, [0, 0.95, 0], chair, 0.07);
    box(0.95, 1.0, 0.14, C.pink, [0, 1.55, 0.46], chair, 0.07);
    box(0.08, 0.5, 0.08, C.charcoal, [0, 1.2, 0.46], chair);

    const cat = new THREE.Group();
    cat.position.set(0, 1.03, -0.05);
    chair.add(cat);
    const catM = mat(C.cat);
    const catBody = sphere(0.28, catM, [0, 0.14, 0], cat);
    catBody.scale.set(1.15, 0.6, 0.9);
    const head = sphere(0.17, catM, [0.27, 0.18, -0.12], cat);
    head.scale.set(1, 0.9, 1);
    for (const s of [-1, 1]) {
        const ear = mesh(new THREE.ConeGeometry(0.06, 0.12, 4), catM, [0.3 + s * 0.03, 0.33, -0.12 + s * 0.09], cat);
        ear.rotation.x = s * 0.35;
        const eye = box(0.012, 0.012, 0.05, C.charcoal, [0.42, 0.2, -0.12 + s * 0.06], cat);
        eye.rotation.y = 0.2;
    }
    const tail = mesh(new THREE.TorusGeometry(0.25, 0.045, 8, 20, Math.PI * 1.1), catM, [-0.02, 0.06, 0.02], cat);
    tail.rotation.x = Math.PI / 2;
    tail.rotation.z = 0.6;
    // stripes
    for (let i = 0; i < 3; i++) {
        const st = sphere(0.06, 0xd9823c, [-0.12 + i * 0.12, 0.29, 0], cat, 8);
        st.scale.set(0.5, 0.25, 2.3);
    }
    hotspot("cat", "pet the cat", cat);

    // ------------------------------------------------ bookshelf -> projects

    const shelf = new THREE.Group();
    shelf.position.set(-3.55, 0, 1.35);
    room.add(shelf);
    const shelfM = mat(C.cream);
    box(0.8, 3.2, 0.08, shelfM, [0, 1.6, -1.1], shelf);
    box(0.8, 3.2, 0.08, shelfM, [0, 1.6, 1.1], shelf);
    box(0.06, 3.2, 2.2, mat(0xe9dcc6), [-0.37, 1.6, 0], shelf);
    const bookColors = [C.pink, C.teal, C.lamp, C.lilac, C.mint, C.peach, 0x7a6cf0, 0xffd38a, 0xf47c7c];
    for (let s = 0; s < 4; s++) {
        const y = 0.06 + s * 0.95;
        box(0.8, 0.08, 2.2, shelfM, [0, y, 0], shelf);
        if (s === 3) continue;
        let z = -1.0;
        let n = 0;
        while (z < 0.95) {
            const w = 0.09 + rand() * 0.08;
            const hgt = 0.5 + rand() * 0.28;
            if (z + w > 1.0) break;
            const col = bookColors[Math.floor(rand() * bookColors.length)];
            const b = box(0.55 + rand() * 0.1, hgt, w, col, [0.02, y + 0.04 + hgt / 2, z + w / 2], shelf, 0.015);
            if (n === 6 && s === 1) { b.rotation.x = -0.35; b.position.z += 0.09; b.position.y -= 0.03; z += 0.12; }
            z += w + 0.01;
            n++;
            if (s === 0 && n === 7) z += 0.5; // a gap for the little plant
        }
    }
    box(0.8, 0.08, 2.2, shelfM, [0, 3.2, 0], shelf);
    // things on top
    cyl(0.16, 0.13, 0.28, C.terracotta, [0, 3.38, 0.6], shelf);
    for (let i = 0; i < 6; i++) {
        const vine = sphere(0.07, i % 2 ? C.leaf : C.leafDark, [0.2 + Math.min(i, 2) * 0.08, 3.42 - i * 0.14, 0.62 + Math.sin(i * 2) * 0.05], shelf, 8);
        vine.scale.set(0.7, 1, 1.2);
    }
    sphere(0.16, C.leaf, [0, 3.58, 0.6], shelf, 10);
    box(0.4, 0.3, 0.3, C.lilac, [0, 3.39, -0.5], shelf, 0.05);
    hotspot("projects", "my projects", shelf);

    // ------------------------------------------------ corkboard -> cv

    const board = new THREE.Group();
    board.position.set(2.75, 3.25, -3.97);
    room.add(board);
    const corkTex = canvasTex(256, 192, (ctx, w, h) => {
        ctx.fillStyle = "#c99a6b";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
            ctx.fillStyle = rand() < 0.5 ? "rgba(90,50,20,0.25)" : "rgba(255,230,190,0.25)";
            ctx.fillRect(rand() * w, rand() * h, 2, 2);
        }
    });
    box(1.9, 1.35, 0.06, mat(C.woodDark), [0, 0, 0.0], board);
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 1.21), new THREE.MeshStandardMaterial({ map: corkTex, roughness: 1 }));
    cork.position.z = 0.032;
    cork.receiveShadow = true;
    board.add(cork);

    const avatarTex = new THREE.TextureLoader().load(profile.avatar);
    avatarTex.colorSpace = THREE.SRGBColorSpace;
    const polaroid = new THREE.Group();
    polaroid.position.set(-0.45, 0.05, 0.04);
    polaroid.rotation.z = 0.07;
    board.add(polaroid);
    const pol = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.7), mat(0xffffff));
    polaroid.add(pol);
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.52), new THREE.MeshStandardMaterial({ map: avatarTex, color: 0xffffff, roughness: 0.6 }));
    photo.position.set(0, 0.05, 0.002);
    polaroid.add(photo);
    const photoBg = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.52), mat(0xffc7d6));
    photoBg.position.set(0, 0.05, 0.001);
    polaroid.add(photoBg);
    sphere(0.035, 0xf47c7c, [0, 0.31, 0.02], polaroid, 8);

    const cvTex = canvasTex(256, 340, (ctx, w, h) => {
        ctx.fillStyle = "#fffaf0";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#3a2d66";
        ctx.font = '40px "Major Mono Display", monospace';
        ctx.fillText("cv", 24, 60);
        ctx.font = '800 18px "Nunito", sans-serif';
        ctx.fillText(profile.name, 24, 92);
        for (let i = 0; i < 9; i++) {
            ctx.fillStyle = i % 3 === 0 ? "#ff8fab" : "#c9bfe0";
            ctx.fillRect(24, 120 + i * 22, i % 3 === 0 ? 90 : 150 + ((i * 37) % 60), 8);
        }
    });
    const cv = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.73), new THREE.MeshStandardMaterial({ map: cvTex, roughness: 0.9 }));
    cv.position.set(0.3, 0.0, 0.05);
    cv.rotation.z = -0.05;
    board.add(cv);
    sphere(0.035, C.teal, [0.3, 0.33, 0.07], board, 8);
    // sticky notes
    const note = (x, y, c, r) => {
        const n = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), mat(c));
        n.position.set(x, y, 0.045);
        n.rotation.z = r;
        board.add(n);
    };
    note(0.75, 0.4, 0xffe98a, 0.1);
    note(0.78, -0.35, C.mint, -0.12);
    hotspot("cv", "my cv", board);

    // ------------------------------------------------ record player -> music

    const cabinet = new THREE.Group();
    cabinet.position.set(2.85, 0, -3.45);
    room.add(cabinet);
    box(1.6, 1.1, 0.9, C.wood, [0, 0.6, 0], cabinet, 0.04);
    box(0.7, 0.85, 0.02, C.woodDark, [-0.38, 0.6, 0.45], cabinet);
    box(0.7, 0.85, 0.02, C.woodDark, [0.38, 0.6, 0.45], cabinet);
    for (const x of [-0.65, 0.65]) cyl(0.04, 0.03, 0.1, C.charcoal, [x, 0.05, 0.3], cabinet, 8);
    // vinyl sleeves inside
    const player = new THREE.Group();
    player.position.set(0, 1.15, 0.05);
    cabinet.add(player);
    box(1.05, 0.14, 0.75, C.cream, [0, 0.07, 0], player, 0.03);
    cyl(0.3, 0.3, 0.02, C.charcoal, [-0.12, 0.15, 0], player, 32);
    const disc = new THREE.Group();
    disc.position.set(-0.12, 0.17, 0);
    player.add(disc);
    cyl(0.29, 0.29, 0.015, 0x15131f, [0, 0, 0], disc, 32);
    cyl(0.1, 0.1, 0.017, C.pink, [0, 0, 0], disc, 20);
    box(0.08, 0.018, 0.02, C.cream, [0.05, 0.003, 0], disc); // marker so you can see it spin
    const tonearm = box(0.04, 0.03, 0.45, 0xd0d0d8, [0.32, 0.2, 0.05], player);
    tonearm.rotation.y = 0.25;
    cyl(0.05, 0.05, 0.06, 0xd0d0d8, [0.36, 0.17, -0.2], player, 12);
    // speaker
    box(0.35, 0.55, 0.35, C.charcoal, [0.55, 1.42, -0.1], cabinet, 0.04).rotation.y = -0.2;
    cyl(0.1, 0.1, 0.02, 0x4b4560, [0.58, 1.48, 0.08], cabinet, 20).rotation.x = Math.PI / 2;
    hotspot("music", "lofi radio", player);

    // ------------------------------------------------ wall decor

    const posterTex = canvasTex(300, 420, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#3a2d66");
        g.addColorStop(1, "#ff8fab");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ffd38a";
        ctx.beginPath();
        ctx.arc(w / 2, 190, 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a2d66";
        for (let i = 0; i < 5; i++) ctx.fillRect(w / 2 - 90, 200 + i * 14, 180, 5 + i);
        ctx.fillStyle = "#fff1dc";
        ctx.font = '42px "Major Mono Display", monospace';
        ctx.textAlign = "center";
        ctx.fillText("lofi", w / 2, 340);
        ctx.font = '18px "Courier Prime", monospace';
        ctx.fillText("beats to code to", w / 2, 372);
    });
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.47), new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.8 }));
    poster.position.set(-2.4, 3.2, -3.98);
    room.add(poster);

    // wall shelf above desk with tiny things
    box(1.6, 0.07, 0.35, C.wood, [0.45, 3.75, -3.82], room);
    for (let i = 0; i < 5; i++) box(0.08, 0.32 + (i % 2) * 0.06, 0.24, bookColors[i + 2], [-0.1 + i * 0.09, 3.95, -3.82], room, 0.01);
    cyl(0.1, 0.08, 0.16, C.terracotta, [0.75, 3.87, -3.82], room);
    sphere(0.12, C.leaf, [0.75, 4.02, -3.82], room, 10);
    const dino = sphere(0.09, C.mint, [1.1, 3.88, -3.82], room, 10);
    dino.scale.set(1.4, 1, 1);

    // floor plant
    const fp = new THREE.Group();
    fp.position.set(-3.3, 0, -3.3);
    room.add(fp);
    cyl(0.32, 0.25, 0.6, C.terracotta, [0, 0.3, 0], fp);
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const leaf = sphere(0.2, i % 2 ? C.leaf : C.leafDark, [Math.cos(a) * 0.3, 0.95 + (i % 3) * 0.25, Math.sin(a) * 0.3], fp, 8);
        leaf.scale.set(0.5, 1.6, 1);
        leaf.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    }

    // floor cushion + stack of books
    const cushion = sphere(0.55, C.teal, [-2.2, 0.2, 2.5], room, 20);
    cushion.scale.set(1, 0.4, 1);
    for (let i = 0; i < 3; i++) box(0.6 - i * 0.05, 0.1, 0.45, bookColors[i], [-1.3, 0.05 + i * 0.1, 2.9], room, 0.02).rotation.y = i * 0.25;

    // fairy lights along the walls
    const bulbs = [];
    const bulbColors = [0xffd38a, 0xff9ec4, 0x9be3c3, 0xb8a4f0];
    for (let i = 0; i <= 26; i++) {
        const u = i / 26;
        const x = -3.9 + u * 7.8;
        const y = 4.55 - Math.sin(u * Math.PI * 3) ** 2 * 0.25;
        bulbs.push([x, y, -3.92]);
    }
    for (let i = 1; i <= 22; i++) {
        const u = i / 22;
        bulbs.push([-3.92, 4.55 - Math.sin(u * Math.PI * 3) ** 2 * 0.25, -3.9 + u * 7.8]);
    }
    const lightsMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length);
    const dummy = new THREE.Object3D();
    bulbs.forEach((p, i) => {
        dummy.position.set(...p);
        dummy.updateMatrix();
        lightsMesh.setMatrixAt(i, dummy.matrix);
        lightsMesh.setColorAt(i, new THREE.Color(bulbColors[i % 4]));
    });
    room.add(lightsMesh);
    const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bulbs.map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: 0x2b2838 }));
    room.add(wire);
    const fairyGlow = new THREE.PointLight(0xffb3c8, 1.6, 7, 2);
    fairyGlow.position.set(-2, 4.2, -2);
    room.add(fairyGlow);

    // dust motes floating in the lamp light
    const moteCount = 60;
    const moteGeo = new THREE.BufferGeometry();
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
        motePos[i * 3] = -3 + Math.random() * 6.5;
        motePos[i * 3 + 1] = 0.5 + Math.random() * 4;
        motePos[i * 3 + 2] = -3.6 + Math.random() * 6;
    }
    moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
    const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xffe2b8, size: 0.035, transparent: true, opacity: 0.6, depthWrite: false }));
    room.add(motes);

    // ------------------------------------------------ "click me" markers

    const markerTex = canvasTex(64, 64, (ctx) => {
        const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.35, "rgba(255,211,138,0.9)");
        g.addColorStop(1, "rgba(255,211,138,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
    });
    const markerSpots = {
        about: [0.45, 3.15, -3.4],
        contact: [1.55, 2.25, -3.05],
        projects: [-3.4, 3.95, 1.35],
        cv: [2.75, 4.15, -3.9],
        music: [2.75, 1.75, -3.4],
        cat: [0.9, 1.75, -1.55],
    };
    const markers = {};
    for (const [k, p] of Object.entries(markerSpots)) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex, depthWrite: false, transparent: true, toneMapped: false }));
        s.position.set(...p);
        s.scale.setScalar(0.32);
        s.userData.base = p[1];
        room.add(s);
        markers[k] = s;
    }

    // ------------------------------------------------ camera views

    const V = (p, t) => ({ pos: new THREE.Vector3(...p), target: new THREE.Vector3(...t) });
    const homeView = () => {
        const aspect = window.innerWidth / window.innerHeight;
        const k = Math.max(1, 1.05 / aspect); // tall phones need the camera further back
        scene.fog.near = 22 * k;
        scene.fog.far = 40 * k;
        return V([8.7 * k, 6.8 * k, 8.7 * k], [0, 1.9 - (k - 1) * 0.3, -0.7]);
    };
    const views = {
        about: V([1.55, 3.0, 0.6], [0.45, 2.35, -3.4]),
        contact: V([2.75, 2.75, -0.7], [1.6, 1.85, -3.05]),
        projects: V([1.9, 3.0, 3.7], [-3.4, 1.8, 1.35]),
        cv: V([3.35, 3.4, 0.55], [2.75, 3.1, -3.9]),
    };

    // orbit limits are lifted while the camera flies, otherwise they fight the move
    const limits = { minAzimuthAngle: controls.minAzimuthAngle, maxAzimuthAngle: controls.maxAzimuthAngle, minDistance: controls.minDistance };
    let tween = null;
    function flyTo(view, speed = 3) {
        tween = { pos: view.pos.clone(), target: view.target.clone(), speed };
        Object.assign(controls, { minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity, minDistance: 0 });
    }
    function endTween() {
        tween = null;
        Object.assign(controls, limits);
    }
    controls.addEventListener("start", endTween);

    const intro = homeView();
    camera.position.copy(intro.pos).multiplyScalar(1.6);
    controls.target.copy(intro.target);
    controls.update();

    // view offset slides the room aside when the panel is open
    const offset = { x: 0, y: 0, tx: 0, ty: 0 };
    function applyOffset() {
        const w = window.innerWidth, h = window.innerHeight;
        if (Math.abs(offset.x) < 0.5 && Math.abs(offset.y) < 0.5) camera.clearViewOffset();
        else camera.setViewOffset(w, h, offset.x, offset.y, w, h);
    }

    // ------------------------------------------------ UI wiring

    const panel = $("#panel");
    const panelBody = panel.querySelector(".panel-body");
    const tooltip = $("#tooltip");
    const radio = new LofiRadio();
    const musicBtn = $("#music");
    let current = null;

    function setMusic(on) {
        musicBtn.setAttribute("aria-pressed", String(on));
        musicBtn.querySelector(".label").textContent = on ? "music on" : "music off";
    }
    musicBtn.addEventListener("click", () => setMusic(radio.toggle()));

    function visit(key) {
        markers[key]?.material && (markers[key].visible = false);
    }

    function openPanel(key) {
        current = key;
        visit(key);
        panelBody.innerHTML = panels[key]();
        panel.hidden = false;
        body.classList.add("panel-open");
        document.querySelectorAll(".chips button").forEach((b) => b.classList.toggle("active", b.dataset.open === key));
        const mobile = window.innerWidth <= 640;
        offset.tx = mobile ? 0 : Math.min(220, window.innerWidth * 0.18);
        offset.ty = mobile ? window.innerHeight * 0.22 : 0;
        // on tall screens step back a little so the object isn't too close
        const v = views[key];
        const aspect = window.innerWidth / window.innerHeight;
        const back = aspect < 1 ? Math.min(1.9, 1 / aspect) : 1;
        flyTo({ target: v.target, pos: v.target.clone().add(v.pos.clone().sub(v.target).multiplyScalar(back)) });
    }

    function closePanel() {
        if (!current) return;
        current = null;
        panel.hidden = true;
        body.classList.remove("panel-open");
        offset.tx = offset.ty = 0;
        document.querySelectorAll(".chips button").forEach((b) => b.classList.remove("active"));
        flyTo(homeView(), 2.2);
    }

    panel.querySelector(".panel-close").addEventListener("click", closePanel);
    window.addEventListener("keydown", (e) => e.key === "Escape" && closePanel());
    document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openPanel(b.dataset.open)));

    // hearts + purr when the cat is petted
    const hearts = [];
    const heartTex = canvasTex(64, 64, (ctx) => {
        ctx.fillStyle = "#ff8fab";
        ctx.font = "48px serif";
        ctx.textAlign = "center";
        ctx.fillText("♥", 32, 48);
    });
    function petCat() {
        visit("cat");
        for (let i = 0; i < 5; i++) {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
            const p = new THREE.Vector3();
            cat.getWorldPosition(p);
            s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4));
            s.scale.setScalar(0.22);
            s.userData = { life: 0, delay: i * 0.12, vx: (Math.random() - 0.5) * 0.3 };
            scene.add(s);
            hearts.push(s);
        }
        catBounce = 1;
        if (radio.ctx || radio.playing !== undefined) purr();
    }
    let catBounce = 0;
    function purr() {
        try {
            radio.init();
            const ctx = radio.ctx;
            ctx.resume();
            const t = ctx.currentTime;
            const src = ctx.createBufferSource();
            src.buffer = radio.noise;
            const f = ctx.createBiquadFilter();
            f.type = "lowpass";
            f.frequency.value = 180;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, t);
            const am = ctx.createOscillator();
            am.frequency.value = 24;
            const amG = ctx.createGain();
            amG.gain.value = 0.25;
            am.connect(amG).connect(g.gain);
            g.gain.linearRampToValueAtTime(0.35, t + 0.2);
            g.gain.linearRampToValueAtTime(0, t + 1.6);
            src.connect(f).connect(g).connect(ctx.destination);
            src.start(t);
            src.stop(t + 1.7);
            am.start(t);
            am.stop(t + 1.7);
        } catch (e) { /* sound is a bonus */ }
    }

    function toggleLamp() {
        visit("lamp");
        lampOn = !lampOn;
        lampLight.intensity = lampOn ? L.lamp : 0;
        bulbM.color.set(lampOn ? 0xfff0c2 : 0x6b6470);
    }

    function activate(key) {
        if (key === "music") { visit("music"); setMusic(radio.toggle()); return; }
        if (key === "cat") return petCat();
        if (key === "lamp") return toggleLamp();
        openPanel(key);
    }

    // pointer picking
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hovered = null;
    let down = null;
    let pointerType = "mouse";

    function pick(e) {
        const r = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(hitTargets, false)[0];
        return hit ? hit.object.userData.spot : null;
    }

    renderer.domElement.addEventListener("pointermove", (e) => {
        pointerType = e.pointerType;
        if (e.pointerType !== "mouse") return;
        const key = pick(e);
        hovered = key;
        renderer.domElement.style.cursor = key ? "pointer" : "grab";
        if (key) {
            tooltip.textContent = hotspots.find((h) => h.key === key).label;
            tooltip.style.left = e.clientX + "px";
            tooltip.style.top = e.clientY + "px";
            tooltip.classList.add("show");
        } else tooltip.classList.remove("show");
    });
    renderer.domElement.addEventListener("pointerleave", () => { hovered = null; tooltip.classList.remove("show"); });
    renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener("pointerup", (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        down = null;
        if (moved > 6) return;
        const key = pick(e);
        if (key) activate(key);
        else if (current) closePanel();
    });

    // simple view toggle
    const back = $(".simple-back");
    let paused = false;
    document.querySelectorAll("[data-simple]").forEach((a) => a.addEventListener("click", (e) => {
        e.preventDefault();
        body.classList.remove("room");
        $("#hud").hidden = $("#dock").hidden = true;
        panel.hidden = true;
        $("#loader").classList.add("gone");
        back.hidden = false;
        paused = true;
        window.scrollTo(0, 0);
    }));
    back.addEventListener("click", () => {
        body.classList.add("room");
        $("#hud").hidden = $("#dock").hidden = false;
        if (current) panel.hidden = false;
        back.hidden = true;
        paused = false;
        onResize();
    });

    // ------------------------------------------------ resize + loop

    function onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        applyOffset();
        if (!current && !tween) flyTo(homeView());
        else if (!current && tween) tween.pos.copy(homeView().pos);
    }
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    const tmpV = new THREE.Vector3();
    function frame() {
        requestAnimationFrame(frame);
        if (paused || document.hidden) { clock.getDelta(); return; }
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;

        if (tween) {
            const k = 1 - Math.exp(-dt * tween.speed);
            camera.position.lerp(tween.pos, k);
            controls.target.lerp(tween.target, k);
            if (camera.position.distanceTo(tween.pos) < 0.01 && controls.target.distanceTo(tween.target) < 0.01) endTween();
        }
        controls.update();

        const ko = 1 - Math.exp(-dt * 5);
        offset.x += (offset.tx - offset.x) * ko;
        offset.y += (offset.ty - offset.y) * ko;
        applyOffset();

        drawWindow(dt);

        // steam
        steam.forEach((s) => {
            const p = (t * 0.35 + s.userData.offset) % 1;
            s.position.set(Math.sin(p * 6 + s.userData.offset * 10) * 0.04, 0.3 + p * 0.5, 0);
            s.scale.setScalar(0.6 + p * 1.2);
            s.material.opacity = 0.28 * Math.sin(p * Math.PI);
        });

        // sleepy cat breathing
        catBounce = Math.max(0, catBounce - dt * 1.5);
        catBody.scale.y = 0.6 + Math.sin(t * 1.6) * 0.02 + catBounce * 0.08;
        head.position.y = 0.18 + catBounce * Math.abs(Math.sin(t * 14)) * 0.05;
        tail.rotation.z = 0.6 + Math.sin(t * 0.8) * 0.08;

        // record spins while music plays
        if (radio.playing) disc.rotation.y -= dt * 3.5;
        tonearm.rotation.y += ((radio.playing ? 0.05 : 0.25) - tonearm.rotation.y) * ko;

        // twinkly lights
        for (let i = 0; i < bulbs.length; i++) {
            const c = new THREE.Color(bulbColors[i % 4]).multiplyScalar(0.75 + 0.45 * Math.sin(t * 2 + i * 1.7));
            lightsMesh.setColorAt(i, c);
        }
        lightsMesh.instanceColor.needsUpdate = true;

        // motes drift
        const mp = moteGeo.attributes.position.array;
        for (let i = 0; i < moteCount; i++) {
            mp[i * 3 + 1] += Math.sin(t * 0.5 + i) * 0.0015;
            mp[i * 3] += Math.cos(t * 0.3 + i * 2) * 0.001;
        }
        moteGeo.attributes.position.needsUpdate = true;

        // markers bob
        for (const m of Object.values(markers)) {
            m.position.y = m.userData.base + Math.sin(t * 2.5 + m.position.x) * 0.06;
            m.material.opacity = 0.65 + Math.sin(t * 3 + m.position.z) * 0.35;
        }

        // hover pop
        for (const h of hotspots) {
            h.hover += ((hovered === h.key ? 1 : 0) - h.hover) * ko;
            h.group.scale.copy(h.baseScale).multiplyScalar(1 + h.hover * 0.04);
        }

        // hearts
        for (let i = hearts.length - 1; i >= 0; i--) {
            const s = hearts[i];
            s.userData.life += dt;
            const life = s.userData.life - s.userData.delay;
            s.visible = life > 0;
            if (life <= 0) continue;
            s.position.y += dt * 0.6;
            s.position.x += s.userData.vx * dt;
            s.material.opacity = Math.max(0, 1 - life / 1.4);
            if (life > 1.4) { scene.remove(s); s.material.dispose(); hearts.splice(i, 1); }
        }

        renderer.render(scene, camera);
    }

    // ------------------------------------------------ ready

    renderer.compile(scene, camera);
    frame();

    loaderText.textContent = "the room is ready";
    const enter = $("#enter");
    enter.hidden = false;
    enter.focus();
    const go = (withMusic) => {
        $("#loader").classList.add("gone");
        $("#hud").hidden = false;
        $("#dock").hidden = false;
        flyTo(homeView(), 1.4);
        if (withMusic) radio.play().then(() => setMusic(true)).catch(() => {});
    };
    enter.addEventListener("click", () => go(true), { once: true });
    const quiet = document.createElement("button");
    quiet.className = "loader-skip";
    quiet.style.cssText = "background:none;border:0;cursor:pointer;text-decoration:underline";
    quiet.textContent = "enter quietly";
    enter.after(quiet);
    quiet.addEventListener("click", () => go(false), { once: true });

    // tiny hello for people who open devtools
    console.log("%c hey there, curious dev ☕ ", "background:#ff8fab;color:#1b1a2e;font-weight:bold;padding:4px 8px;border-radius:6px");
    console.log("%cthis room is plain three.js, no build step. peek at /js/room/", "color:#b8a4f0");
}
