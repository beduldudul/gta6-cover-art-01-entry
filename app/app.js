/* Neon Coast Cover Studio — original cover engine.
   Turns the user's photos + caption into GTA-style multi-panel cover art,
   graded Vice City sunset / neon, exported as a real PNG. Fully offline. */
'use strict';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SHOT_MODE = params.get('shot') === 'cover';
const SELFTEST = params.get('selftest') === '1';

/* ------------------------------------------------------------ data */
const GRADES = {
  sunset: { name: 'Vice Sunset', filter: 'saturate(1.35) contrast(1.1) sepia(0.18)',
    top: '#ff9a3c', bottom: '#ff2e88', overlay: 0.38, tint: 'rgba(255,120,40,0.12)' },
  neon: { name: 'Neon Nights', filter: 'saturate(1.5) contrast(1.15) hue-rotate(8deg)',
    top: '#00e5ff', bottom: '#ff2e88', overlay: 0.42, tint: 'rgba(80,0,120,0.15)' },
  golden: { name: 'Golden Hour', filter: 'saturate(1.3) sepia(0.35) contrast(1.05)',
    top: '#ffd166', bottom: '#ff7b00', overlay: 0.32, tint: 'rgba(255,180,60,0.10)' },
  noir: { name: 'Palm Noir', filter: 'grayscale(1) contrast(1.25) brightness(1.06)',
    top: '#ffd166', bottom: '#2a1b45', overlay: 0.16, tint: 'rgba(255,200,120,0.08)' },
  pop: { name: 'Miami Pop', filter: 'saturate(1.9) contrast(1.12)',
    top: '#00ffcc', bottom: '#ff2e88', overlay: 0.30, tint: 'rgba(255,46,136,0.10)' },
};

const LAYOUTS = {
  hero: { name: 'Vice Grid', panels: 4 },
  tilt: { name: 'Snapshot Tilt', panels: 4 },
  nine: { name: 'Nine Panel', panels: 8 },
  duo: { name: 'Split Duo', panels: 3 },
  strip: { name: 'Full Bleed', panels: 4 },
  stack: { name: 'Poster Stack', panels: 3 },
};

const SIZES = {
  '1080x1080': { w: 1080, h: 1080, label: 'Square · 1080 × 1080' },
  '1080x1350': { w: 1080, h: 1350, label: 'Portrait · 1080 × 1350' },
  '1920x1080': { w: 1920, h: 1080, label: 'Wide · 1920 × 1080' },
  '1080x1920': { w: 1080, h: 1920, label: 'Story · 1080 × 1920' },
};

const state = {
  layout: 'hero', grade: 'sunset',
  title: 'NEON SHORE', subtitle: 'Vice City nights', badge: 'EST. 2026',
  heat: 4, titleScale: 1, grain: true, halftone: true,
  size: '1080x1080', selectedPanel: 0,
  photos: [], // {img, name}
  // per panel-slot config, shared across layouts by slot index
  panelCfg: Array.from({ length: 9 }, (_, i) => ({
    photo: [0, 2, 1, 0, 1, 2, 0, 2, 1][i] || 0, zoom: 1.25, panX: 0, panY: 0,
  })),
};

const history = { past: [], future: [] };

