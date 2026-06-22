/* ===========================================================
   RAMP RIDER — a 2D motorcycle scroller
   Fixed logical resolution (960x540), scaled to fit the screen.

   Mechanics: constant speed, jump, air rotation (with auto-level),
   center-of-gravity landings, ramps, gaps you fall into, raised
   platforms / a second level, and speed-boost pickups.
   =========================================================== */

const W = 960;            // logical width
const H = 540;            // logical height

// ---- Tuning constants ----
const SPEED      = 480;   // base horizontal speed (px/s)
const BOOST_MULT = 1.65;  // speed multiplier while boosting
const BOOST_TIME = 2.6;   // seconds a boost lasts
const RIDE_H     = 30;    // chassis center height above the surface when resting
const WHEEL_BASE = 64;    // distance between the two wheels
const WHEEL_R    = 15;    // wheel radius

// ---- Physics tunables (overridden by saved settings from the editor) ----
let GRAVITY   = 1500;  // px/s^2
let JUMP_VEL  = -700;  // upward launch velocity
let ANG_ACCEL = 32;    // air rotation acceleration (rad/s^2)
let ANG_MAX   = 16;    // max air spin (rad/s)
let JUMP_CUT  = 0.46;  // velocity multiplier on early jump release (min jump height)

(function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('rampRiderSettings') || 'null');
    if (!s) return;
    if (s.gravity   != null) GRAVITY   = s.gravity;
    if (s.jumpVel   != null) JUMP_VEL  = -Math.abs(s.jumpVel);
    if (s.angAccel  != null) ANG_ACCEL = s.angAccel;
    if (s.angMax    != null) ANG_MAX   = s.angMax;
    if (s.jumpCut   != null) JUMP_CUT  = s.jumpCut;
  } catch(e) {}
})();
const HALF_WB    = WHEEL_BASE / 2; // half the wheelbase = half the support base
const COG_HEIGHT = 18;    // center-of-gravity height above the wheels (lower = more stable)
const WALL_TOL   = 18;    // how far the surface can be above the wheels before it's a wall
const DEATH_Y    = H + 130; // fall past this = you fell in a gap
const START_X    = 120;   // where the bike starts

// ===========================================================
//  Level — built as a sequence of solid surface segments.
//  A "gap" is simply an x-range with no segment (you fall through).
//  A vertical jump in height between segments is a cliff/wall.
// ===========================================================
const SEGS     = [];   // { x0, y0, x1, y1 }   solid top surfaces
const CRATES   = [];   // { x, w, h }          obstacles to jump
const POWERUPS = [];   // { x, y, type, taken }  'boost' (distance) | 'djump' (height)
let FINISH_X = 0, LEVEL_END = 0;

