// ============================================================
//  Ramp Rider — Level Editor
//  Loaded after game.js (EDITOR_MODE=true), which populates
//  SEGS, CRATES, POWERUPS, FINISH_X, LEVEL_END and the physics
//  tunables (GRAVITY, JUMP_VEL, ANG_ACCEL, ANG_MAX, JUMP_CUT).
// ============================================================

const SCALE    = 0.4;
const PAD_TOP  = 40;
const PAD_BOT  = 20;
const CANVAS_H = Math.ceil(H * SCALE) + PAD_TOP + PAD_BOT;
const HANDLE_R = 7;

const eCanvas = document.getElementById('editor-canvas');
const ectx    = eCanvas.getContext('2d');
eCanvas.width  = Math.ceil(LEVEL_END * SCALE) + 60;
eCanvas.height = CANVAS_H;

// ---- Coordinate transforms ----
const tx  = (lvlX) => lvlX * SCALE;
const ty  = (lvlY) => PAD_TOP + lvlY * SCALE;
const flx = (canX) => canX / SCALE;
const fly = (canY) => (canY - PAD_TOP) / SCALE;

// ---- Editor state ----
let activeTool  = 'select';
let handles     = [];
let dragHandle  = null;
let hoverHandle = null;
let hoverObj    = null;

// ---- Physics state (runtime copy, separate from game.js globals) ----
// These start from whatever game.js loaded (including any saved settings).
const physics = {
  gravity:  GRAVITY,
  jumpVel:  Math.abs(JUMP_VEL),
  angAccel: ANG_ACCEL,
  angMax:   ANG_MAX,
  jumpCut:  JUMP_CUT,
};
const PHYSICS_DEFAULTS = { gravity: 1500, jumpVel: 700, angAccel: 32, angMax: 16, jumpCut: 0.46 };

// ---- Handles ----
function buildHandles() {
  const seen = new Map();
  for (const s of SEGS) {
    if (!seen.has(s.x0)) seen.set(s.x0, s.y0);
    if (!seen.has(s.x1)) seen.set(s.x1, s.y1);
  }
  handles = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([x, y]) => ({ lx: x, ly: y }));
}

function syncSegs() {
  const byX = new Map(handles.map(h => [h.lx, h.ly]));
  for (const s of SEGS) {
    if (byX.has(s.x0)) s.y0 = byX.get(s.x0);
    if (byX.has(s.x1)) s.y1 = byX.get(s.x1);
  }
  for (const p of POWERUPS) {
    const gy = groundY(p.x);
    if (gy !== null) p.y = gy - 46;
  }
}

