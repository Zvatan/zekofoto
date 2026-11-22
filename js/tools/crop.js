// Düzenle aracı: kırpma (oranlı ya da serbest), 90° döndürme, aynalama,
// açı düzeltme, perspektif ve yeniden boyutlandırma.
//
// Önizlemede bütün çerçeve gösterilir; kırpma dikdörtgeni üstte, sürüklenebilir
// tutamaçlarla çizilir. Kırpma her zaman fotoğrafın içinde kalır (açı ve
// perspektif değişince kendiliğinden küçülür).
import { createSlider } from '../widgets/slider.js';
import { icon, el, escapeHtml } from '../ui.js';
import { defaultSpec } from '../gl/engine.js';
import {
  identityGeom, isIdentityGeom, frameSize, renderMatrix, validPolygon, refreshCrop, rotate90, flip,
  cropToPx, pxToCrop, constrainMove, snapCrop, outputSize, naturalSize, MIN_CROP_PX,
} from '../core/geometry.js';

const ASPECTS = [
  { id: 'free', label: 'Serbest', value: null },
  { id: 'orig', label: 'Orijinal', value: 'orig' },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '4:5', label: '4:5', value: 4 / 5 },
  { id: '5:4', label: '5:4', value: 5 / 4 },
  { id: '3:4', label: '3:4', value: 3 / 4 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '2:3', label: '2:3', value: 2 / 3 },
  { id: '3:2', label: '3:2', value: 3 / 2 },
  { id: '9:16', label: '9:16', value: 9 / 16 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
];

const SIZES = [null, 4096, 3000, 2048, 1600, 1080, 720];

const TABS = [
  { id: 'crop', label: 'Kırp' },
  { id: 'rotate', label: 'Döndür' },
  { id: 'persp', label: 'Perspektif' },
  { id: 'size', label: 'Boyut' },
];

const CORNER_HIT = 30;
const EDGE_HIT = 22;