(function buildLevel() {
  // Load a manually-edited level from the editor if one has been saved.
  const saved = localStorage.getItem('rampRiderLevel');
  if (saved) {
    try {
      const d = JSON.parse(saved);
      d.segs.forEach(s => SEGS.push(s));
      d.crates.forEach(c => CRATES.push(c));
      d.powerups.forEach(p => POWERUPS.push(p));
      FINISH_X = d.finishX; LEVEL_END = d.levelEnd;
      return;
    } catch(e) { localStorage.removeItem('rampRiderLevel'); }
  }
  let cx = 0, cy = 430;
  const seg   = (x0, y0, x1, y1) => SEGS.push({ x0, y0, x1, y1 });
  const flat  = (len) => { seg(cx, cy, cx + len, cy); cx += len; };
  const ramp  = (len, dy) => { seg(cx, cy, cx + len, cy + dy); cx += len; cy += dy; };
  const gap   = (len) => { cx += len; };         // no segment = a chasm
  const step  = (dy) => { cy += dy; };           // cliff: + = down, - = up
  const crate = (w, h) => CRATES.push({ x: cx, w, h });
  const power = (type) => POWERUPS.push({ x: cx, y: 0, type, taken: false });

  // Deterministic RNG so the level is identical every run (and matches verification).
  let seed = 9241;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ri  = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  // ---- Reusable chunks (each is elevation-neutral and runway-padded, so they
  //      compose in any order without creating impossible / stacked hazards). ----
  const hills   = (n) => { for (let i = 0; i < n; i++) { const h = ri(26, 42); ramp(120, -h); ramp(120, h); } };
  const whoops  = (n) => { for (let i = 0; i < n; i++) { ramp(80, -24); ramp(80, 24); } };
  const aCrate  = () => { flat(150); crate(40, ri(38, 46)); flat(300); };
  const crateRun = (n) => { for (let i = 0; i < n; i++) { flat(140); crate(40, ri(38, 46)); flat(260); } flat(80); };
  const aGap    = (w) => { flat(70); gap(w || ri(160, 190)); flat(320); };
  const kicker  = (w) => { flat(140); ramp(150, -80); step(80); gap(w || 250); flat(320); }; // launch + flip over a valley
  const ledgeMesa = () => {                       // climb, hop a ledge onto a high mesa, drop off
    ramp(240, -90); flat(180);
    step(-80); flat(420); crate(40, 44); flat(220);
    step(80); flat(140); ramp(200, 90); flat(180);
  };
  const djumpTower = (h) => {                      // ⏫ then a tall wall onto a high platform
    flat(140); power('djump'); flat(330);
    step(-h); flat(400);
    step(h); flat(280);
  };
  const boostGap = (w) => {                         // ⚡ then a wide chasm only crossable boosted
    flat(80); power('boost'); flat(210);
    gap(w); flat(320);
  };
  const gauntlet = (n) => {                         // floating platforms over a deep pit
    flat(70);
    for (let i = 0; i < n; i++) { gap(ri(160, 185)); flat(220); }
    flat(120);
  };
  const climbHigh = () => {                         // ride up to a high plateau (crate on top) and back
    ramp(280, -110); flat(320); crate(40, 44); flat(280);
    ramp(280, 110); flat(180);
  };
  const valley = () => {                            // dip down into a gully and back up
    ramp(220, 40); flat(280); crate(40, 42); flat(240);
    ramp(220, -40); flat(160);
  };

  // ===== ACT 1 — Learn the moves (gentle) =====
  flat(420);
  hills(2); aCrate(); aGap(); whoops(3); aCrate(); aGap();
  kicker(230); hills(2); ledgeMesa();

  // ===== ACT 2 — Power-ups introduced =====
  aGap(); djumpTower(180); gauntlet(3); boostGap(330);
  hills(2); crateRun(2); climbHigh(); aGap();

  // ===== ACT 3 — Combos & escalation =====
  djumpTower(195); gauntlet(4); boostGap(345); kicker(260);
  whoops(3); valley(); aGap(); aGap(); ledgeMesa();

  // ===== ACT 4 — A gauntlet of everything =====
  djumpTower(190); gauntlet(4); boostGap(340); crateRun(3);
  climbHigh(); djumpTower(205); gauntlet(5); boostGap(350);
  hills(2); valley(); kicker(255);

  // ===== Finale — big boost + ramp over a massive chasm to the finish =====
  flat(140); crate(40, 44); flat(260);
  flat(80); power('boost'); flat(190);
  ramp(180, -95); step(95);
  gap(400);
  flat(140); FINISH_X = cx + 60; flat(360);
  LEVEL_END = cx;

  // Sit each power-up just above the ground at its x.
  for (const p of POWERUPS) p.y = groundY(p.x) - 46;
})();

// Highest solid surface at x (smallest y), or null over a gap.
function surfaceAt(x) {
  let best = null;
  for (const s of SEGS) {
    if (x >= s.x0 && x <= s.x1) {
      const span = (s.x1 - s.x0) || 1;
      const t = (x - s.x0) / span;
      const y = s.y0 + (s.y1 - s.y0) * t;
      if (best === null || y < best.y) best = { y, slope: (s.y1 - s.y0) / span };
    }
  }
  return best;
}
function groundY(x) { const s = surfaceAt(x); return s ? s.y : null; }

