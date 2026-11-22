// Metin: fotoğrafa yazı katmanları. Katman parmakla sürüklenir; köşedeki
// tutamaçla büyütülüp döndürülür, ×'le silinir. Yazı tipi, renk, kontur,
// gölge, etiket zemini, hizalama ve saydamlık. Yazılar görüntü pikselinde
// tanımlıdır: önizleme ekranda, çıktı tam çözünürlükte aynı çizimle üretilir.
import { el, icon, escapeHtml } from '../ui.js';
import { createCanvas } from '../image-io.js';
import { defaultSpec } from '../gl/engine.js';
import { FONTS } from '../core/fonts.js';
import { createOverlay } from './paint.js';
import { labeled, segmented, palette } from './kit.js';

const BASE = new URL('../../fonts/', import.meta.url).href;
const loaded = new Map();

// Yazı tipini yükler (bir kez); FontFace ile, alt küme aralıklarıyla.
export function loadFont(f) {
  if (!f.files.length) return Promise.resolve();
  if (!loaded.has(f.id)) {
    const faces = f.files.map(([file, range]) => new FontFace(f.family, `url(${BASE}${file})`, { weight: String(f.weight), unicodeRange: range }));
    for (const ff of faces) document.fonts.add(ff);
    loaded.set(f.id, Promise.all(faces.map((ff) => ff.load())).catch((e) => console.warn('yazı tipi', f.family, e)));
  }
  return loaded.get(f.id);
}

const fontOf = (id) => FONTS.find((f) => f.id === id) || FONTS[0];
const cssFamily = (f) => (f.files.length ? `"${f.family}"` : f.family);

// Katmanın ölçüleri (görüntü pikseli): satır genişlikleri, kutu.
function measure(ctx, L) {
  const f = fontOf(L.font);
  ctx.font = `${f.weight} ${L.size}px ${cssFamily(f)}`;
  const lines = (L.text || ' ').split('\n');
  const widths = lines.map((t) => ctx.measureText(t || ' ').width);
  const lh = L.size * 1.22;
  const pad = L.bg ? L.size * 0.35 : L.size * 0.12;
  const w = Math.max(...widths) + pad * 2;
  const h = lines.length * lh + pad * 2 - L.size * 0.22;
  return { lines, widths, lh, pad, w, h };
}

