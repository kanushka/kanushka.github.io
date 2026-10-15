// Mirrorline prototype.
// The ball rides a line. Above the line (white) it is black and gravity
// pulls it down; below the line (black) it is white and gravity pulls it up.
// Space flips sides, so a hill you can't climb becomes a valley you can.

// ---- Tuning ---------------------------------------------------------------
const WORLD_H = 600;    // world units visible vertically
const G = 1000;         // gravity
const DRIVE = 500;      // roll force from arrows; climbs up to asin(DRIVE/G) = 30deg
const DAMP = 1.4;       // rolling resistance (per second)
const MAX_V = 320;      // speed cap along the line
const R = 22;           // ball radius
const ROCK_R = 40;      // rock radius
const FLIP_TIME = 0.42; // seconds for the flip jump
const HOP = 1.1;        // how far (in radii) the ball hops away before diving through
const GOAL_W = 70;      // thickness of the goal line (wider than the ball)
const FAR_ABOVE = -5000, FAR_BELOW = WORLD_H + 5000; // fill edges past any screen

// ---- Levels ---------------------------------------------------------------
// A level is a line drawn left to right as a chain of pieces. Heights are in
// world units with y growing downward; "up" arguments below are positive up.
// Curved pieces use a smooth cosine shape; straight pieces keep sharp corners,
// and two points with the same x make a 90° wall. Rocks live in one world
// only: side 1 = above the line, -1 = below.
class Track {
  constructor(y = 300) { this.x = 0; this.y = y; this.pts = [[0, y]]; this.rocks = []; }
  to(dx, up, straight) {
    this.x += dx; this.y -= up;
    this.pts.push(straight ? [this.x, this.y, 'l'] : [this.x, this.y]);
    return this;
  }
  flat(len) { return this.to(len, 0, true); }
  waves(n, amp = 15, len = 200) {
    for (let i = 0; i < n; i++) this.to(len / 2, i % 2 ? -amp : amp).to(len / 2, i % 2 ? amp : -amp);
    return this;
  }
  hill(w, h) { return this.to(w / 2, h).to(w / 2, -h); }   // curvy hill
  pit(w, d) { return this.to(w / 2, -d).to(w / 2, d); }     // curvy pit
  ramp(dx, up) { return this.to(dx, up, true); }             // straight slope
  boxHill(w, h) { return this.to(0, h, true).to(w, 0, true).to(0, -h, true); }
  boxPit(w, d) { return this.boxHill(w, -d); }
  stairs(n, rise, run = 90) {                                // rise < 0 goes down
    for (let i = 0; i < n; i++) this.to(0, rise, true).to(run, 0, true);
    return this;
  }
  rock(dx, side) { this.rocks.push({ x: this.x + dx, side }); return this; }
  end() { this.flat(450); return { pts: this.pts, rocks: this.rocks, goal: this.x - 200 }; }
}

// Each level keeps the earlier obstacles and adds a new one, mixed in tighter
// combinations as you go.
const LEVELS = [
  {
    name: 'First fold',
    par: 2,
    // Too steep from above. Flip under, ride into the peak, flip back.
    ...new Track().waves(4).flat(100).hill(600, 180).waves(2).end(),
  },
  {
    name: 'Undertow',
    par: 8,
    ...new Track()
      .waves(3).hill(600, 180).flat(150)
      .pit(600, 180).waves(2)
      // Hill straight into a pit: come down the hill and fall right in.
      .hill(500, 160).pit(500, 160).flat(200)
      // Pit straight into a hill: stay under through both.
      .pit(600, 200).flat(100).hill(600, 200)
      .waves(2).end(),
  },
  {
    name: 'Angles',
    par: 14,
    ...new Track()
      .waves(2).hill(600, 180).flat(100)
      .ramp(150, 150).flat(200).ramp(150, -150).flat(150)
      .pit(600, 180).flat(100)
      .boxHill(250, 130).flat(150)
      .boxPit(220, 140).flat(100)
      // Curvy hill into a box pit.
      .hill(500, 170).boxPit(220, 130).flat(150)
      // Up a ramp, a curvy pit on the plateau, back down, into a box hill.
      .ramp(120, 120).flat(100).pit(500, 160).flat(100).ramp(120, -120)
      .flat(80).boxHill(220, 150)
      .end(),
  },
  {
    name: 'Steps',
    par: 13,
    ...new Track()
      .waves(2)
      // Climb onto a plateau with a pit in it, then step back down.
      .stairs(3, 50).flat(100).pit(500, 160).flat(100).stairs(3, -50).flat(150)
      .hill(600, 180).flat(100)
      .boxPit(200, 140).flat(100)
      // Ziggurat.
      .stairs(4, 50).flat(200).stairs(4, -50).flat(100)
      // Ramp up, stairs down.
      .ramp(150, 150).flat(100).stairs(3, -50).flat(150)
      // Stepped pit, then a curvy one.
      .stairs(3, -50).flat(130).stairs(3, 50).flat(150)
      .pit(500, 170)
      .end(),
  },
  {
    name: 'Boulders',
    par: 19,
    ...new Track()
      .waves(2).rock(-100, 1).flat(250).rock(-125, -1)
      // A rock above, then one below, close together.
      .flat(200).rock(-150, 1).flat(220).rock(-80, -1).flat(100)
      .hill(600, 180).flat(250).rock(-120, 1)
      .pit(600, 180).flat(250).rock(-110, -1)
      // A rock under the box hill's ceiling: flip on top of the roof to pass.
      .boxHill(320, 140).rock(-160, -1).flat(150)
      // A rock on the ziggurat's landing.
      .stairs(3, 50).flat(260).rock(-130, 1).stairs(3, -50).flat(150)
      .ramp(150, 150).flat(240).rock(-120, -1).ramp(150, -150).flat(150)
      .hill(500, 170).pit(500, 170).flat(250).rock(-120, 1)
      .end(),
  },
];