// ---- Rendering ----
function render() {
  ectx.clearRect(0, 0, eCanvas.width, eCanvas.height);
  ectx.fillStyle = '#0a0418';
  ectx.fillRect(0, 0, eCanvas.width, eCanvas.height);

  for (const s of SEGS) {
    ectx.beginPath();
    ectx.moveTo(tx(s.x0), ty(s.y0));
    ectx.lineTo(tx(s.x1), ty(s.y1));
    ectx.lineTo(tx(s.x1), CANVAS_H);
    ectx.lineTo(tx(s.x0), CANVAS_H);
    ectx.closePath();
    ectx.fillStyle = '#2a1a3e';
    ectx.fill();
  }

  ectx.strokeStyle = '#c88050';
  ectx.lineWidth = 2;
  for (const s of SEGS) {
    ectx.beginPath();
    ectx.moveTo(tx(s.x0), ty(s.y0));
    ectx.lineTo(tx(s.x1), ty(s.y1));
    ectx.stroke();
  }

  for (let i = 0; i < CRATES.length; i++) {
    const o  = CRATES[i];
    const gy = groundY(o.x + o.w / 2);
    if (gy === null) continue;
    const rx = tx(o.x), ry = ty(gy - o.h), rw = o.w * SCALE, rh = o.h * SCALE;
    const hot = hoverObj && hoverObj.type === 'crate' && hoverObj.idx === i;
    ectx.fillStyle   = hot ? '#c04040' : '#8b5e3c';
    ectx.strokeStyle = hot ? '#ff6060' : '#c4874e';
    ectx.lineWidth   = 1.5;
    ectx.fillRect(rx, ry, rw, rh);
    ectx.strokeRect(rx, ry, rw, rh);
  }

  for (let i = 0; i < POWERUPS.length; i++) {
    const p   = POWERUPS[i];
    const px2 = tx(p.x), py2 = ty(p.y);
    const hot = hoverObj && hoverObj.type === 'powerup' && hoverObj.idx === i;
    ectx.beginPath();
    ectx.arc(px2, py2, 10, 0, Math.PI * 2);
    ectx.fillStyle = hot ? '#ff4040' : (p.type === 'boost' ? '#ffd24d' : '#5be0ff');
    ectx.fill();
    ectx.font = '11px sans-serif';
    ectx.textAlign = 'center';
    ectx.textBaseline = 'middle';
    ectx.fillText(p.type === 'boost' ? '⚡' : '⏫', px2, py2);
  }

  ectx.strokeStyle = '#ffd24d';
  ectx.lineWidth = 2;
  ectx.setLineDash([5, 4]);
  ectx.beginPath();
  ectx.moveTo(tx(FINISH_X), 0);
  ectx.lineTo(tx(FINISH_X), CANVAS_H);
  ectx.stroke();
  ectx.setLineDash([]);
  ectx.fillStyle = '#ffd24d';
  ectx.font = 'bold 10px sans-serif';
  ectx.textAlign = 'center';
  ectx.fillText('FINISH', tx(FINISH_X), 10);

  if (activeTool === 'select') {
    for (let i = 0; i < handles.length; i++) {
      const h = handles[i];
      const isDrag = dragHandle && dragHandle.idx === i;
      const isHov  = hoverHandle === i;
      ectx.beginPath();
      ectx.arc(tx(h.lx), ty(h.ly), isDrag ? HANDLE_R + 3 : HANDLE_R, 0, Math.PI * 2);
      ectx.fillStyle   = isDrag ? '#ffd24d' : isHov ? '#ff9e3d' : 'rgba(255,255,255,0.75)';
      ectx.strokeStyle = '#1a0f2e';
      ectx.lineWidth   = 1.5;
      ectx.fill();
      ectx.stroke();
    }
  }
}

// ---- Hit testing ----
function hitHandle(ex, ey) {
  for (let i = 0; i < handles.length; i++) {
    const h = handles[i];
    const dx = ex - tx(h.lx), dy = ey - ty(h.ly);
    if (dx * dx + dy * dy <= (HANDLE_R + 6) * (HANDLE_R + 6)) return i;
  }
  return -1;
}
function hitCrate(ex, ey) {
  for (let i = 0; i < CRATES.length; i++) {
    const o = CRATES[i], gy = groundY(o.x + o.w / 2);
    if (gy === null) continue;
    const rx = tx(o.x), ry = ty(gy - o.h), rw = o.w * SCALE, rh = o.h * SCALE;
    if (ex >= rx && ex <= rx + rw && ey >= ry && ey <= ry + rh) return i;
  }
  return -1;
}
function hitPowerup(ex, ey) {
  for (let i = 0; i < POWERUPS.length; i++) {
    const p = POWERUPS[i];
    const dx = ex - tx(p.x), dy = ey - ty(p.y);
    if (dx * dx + dy * dy <= 14 * 14) return i;
  }
  return -1;
}

function getPos(e) {
  const rect = eCanvas.getBoundingClientRect();
  const src  = e.touches ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

// ---- Pointer events ----
eCanvas.addEventListener('mousedown',  onDown);
eCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e); }, { passive: false });