// ===========================================================
//  Game state
// ===========================================================
const STATE = { READY: 'ready', PLAYING: 'playing', CRASHED: 'crashed', WON: 'won' };

let bike, state, best = 0, crashReason = '', wheelSpin = 0, shake = 0;

function resetBike() {
  bike = {
    x: START_X,
    y: groundY(START_X) - RIDE_H,
    vy: 0,
    angle: 0,
    angVel: 0,
    grounded: true,
    airTime: 0,
    boost: 0,            // seconds of boost remaining (also a safety cap)
    boostedAir: false,   // used a boost since leaving the ground?
    airJumps: 0,         // mid-air jumps available (from double-jump pickups)
  };
  wheelSpin = 0;
  shake = 0;
  parts.length = 0;
  for (const p of POWERUPS) p.taken = false;
}

function startGame() {
  resetBike();
  state = STATE.PLAYING;
  hideOverlay();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

// ===========================================================
//  Input
// ===========================================================
const input = { jump: false, jumpEdge: false, jumpRelease: false, back: false, fwd: false };

function press(name, down) {
  if (name === 'jump') {
    if (down && !input.jump) input.jumpEdge = true;
    if (!down && input.jump) input.jumpRelease = true;
    input.jump = down;
  } else {
    input[name] = down;
  }
}

window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'Space': case 'ArrowUp': case 'KeyW': press('jump', true); e.preventDefault(); break;
    case 'ArrowLeft': case 'KeyA': press('back', true); break;
    case 'ArrowRight': case 'KeyD': press('fwd', true); break;
    case 'Enter': case 'KeyR':
      if (state !== STATE.PLAYING) startGame();
      break;
  }
});
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'Space': case 'ArrowUp': case 'KeyW': press('jump', false); break;
    case 'ArrowLeft': case 'KeyA': press('back', false); break;
    case 'ArrowRight': case 'KeyD': press('fwd', false); break;
  }
});

function bindButton(id, name) {
  const el = document.getElementById(id);
  const on  = (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); press(name, true); };
  const off = (e) => { e.preventDefault(); press(name, false); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  // pointerleave removed — capture keeps events on the element even if thumb drifts off
}
if (!window.EDITOR_MODE) {
bindButton('jumpBtn', 'jump');
bindButton('leanBack', 'back');
bindButton('leanFwd', 'fwd');

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('shareBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const data = { title: 'Ramp Rider', text: 'Can you make it to the finish line?', url: 'https://bike-aft.pages.dev/' };
  if (navigator.share) {
    navigator.share(data).catch(() => {});
  } else {
    navigator.clipboard.writeText(data.url).then(() => {
      const btn = document.getElementById('shareBtn');
      btn.textContent = 'COPIED!';
      setTimeout(() => btn.textContent = 'SHARE', 1800);
    });
  }
});
document.getElementById('overlay').addEventListener('click', (e) => {
  if (e.target.id === 'overlay' && state !== STATE.READY) startGame();
});

// Swipe down on the overlay to exit fullscreen (only when not playing)
let _swipeStartY = 0;
document.getElementById('overlay').addEventListener('touchstart', (e) => {
  _swipeStartY = e.touches[0].clientY;
}, { passive: true });
document.getElementById('overlay').addEventListener('touchend', (e) => {
  if (state === STATE.PLAYING) return;
  const dy = e.changedTouches[0].clientY - _swipeStartY;
  if (dy > 60 && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}, { passive: true });
} // end !EDITOR_MODE input block

// ===========================================================
//  Helpers
// ===========================================================
function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
function rotate(px, py, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: px * c - py * s, y: px * s + py * c };
}
function distM(x) { return Math.max(0, Math.round((x - START_X) / 10)); }