// ---- Line geometry --------------------------------------------------------
// The level becomes a dense polyline P with cumulative distance s along it.
// The ball moves by s, so it can roll up and down vertical walls.
let level, levelIndex = 0, P, rocks, goalEdge, goalEnd, sMin, sMax;

function loadLevel(i) {
  levelIndex = i;
  level = LEVELS[i];
  const pts = level.pts;
  const first = pts[0], lastPt = pts[pts.length - 1];
  P = [{ x: first[0] - 3000, y: first[1] }, { x: first[0], y: first[1] }];
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1];
    const [x1, y1, kind] = pts[k];
    if (kind === 'l') { P.push({ x: x1, y: y1 }); continue; }
    const n = Math.max(2, Math.ceil((x1 - x0) / 4));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      P.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * (1 - Math.cos(Math.PI * t)) / 2 });
    }
  }
  P.push({ x: lastPt[0] + 3000, y: lastPt[1] });
  P[0].s = 0;
  for (let k = 1; k < P.length; k++) P[k].s = P[k - 1].s + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y);

  sMin = sFromX(first[0] + R);
  sMax = sFromX(lastPt[0] - R);
  goalEdge = level.goal - GOAL_W / 2;
  goalEnd = level.goal + GOAL_W / 2;
  rocks = (level.rocks || []).map((r) => ({ s: sFromX(r.x), side: r.side }));
}