/* ------------------------------------------------------------ layout geometry */
function layoutPanels(id, W, H) {
  const g = Math.round(W * 0.012) || 4;
  const R = (x, y, w, h, rot) => ({ x, y, w, h, rot: rot || 0 });
  switch (id) {
    case 'hero': {
      const rw = Math.round(W * 0.60), rh = Math.round((H - 2 * g) / 3);
      return {
        bg: -1,
        panels: [R(0, 0, rw, H), R(rw + g, 0, W - rw - g, rh),
          R(rw + g, rh + g, W - rw - g, rh), R(rw + g, 2 * (rh + g), W - rw - g, rh)],
        title: { x: 0, y: H * 0.70, w: W, h: H * 0.30, align: 'left', scrim: true },
      };
    }
    case 'tilt':
      return {
        bg: 0,
        panels: [R(W * 0.05, H * 0.08, W * 0.44, H * 0.52, -4),
          R(W * 0.50, H * 0.05, W * 0.45, H * 0.46, 3),
          R(W * 0.27, H * 0.52, W * 0.48, H * 0.42, -2),
          R(W * 0.72, H * 0.55, W * 0.24, H * 0.36, 5)],
        border: true,
        title: { x: W * 0.04, y: H * 0.86, w: W * 0.92, h: H * 0.14, align: 'left', scrim: false },
      };
    case 'nine': {
      const cw = (W - 2 * g) / 3, ch = (H - 2 * g) / 3;
      const cells = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        if (r === 1 && c === 1) continue; // centre cell is the title block
        cells.push(R(c * (cw + g), r * (ch + g), cw, ch));
      }
      return {
        bg: -1, panels: cells,
        title: { x: cw + g, y: ch + g, w: cw, h: ch, align: 'center', scrim: false, block: true },
      };
    }
    case 'duo': {
      const stripH = Math.round(H * 0.24);
      return {
        bg: -1,
        panels: [R(0, 0, (W - g) / 2, H - stripH - g), R((W + g) / 2, 0, (W - g) / 2, H - stripH - g),
          R(0, H - stripH, W, stripH)],
        title: { x: 0, y: H - stripH - H * 0.02, w: W, h: stripH + H * 0.02, align: 'center', scrim: true },
      };
    }
    case 'strip':
      return {
        bg: 0,
        panels: [R(g, H * 0.64, (W - 4 * g) / 3, H * 0.30, -1),
          R(2 * g + (W - 4 * g) / 3, H * 0.64, (W - 4 * g) / 3, H * 0.30, 1),
          R(3 * g + 2 * (W - 4 * g) / 3, H * 0.64, (W - 4 * g) / 3, H * 0.30, -1),
          R(W * 0.68, H * 0.06, W * 0.28, H * 0.34, 2)],
        border: true,
        title: { x: W * 0.04, y: H * 0.08, w: W * 0.60, h: H * 0.30, align: 'left', scrim: false },
      };
    case 'stack': {
      const hh = Math.round(H * 0.52);
      return {
        bg: -1,
        panels: [R(0, 0, W, hh), R(0, hh + g, (W - g) / 2, H - hh - g), R((W + g) / 2, hh + g, (W - g) / 2, H - hh - g)],
        title: { x: 0, y: hh - H * 0.16, w: W, h: H * 0.16, align: 'left', scrim: true },
      };
    }
    default: return layoutPanels('hero', W, H);
  }
}

