// ============================================================
//  Ramp Rider — Level Editor
//  Depends on game.js loaded with window.EDITOR_MODE = true,
//  which populates SEGS, CRATES, POWERUPS, FINISH_X, LEVEL_END.
// ============================================================

const SCALE     = 0.4;    // level px → canvas px (uniform)
const PAD_TOP   = 40;     // canvas px above level y=0
const PAD_BOT   = 20;
const CANVAS_H  = Math.ceil(H * SCALE) + PAD_TOP + PAD_BOT;
const HANDLE_R  = 7;      // hit/draw radius for terrain handles

const eCanvas = document.getElementById('editor-canvas');
const ectx    = eCanvas.getContext('2d');
eCanvas.width  = Math.ceil(LEVEL_END * SCALE) + 60;
eCanvas.height = CANVAS_H;

// ---- Coordinate transforms ----
const tx   = (lvlX) => lvlX * SCALE;
const ty   = (lvlY) => PAD_TOP + lvlY * SCALE;
const flx  = (canX) => canX / SCALE;
const fly  = (canY) => (canY - PAD_TOP) / SCALE;

// ---- Editor state ----
let activeTool  = 'select';
let handles     = [];       // { lx, ly }  — terrain junction points
let dragHandle  = null;     // { idx, startLY, startCanY }
let hoverHandle = null;     // index or null
let hoverObj    = null;     // { type:'crate'|'powerup', idx } or null

// ---- Build handles from SEGS ----
function buildHandles() {
  const seen = new Map();
  for (const s of SEGS) {
    if (!seen.has(s.x0)) seen.set(s.x0, s.y0);
    if (!seen.has(s.x1)) seen.set(s.x1, s.y1);
  }
  handles = [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([x, y]) => ({ lx: x, ly: y }));
}

// Write handle positions back into SEGS after a drag
function syncSegs() {
  const byX = new Map(handles.map(h => [h.lx, h.ly]));
  for (const s of SEGS) {
    if (byX.has(s.x0)) s.y0 = byX.get(s.x0);
    if (byX.has(s.x1)) s.y1 = byX.get(s.x1);
  }
  // Re-seat power-ups on the (possibly moved) terrain
  for (const p of POWERUPS) {
    const gy = groundY(p.x);
    if (gy !== null) p.y = gy - 46;
  }
}

// ---- Rendering ----
function render() {
  ectx.clearRect(0, 0, eCanvas.width, eCanvas.height);

  // Background
  ectx.fillStyle = '#1a0f2e';
  ectx.fillRect(0, 0, eCanvas.width, eCanvas.height);

  // Gap zones (void below terrain breaks)
  ectx.fillStyle = '#0a0418';
  ectx.fillRect(0, 0, eCanvas.width, CANVAS_H);

  // Terrain fill
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

  // Terrain surface line
  ectx.strokeStyle = '#c88050';
  ectx.lineWidth = 2;
  for (const s of SEGS) {
    ectx.beginPath();
    ectx.moveTo(tx(s.x0), ty(s.y0));
    ectx.lineTo(tx(s.x1), ty(s.y1));
    ectx.stroke();
  }

  // Crates
  for (let i = 0; i < CRATES.length; i++) {
    const o = CRATES[i];
    const gy = groundY(o.x + o.w / 2);
    if (gy === null) continue;
    const rx = tx(o.x), ry = ty(gy - o.h), rw = o.w * SCALE, rh = o.h * SCALE;
    const hot = hoverObj && hoverObj.type === 'crate' && hoverObj.idx === i;
    ectx.fillStyle   = hot ? '#c04040' : '#8b5e3c';
    ectx.strokeStyle = hot ? '#ff6060' : '#c4874e';
    ectx.lineWidth = 1.5;
    ectx.fillRect(rx, ry, rw, rh);
    ectx.strokeRect(rx, ry, rw, rh);
    if (hot) {
      ectx.fillStyle = 'rgba(255,80,80,0.18)';
      ectx.fillRect(rx - 2, ry - 2, rw + 4, rh + 4);
    }
  }

  // Power-ups
  for (let i = 0; i < POWERUPS.length; i++) {
    const p = POWERUPS[i];
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

  // Finish line
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

  // Terrain handles (only in select mode)
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
    const o  = CRATES[i];
    const gy = groundY(o.x + o.w / 2);
    if (gy === null) continue;
    const rx = tx(o.x), ry = ty(gy - o.h), rw = o.w * SCALE, rh = o.h * SCALE;
    if (ex >= rx && ex <= rx + rw && ey >= ry && ey <= ry + rh) return i;
  }
  return -1;
}

function hitPowerup(ex, ey) {
  for (let i = 0; i < POWERUPS.length; i++) {
    const p  = POWERUPS[i];
    const dx = ex - tx(p.x), dy = ey - ty(p.y);
    if (dx * dx + dy * dy <= 14 * 14) return i;
  }
  return -1;
}

// ---- Canvas event position ----
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
    const lvlX = flx(x);
    const gy   = groundY(lvlX);
    if (gy !== null) { CRATES.push({ x: lvlX - 20, w: 40, h: 44 }); render(); }
    return;
  }

  if (activeTool === 'boost' || activeTool === 'djump') {
    const lvlX = flx(x);
    const gy   = groundY(lvlX);
    if (gy !== null) {
      POWERUPS.push({ x: lvlX, y: gy - 46, type: activeTool === 'boost' ? 'boost' : 'djump', taken: false });
      render();
    }
    return;
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
    const hi = hitHandle(x, y);
    const next = hi >= 0 ? hi : null;
    if (next !== hoverHandle) { hoverHandle = next; render(); }
  } else if (activeTool === 'erase') {
    const ci  = hitCrate(x, y);
    const pi  = hitPowerup(x, y);
    const next = ci >= 0 ? { type: 'crate', idx: ci }
               : pi >= 0 ? { type: 'powerup', idx: pi }
               : null;
    if (JSON.stringify(next) !== JSON.stringify(hoverObj)) { hoverObj = next; render(); }
  }
}

document.addEventListener('mouseup',  onUp);
document.addEventListener('touchend', onUp);
function onUp() { dragHandle = null; }

// ---- Toolbar ----
document.querySelectorAll('.tool').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTool  = btn.dataset.tool;
    hoverHandle = null;
    hoverObj    = null;
    render();
    updateHint();
  });
});

const HINTS = {
  select: 'Drag white dots to reshape terrain up/down',
  erase:  'Click a crate or power-up to delete it',
  crate:  'Click on terrain to place a crate',
  boost:  'Click on terrain to place a ⚡ speed boost',
  djump:  'Click on terrain to place a ⏫ double-jump',
};
function updateHint() {
  document.getElementById('hint').textContent = HINTS[activeTool] || '';
}

// ---- Save & Reset ----
document.getElementById('saveBtn').addEventListener('click', () => {
  localStorage.setItem('rampRiderLevel', JSON.stringify({
    segs:     SEGS,
    crates:   CRATES,
    powerups: POWERUPS,
    finishX:  FINISH_X,
    levelEnd: LEVEL_END,
  }));
  window.location.href = 'index.html';
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset to the default level? All edits will be lost.')) return;
  localStorage.removeItem('rampRiderLevel');
  window.location.reload();
});

// ---- Boot ----
buildHandles();
render();
updateHint();
