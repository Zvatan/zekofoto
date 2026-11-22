// Mozaik: fırçayla boyanan yerler piksellenir, altıgen desen, bulanık ya da
// buzlu cam olur; silgiyle geri alınır. Her vuruş seçili deseni kullanır.
//
// Önizlemede desenler fotoğrafın küçük kopyasından hazırlanır ve yalnız
// boyanan yerler sahnenin üstündeki katmanda gösterilir (altta özgün foto).
// Uygulanınca vuruşlar tam çözünürlükte, yalnız boyanan bölgede yeniden işlenir.
import { el, icon } from '../ui.js';
import { createCanvas } from '../image-io.js';
import { defaultSpec } from '../gl/engine.js';
import { pixelate, hexagons, frost } from '../core/mosaic.js';
import { createPainter, createOverlay, tracePath, strokesBounds, historyButtons, BRUSH_MIN, BRUSH_MAX } from './paint.js';
import { labeled, segmented, itemStrip } from './kit.js';

const STYLES = [
  { id: 'pixel', label: 'Piksel', icon: 'mosaic' },
  { id: 'hex', label: 'Altıgen', icon: 'hexagon' },
  { id: 'blur', label: 'Bulanık', icon: 'blurDrop' },
  { id: 'frost', label: 'Buzlu cam', icon: 'frost' },
];
const PREVIEW = 1600;

// Hücre boyutu: kaydırıcı 1..100 → fotoğrafın uzun kenarının %0,6–%5'i.
const cellOf = (v, long) => long * (0.006 + (v / 100) * 0.044);

// Bölgenin (rx, ry, rw, rh) desenli kopyası; src: aynı ölçekte tuval,
// cell: o ölçekte hücre boyu. Izgara tuvalin (0, 0) noktasına hizalıdır.
function effectRegion(style, src, rx, ry, rw, rh, cell) {
  const out = createCanvas(rw, rh);
  const o = out.getContext('2d');
  if (style === 'blur') {
    // Küçültüp büyütmek (iki kademe) yumuşak bir bulanıklık verir.
    const pad = Math.ceil(cell * 2);
    const x0 = Math.max(0, rx - pad);
    const y0 = Math.max(0, ry - pad);
    const x1 = Math.min(src.width, rx + rw + pad);
    const y1 = Math.min(src.height, ry + rh + pad);
    const k = Math.max(2, cell / 2.5);
    const sw = Math.max(1, Math.round((x1 - x0) / k));
    const sh = Math.max(1, Math.round((y1 - y0) / k));
    const a = createCanvas(sw, sh);
    const ag = a.getContext('2d');
    ag.imageSmoothingQuality = 'high';
    ag.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, sw, sh);
    const b = createCanvas(Math.max(1, Math.round(sw / 2)), Math.max(1, Math.round(sh / 2)));
    const bg = b.getContext('2d');
    bg.imageSmoothingQuality = 'high';
    bg.drawImage(a, 0, 0, b.width, b.height);
    ag.clearRect(0, 0, sw, sh);
    ag.drawImage(b, 0, 0, sw, sh);
    o.imageSmoothingQuality = 'high';
    o.drawImage(a, 0, 0, sw, sh, x0 - rx, y0 - ry, x1 - x0, y1 - y0);
    return out;
  }
  // Piksel işlemleri: hücre kesilmesin diye bölge ızgaraya genişletilir.
  const g = Math.ceil(cell) + 1;
  const x0 = Math.max(0, Math.floor((rx - g) / cell) * cell | 0);
  const y0 = Math.max(0, Math.floor((ry - g) / cell) * cell | 0);
  const x1 = Math.min(src.width, rx + rw + g);
  const y1 = Math.min(src.height, ry + rh + g);
  const w = x1 - x0;
  const h = y1 - y0;
  const data = src.getContext('2d').getImageData(x0, y0, w, h);
  let res;
  if (style === 'pixel') res = pixelate(data.data, w, h, x0, y0, cell);
  else if (style === 'hex') res = hexagons(data.data, w, h, x0, y0, cell);
  else res = frost(data.data, w, h, x0, y0, cell * 0.6);
  o.putImageData(new ImageData(res, w, h), x0 - rx, y0 - ry);
  return out;
}