/* ------------------------------------------------------------ photo drawing */
function drawPhotoCover(ctx, img, rect, cfg, grade) {
  const { x, y, w, h, rot } = rect;
  ctx.save();
  if (rot) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot * Math.PI / 180); ctx.translate(-w / 2, -h / 2); }
  else ctx.translate(x, y);
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  const ir = img.width / img.height, pr = w / h;
  let dw, dh;
  if (ir > pr) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  dw *= cfg.zoom; dh *= cfg.zoom;
  const dx = (w - dw) / 2 - cfg.panX * Math.max(0, (dw - w) / 2);
  const dy = (h - dh) / 2 - cfg.panY * Math.max(0, (dh - h) / 2);
  ctx.filter = grade.filter;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.filter = 'none';
  // sunset / neon wash: gradient overlay + warm multiply tint
  const grad = ctx.createLinearGradient(0, 0, w * 0.25, h);
  grad.addColorStop(0, grade.top); grad.addColorStop(1, grade.bottom);
  ctx.globalAlpha = grade.overlay; ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1;
  ctx.fillStyle = grade.tint; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  // panel vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,0,20,0.35)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const d = g.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 110 + Math.random() * 90;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0); grainTile = c; return c;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawTitleBlock(ctx, W, H, zone) {
  const { x, y, w, h, align, scrim, block } = zone;
  ctx.save();
  if (block) {
    const bg = ctx.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, '#ff7b00'); bg.addColorStop(0.5, '#ff2e88'); bg.addColorStop(1, '#7a1042');
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  } else if (scrim) {
    const sc = ctx.createLinearGradient(0, y, 0, y + h);
    sc.addColorStop(0, 'rgba(10,4,24,0)'); sc.addColorStop(1, 'rgba(10,4,24,0.88)');
    ctx.fillStyle = sc; ctx.fillRect(x, y, w, h);
  }
  if (state.halftone && !block) {
    ctx.fillStyle = 'rgba(255,209,102,0.16)';
    const step = Math.max(10, W * 0.014);
    for (let yy = y + step; yy < y + h; yy += step)
      for (let xx = x + step; xx < x + w; xx += step) {
        const r = step * 0.16 * (0.5 + 0.5 * Math.sin(xx * 0.02 + yy * 0.03));
        ctx.beginPath(); ctx.arc(xx, yy, r, 0, Math.PI * 2); ctx.fill();
      }
  }
  const pad = block ? w * 0.08 : W * 0.035;
  const cx = align === 'center' ? x + w / 2 : x + pad;
  const title = (state.title || 'UNTITLED').toUpperCase();
  let fs = Math.min((w - pad * 2) / Math.max(4, title.length * 0.60), h * (block ? 0.34 : 0.52)) * state.titleScale;
  fs = Math.max(18, fs);
  const ty = block ? y + h * 0.50 : y + h * 0.42;
  ctx.save();
  ctx.translate(cx, ty); ctx.rotate(-0.03);
  ctx.textAlign = align === 'center' ? 'center' : 'left'; ctx.textBaseline = 'middle';
  ctx.font = fs + 'px Anton, "Arial Black", sans-serif';
  ctx.lineJoin = 'round';
  // neon echo behind the title
  ctx.fillStyle = 'rgba(255,46,136,0.55)';
  ctx.fillText(title, fs * 0.045, fs * 0.06);
  ctx.strokeStyle = '#160a2e'; ctx.lineWidth = fs * 0.16;
  ctx.strokeText(title, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillText(title, 0, 0);
  ctx.restore();
  // script subtitle with neon glow
  const sub = state.subtitle || '';
  if (sub) {
    const sfs = Math.max(14, fs * 0.42);
    ctx.font = sfs + 'px Pacifico, cursive';
    ctx.textAlign = align === 'center' ? 'center' : 'left'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff2e88'; ctx.shadowBlur = sfs * 0.45;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(sub, cx, (block ? y + h * 0.78 : ty + fs * 0.60));
    ctx.shadowBlur = 0;
  }
  // heat meter: stars under the title
  const starY = block ? y + h * 0.92 : ty + fs * 0.98;
  const starSize = Math.max(12, fs * 0.26);
  ctx.font = starSize + 'px "Archivo Black", sans-serif';
  ctx.textAlign = align === 'center' ? 'center' : 'left'; ctx.textBaseline = 'middle';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < state.heat ? '★' : '☆';
  ctx.fillStyle = '#ffd166'; ctx.fillText(stars, cx, starY);
  ctx.restore();
}

function drawBadge(ctx, W, H) {
  if (!state.badge) return;
  const fs = Math.max(16, W * 0.022);
  ctx.save();
  ctx.translate(W - W * 0.085, H * 0.055); ctx.rotate(0.14);
  ctx.font = fs + 'px "Archivo Black", sans-serif';
  const tw = ctx.measureText(state.badge).width + fs * 1.6;
  ctx.fillStyle = '#ff2e88';
  roundRectPath(ctx, -tw / 2, -fs * 0.85, tw, fs * 1.7, fs * 0.85); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(state.badge, 0, fs * 0.05);
  ctx.restore();
}