// Index k such that P[k].s <= s < P[k+1].s.
function segAt(s) {
  let lo = 0, hi = P.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (P[mid].s <= s) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function posAt(s) {
  const k = segAt(s);
  const a = P[k], b = P[k + 1];
  const t = (s - a.s) / (b.s - a.s || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Unit direction of the line at s (direction of increasing s).
function tanAt(s) {
  const k = segAt(s);
  const a = P[k], b = P[k + 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

function sFromX(x) {
  let k = 0;
  while (k < P.length - 1 && P[k + 1].x < x) k++;
  const a = P[k], b = P[k + 1];
  const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
  return a.s + (b.s - a.s) * Math.max(0, Math.min(1, t));
}

// Where a circle of radius r resting at s sits, offset by off radii (+ above).
// The normal is smoothed around corners, then the circle is pushed out of
// any part of the line it overlaps, so it hugs corners without sinking in.
function centerAt(s, r, off) {
  const h = r * 0.5;
  const p0 = posAt(s - h), p1 = posAt(s + h), p = posAt(s);
  let tx = p1.x - p0.x, ty = p1.y - p0.y;
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl; ty /= tl;
  const c = { x: p.x + ty * r * off, y: p.y - tx * r * off };
  if (Math.abs(off) >= 1) pushOut(c, r, s);
  return c;
}

function pushOut(c, r, s) {
  const k0 = segAt(Math.max(0, s - r * 4)), k1 = segAt(s + r * 4);
  for (let pass = 0; pass < 3; pass++) {
    for (let k = k0; k <= k1; k++) {
      const a = P[k], b = P[k + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2));
      const qx = a.x + dx * t, qy = a.y + dy * t;
      const d = Math.hypot(c.x - qx, c.y - qy);
      if (d > 1e-6 && d < r) {
        c.x = qx + (c.x - qx) / d * r;
        c.y = qy + (c.y - qy) / d * r;
      }
    }
  }
}

// ---- State ----------------------------------------------------------------
const keys = { left: false, right: false };
let ball;

function reset() {
  ball = {
    s: sFromX(80),
    v: 0,          // speed along the line, + is rightward
    side: 1,       // 1 = above (white side), -1 = below (black side)
    flipFrom: 1,
    flipT: 1,      // 0..1 progress of the current flip animation
    flips: 0,
    won: false,
    inside: false, // true once the ball has rolled fully into the goal line
    time: 0,
  };
}

function flip() {
  if (ball.won || ball.flipT < 1) return;
  ball.flipFrom = ball.side;
  ball.side = -ball.side;
  ball.flipT = 0;
  ball.flips++;
}

// Where the ball's centre sits relative to the line, in radii: +1 resting
// above, -1 resting below. A flip hops away from the line, then dives through
// it and lands on the other side with a small bounce.
const HOP_END = 0.35;
function currentOffset() {
  const t = Math.min(ball.flipT, 1);
  if (t >= 1) return ball.side;
  let d;
  if (t < HOP_END) {
    d = 1 + HOP * Math.sin((t / HOP_END) * Math.PI / 2);
  } else {
    const u = (t - HOP_END) / (1 - HOP_END);
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    d = 1 + HOP - (2 + HOP) * e;          // 1+HOP down to -1
    d -= 0.25 * Math.sin(u * Math.PI);    // slight overshoot past the line
  }
  return ball.flipFrom * d;
}

function ballCenter() { return centerAt(ball.s, R, currentOffset()); }

// ---- Physics --------------------------------------------------------------
function step(dt) {
  if (paused()) return;
  if (ball.inside) return;
  ball.flipT += dt / FLIP_TIME;
  if (ball.won) {
    // Keep rolling into the goal line until it has disappeared inside.
    ball.s += Math.max(Math.abs(ball.v), 140) * dt;
    if (ballCenter().x - R >= goalEnd) ball.inside = true;
    return;
  }
  ball.time += dt;

  const t = tanAt(ball.s);
  const input = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  // Gravity along the line: above, a segment heading down-screen pulls you
  // forward; below, gravity is reversed so the same segment pulls you back.
  const a = ball.side * G * t.y + input * DRIVE;
  ball.v += a * dt;
  ball.v *= Math.exp(-DAMP * dt);
  ball.v = Math.max(-MAX_V, Math.min(MAX_V, ball.v));
  const prev = ball.s;
  ball.s += ball.v * dt;

  hitCorners(prev, ball.s);

  if (ball.s < sMin) { ball.s = sMin; ball.v = 0; }
  if (ball.s > sMax) { ball.s = sMax; ball.v = 0; }

  // Rocks are solid only to a ball in the same world.
  for (const rock of rocks) {
    if (rock.side !== ball.side) continue;
    const gap = R + ROCK_R;
    if (Math.abs(ball.s - rock.s) < gap) {
      ball.s = prev <= rock.s ? rock.s - gap : rock.s + gap;
      ball.v = -ball.v * 0.2;
    }
  }

  if (ballCenter().x + R >= goalEdge) ball.won = true;
}

// Rolling into an inside corner (a wall, the foot of a ramp) costs speed:
// the sharper the turn, the more is lost, so a 90° wall stops you dead
// instead of letting momentum carry you up it. Outside corners are free.
function hitCorners(from, to) {
  let k = segAt(from);
  const kEnd = segAt(to);
  const dir = Math.sign(to - from);
  while (k !== kEnd) {
    const v = dir > 0 ? k + 1 : k; // the vertex being crossed
    const a = segDir(v - 1), b = segDir(v);
    const cross = a.x * b.y - a.y * b.x;
    if (cross * ball.side * dir < 0) ball.v *= Math.max(0, a.x * b.x + a.y * b.y);
    k += dir;
  }
}

function segDir(k) {
  const a = P[k], b = P[k + 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

// ---- Rendering ------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H, scale, offY;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  // Fit the world's height, but on narrow (portrait) screens keep at least
  // MIN_VIEW_W of the line in view and centre the world vertically.
  scale = Math.min(H / WORLD_H, W / MIN_VIEW_W) * dpr;
  offY = (canvas.height - WORLD_H * scale) / 2;
}
const MIN_VIEW_W = 560;
window.addEventListener('resize', resize);

// Trace the line from x0 to x1, then close the shape off at y = edge.
function traceSide(x0, x1, edge) {
  let k0 = 0;
  while (k0 < P.length - 1 && P[k0 + 1].x < x0) k0++;
  let k1 = k0;
  while (k1 < P.length - 1 && P[k1].x <= x1) k1++;
  ctx.beginPath();
  ctx.moveTo(P[k0].x, P[k0].y);
  for (let k = k0 + 1; k <= k1; k++) ctx.lineTo(P[k].x, P[k].y);
  ctx.lineTo(P[k1].x, edge);
  ctx.lineTo(P[k0].x, edge);
  ctx.closePath();
}

function render() {
  const viewW = canvas.width / scale;
  const c = ballCenter();
  const lastX = level.pts[level.pts.length - 1][0];
  const camX = Math.max(0, Math.min(c.x - viewW * 0.35, lastX - viewW));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.setTransform(scale, 0, 0, scale, -camX * scale, offY);

  // Black side: everything below the line.
  traceSide(camX - 50, camX + viewW + 50, FAR_BELOW);
  ctx.fillStyle = '#000';
  ctx.fill();

  drawGoal();

  for (const rock of rocks) {
    const rc = centerAt(rock.s, ROCK_R, rock.side);
    ctx.fillStyle = '#7d7d7d';
    ctx.beginPath();
    ctx.arc(rc.x, rc.y, ROCK_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw each side clipped to its own world, so while crossing the line the
  // ball is black in the white world and white in the black world.
  if (!ball.inside && !onTitle()) { // the ball arrives when play starts
    drawBallInSide(c.x, c.y, 1);
    drawBallInSide(c.x, c.y, -1);
  }

  updateHud();
}

// The goal: a still grey band running top to bottom. The ball rolls over it
// and vanishes at its far edge.
function drawGoal() {
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(goalEdge, FAR_ABOVE, GOAL_W, FAR_BELOW - FAR_ABOVE);
}

function drawBallInSide(cx, cy, side) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-5000, FAR_ABOVE, goalEnd + 5000, FAR_BELOW - FAR_ABOVE);
  ctx.clip();
  traceSide(cx - R * 4, cx + R * 4, side > 0 ? FAR_ABOVE : FAR_BELOW);
  ctx.clip();
  ctx.fillStyle = side > 0 ? '#000' : '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- HUD ------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const hud = {
  flips: $('flips'),
  time: $('time'),
  levelName: $('level-name'),
  levelNum: $('level-num'),
  help: $('help'),
  helpBtn: $('help-btn'),
  pause: $('pause'),
  pauseBtn: $('pause-btn'),
  done: $('done'),
  doneTitle: $('done-title'),
  doneFlips: $('done-flips'),
  donePar: $('done-par'),
  doneTime: $('done-time'),
  next: $('next'),
};
let shown = {};

function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function setText(el, key, value) {
  if (shown[key] !== value) { el.textContent = value; shown[key] = value; }
}

function updateHud() {
  setText(hud.flips, 'flips', String(ball.flips));
  setText(hud.time, 'time', formatTime(ball.time));
  setText(hud.levelName, 'levelName', level.name);
  setText(hud.levelNum, 'levelNum', `level ${levelIndex + 1} of ${LEVELS.length}`);
  const done = ball.inside;
  if (shown.done !== done) {
    hud.done.hidden = !done;
    shown.done = done;
    if (done) {
      const lastLevel = levelIndex === LEVELS.length - 1;
      hud.doneTitle.textContent = lastLevel ? 'All levels complete' : `Level ${levelIndex + 1} complete`;
      hud.doneFlips.textContent = `${ball.flips} ${ball.flips === 1 ? 'flip' : 'flips'}`;
      hud.donePar.textContent = `par ${level.par}`;
      hud.doneTime.textContent = formatTime(ball.time);
      hud.next.hidden = lastLevel;
      if (!lastLevel) saveProgress(levelIndex + 1);
    }
  }
}

// Remember the furthest level reached. Storage can be unavailable; the game
// works without it.
function saveProgress(i) {
  try { if (i > loadProgress()) localStorage.setItem('mirrorline.level', String(i)); } catch (e) {}
}
function loadProgress() {
  try { return Math.min(LEVELS.length - 1, parseInt(localStorage.getItem('mirrorline.level'), 10) || 0); } catch (e) { return 0; }
}

function playLevel(i) {
  loadLevel(i);
  reset();
  keys.left = keys.right = false;
  last = performance.now();
}

const title = $('title');
function onTitle() { return !title.hidden; }
function playing() { return !onTitle() && !title.classList.contains('leaving'); }
function paused() { return !hud.help.hidden || !hud.pause.hidden || !playing(); }

function start() {
  if (title.classList.contains('leaving')) return;
  title.classList.add('leaving');
  document.body.classList.add('playing');
  let begun = false;
  const begin = () => {
    if (begun) return;
    begun = true;
    title.hidden = true;
    title.classList.remove('leaving');
    playLevel(loadProgress());
  };
  title.addEventListener('animationend', begin, { once: true });
  setTimeout(begin, 600); // in case the animation never runs
}

function toggleHelp(open = hud.help.hidden) {
  hud.help.hidden = !open;
  hud.helpBtn.setAttribute('aria-expanded', String(open));
  keys.left = keys.right = false;
  last = performance.now();
}

function togglePause(open = hud.pause.hidden) {
  if (open && (!playing() || ball.won)) return;
  hud.pause.hidden = !open;
  hud.pauseBtn.setAttribute('aria-pressed', String(open));
  keys.left = keys.right = false;
  last = performance.now();
}

function restart() { togglePause(false); reset(); }
function nextLevel() { if (levelIndex < LEVELS.length - 1) playLevel(levelIndex + 1); }

// Blur after clicking so Space flips the ball instead of re-pressing the button.
function onClick(id, fn) {
  $(id).addEventListener('click', (e) => { e.currentTarget.blur(); fn(); });
}
onClick('start', start);
onClick('title-help', () => toggleHelp(true));
onClick('help-btn', () => toggleHelp());
onClick('help-close', () => toggleHelp(false));
onClick('pause-btn', () => togglePause());
onClick('resume', () => togglePause(false));
onClick('pause-restart', restart);
onClick('replay', reset);
onClick('next', nextLevel);

// ---- Input ----------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' || e.key === '?') { toggleHelp(); e.preventDefault(); return; }
  if (!hud.help.hidden) {
    if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') { toggleHelp(false); e.preventDefault(); }
    return;
  }
  if (onTitle()) {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); start(); }
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); return; }
  if (e.code === 'KeyR') { restart(); e.preventDefault(); return; }
  if (!hud.pause.hidden) return;
  if (ball.inside && (e.code === 'Enter' || e.code === 'KeyN')) { nextLevel(); e.preventDefault(); return; }
  // Number keys jump straight to a level, handy while designing.
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= LEVELS.length) { playLevel(n - 1); e.preventDefault(); return; }
  if (e.code === 'ArrowLeft') keys.left = true;
  else if (e.code === 'ArrowRight') keys.right = true;
  else if (e.code === 'Space') { if (!e.repeat) flip(); }
  else return;
  e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') keys.left = false;
  else if (e.code === 'ArrowRight') keys.right = false;
});
// Touch controls: hold the arrows to roll, tap Flip to flip.
function holdButton(id, key) {
  const el = $(id);
  const set = (on) => (e) => {
    e.preventDefault();
    if (on && paused()) return;
    keys[key] = on;
    el.classList.toggle('held', on);
  };
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); set(true)(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, set(false));
}
holdButton('touch-left', 'left');
holdButton('touch-right', 'right');
$('touch-flip').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!paused()) flip();
});
$('game').addEventListener('contextmenu', (e) => e.preventDefault());

// Pause when the tab is hidden.
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

// ---- Loop -----------------------------------------------------------------
const SUBSTEP = 1 / 240;
let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min((now - last) / 1000, 0.1);
  last = now;
  while (acc >= SUBSTEP) { step(SUBSTEP); acc -= SUBSTEP; }
  render();
  requestAnimationFrame(frame);
}

resize();
loadLevel(loadProgress());
reset();
requestAnimationFrame(frame);

// Exposed for quick tweaking from the console.
window.mirrorline = { get ball() { return ball; }, LEVELS, playLevel, reset, step, flip, keys, ballCenter, sFromX };