// Center-of-gravity landing rule. Tilt the bike by `phi` relative to the ground
// it's touching; it stays up only if the CoG projects between the two wheels.
// Reduces to |tan(phi)| < HALF_WB / COG_HEIGHT  (~60deg here).
function landingIsStable(phi) {
  return COG_HEIGHT * Math.abs(Math.sin(phi)) < HALF_WB * Math.cos(phi);
}

function obstacleRect(o) {
  const base = groundY(o.x + o.w / 2);
  return { x: o.x, y: base - o.h, w: o.w, h: o.h };
}
function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

function crash(reason) {
  state = STATE.CRASHED;
  crashReason = reason;
  shake = 14;
  spawnBurst(bike.x, bike.y, 22, ['#ff7a4d', '#ffd24d', '#ffffff']);
  const dist = distM(bike.x);
  if (dist > best) best = dist;
  showResult('CRASHED', reason, 'RETRY');
}
function win() {
  state = STATE.WON;
  best = Math.max(best, distM(LEVEL_END));
  showResult('FINISH!', 'You made it through in one piece. Beautiful riding.', 'PLAY AGAIN');
}

// ===========================================================
//  Particles (atmosphere + feedback)
// ===========================================================
const parts = [];
function spawn(x, y, vx, vy, life, size, color, grav) {
  if (parts.length > 260) return;
  parts.push({ x, y, vx, vy, life, max: life, size, color, grav: grav || 0 });
}
function spawnBurst(x, y, n, colors) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
    spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60,
      0.4 + Math.random() * 0.5, 2 + Math.random() * 3,
      colors[(Math.random() * colors.length) | 0], 900);
  }
}
function spawnDust(x, y) {
  for (let i = 0; i < 7; i++) {
    spawn(x + (Math.random() - 0.5) * 24, y, (Math.random() - 0.5) * 80, -40 - Math.random() * 60,
      0.4 + Math.random() * 0.3, 3 + Math.random() * 3, 'rgba(255,225,190,0.9)', 500);
  }
}
function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
  // ambient drifting motes
  if (Math.random() < 0.25) {
    const camX = cameraX();
    spawn(camX + Math.random() * W, Math.random() * H * 0.8, (Math.random() - 0.5) * 14, -6 - Math.random() * 10,
      2 + Math.random() * 2, 1 + Math.random() * 1.5, 'rgba(255,210,170,0.5)', 0);
  }
}