// Katmanı çizer: s ölçeği, (ox, oy) görüntünün (0, 0) noktası.
export function drawTextLayer(ctx, L, s, ox, oy) {
  const f = fontOf(L.font);
  const m = measure(ctx, L);
  ctx.save();
  ctx.translate(ox + L.x * s, oy + L.y * s);
  ctx.rotate(L.rot);
  ctx.scale(s, s);
  ctx.globalAlpha = L.opacity;
  if (L.bg) {
    ctx.fillStyle = L.bgColor;
    roundRect(ctx, -m.w / 2, -m.h / 2, m.w, m.h, Math.min(m.h / 2, L.size * 0.35));
    ctx.fill();
  }
  ctx.font = `${f.weight} ${L.size}px ${cssFamily(f)}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = L.align;
  ctx.lineJoin = 'round';
  const x = L.align === 'left' ? -m.w / 2 + m.pad : L.align === 'right' ? m.w / 2 - m.pad : 0;
  const y0 = -m.h / 2 + m.pad + L.size * 0.5;
  if (L.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = L.size * 0.18 * s;
    ctx.shadowOffsetY = L.size * 0.05 * s;
  }
  // Kontur varsa gölgeyi kontur taşır; dolgu ikinci kez gölgelenmez.
  if (L.stroke > 0) {
    ctx.strokeStyle = L.strokeColor;
    ctx.lineWidth = L.size * L.stroke * 0.25;
    m.lines.forEach((t, i) => ctx.strokeText(t, x, y0 + i * m.lh));
    ctx.shadowColor = 'transparent';
  }
  ctx.fillStyle = L.color;
  m.lines.forEach((t, i) => ctx.fillText(t, x, y0 + i * m.lh));
  ctx.restore();
  return m;
}

// Yuvarlak köşeli dikdörtgen yolu (iOS 15'te roundRect yok).
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function textTool(host) {
  const W = host.W;
  const H = host.H;
  const short = Math.min(W, H);
  const layers = [];
  let sel = null;
  let overlay = null;
  let ui = null;
  let drag = null;
  let nextId = 1;
  const meas = createCanvas(1, 1).getContext('2d');
  const st = { tab: 'font', target: 'text' };

  function newLayer(text = 'Metin') {
    const prev = sel;
    const L = {
      id: nextId++,
      text,
      font: prev?.font || 'montserrat',
      size: short * 0.09,
      color: prev?.color || '#ffffff',
      stroke: prev?.stroke ?? 0,
      strokeColor: prev?.strokeColor || '#000000',
      shadow: prev?.shadow ?? true,
      bg: prev?.bg ?? false,
      bgColor: prev?.bgColor || '#000000',
      align: prev?.align || 'center',
      opacity: 1,
      x: W / 2,
      y: H / 2 + layers.length * short * 0.12,
      rot: 0,
    };
    L.y = Math.min(H * 0.85, L.y);
    layers.push(L);
    select(L);
    loadFont(fontOf(L.font)).then(() => overlay.invalidate());
    return L;
  }

  function select(L) {
    sel = L;
    if (ui) {
      ui.input.value = L ? L.text : '';
      ui.input.disabled = !L;
      ui.fonts?.querySelectorAll('.font-chip').forEach((b) => b.classList.toggle('is-selected', !!L && b.dataset.id === L.font));
      refreshStyle();
    }
    layoutHandles();
    overlay?.invalidate();
  }

  // --- sahne ------------------------------------------------------------

  function drawOverlay(ctx, v) {
    for (const L of layers) {
      const m = drawTextLayer(ctx, L, v.s, v.ox, v.oy);
      L._w = m.w;
      L._h = m.h;
    }
    layoutHandles();
  }

  // Seçili katmanın çerçevesi ve tutamaçları (DOM, dokunmak için).
  function layoutHandles() {
    if (!ui) return;
    const box = ui.box;
    if (!sel) {
      box.hidden = true;
      return;
    }
    if (sel._w === undefined) {
      const m = measure(meas, sel);
      sel._w = m.w;
      sel._h = m.h;
    }
    const r = host.viewer.imageRect();
    const s = r.scale;
    box.hidden = false;
    box.style.width = `${sel._w * s}px`;
    box.style.height = `${sel._h * s}px`;
    box.style.transform = `translate(${r.left + sel.x * s}px, ${r.top + sel.y * s}px) translate(-50%, -50%) rotate(${sel.rot}rad)`;
  }

  const local = (e) => {
    const b = host.stage.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  };
  const toImage = (x, y) => {
    const [u, v] = host.viewer.toOutput(x, y);
    return [u * W, v * H];
  };

  function hitLayer(px, py) {
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      if (L._w === undefined) continue;
      const dx = px - L.x;
      const dy = py - L.y;
      const c = Math.cos(-L.rot);
      const sn = Math.sin(-L.rot);
      const lx = dx * c - dy * sn;
      const ly = dx * sn + dy * c;
      const pad = short * 0.02;
      if (Math.abs(lx) <= L._w / 2 + pad && Math.abs(ly) <= L._h / 2 + pad) return L;
    }
    return null;
  }

  function down(e) {
    if (e.button > 0 || host.viewer.pointers.size > 1) {
      drag = null;
      return;
    }
    const [x, y] = local(e);
    const p = toImage(x, y);
    const handle = e.target.closest?.('[data-h]')?.dataset.h;
    if (handle === 'del' && sel) {
      e.stopPropagation();
      layers.splice(layers.indexOf(sel), 1);
      select(layers[layers.length - 1] || null);
      return;
    }
    if (handle === 'rot' && sel) {
      e.stopPropagation();
      const d0 = Math.hypot(p[0] - sel.x, p[1] - sel.y) || 1;
      drag = { id: e.pointerId, kind: 'rot', d0, a0: Math.atan2(p[1] - sel.y, p[0] - sel.x), size0: sel.size, rot0: sel.rot };
      return;
    }
    const L = hitLayer(p[0], p[1]);
    if (!L) {
      select(null);
      return;
    }
    if (L !== sel) select(L);
    drag = { id: e.pointerId, kind: 'move', dx: p[0] - L.x, dy: p[1] - L.y };
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id || !sel) return;
    if (host.viewer.isGesturing) {
      drag = null;
      return;
    }
    const [x, y] = local(e);
    const p = toImage(x, y);
    if (drag.kind === 'move') {
      sel.x = Math.min(W, Math.max(0, p[0] - drag.dx));
      sel.y = Math.min(H, Math.max(0, p[1] - drag.dy));
    } else {
      const d = Math.hypot(p[0] - sel.x, p[1] - sel.y);
      sel.size = Math.max(short * 0.015, Math.min(short * 0.6, (drag.size0 * d) / drag.d0));
      let rot = drag.rot0 + Math.atan2(p[1] - sel.y, p[0] - sel.x) - drag.a0;
      // Düz açılara (0°, 90° …) hafif yapışma.
      const q = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(rot - q) < 0.06) rot = q;
      sel.rot = rot;
    }
    sel._w = undefined;
    overlay.invalidate();
  }

  function up(e) {
    if (drag && e.pointerId === drag.id) drag = null;
  }

  // --- panel ------------------------------------------------------------

  function refreshStyle() {
    if (!ui) return;
    const L = sel;
    ui.body.classList.toggle('is-empty', !L);
    if (!L) return;
    ui.colors?.set(st.target === 'text' ? L.color : st.target === 'stroke' ? L.strokeColor : L.bgColor);
    ui.stroke?.slider.set(L.stroke * 100);
    ui.stroke?.show(L.stroke * 100);
    ui.opacity?.slider.set(L.opacity * 100);
    ui.opacity?.show(L.opacity * 100);
    ui.align?.set(L.align);
    ui.shadowBtn?.classList.toggle('is-on', L.shadow);
    ui.bgBtn?.classList.toggle('is-on', L.bg);
  }

  function changed() {
    if (sel) sel._w = undefined;
    overlay.invalidate();
  }

  function buildTab() {
    const c = ui.tabBody;
    c.replaceChildren();
    ui.fonts = ui.colors = ui.stroke = ui.opacity = ui.align = ui.shadowBtn = ui.bgBtn = null;
    if (st.tab === 'font') {
      const strip = el('div', 'chip-strip font-strip');
      for (const f of FONTS) {
        const b = el('button', 'chip font-chip', escapeHtml(f.label));
        b.dataset.id = f.id;
        b.style.fontFamily = cssFamily(f);
        b.style.fontWeight = f.weight;
        loadFont(f);
        b.addEventListener('click', () => {
          if (!sel) return;
          sel.font = f.id;
          strip.querySelectorAll('.font-chip').forEach((x) => x.classList.toggle('is-selected', x === b));
          loadFont(f).then(changed);
          changed();
        });
        strip.append(b);
      }
      ui.fonts = strip;
      c.append(strip);
      strip.querySelectorAll('.font-chip').forEach((b) => b.classList.toggle('is-selected', !!sel && b.dataset.id === sel.font));
    } else if (st.tab === 'color') {
      const target = segmented(
        [{ id: 'text', label: 'Yazı' }, { id: 'stroke', label: 'Kontur' }, { id: 'bg', label: 'Etiket' }],
        st.target,
        (id) => {
          st.target = id;
          refreshStyle();
        },
      );
      ui.colors = palette(sel?.color || '#ffffff', (col) => {
        if (!sel) return;
        if (st.target === 'text') sel.color = col;
        else if (st.target === 'stroke') {
          sel.strokeColor = col;
          if (!sel.stroke) sel.stroke = 0.4;
        } else {
          sel.bgColor = col;
          sel.bg = true;
        }
        changed();
      });
      c.append(target.el, ui.colors.el);
    } else {
      const row = el('div', 'ctl-row text-style-row');
      ui.align = segmented(
        [{ id: 'left', label: '', icon: 'alignLeft' }, { id: 'center', label: '', icon: 'alignCenter' }, { id: 'right', label: '', icon: 'alignRight' }],
        sel?.align || 'center',
        (id) => {
          if (!sel) return;
          sel.align = id;
          changed();
        },
        'seg--icons',
      );
      ui.shadowBtn = el('button', 'toggle-btn', `${icon('shadowText')}<span>Gölge</span>`);
      ui.shadowBtn.addEventListener('click', () => {
        if (!sel) return;
        sel.shadow = !sel.shadow;
        refreshStyle();
        changed();
      });
      ui.bgBtn = el('button', 'toggle-btn', `${icon('label')}<span>Etiket</span>`);
      ui.bgBtn.addEventListener('click', () => {
        if (!sel) return;
        sel.bg = !sel.bg;
        refreshStyle();
        changed();
      });
      row.append(ui.align.el, ui.shadowBtn, ui.bgBtn);
      ui.stroke = labeled('Kontur', {
        min: 0,
        max: 100,
        value: (sel?.stroke || 0) * 100,
        def: 0,
        onInput: (v) => {
          if (!sel) return;
          sel.stroke = v / 100;
          changed();
        },
      });
      ui.opacity = labeled('Saydamlık', {
        min: 10,
        max: 100,
        value: (sel?.opacity ?? 1) * 100,
        def: 100,
        fmt: (v) => `%${Math.round(v)}`,
        onInput: (v) => {
          if (!sel) return;
          sel.opacity = v / 100;
          changed();
        },
      });
      c.append(row, ui.stroke.row, ui.opacity.row);
    }
    refreshStyle();
  }

  function mount(body) {
    body.classList.add('panel-text');
    host.viewer.setContent({ w: W, h: H, spec: () => defaultSpec(W, H) }, { keepView: true, singlePointer: 'none' });
    overlay = createOverlay(host, drawOverlay);
    const box = el('div', 'text-box');
    box.innerHTML =
      `<button class="text-box__h text-box__h--del" data-h="del" aria-label="Yazıyı sil">${icon('close')}</button>` +
      `<button class="text-box__h text-box__h--rot" data-h="rot" aria-label="Büyüt ve döndür">${icon('rotateScale')}</button>`;
    host.overlay.append(box);
    host.stage.addEventListener('pointerdown', down);
    host.stage.addEventListener('pointermove', move);
    host.stage.addEventListener('pointerup', up);
    host.stage.addEventListener('pointercancel', up);

    const top = el('div', 'ctl-row text-input-row');
    const input = el('textarea', 'text-input');
    input.rows = 1;
    input.placeholder = 'Yazını gir';
    input.setAttribute('aria-label', 'Yazı');
    input.addEventListener('input', () => {
      if (!sel) newLayer(input.value);
      sel.text = input.value;
      changed();
    });
    const add = el('button', 'btn btn--secondary btn--small', `${icon('plus')}Ekle`);
    add.addEventListener('click', () => {
      newLayer();
      input.focus();
      input.select();
    });
    top.append(input, add);
    const tabs = segmented(
      [{ id: 'font', label: 'Yazı tipi' }, { id: 'color', label: 'Renk' }, { id: 'style', label: 'Stil' }],
      st.tab,
      (id) => {
        st.tab = id;
        buildTab();
      },
      'seg--tabs',
    );
    const tabBody = el('div', 'text-tab');
    body.append(top, tabs.el, tabBody);
    ui = { body, input, box, tabBody };
    buildTab();
    newLayer();
    input.focus({ preventScroll: true });
    input.select();
  }

  async function render() {
    const used = [...new Set(layers.map((L) => L.font))].map(fontOf);
    await Promise.all(used.map(loadFont));
    const out = createCanvas(W, H);
    const o = out.getContext('2d');
    o.drawImage(host.image, 0, 0);
    for (const L of layers) drawTextLayer(o, L, 1, 0, 0);
    return out;
  }

  return {
    title: 'Metin',
    mount,
    apply() {
      if (!layers.some((L) => L.text.trim())) return null;
      return { label: 'Metin', render };
    },
    destroy() {
      host.stage.removeEventListener('pointerdown', down);
      host.stage.removeEventListener('pointermove', move);
      host.stage.removeEventListener('pointerup', up);
      host.stage.removeEventListener('pointercancel', up);
      overlay?.destroy();
      ui?.box.remove();
    },
  };
}