/* ------------------------------------------------------------ the render */
function renderCover(ctx, W, H) {
  const g = GRADES[state.grade];
  const geo = layoutPanels(state.layout, W, H);
  // backdrop
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1b1030'); bg.addColorStop(0.55, '#3b0f54'); bg.addColorStop(1, '#12081f');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const photoAt = (i) => state.photos[state.panelCfg[i] ? state.panelCfg[i].photo : 0] || state.photos[0];
  if (geo.bg >= 0) {
    const img = photoAt(geo.bg);
    if (img) drawPhotoCover(ctx, img.img, { x: 0, y: 0, w: W, h: H, rot: 0 },
      { zoom: 1.1, panX: 0, panY: 0 }, g);
  }
  geo.panels.forEach((rect, i) => {
    const cfg = state.panelCfg[i];
    const photo = photoAt(i);
    if (!photo) return;
    if (geo.border) {
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate((rect.rot || 0) * Math.PI / 180);
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = W * 0.02; ctx.shadowOffsetY = W * 0.008;
      ctx.fillStyle = '#fff'; ctx.fillRect(-rect.w / 2 - 6, -rect.h / 2 - 6, rect.w + 12, rect.h + 12);
      ctx.restore();
    }
    drawPhotoCover(ctx, photo.img, rect, cfg, g);
  });
  // gutters read as dark seams: redraw thin separators for grid layouts
  if (state.grain) {
    const pat = ctx.createPattern(getGrainTile(), 'repeat');
    ctx.save(); ctx.globalAlpha = 0.10; ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,0,18,0.42)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  drawTitleBlock(ctx, W, H, geo.title);
  drawBadge(ctx, W, H);
}

function renderPreview() {
  const canvas = $('preview');
  const size = SIZES[state.size];
  if (SHOT_MODE) {
    // size the canvas to the viewport (headless viewport height is the
    // window height minus 87px, so shoot with a window 87px taller);
    // the canvas then fills the frame exactly, undistorted
    let cw = Math.min(1280, window.innerWidth);
    let ch = Math.round(cw * size.h / size.w);
    if (ch > window.innerHeight) { ch = window.innerHeight; cw = Math.round(ch * size.w / size.h); }
    canvas.width = cw; canvas.height = ch;
    canvas.style.width = ''; canvas.style.height = '';
    canvas.style.maxWidth = '100%'; canvas.style.maxHeight = '100%';
  } else {
    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(size.w, size.h));
    canvas.width = Math.round(size.w * scale);
    canvas.height = Math.round(size.h * scale);
  }
  const ctx = canvas.getContext('2d');
  renderCover(ctx, canvas.width, canvas.height);
  $('sizeLine').textContent = size.w + ' × ' + size.h;
}