function onDown(e) {
  const { x, y } = getPos(e);
  if (activeTool === 'select') {
    const hi = hitHandle(x, y);
    if (hi >= 0) dragHandle = { idx: hi, startLY: handles[hi].ly, startCanY: y };
    return;
  }
  if (activeTool === 'erase') {
    const ci = hitCrate(x, y);
    if (ci >= 0) { CRATES.splice(ci, 1); hoverObj = null; render(); return; }
    const pi = hitPowerup(x, y);
    if (pi >= 0) { POWERUPS.splice(pi, 1); hoverObj = null; render(); return; }
    return;
  }
  if (activeTool === 'crate') {
    const lvlX = flx(x), gy = groundY(lvlX);
    if (gy !== null) { CRATES.push({ x: lvlX - 20, w: 40, h: 44 }); render(); }
    return;
  }
  if (activeTool === 'boost' || activeTool === 'djump') {
    const lvlX = flx(x), gy = groundY(lvlX);
    if (gy !== null) {
      POWERUPS.push({ x: lvlX, y: gy - 46, type: activeTool === 'boost' ? 'boost' : 'djump', taken: false });
      render();
    }
  }
}

document.addEventListener('mousemove',  onMove);
document.addEventListener('touchmove',  (e) => { e.preventDefault(); onMove(e); }, { passive: false });

function onMove(e) {
  const { x, y } = getPos(e);
  if (dragHandle !== null) {
    const deltaLY = (y - dragHandle.startCanY) / SCALE;
    handles[dragHandle.idx].ly = Math.max(60, Math.min(H - 30, dragHandle.startLY + deltaLY));
    syncSegs();
    render();
    return;
  }
  if (activeTool === 'select') {
    const hi   = hitHandle(x, y);
    const next = hi >= 0 ? hi : null;
    if (next !== hoverHandle) { hoverHandle = next; render(); }
  } else if (activeTool === 'erase') {
    const ci   = hitCrate(x, y);
    const pi   = hitPowerup(x, y);
    const next = ci >= 0 ? { type: 'crate', idx: ci } : pi >= 0 ? { type: 'powerup', idx: pi } : null;
    if (JSON.stringify(next) !== JSON.stringify(hoverObj)) { hoverObj = next; render(); }
  }
}

document.addEventListener('mouseup',  onUp);
document.addEventListener('touchend', onUp);
function onUp() { dragHandle = null; }

// ---- Toolbar ----
const HINTS = {
  select: 'Drag white dots to reshape terrain up/down',
  erase:  'Click a crate or power-up to delete it',
  crate:  'Click on terrain to place a crate',
  boost:  'Click on terrain to place a ⚡ speed boost',
  djump:  'Click on terrain to place a ⏫ double-jump',
};
document.querySelectorAll('.tool').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTool = btn.dataset.tool;
    hoverHandle = null; hoverObj = null;
    render();
    document.getElementById('hint').textContent = HINTS[activeTool] || '';
  });
});

// ---- Collapsible panels ----
function makeToggle(headerId, bodyId) {
  const header = document.getElementById(headerId);
  const body   = document.getElementById(bodyId);
  header.addEventListener('click', () => {
    const closed = body.classList.toggle('hidden');
    header.classList.toggle('closed', closed);
  });
}
makeToggle('physics-toggle', 'physics-body');
makeToggle('saves-toggle',   'saves-body');

// ---- Physics sliders ----
const sliders = [
  { id: 'sl-gravity',  valId: 'grav-val',    key: 'gravity',  fmt: v => v },
  { id: 'sl-jump',     valId: 'jump-val',    key: 'jumpVel',  fmt: v => v },
  { id: 'sl-cut',      valId: 'cut-val',     key: 'jumpCut',  fmt: v => v + '%', toStore: v => v / 100, fromStore: v => Math.round(v * 100) },
  { id: 'sl-spin',     valId: 'spin-val',    key: 'angAccel', fmt: v => v },
  { id: 'sl-spinmax',  valId: 'spinmax-val', key: 'angMax',   fmt: v => v },
];

function initSliders() {
  for (const s of sliders) {
    const el  = document.getElementById(s.id);
    const raw = s.fromStore ? s.fromStore(physics[s.key]) : physics[s.key];
    el.value  = raw;
    document.getElementById(s.valId).textContent = s.fmt(raw);
    el.addEventListener('input', () => {
      const val = parseFloat(el.value);
      document.getElementById(s.valId).textContent = s.fmt(val);
      physics[s.key] = s.toStore ? s.toStore(val) : val;
    });
  }
}

