// The two toys in the room: a snake game on the retro TV and a paint easel.
// Each draws into its own canvas, which is both shown in the panel and used
// as a texture in the 3D room.

const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

// ---------------------------------------------------------------- snake

export function createGame() {
    const W = 320, H = 240, CELL = 16;
    const COLS = W / CELL, ROWS = (H - 32) / CELL; // top 32px is the score bar
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "toy-canvas game-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Snake game. Use arrow keys or swipe.");
    const ctx = canvas.getContext("2d");

    let state = "attract"; // attract | play | over
    let snake, dir, nextDir, food, score, stepTime, acc = 0, t = 0;
    let best = Number(store.get("kg-snake-best")) || 0;

    function reset() {
        snake = [{ x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
        dir = nextDir = { x: 1, y: 0 };
        score = 0;
        stepTime = 0.14;
        placeFood();
    }
    function placeFood() {
        do food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
        while (snake.some((s) => s.x === food.x && s.y === food.y));
    }

    function start() {
        reset();
        state = "play";
        canvas.focus({ preventScroll: true });
    }

    function turn(x, y) {
        if (state !== "play") return start();
        if (x === -dir.x && y === -dir.y) return;
        nextDir = { x, y };
    }

    function step() {
        dir = nextDir;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || snake.some((s) => s.x === head.x && s.y === head.y)) {
            state = "over";
            if (score > best) { best = score; store.set("kg-snake-best", String(best)); }
            return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
            score++;
            stepTime = Math.max(0.06, stepTime - 0.004);
            placeFood();
        } else snake.pop();
    }

    // a lazy demo snake that chases food on its own
    function autopilot() {
        const h = snake[0];
        const opts = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].filter((d) => !(d.x === -dir.x && d.y === -dir.y));
        const safe = opts.filter((d) => {
            const n = { x: h.x + d.x, y: h.y + d.y };
            return n.x >= 0 && n.y >= 0 && n.x < COLS && n.y < ROWS && !snake.some((s) => s.x === n.x && s.y === n.y);
        });
        const pickFrom = safe.length ? safe : opts;
        pickFrom.sort((a, b) => Math.abs(h.x + a.x - food.x) + Math.abs(h.y + a.y - food.y) - (Math.abs(h.x + b.x - food.x) + Math.abs(h.y + b.y - food.y)));
        nextDir = pickFrom[0];
    }

    function text(str, x, y, size, col, align = "center") {
        ctx.font = `${size}px "Press Start 2P", "Courier Prime", monospace`;
        ctx.fillStyle = col;
        ctx.textAlign = align;
        ctx.fillText(str, x, y);
    }

    function draw() {
        ctx.fillStyle = "#0b1020";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#141c33";
        ctx.fillRect(0, 0, W, 32);
        text(`SCORE ${score}`, 10, 21, 10, "#9fd8ff", "left");
        text(`BEST ${best}`, W - 10, 21, 10, "#ffc56b", "right");

        ctx.save();
        ctx.translate(0, 32);
        ctx.fillStyle = "rgba(159,216,255,0.05)";
        for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) if ((x + y) % 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        ctx.fillStyle = "#ff8a3d";
        ctx.fillRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6);
        snake.forEach((s, i) => {
            ctx.fillStyle = i === 0 ? "#b6ff8a" : "#5fd16b";
            ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
        });
        ctx.restore();

        const blink = Math.floor(t * 2) % 2 === 0;
        if (state === "attract") {
            ctx.fillStyle = "rgba(11,16,32,0.55)";
            ctx.fillRect(0, 90, W, 70);
            text("KANUSHKA ARCADE", W / 2, 118, 12, "#ffc56b");
            if (blink) text("PRESS START", W / 2, 144, 10, "#fff");
        } else if (state === "over") {
            ctx.fillStyle = "rgba(11,16,32,0.7)";
            ctx.fillRect(0, 80, W, 90);
            text("GAME OVER", W / 2, 112, 14, "#ff8a3d");
            text(`SCORE ${score}`, W / 2, 136, 10, "#fff");
            if (blink) text("PRESS START", W / 2, 158, 9, "#9fd8ff");
        }
        // scanlines
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    }

    function update(dt) {
        t += dt;
        acc += dt;
        const st = state === "play" ? stepTime : 0.12;
        while (acc > st) {
            acc -= st;
            if (state === "play") step();
            else if (state === "attract") {
                autopilot();
                const before = snake.length;
                step();
                if (state === "over" || snake.length > 18) { state = "attract"; reset(); }
                else if (snake.length > before) score = 0;
            }
        }
        draw();
    }

    // controls
    const keys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    function onKey(e) {
        if (!canvas.isConnected || !canvas.offsetParent) return;
        if (keys[e.key]) { e.preventDefault(); turn(...keys[e.key]); }
        else if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (state !== "play") start(); }
    }
    window.addEventListener("keydown", onKey);

    let touch = null;
    canvas.addEventListener("pointerdown", (e) => { touch = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener("pointerup", (e) => {
        if (!touch) return;
        const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
        touch = null;
        if (Math.hypot(dx, dy) < 20) { if (state !== "play") start(); return; }
        Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy));
    });

    reset();
    draw();
    return { canvas, update, turn, start, get playing() { return state === "play"; } };
}