/* ------------------------------------------------------------ photos */
function proceduralPhoto(seed) {
  const c = document.createElement('canvas'); c.width = 960; c.height = 1280;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 1280);
  sky.addColorStop(0, '#2b1055'); sky.addColorStop(0.5, '#ff7b54'); sky.addColorStop(1, '#ffd166');
  x.fillStyle = sky; x.fillRect(0, 0, 960, 1280);
  x.fillStyle = '#ffdf8e'; x.beginPath(); x.arc(480, 520, 130, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#1b1030';
  for (let i = 0; i < 9; i++) { const bx = 60 + i * 100; const bh = 260 + ((seed * 37 + i * 91) % 320); x.fillRect(bx, 1280 - bh, 70, bh); }
  x.fillStyle = '#0d0a14'; x.fillRect(0, 1080, 960, 200);
  x.fillStyle = '#ff2e88'; x.font = 'bold 90px sans-serif'; x.textAlign = 'center';
  x.fillText('NEON COAST', 480, 1180);
  const img = new Image(); img.src = c.toDataURL('image/png'); return img;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadDefaultPhotos() {
  const defs = [
    { src: 'sample.jpg', name: 'Portrait' },
    { src: 'sample2.jpg', name: 'Skyline' },
    { src: 'sample3.jpg', name: 'Car' },
  ];
  for (const d of defs) {
    const img = await loadImage(d.src);
    state.photos.push({ img: img || proceduralPhoto(state.photos.length + 1), name: d.name });
  }
  buildSlots(); buildPanelControls();
}

function addPhotoFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      state.photos.push({ img, name: file.name.replace(/\.[^.]+$/, '').slice(0, 14) || 'Photo' });
      if (state.photos.length > 6) state.photos.shift();
      buildSlots(); buildPanelControls(); renderPreview();
      setStatus('Loaded ' + file.name + ' — assigned to the selected panel.');
      pushHistory();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ------------------------------------------------------------ history */
function snapshot() {
  return JSON.stringify({
    layout: state.layout, grade: state.grade, title: state.title, subtitle: state.subtitle,
    badge: state.badge, heat: state.heat, titleScale: state.titleScale,
    grain: state.grain, halftone: state.halftone, size: state.size,
    panelCfg: state.panelCfg, selectedPanel: state.selectedPanel,
  });
}
function applySnapshot(json) {
  const s = JSON.parse(json);
  Object.assign(state, s);
  syncControls(); renderPreview();
}
function pushHistory() {
  history.past.push(snapshot()); if (history.past.length > 60) history.past.shift();
  history.future.length = 0;
}
function undo() {
  if (!history.past.length) return;
  history.future.push(snapshot()); applySnapshot(history.past.pop());
}
function redo() {
  if (!history.future.length) return;
  history.past.push(snapshot()); applySnapshot(history.future.pop());
}

/* ------------------------------------------------------------ UI */
function setStatus(t) { $('statusLine').textContent = t; }

function chipGroup(el, items, current, onPick) {
  el.innerHTML = '';
  for (const [key, label] of items) {
    const b = document.createElement('button');
    b.textContent = label; if (key === current) b.classList.add('active');
    b.onclick = () => { pushHistory(); onPick(key); syncControls(); renderPreview(); };
    el.appendChild(b);
  }
}

function buildSlots() {
  const wrap = $('slots'); wrap.innerHTML = '';
  state.photos.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'slot'; b.title = p.name + ' — click to use in the selected panel';
    const im = document.createElement('img'); im.src = p.img.src; im.alt = p.name;
    const lb = document.createElement('span'); lb.className = 'slot-label'; lb.textContent = (i + 1) + ' · ' + p.name;
    b.appendChild(im); b.appendChild(lb);
    b.onclick = () => {
      state.panelCfg[state.selectedPanel].photo = i;
      pushHistory(); buildPanelControls(); renderPreview();
      setStatus('Panel ' + (state.selectedPanel + 1) + ' now shows photo ' + (i + 1) + ' (' + p.name + ').');
    };
    wrap.appendChild(b);
  });
}

function buildPanelControls() {
  const n = LAYOUTS[state.layout].panels;
  if (state.selectedPanel >= n) state.selectedPanel = 0;
  const sel = $('panelSelect'); sel.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const o = document.createElement('option'); o.value = i; o.textContent = 'Panel ' + (i + 1);
    sel.appendChild(o);
  }
  sel.value = String(state.selectedPanel);
  const pp = $('panelPhoto'); pp.innerHTML = '';
  state.photos.forEach((p, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = (i + 1) + ' · ' + p.name;
    pp.appendChild(o);
  });
  pp.value = String(state.panelCfg[state.selectedPanel].photo);
  $('zoomSlider').value = String(state.panelCfg[state.selectedPanel].zoom);
}