export function mosaicTool(host) {
  const W = host.W;
  const H = host.H;
  const long = Math.max(W, H);
  const st = { style: 'pixel', erase: false, size: 40, cell: 35 };
  let painter = null;
  let overlay = null;
  let hist = null;
  let small = null; // önizleme kaynağı
  let sp = 1; // önizleme pikseli / görüntü pikseli
  let layer = null; // boyanan desenler (önizleme ölçeği, saydam zemin)
  const effects = new Map(); // `${stil}:${hücre}` → önizleme ölçeğinde desenli tuval

  function effectFor(style, cellV) {
    const key = `${style}:${cellV}`;
    if (!effects.has(key)) {
      effects.set(key, effectRegion(style, small, 0, 0, small.width, small.height, cellOf(cellV, long) * sp));
    }
    return effects.get(key);
  }

  // Bir vuruşu katmana işler (bbox içinde maske + desen).
  function applyStroke(ctx, s, region, srcFor, scale, ox = 0, oy = 0) {
    const r = region;
    if (s.erase) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineWidth = s.width * scale;
      tracePath(ctx, s.points, scale, -ox, -oy);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const tmp = createCanvas(r.w, r.h);
    const t = tmp.getContext('2d');
    t.lineCap = t.lineJoin = 'round';
    t.lineWidth = s.width * scale;
    tracePath(t, s.points, scale, -r.x, -r.y);
    t.stroke();
    t.globalCompositeOperation = 'source-in';
    t.drawImage(srcFor(s, r), 0, 0);
    ctx.drawImage(tmp, r.x - ox, r.y - oy);
  }

  // Önizleme katmanını vuruşlardan yeniden kurar.
  function rebuild() {
    const c = layer.getContext('2d');
    c.clearRect(0, 0, layer.width, layer.height);
    for (const s of painter.strokes) commit(s);
    overlay.invalidate();
    refreshHist();
  }

  function previewRegion(s) {
    const b = strokesBounds([s], W, H, 2);
    if (!b) return null;
    const x = Math.floor(b.x * sp);
    const y = Math.floor(b.y * sp);
    return { x, y, w: Math.min(layer.width - x, Math.ceil(b.w * sp) + 2), h: Math.min(layer.height - y, Math.ceil(b.h * sp) + 2) };
  }

  function commit(s) {
    const r = previewRegion(s);
    if (!r || r.w <= 0 || r.h <= 0) return;
    const eff = s.erase ? null : effectFor(s.style, s.cell);
    applyStroke(layer.getContext('2d'), s, r, () => {
      const c = createCanvas(r.w, r.h);
      c.getContext('2d').drawImage(eff, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      return c;
    }, sp);
  }

  function drawOverlay(ctx, v) {
    if (!layer) return;
    const cur = painter?.current;
    let src = layer;
    if (cur && cur.points.length) {
      // Süren vuruş: katmanın geçici kopyasına işlenir.
      src = createCanvas(layer.width, layer.height);
      const c = src.getContext('2d');
      c.drawImage(layer, 0, 0);
      const r = previewRegion(cur);
      if (r && r.w > 0 && r.h > 0) {
        const eff = cur.erase ? null : effectFor(cur.style, cur.cell);
        applyStroke(c, cur, r, () => {
          const t = createCanvas(r.w, r.h);
          t.getContext('2d').drawImage(eff, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
          return t;
        }, sp);
      }
    }
    // Yalnız piksel deseni varsa keskin büyütülür (kareler bulanıklaşmasın).
    const all = cur ? [...painter.strokes, cur] : painter.strokes;
    ctx.imageSmoothingEnabled = all.some((s) => !s.erase && s.style !== 'pixel');
    ctx.drawImage(src, v.ox, v.oy, W * v.s, H * v.s);
  }

  function refreshHist() {
    hist?.update(painter.canUndo, painter.canRedo);
  }

  function mount(body) {
    body.classList.add('panel-paint');
    small = host.small(PREVIEW);
    sp = small.width / W;
    layer = createCanvas(small.width, small.height);
    host.viewer.setContent({ w: W, h: H, spec: () => defaultSpec(W, H) }, { keepView: true, singlePointer: 'none' });
    overlay = createOverlay(host, drawOverlay);
    painter = createPainter(host, {
      size: () => st.size,
      begin: () => ({ style: st.style, cell: st.cell, erase: st.erase }),
      onMove: () => overlay.invalidate(),
      onEnd: (s) => {
        commit(s);
        overlay.invalidate();
        refreshHist();
      },
    });

    const top = el('div', 'ctl-row paint-top');
    const mode = segmented(
      [{ id: 'paint', label: 'Fırça', icon: 'brush' }, { id: 'erase', label: 'Silgi', icon: 'eraser' }],
      'paint',
      (id) => {
        st.erase = id === 'erase';
        strip.el.classList.toggle('is-dim', st.erase);
      },
    );
    hist = historyButtons(icon, {
      onUndo: () => {
        painter.undo();
        rebuild();
      },
      onRedo: () => {
        painter.redo();
        rebuild();
      },
    });
    top.append(mode.el, hist.el);
    const size = labeled('Fırça', {
      min: BRUSH_MIN,
      max: BRUSH_MAX,
      value: st.size,
      def: 40,
      onInput: (v) => {
        st.size = v;
        painter.previewSize();
      },
    });
    const cell = labeled('Yoğunluk', {
      min: 1,
      max: 100,
      value: st.cell,
      def: 35,
      onInput: (v) => (st.cell = v),
    });
    const strip = itemStrip(STYLES, st.style, (id) => {
      st.style = id;
      if (st.erase) {
        st.erase = false;
        mode.set('paint');
        strip.el.classList.remove('is-dim');
      }
    });
    body.append(top, size.row, cell.row, strip.el);
    refreshHist();
  }

  // Tam çözünürlük: vuruşlar yalnız kapladıkları bölgede, özgün fotoğraftan.
  function render() {
    const src = host.image;
    const out = createCanvas(W, H);
    const o = out.getContext('2d');
    o.drawImage(src, 0, 0);
    const box = strokesBounds(painter.strokes, W, H, 4);
    if (!box) return out;
    const lay = createCanvas(box.w, box.h);
    const lc = lay.getContext('2d');
    const cache = new Map();
    for (const s of painter.strokes) {
      const b = strokesBounds([s], W, H, 2);
      if (!b) continue;
      applyStroke(lc, s, b, () => {
        const key = `${s.style}:${s.cell}:${b.x},${b.y},${b.w},${b.h}`;
        if (!cache.has(key)) cache.set(key, effectRegion(s.style, src, b.x, b.y, b.w, b.h, cellOf(s.cell, long)));
        return cache.get(key);
      }, 1, box.x, box.y);
    }
    o.drawImage(lay, box.x, box.y);
    return out;
  }

  return {
    title: 'Mozaik',
    mount,
    apply() {
      if (!painter.strokes.length) return null;
      return { label: 'Mozaik', render };
    },
    destroy() {
      painter?.destroy();
      overlay?.destroy();
      effects.clear();
    },
  };
}