export function cropTool(host, { tab = 'crop' } = {}) {
  const W = host.W;
  const H = host.H;
  let geom = identityGeom();
  let aspectId = 'free';
  let ui = null;
  let ov = null;
  let drag = null;
  let offLayout = null;

  const frame = () => frameSize(geom, W, H);

  function spec() {
    const [Wf, Hf] = frame();
    const s = defaultSpec(Wf, Hf);
    s.matrix = renderMatrix(geom, W, H, { x: 0, y: 0, w: 1, h: 1 });
    s.outside = [0.1, 0.1, 0.11];
    return s;
  }

  function setContent() {
    const [Wf, Hf] = frame();
    host.viewer.setContent({ w: Wf, h: Hf, spec }, { padding: 30, singlePointer: 'none' });
  }

  function changed(content = false) {
    if (content) setContent();
    else host.viewer.invalidate();
    layoutOverlay();
    refreshSize();
  }

  // --- kırpma katmanı -----------------------------------------------------------

  function buildOverlay() {
    ov = el('div', 'crop-ov');
    ov.innerHTML =
      '<div class="crop-box"><div class="crop-grid"><i></i><i></i><i></i><i></i></div>' +
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => `<span class="crop-h crop-h--${h}"></span>`).join('') +
      '</div>';
    host.overlay.append(ov);
    ov.addEventListener('pointerdown', down);
    ov.addEventListener('pointermove', move);
    ov.addEventListener('pointerup', up);
    ov.addEventListener('pointercancel', up);
    offLayout = host.viewer.onLayout(layoutOverlay);
  }

  function boxRect() {
    const r = host.viewer.imageRect();
    const c = geom.crop;
    return { left: r.left + c.x * r.width, top: r.top + c.y * r.height, width: c.w * r.width, height: c.h * r.height, scale: r.scale };
  }

  function layoutOverlay() {
    if (!ov) return;
    const b = boxRect();
    const box = ov.firstElementChild;
    box.style.transform = `translate(${b.left}px, ${b.top}px)`;
    box.style.width = `${b.width}px`;
    box.style.height = `${b.height}px`;
  }

  function local(e) {
    const s = host.stage.getBoundingClientRect();
    return [e.clientX - s.left, e.clientY - s.top];
  }

  function hit(x, y) {
    const b = boxRect();
    const xs = { w: b.left, e: b.left + b.width };
    const ys = { n: b.top, s: b.top + b.height };
    for (const v of ['n', 's']) {
      for (const h of ['w', 'e']) {
        if (Math.hypot(x - xs[h], y - ys[v]) < CORNER_HIT) return v + h;
      }
    }
    const inX = x > b.left && x < b.left + b.width;
    const inY = y > b.top && y < b.top + b.height;
    if (inX && Math.abs(y - b.top) < EDGE_HIT) return 'n';
    if (inX && Math.abs(y - (b.top + b.height)) < EDGE_HIT) return 's';
    if (inY && Math.abs(x - b.left) < EDGE_HIT) return 'w';
    if (inY && Math.abs(x - (b.left + b.width)) < EDGE_HIT) return 'e';
    if (inX && inY) return 'move';
    return null;
  }

  function down(e) {
    if (drag || host.viewer.isGesturing) {
      drag = null;
      return;
    }
    const [x, y] = local(e);
    const mode = hit(x, y);
    if (!mode) return;
    e.stopPropagation();
    ov.setPointerCapture(e.pointerId);
    const [Wf, Hf] = frame();
    drag = {
      id: e.pointerId,
      mode,
      x0: x,
      y0: y,
      start: cropToPx(geom.crop, Wf, Hf),
      last: cropToPx(geom.crop, Wf, Hf),
      poly: validPolygon(geom, W, H),
    };
    ov.classList.add('is-dragging');
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (host.viewer.isGesturing) {
      up(e);
      return;
    }
    e.stopPropagation();
    const [x, y] = local(e);
    const [Wf, Hf] = frame();
    const scale = host.viewer.imageRect().scale;
    const dx = (x - drag.x0) / scale;
    const dy = (y - drag.y0) / scale;
    const s = drag.start;
    const minPx = Math.max(MIN_CROP_PX, 56 / scale);
    const aspect = geom.aspect;
    let r;
    if (drag.mode === 'move') {
      r = { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
    } else {
      let x0 = s.x;
      let y0 = s.y;
      let x1 = s.x + s.w;
      let y1 = s.y + s.h;
      const m = drag.mode;
      if (m.includes('w')) x0 = Math.min(x1 - minPx, s.x + dx);
      if (m.includes('e')) x1 = Math.max(x0 + minPx, s.x + s.w + dx);
      if (m.includes('n')) y0 = Math.min(y1 - minPx, s.y + dy);
      if (m.includes('s')) y1 = Math.max(y0 + minPx, s.y + s.h + dy);
      if (aspect) {
        let w = x1 - x0;
        let h = y1 - y0;
        if (m.length === 2) {
          // Köşe: daha çok değişen kenar belirler, karşı köşe sabit kalır.
          if (Math.abs(w - s.w) / s.w > Math.abs(h - s.h) / s.h) h = w / aspect;
          else w = h * aspect;
          if (m.includes('w')) x0 = x1 - w;
          else x1 = x0 + w;
          if (m.includes('n')) y0 = y1 - h;
          else y1 = y0 + h;
        } else if (m === 'e' || m === 'w') {
          h = w / aspect;
          const cy = s.y + s.h / 2;
          y0 = cy - h / 2;
          y1 = cy + h / 2;
        } else {
          w = h * aspect;
          const cx = s.x + s.w / 2;
          x0 = cx - w / 2;
          x1 = cx + w / 2;
        }
      }
      r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    r = constrainMove(drag.last, r, drag.poly);
    drag.last = r;
    geom.crop = pxToCrop(r, Wf, Hf);
    geom.cropAuto = false;
    layoutOverlay();
    refreshSize();
  }

  function up(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    drag = null;
    ov.classList.remove('is-dragging');
  }

  // --- panel ----------------------------------------------------------------

  function mount(body) {
    body.classList.add('panel-crop');
    const controls = el('div', 'tool-controls tool-controls--crop');
    const tabs = el('div', 'seg seg--tabs');
    tabs.setAttribute('role', 'tablist');
    for (const t of TABS) {
      const b = el('button', '', escapeHtml(t.label));
      b.type = 'button';
      b.dataset.tab = t.id;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => showTab(t.id));
      tabs.append(b);
    }
    body.append(controls, tabs);
    ui = { controls, tabs, sizeOut: null };
    buildOverlay();
    setContent();
    showTab(tab);
  }

  function showTab(id) {
    for (const b of ui.tabs.children) {
      const on = b.dataset.tab === id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-selected', on);
    }
    ov.classList.toggle('is-straighten', id === 'rotate' || id === 'persp');
    ui.controls.replaceChildren();
    ui.sizeOut = null;
    if (id === 'crop') buildAspects();
    else if (id === 'rotate') buildRotate();
    else if (id === 'persp') buildPerspective();
    else buildSize();
  }

  function aspectValue(a) {
    if (a.value === 'orig') {
      const [Wf, Hf] = frame();
      return Wf / Hf;
    }
    return a.value;
  }

  function buildAspects() {
    const strip = el('div', 'chip-strip');
    for (const a of ASPECTS) {
      const b = el('button', 'chip', `${a.id === 'free' || a.id === 'orig' ? '' : `<span class="chip__ratio" style="--r:${a.value}"></span>`}${escapeHtml(a.label)}`);
      b.type = 'button';
      b.dataset.id = a.id;
      b.classList.toggle('is-selected', a.id === aspectId);
      b.addEventListener('click', () => {
        aspectId = a.id;
        for (const x of strip.children) x.classList.toggle('is-selected', x === b);
        geom.aspect = aspectValue(a);
        geom.cropAuto = true;
        refreshCrop(geom, W, H);
        changed();
      });
      strip.append(b);
    }
    const reset = el('button', 'btn btn--ghost btn--small', `${icon('reset')}Sıfırla`);
    reset.addEventListener('click', () => {
      geom = identityGeom();
      aspectId = 'free';
      showTab('crop');
      changed(true);
    });
    const row = el('div', 'ctl-row ctl-row--end');
    row.append(reset);
    ui.controls.append(strip, row);
  }

  function buildRotate() {
    const row = el('div', 'btn-row');
    const actions = [
      { icon: 'rotateLeft', label: 'Sola 90°', run: () => rotate90(geom, -1) },
      { icon: 'rotateRight', label: 'Sağa 90°', run: () => rotate90(geom, 1) },
      { icon: 'flipH', label: 'Yatay çevir', run: () => flip(geom, 'h') },
      { icon: 'flipV', label: 'Dikey çevir', run: () => flip(geom, 'v') },
    ];
    for (const a of actions) {
      const b = el('button', 'tool', `${icon(a.icon)}<span>${escapeHtml(a.label)}</span>`);
      b.type = 'button';
      b.addEventListener('click', () => {
        a.run();
        if (aspectId === 'orig') geom.aspect = aspectValue(ASPECTS[1]);
        // 90° dönünce oran tersine döner (4:3 → 3:4); seçili oran da ona geçer.
        const same = ASPECTS.find((x) => typeof x.value === 'number' && geom.aspect && Math.abs(x.value - geom.aspect) < 1e-6);
        if (same) aspectId = same.id;
        refreshCrop(geom, W, H);
        angle.set(geom.angle);
        angleOut.textContent = fmtAngle(geom.angle);
        changed(true);
      });
      row.append(b);
    }
    const head = el('div', 'ctl-head', '<span class="ctl-label">Açı</span><output class="ctl-value"></output>');
    const angleOut = head.querySelector('output');
    const fmtAngle = (v) => `${v > 0 ? '+' : ''}${(Math.round(v * 10) / 10).toLocaleString('tr-TR')}°`;
    const angle = createSlider({
      min: -45,
      max: 45,
      step: 0.1,
      value: geom.angle,
      label: 'Düzeltme açısı',
      format: fmtAngle,
      onInput: (v) => {
        geom.angle = v;
        angleOut.textContent = fmtAngle(v);
        refreshCrop(geom, W, H);
        changed();
      },
    });
    angleOut.textContent = fmtAngle(geom.angle);
    ui.controls.append(row, head, angle.el);
  }

  function buildPerspective() {
    for (const [key, label] of [
      ['persV', 'Dikey'],
      ['persH', 'Yatay'],
    ]) {
      const row = el('div', 'mini');
      row.innerHTML = `<span class="mini__label">${label}</span>`;
      const out = el('output', 'mini__value', String(geom[key]));
      const s = createSlider({
        min: -100,
        max: 100,
        value: geom[key],
        label: `${label} perspektif`,
        onInput: (v) => {
          geom[key] = v;
          out.textContent = v > 0 ? `+${v}` : String(v);
          refreshCrop(geom, W, H);
          changed();
        },
      });
      row.append(s.el, out);
      ui.controls.append(row);
    }
    ui.controls.append(el('p', 'ctl-hint', 'Eğik binaları ve belgeleri düzeltir; kırpma kendiliğinden ayarlanır.'));
  }

  function buildSize() {
    const out = el('p', 'size-out');
    const strip = el('div', 'chip-strip');
    const [nw, nh] = naturalSize(geom, W, H);
    const natLong = Math.max(nw, nh);
    for (const s of SIZES) {
      if (s && s >= natLong) continue;
      const b = el('button', 'chip', s ? `${s} px` : 'Orijinal');
      b.type = 'button';
      b.classList.toggle('is-selected', geom.resize === s);
      b.addEventListener('click', () => {
        geom.resize = s;
        for (const x of strip.children) x.classList.toggle('is-selected', x === b);
        refreshSize();
      });
      strip.append(b);
    }
    ui.controls.append(out, strip, el('p', 'ctl-hint', 'Uzun kenar seçilen boyuta indirilir; oran korunur.'));
    ui.sizeOut = out;
    refreshSize();
  }

  function refreshSize() {
    if (!ui?.sizeOut) return;
    const [w, h] = outputSize(geom, W, H);
    ui.sizeOut.innerHTML = `Çıktı: <b>${w} × ${h}</b> piksel`;
  }

  return {
    title: 'Düzenle',
    compare: false, // bütün çerçeve zaten görünüyor
    mount,
    isDirty: () => !isIdentityGeom(geom),
    apply() {
      if (isIdentityGeom(geom)) return null;
      const g = { ...geom };
      // Açı ve perspektif yoksa kırpma tam piksele oturur (yeniden örnekleme yok).
      if (!g.angle && !g.persV && !g.persH) g.crop = snapCrop(g, W, H);
      const [w, h] = outputSize(g, W, H);
      const s = defaultSpec(w, h);
      s.matrix = renderMatrix(g, W, H);
      return { spec: s, w, h, label: 'Düzenle' };
    },
    destroy() {
      offLayout?.();
      ov?.remove();
    },
  };
}