function syncControls() {
  chipGroup($('layoutChips'), Object.entries(LAYOUTS).map(([k, v]) => [k, v.name]), state.layout, (k) => { state.layout = k; state.selectedPanel = 0; });
  chipGroup($('gradeChips'), Object.entries(GRADES).map(([k, v]) => [k, v.name]), state.grade, (k) => { state.grade = k; });
  chipGroup($('sizeChips'), Object.entries(SIZES).map(([k, v]) => [k, v.label]), state.size, (k) => { state.size = k; });
  $('titleInput').value = state.title;
  $('subtitleInput').value = state.subtitle;
  $('badgeInput').value = state.badge;
  $('heatSlider').value = String(state.heat);
  $('titleSizeSlider').value = String(state.titleScale);
  $('grainToggle').checked = state.grain;
  $('halftoneToggle').checked = state.halftone;
  buildSlots(); buildPanelControls();
}

function bindControls() {
  $('titleInput').addEventListener('input', (e) => { state.title = e.target.value; renderPreview(); });
  $('titleInput').addEventListener('change', pushHistory);
  $('subtitleInput').addEventListener('input', (e) => { state.subtitle = e.target.value; renderPreview(); });
  $('subtitleInput').addEventListener('change', pushHistory);
  $('badgeInput').addEventListener('input', (e) => { state.badge = e.target.value; renderPreview(); });
  $('badgeInput').addEventListener('change', pushHistory);
  $('heatSlider').addEventListener('input', (e) => { state.heat = +e.target.value; renderPreview(); });
  $('heatSlider').addEventListener('change', pushHistory);
  $('titleSizeSlider').addEventListener('input', (e) => { state.titleScale = +e.target.value; renderPreview(); });
  $('titleSizeSlider').addEventListener('change', pushHistory);
  $('grainToggle').addEventListener('change', (e) => { state.grain = e.target.checked; pushHistory(); renderPreview(); });
  $('halftoneToggle').addEventListener('change', (e) => { state.halftone = e.target.checked; pushHistory(); renderPreview(); });
  $('panelSelect').addEventListener('change', (e) => { state.selectedPanel = +e.target.value; buildPanelControls(); renderPreview(); });
  $('panelPhoto').addEventListener('change', (e) => {
    state.panelCfg[state.selectedPanel].photo = +e.target.value; pushHistory(); renderPreview();
  });
  $('zoomSlider').addEventListener('input', (e) => {
    state.panelCfg[state.selectedPanel].zoom = +e.target.value; renderPreview();
  });
  $('zoomSlider').addEventListener('change', pushHistory);
  $('undoBtn').onclick = undo;
  $('redoBtn').onclick = redo;
  $('shuffleBtn').onclick = () => {
    pushHistory();
    const layouts = Object.keys(LAYOUTS), grades = Object.keys(GRADES);
    state.layout = layouts[Math.floor(Math.random() * layouts.length)];
    state.grade = grades[Math.floor(Math.random() * grades.length)];
    state.selectedPanel = 0; syncControls(); renderPreview();
    setStatus('Shuffled to ' + LAYOUTS[state.layout].name + ' + ' + GRADES[state.grade].name + '.');
  };
  $('fillOneBtn').onclick = () => {
    pushHistory();
    state.panelCfg.forEach((c) => { c.photo = 0; });
    buildPanelControls(); renderPreview(); setStatus('Every panel now shows photo 1.');
  };
  $('fileInput').addEventListener('change', (e) => {
    for (const f of e.target.files) addPhotoFile(f);
    e.target.value = '';
  });
  $('exportBtn').onclick = exportPNG;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  });
  // canvas: drag to pan the panel under the pointer, wheel to zoom
  const canvas = $('preview');
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    const hit = hitPanel(px, py, canvas.width, canvas.height);
    if (hit < 0) return;
    state.selectedPanel = hit; buildPanelControls();
    drag = { x: px, y: py, panX: state.panelCfg[hit].panX, panY: state.panelCfg[hit].panY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    const cfg = state.panelCfg[state.selectedPanel];
    cfg.panX = Math.max(-1, Math.min(1, drag.panX + (px - drag.x) / 160));
    cfg.panY = Math.max(-1, Math.min(1, drag.panY + (py - drag.y) / 160));
    renderPreview();
  });
  canvas.addEventListener('pointerup', () => { if (drag) { drag = null; pushHistory(); } });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const cfg = state.panelCfg[state.selectedPanel];
    cfg.zoom = Math.max(1, Math.min(3, cfg.zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
    $('zoomSlider').value = String(cfg.zoom); renderPreview();
  }, { passive: false });
  // drag & drop photos onto the stage
  const wrap = $('canvasWrap');
  ['dragenter', 'dragover'].forEach((ev) => wrap.addEventListener(ev, (e) => { e.preventDefault(); wrap.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => wrap.addEventListener(ev, (e) => { e.preventDefault(); wrap.classList.remove('dragover'); }));
  wrap.addEventListener('drop', (e) => {
    for (const f of e.dataTransfer.files) if (f.type.startsWith('image/')) addPhotoFile(f);
  });
}

function hitPanel(px, py, W, H) {
  const geo = layoutPanels(state.layout, W, H);
  for (let i = geo.panels.length - 1; i >= 0; i--) {
    const r = geo.panels[i];
    let lx = px, ly = py;
    if (r.rot) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const a = -r.rot * Math.PI / 180;
      lx = cx + (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a);
      ly = cy + (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a);
    }
    if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) return i;
  }
  return -1;
}