document.getElementById('resetPhysicsBtn').addEventListener('click', () => {
  Object.assign(physics, {
    gravity: PHYSICS_DEFAULTS.gravity,
    jumpVel: PHYSICS_DEFAULTS.jumpVel,
    angAccel: PHYSICS_DEFAULTS.angAccel,
    angMax:  PHYSICS_DEFAULTS.angMax,
    jumpCut: PHYSICS_DEFAULTS.jumpCut,
  });
  initSliders();
});

// ---- Named save slots ----
const SLOTS_KEY    = 'rampRiderLevelSlots';
const ACTIVE_KEY   = 'rampRiderLevel';
const SETTINGS_KEY = 'rampRiderSettings';

function getSlots() {
  try { return JSON.parse(localStorage.getItem(SLOTS_KEY) || '[]'); } catch(e) { return []; }
}
function saveSlots(slots) { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); }

function getActiveId() {
  try {
    const a = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
    return a ? a._slotId : null;
  } catch(e) { return null; }
}

function renderSlots() {
  const list     = document.getElementById('slot-list');
  const slots    = getSlots();
  const activeId = getActiveId();
  list.innerHTML = '';
  if (!slots.length) {
    list.innerHTML = '<div style="font-size:12px;color:#806070;padding:4px 0">No saved levels yet.</div>';
    return;
  }
  slots.forEach((slot, i) => {
    const isActive = slot.id === activeId;
    const item = document.createElement('div');
    item.className = 'slot-item' + (isActive ? ' active-slot' : '');
    item.innerHTML = `
      <div class="slot-name">${slot.name}</div>
      <div class="slot-date">${slot.date}</div>
      ${isActive ? '<span class="slot-active-badge">ACTIVE</span>' : ''}
      <div class="slot-btns">
        <button class="load-btn">Load</button>
        <button class="del-btn">✕</button>
      </div>`;
    item.querySelector('.load-btn').addEventListener('click', () => loadSlot(slot));
    item.querySelector('.del-btn').addEventListener('click', () => deleteSlot(i));
    list.appendChild(item);
  });
}

function loadSlot(slot) {
  // Activate this slot as the current level and reload to rebuild
  const data = { ...slot.data, _slotId: slot.id };
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(data));
  window.location.reload();
}

function deleteSlot(idx) {
  const slots = getSlots();
  slots.splice(idx, 1);
  saveSlots(slots);
  renderSlots();
}

document.getElementById('saveSlotBtn').addEventListener('click', () => {
  const name = document.getElementById('save-name').value.trim() || 'Untitled';
  const slot = {
    id:   Date.now().toString(36),
    name,
    date: new Date().toLocaleDateString(),
    data: { segs: SEGS, crates: CRATES, powerups: POWERUPS, finishX: FINISH_X, levelEnd: LEVEL_END },
  };
  const slots = getSlots();
  slots.unshift(slot);
  saveSlots(slots);
  document.getElementById('save-name').value = '';
  renderSlots();
});

// ---- Save & Play (sets active level + physics, returns to game) ----
document.getElementById('saveBtn').addEventListener('click', () => {
  const levelData = { segs: SEGS, crates: CRATES, powerups: POWERUPS, finishX: FINISH_X, levelEnd: LEVEL_END };
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(levelData));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    gravity:  physics.gravity,
    jumpVel:  physics.jumpVel,
    angAccel: physics.angAccel,
    angMax:   physics.angMax,
    jumpCut:  physics.jumpCut,
  }));
  window.location.href = 'index.html';
});

// ---- Reset Level ----
document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset to the default level? All terrain edits will be lost.')) return;
  localStorage.removeItem(ACTIVE_KEY);
  window.location.reload();
});

// ---- Boot ----
buildHandles();
render();
initSliders();
renderSlots();
document.getElementById('hint').textContent = HINTS['select'];