// ===========================================================
//  Update
// ===========================================================
function update(dt) {
  if (state !== STATE.PLAYING) { input.jumpEdge = false; updateParticles(dt); return; }

  const curSpeed = SPEED * (bike.boost > 0 ? BOOST_MULT : 1);
  if (bike.boost > 0) bike.boost -= dt;

  // Jump — grounded jump, or a mid-air double-jump if a charge is held.
  if (input.jumpEdge) {
    if (bike.grounded) {
      bike.vy = JUMP_VEL; bike.grounded = false;
    } else if (bike.airJumps > 0) {
      bike.vy = JUMP_VEL; bike.airJumps--;
      spawnBurst(bike.x, bike.y + 10, 10, ['#5be0ff', '#b48cff', '#ffffff']); // air-jump puff
    }
  }
  input.jumpEdge = false;

  // Horizontal: constant (or boosted) speed.
  bike.x += curSpeed * dt;
  wheelSpin += (curSpeed / WHEEL_R) * dt;

  // Short-press = short jump: releasing jump early cuts upward velocity.
  if (input.jumpRelease && !bike.grounded && bike.vy < 0) bike.vy *= JUMP_CUT;
  input.jumpRelease = false;

  // Vertical integration.
  bike.vy += GRAVITY * dt;
  bike.y += bike.vy * dt;

  // Air rotation control (auto-level when no button held).
  if (!bike.grounded) {
    bike.airTime += dt;
    if (input.fwd) {
      bike.angVel += ANG_ACCEL * dt;
    } else if (input.back) {
      bike.angVel -= ANG_ACCEL * dt;
    } else {
      const a = normalizeAngle(bike.angle);
      bike.angVel += (-a * 16 - bike.angVel * 6) * dt;
    }
    bike.angVel = Math.max(-ANG_MAX, Math.min(ANG_MAX, bike.angVel));
    bike.angle += bike.angVel * dt;
  }

  // Ground contact / gaps / walls.
  const surf = surfaceAt(bike.x);
  if (surf === null) {
    // Over a gap — nothing to stand on.
    bike.grounded = false;
    if (bike.y > DEATH_Y) { crash('Fell into the gap.'); return; }
  } else {
    const restY = surf.y - RIDE_H;
    const pen = bike.y - restY;          // > 0 means wheels are below the surface
    if (pen > WALL_TOL) {
      // Surface is well above the wheels: we drove into a wall / missed a platform.
      crash('Smashed into the ledge.');
      return;
    }
    if (pen >= 0 && (bike.grounded || bike.vy >= 0)) {
      // Landing or riding.
      if (!bike.grounded && bike.airTime > 0.13) {
        const phi = normalizeAngle(bike.angle - Math.atan(surf.slope));
        if (!landingIsStable(phi)) { bike.y = restY; crash('Bad landing — tipped past your wheels.'); return; }
      }
      if (!bike.grounded) {                             // touchdown this frame
        spawnDust(bike.x, surf.y);
        if (bike.boostedAir) { bike.boost = 0; bike.boostedAir = false; } // boost powers one jump
        bike.airJumps = 0;                              // double-jump charge is use-it-or-lose-it
      }
      bike.y = restY;
      const vyTerr = curSpeed * surf.slope;
      if (bike.vy > vyTerr) bike.vy = vyTerr;           // ground only pushes up
      bike.angle = Math.atan(surf.slope);
      bike.angVel = 0;
      bike.grounded = true;
      bike.airTime = 0;
    } else {
      bike.grounded = false;
    }
  }
  if (!bike.grounded && bike.boost > 0) bike.boostedAir = true;

  // Power-up pickups.
  for (const p of POWERUPS) {
    if (p.taken) continue;
    const dx = bike.x - p.x, dy = bike.y - p.y;
    if (dx * dx + dy * dy < 34 * 34) {
      p.taken = true;
      if (p.type === 'boost') {
        bike.boost = BOOST_TIME;
        spawnBurst(p.x, p.y, 16, ['#ffd24d', '#ff9e3d', '#ffffff']);
      } else { // 'djump'
        bike.airJumps = 1;
        spawnBurst(p.x, p.y, 16, ['#5be0ff', '#b48cff', '#ffffff']);
      }
    }
  }
  // Boost trail.
  if (bike.boost > 0) {
    const tail = rotate(-HALF_WB, RIDE_H - WHEEL_R, bike.angle);
    spawn(bike.x + tail.x, bike.y + tail.y, -curSpeed * 0.5, (Math.random() - 0.5) * 40,
      0.3, 4 + Math.random() * 3, Math.random() < 0.5 ? '#ff7a3d' : '#ffd24d', 0);
  }

  // Obstacle collisions.
  const downOff = RIDE_H - WHEEL_R;
  const rear  = rotate(-HALF_WB, downOff, bike.angle);
  const front = rotate( HALF_WB, downOff, bike.angle);
  const points = [
    { x: bike.x + rear.x,  y: bike.y + rear.y,  r: WHEEL_R },
    { x: bike.x + front.x, y: bike.y + front.y, r: WHEEL_R },
    { x: bike.x,           y: bike.y,           r: 8 },
  ];
  for (const o of CRATES) {
    const r = obstacleRect(o);
    for (const p of points) {
      if (circleHitsRect(p.x, p.y, p.r, r.x, r.y, r.w, r.h)) { crash('Smashed into an obstacle.'); return; }
    }
  }

  // Flipped over while grounded (safety net).
  if (bike.grounded && Math.abs(normalizeAngle(bike.angle)) > 2.6) { crash('Flipped over.'); return; }

  // Finish line.
  if (bike.x >= FINISH_X) win();

  if (shake > 0) shake = Math.max(0, shake - 40 * dt);
  updateParticles(dt);
}