/* ------------------------------------------------------------ export */
function exportPNG() {
  const size = SIZES[state.size];
  const c = document.createElement('canvas'); c.width = size.w; c.height = size.h;
  renderCover(c.getContext('2d'), size.w, size.h);
  c.toBlob((blob) => {
    if (!blob) { setStatus('Export failed — try again.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'neon-coast-cover-' + state.size + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setStatus('Exported ' + size.w + ' × ' + size.h + ' PNG (' + (blob.size / 1024).toFixed(0) + ' KiB).');
  }, 'image/png');
}

/* ------------------------------------------------------------ boot */
async function boot() {
  // URL presets (also handy for screenshots): layout, grade, size, title, subtitle
  if (params.get('layout') && LAYOUTS[params.get('layout')]) state.layout = params.get('layout');
  if (params.get('grade') && GRADES[params.get('grade')]) state.grade = params.get('grade');
  const m = (params.get('size') || '').match(/^(\d+)x(\d+)$/);
  if (m && SIZES[m[0]]) state.size = m[0];
  if (params.get('title')) state.title = params.get('title');
  if (params.get('subtitle')) state.subtitle = params.get('subtitle');
  if (SHOT_MODE) {
    document.querySelector('.topbar').style.display = 'none';
    document.querySelector('.controls').style.display = 'none';
    document.querySelector('.foot').style.display = 'none';
    document.querySelector('.stage-bar').style.display = 'none';
    document.querySelector('.workspace').style.display = 'block';
    document.querySelector('.stage').style.display = 'block';
    document.querySelector('.canvas-wrap').style.height = '100vh';
    document.querySelector('.canvas-wrap').style.padding = '0';
    document.querySelector('.canvas-wrap').style.justifyContent = 'flex-start';
    document.querySelector('.canvas-wrap').style.alignItems = 'flex-start';
  }
  bindControls();
  syncControls();
  await loadDefaultPhotos();
  try { await document.fonts.ready; } catch (e) { /* fonts fall back to system sans */ }
  renderPreview();
  pushHistory();
  if (SELFTEST) {
    const size = SIZES['1080x1080'];
    const c = document.createElement('canvas'); c.width = size.w; c.height = size.h;
    renderCover(c.getContext('2d'), size.w, size.h);
    const url = c.toDataURL('image/png');
    const el = $('selftest');
    el.style.display = 'block';
    el.textContent = 'SELFTEST OK png_data_url_length=' + url.length;
    document.title = 'SELFTEST OK ' + url.length;
  }
}

boot();