// ---------------------------------------------------------------- paint

export function createPaint() {
    const W = 384, H = 288;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "toy-canvas paint-canvas";
    canvas.setAttribute("aria-label", "Drawing canvas");
    const ctx = canvas.getContext("2d");
    ctx.lineCap = ctx.lineJoin = "round";

    const colors = ["#1e2538", "#ff8a3d", "#ffc56b", "#5fd16b", "#3fa7d6", "#e94f4f", "#ffffff"];
    let color = colors[1];
    let size = 6;
    let changed = true;

    function starter() {
        // a little sunset painting so the easel isn't blank
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#2b4a7a");
        g.addColorStop(0.6, "#f2a35e");
        g.addColorStop(1, "#f7d9a8");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#ffe08a";
        ctx.beginPath();
        ctx.arc(W * 0.68, H * 0.55, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#33405e";
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(0, H * 0.62);
        ctx.lineTo(W * 0.25, H * 0.42);
        ctx.lineTo(W * 0.48, H * 0.66);
        ctx.lineTo(W * 0.7, H * 0.5);
        ctx.lineTo(W, H * 0.7);
        ctx.lineTo(W, H);
        ctx.fill();
        ctx.fillStyle = "#1e2538";
        ctx.fillRect(0, H * 0.85, W, H * 0.15);
        changed = true;
    }

    function clear() {
        ctx.fillStyle = "#fbf6ec";
        ctx.fillRect(0, 0, W, H);
        changed = true;
    }

    let last = null;
    const pos = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    canvas.addEventListener("pointerdown", (e) => {
        canvas.setPointerCapture(e.pointerId);
        last = pos(e);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(last.x, last.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
        changed = true;
    });
    canvas.addEventListener("pointermove", (e) => {
        if (!last) return;
        const p = pos(e);
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last = p;
        changed = true;
    });
    const end = () => { last = null; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    // toolbar
    const tools = document.createElement("div");
    tools.className = "paint-tools";
    colors.forEach((c, i) => {
        const b = document.createElement("button");
        b.className = "swatch" + (i === 1 ? " active" : "");
        b.style.background = c;
        b.setAttribute("aria-label", `colour ${c}`);
        b.addEventListener("click", () => {
            color = c;
            tools.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s === b));
        });
        tools.appendChild(b);
    });
    const sizeBtn = document.createElement("button");
    sizeBtn.className = "tool-btn";
    const sizes = [3, 6, 14];
    sizeBtn.textContent = "brush: M";
    sizeBtn.addEventListener("click", () => {
        size = sizes[(sizes.indexOf(size) + 1) % sizes.length];
        sizeBtn.textContent = "brush: " + { 3: "S", 6: "M", 14: "L" }[size];
    });
    const clearBtn = document.createElement("button");
    clearBtn.className = "tool-btn";
    clearBtn.textContent = "clear";
    clearBtn.addEventListener("click", clear);
    tools.append(sizeBtn, clearBtn);

    starter();
    return {
        canvas,
        tools,
        consumeChange() { const c = changed; changed = false; return c; },
    };
}