// ===========================================================
//  Rendering
// ===========================================================
const canvas = window.EDITOR_MODE ? null : document.getElementById('canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let viewScale = 1, viewOX = 0, viewOY = 0, dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = window.innerWidth, ch = window.innerHeight;
  canvas.width = Math.floor(cw * dpr);
  canvas.height = Math.floor(ch * dpr);
  viewScale = Math.min(cw / W, ch / H);
  viewOX = (cw - W * viewScale) / 2;
  viewOY = (ch - H * viewScale) / 2;
}
if (!window.EDITOR_MODE) { window.addEventListener('resize', resize); resize(); }

function cameraX() {
  let cx = (bike ? bike.x : START_X) - 300;
  return Math.max(0, Math.min(cx, LEVEL_END - W + 360));
}

// Pre-baked stars so they don't twinkle randomly each frame.
const STARS = Array.from({ length: 70 }, () => ({
  x: Math.random() * (LEVEL_END + W), y: Math.random() * H * 0.55,
  r: Math.random() * 1.4 + 0.3, a: Math.random() * 0.6 + 0.2,
}));

function drawBackground(camX) {
  // Dusk sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0.00, '#1d1140');
  sky.addColorStop(0.42, '#5a2f63');
  sky.addColorStop(0.68, '#b05572');
  sky.addColorStop(0.84, '#ef8a5d');
  sky.addColorStop(1.00, '#ffbb6b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars (parallax, fade near horizon)
  for (const s of STARS) {
    const sx = s.x - camX * 0.1;
    const wrapped = ((sx % (LEVEL_END + W)) + (LEVEL_END + W)) % (LEVEL_END + W);
    if (wrapped > W) continue;
    ctx.globalAlpha = s.a * Math.max(0, 1 - s.y / (H * 0.5));
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(wrapped, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Sun low on the horizon with a soft glow
  const sunX = W * 0.70, sunY = H * 0.60;
  const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 220);
  glow.addColorStop(0, 'rgba(255,225,170,0.95)');
  glow.addColorStop(0.25, 'rgba(255,180,110,0.45)');
  glow.addColorStop(1, 'rgba(255,180,110,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffe7b8';
  ctx.beginPath(); ctx.arc(sunX, sunY, 42, 0, Math.PI * 2); ctx.fill();

  // Parallax mountain silhouettes (far -> near)
  drawHills(camX * 0.18, H * 0.66, 95, 0.0011, '#7a4f80', 0.55);
  drawHills(camX * 0.34, H * 0.74, 80, 0.0019, '#5b3568', 0.8);
  drawHills(camX * 0.55, H * 0.82, 65, 0.0030, '#3c2150', 1);
}

function drawHills(offset, baseY, amp, freq, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let sx = 0; sx <= W; sx += 10) {
    const wx = sx + offset;
    const y = baseY - amp * (0.6 * Math.sin(wx * freq) + 0.4 * Math.sin(wx * freq * 2.7 + 1.3));
    ctx.lineTo(sx, y);
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawTerrain(camX) {
  for (const s of SEGS) {
    if (s.x1 - camX < -4 || s.x0 - camX > W + 4) continue;
    const x0 = s.x0 - camX, x1 = s.x1 - camX;
    // Landmass fill (mesa down to the bottom)
    const g = ctx.createLinearGradient(0, Math.min(s.y0, s.y1) - 10, 0, H);
    g.addColorStop(0, '#33204a');
    g.addColorStop(1, '#150d22');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, s.y0); ctx.lineTo(x1, s.y1);
    ctx.lineTo(x1, H); ctx.lineTo(x0, H); ctx.closePath();
    ctx.fill();
    // Warm rim light on the top edge (from the sun)
    ctx.beginPath();
    ctx.moveTo(x0, s.y0); ctx.lineTo(x1, s.y1);
    ctx.strokeStyle = '#ff9e6b';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0, s.y0 + 3); ctx.lineTo(x1, s.y1 + 3);
    ctx.strokeStyle = 'rgba(255,158,107,0.25)';
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}

function drawObstacles(camX) {
  for (const o of CRATES) {
    const r = obstacleRect(o);
    const sx = r.x - camX;
    if (sx + r.w < -10 || sx > W + 10) continue;
    ctx.fillStyle = '#221634';
    ctx.strokeStyle = '#ff9e6b';
    ctx.lineWidth = 2.5;
    ctx.fillRect(sx, r.y, r.w, r.h);
    ctx.strokeRect(sx, r.y, r.w, r.h);
    ctx.beginPath();
    ctx.moveTo(sx, r.y); ctx.lineTo(sx + r.w, r.y + r.h);
    ctx.moveTo(sx + r.w, r.y); ctx.lineTo(sx, r.y + r.h);
    ctx.strokeStyle = 'rgba(255,158,107,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawPowerups(camX, time) {
  for (const p of POWERUPS) {
    if (p.taken) continue;
    const sx = p.x - camX;
    if (sx < -20 || sx > W + 20) continue;
    const boost = p.type === 'boost';
    const cy = p.y + Math.sin(time * 4 + p.x) * 4;
    const glow = ctx.createRadialGradient(sx, cy, 2, sx, cy, 30);
    glow.addColorStop(0, boost ? 'rgba(255,210,77,0.9)' : 'rgba(91,224,255,0.9)');
    glow.addColorStop(1, boost ? 'rgba(255,158,61,0)' : 'rgba(140,120,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sx, cy, 30, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = boost ? '#fff4cf' : '#e6f7ff';
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const off of [-7, 4]) {
      ctx.beginPath();
      if (boost) {                                 // forward chevrons » (distance)
        ctx.moveTo(sx - 8, cy - 9 + off);
        ctx.lineTo(sx + 8, cy + off);
        ctx.lineTo(sx - 8, cy + 9 + off);
      } else {                                     // upward chevrons ⏫ (height)
        ctx.moveTo(sx - 9, cy + 8 - off);
        ctx.lineTo(sx, cy - 8 - off);
        ctx.lineTo(sx + 9, cy + 8 - off);
      }
      ctx.stroke();
    }
  }
}

function drawParticles(camX) {
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x - camX, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFinish(camX) {
  const sx = FINISH_X - camX;
  if (sx < -40 || sx > W + 40) return;
  const gy = groundY(FINISH_X);
  const top = gy - 150;
  ctx.fillStyle = '#fff4cf';
  ctx.fillRect(sx - 3, top, 6, 150);
  const fw = 70, fh = 46, cell = fh / 4;
  for (let i = 0; i < fw / cell; i++)
    for (let j = 0; j < fh / cell; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#1d1140' : '#ffffff';
      ctx.fillRect(sx + 3 + i * cell, top + j * cell, cell, cell);
    }
}

function drawBike(camX) {
  const sx = bike.x - camX, sy = bike.y;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(bike.angle);

  const downOff = RIDE_H - WHEEL_R;
  const rx = -HALF_WB, fx = HALF_WB, wy = downOff;
  const accent = bike.boost > 0 ? '#ffd24d' : '#ff7a4d';

  // Headlight glow (forward)
  const hl = ctx.createRadialGradient(fx + 6, -8, 2, fx + 6, -8, 46);
  hl.addColorStop(0, 'rgba(255,242,192,0.5)');
  hl.addColorStop(1, 'rgba(255,242,192,0)');
  ctx.fillStyle = hl;
  ctx.beginPath(); ctx.arc(fx + 10, -6, 46, 0, Math.PI * 2); ctx.fill();

  // Wheels
  for (const wx of [rx, fx]) {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.beginPath(); ctx.arc(0, 0, WHEEL_R, 0, Math.PI * 2);
    ctx.fillStyle = '#0e0a16'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = accent; ctx.stroke();
    ctx.rotate(wheelSpin);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(k * Math.PI / 2) * (WHEEL_R - 3), Math.sin(k * Math.PI / 2) * (WHEEL_R - 3));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Frame
  ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(rx, wy); ctx.lineTo(-4, -6); ctx.lineTo(fx - 6, -10); ctx.lineTo(fx, wy);
  ctx.stroke();

  // Seat + bars (dark silhouette)
  ctx.fillStyle = '#15101f';
  ctx.fillRect(-16, -12, 22, 6);
  ctx.strokeStyle = '#cdbfe0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(fx - 6, -10); ctx.lineTo(fx - 2, -22); ctx.lineTo(fx + 6, -22); ctx.stroke();

  // Rider silhouette
  ctx.fillStyle = '#120c1e';
  ctx.beginPath(); ctx.ellipse(-2, -20, 7, 11, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -32, 6, 0, Math.PI * 2); ctx.fill();           // head
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(6, -33, 6.5, Math.PI, Math.PI * 2); ctx.fill();   // helmet
  ctx.strokeStyle = '#120c1e'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-2, -22); ctx.lineTo(fx - 2, -20); ctx.stroke();

  ctx.restore();
}

let timeSec = 0;
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1d1140';
  ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

  ctx.save();
  ctx.translate(viewOX, viewOY);
  ctx.scale(viewScale, viewScale);
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

  const camX = cameraX();
  const sh = shake ? (Math.random() - 0.5) * shake : 0;
  const sv = shake ? (Math.random() - 0.5) * shake : 0;

  drawBackground(camX);
  ctx.translate(sh, sv);
  drawTerrain(camX);
  drawObstacles(camX);
  drawPowerups(camX, timeSec);
  drawFinish(camX);
  drawParticles(camX);
  if (bike) drawBike(camX);

  // subtle vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.9);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,4,20,0.45)');
  ctx.fillStyle = vg; ctx.fillRect(-sh, -sv, W, H);

  ctx.restore();
}

// ===========================================================
//  Overlay + HUD
// ===========================================================
const overlay = document.getElementById('overlay');
function hideOverlay() { overlay.classList.remove('show'); }
function showResult(title, subtitle, btn) {
  document.getElementById('title').textContent = title;
  document.getElementById('subtitle').textContent = subtitle;
  document.getElementById('help').style.display = 'none';
  document.getElementById('startBtn').textContent = btn;
  overlay.classList.add('show');
}

const distEl = document.getElementById('dist');
const bestEl = document.getElementById('best');
const boostEl = document.getElementById('boost');
const djumpEl = document.getElementById('djump');
function updateHud() {
  const d = state === STATE.WON ? distM(LEVEL_END) : (bike ? distM(bike.x) : 0);
  distEl.textContent = d;
  bestEl.textContent = best;
  boostEl.classList.toggle('on', !!(bike && bike.boost > 0));
  djumpEl.classList.toggle('on', !!(bike && bike.airJumps > 0));
}

// ===========================================================
//  Main loop (fixed timestep)
// ===========================================================
const STEP = 1 / 120;
let acc = 0, last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  timeSec += dt;
  acc += dt;
  if (!window.__pause) {
    while (acc >= STEP) { update(STEP); acc -= STEP; }
  } else { acc = 0; }
  render();
  updateHud();
  requestAnimationFrame(frame);
}

// ---- boot ----
if (!window.EDITOR_MODE) {
  state = STATE.READY;
  resetBike();
  requestAnimationFrame(frame);
}
