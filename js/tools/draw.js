// Çizim: kalem, neon, fosforlu kalem, kesik çizgi ve gökkuşağı fırçaları;
// silgi yalnız çizimi siler (fotoğrafa dokunmaz). Vuruşlar vektör olarak
// saklanır: önizleme her yakınlaştırmada ekran çözünürlüğünde, çıktı tam
// çözünürlükte çizilir.
import { el, icon } from '../ui.js';
import { createCanvas } from '../image-io.js';
import { defaultSpec } from '../gl/engine.js';
import { createPainter, createOverlay, tracePath, strokesBounds, historyButtons, BRUSH_MIN, BRUSH_MAX } from './paint.js';
import { labeled, itemStrip, palette } from './kit.js';

const BRUSHES = [
  { id: 'pen', label: 'Kalem', icon: 'pen' },
  { id: 'neon', label: 'Neon', icon: 'neon' },
  { id: 'marker', label: 'Fosforlu', icon: 'marker' },
  { id: 'dash', label: 'Kesik', icon: 'dash' },
  { id: 'rainbow', label: 'Gökkuşağı', icon: 'rainbow' },
  { id: 'erase', label: 'Silgi', icon: 'eraser' },
];

// Bir vuruşu çizer: hedefte görüntü pikseli s ölçeğinde, (0, 0) noktası (ox, oy).
export function drawStroke(ctx, st, s, ox, oy) {
  const w = st.width * s;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  ctx.globalAlpha = st.opacity ?? 1;
  if (st.brush === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    tracePath(ctx, st.points, s, ox, oy);
    ctx.stroke();
  } else if (st.brush === 'neon') {
    // Renkli parıltı + beyaza yakın çekirdek.
    ctx.strokeStyle = st.color;
    ctx.shadowColor = st.color;
    ctx.shadowBlur = w * 1.1;
    ctx.lineWidth = w * 0.7;
    tracePath(ctx, st.points, s, ox, oy);
    ctx.stroke();
    ctx.stroke();
    ctx.shadowBlur = w * 0.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = w * 0.28;
    ctx.stroke();
  } else if (st.brush === 'marker') {
    ctx.globalAlpha = 0.45 * (st.opacity ?? 1);
    ctx.lineCap = 'square';
    ctx.strokeStyle = st.color;
    tracePath(ctx, st.points, s, ox, oy);
    ctx.stroke();
  } else if (st.brush === 'dash') {
    ctx.strokeStyle = st.color;
    ctx.setLineDash([w * 1.5, w * 1.6]);
    tracePath(ctx, st.points, s, ox, oy);
    ctx.stroke();
  } else if (st.brush === 'rainbow') {
    // Renk tonu çizgi boyunca döner (görüntü pikseline bağlı, ölçekten bağımsız).
    let len = 0;
    const p = st.points;
    if (p.length === 1) {
      ctx.strokeStyle = 'hsl(0 100% 55%)';
      tracePath(ctx, p, s, ox, oy);
      ctx.stroke();
    }
    for (let i = 1; i < p.length; i++) {
      const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      ctx.strokeStyle = `hsl(${((len / (st.width * 6)) * 60) % 360} 100% 55%)`;
      ctx.beginPath();
      ctx.moveTo(ox + p[i - 1][0] * s, oy + p[i - 1][1] * s);
      ctx.lineTo(ox + p[i][0] * s, oy + p[i][1] * s);
      ctx.stroke();
      len += d;
    }
  } else {
    ctx.strokeStyle = st.color;
    tracePath(ctx, st.points, s, ox, oy);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTool(host) {
  const W = host.W;
  const H = host.H;
  const st = { brush: 'pen', color: '#ff3b30', size: 14, opacity: 100 };
  let painter = null;
  let overlay = null;
  let hist = null;
  let colors = null;

  function drawOverlay(ctx, v) {
    if (!painter) return;
    const all = painter.current ? [...painter.strokes, painter.current] : painter.strokes;
    for (const s of all) drawStroke(ctx, s, v.s, v.ox, v.oy);
  }

  function refresh() {
    hist?.update(painter.canUndo, painter.canRedo);
    overlay.invalidate();
  }

  function mount(body) {
    body.classList.add('panel-paint');
    host.viewer.setContent({ w: W, h: H, spec: () => defaultSpec(W, H) }, { keepView: true, singlePointer: 'none' });
    overlay = createOverlay(host, drawOverlay);
    painter = createPainter(host, {
      size: () => st.size,
      begin: () => ({
        brush: st.brush,
        color: st.color,
        opacity: st.opacity / 100,
        extra: 0,
      }),
      onMove: (s) => {
        if (s && s.brush === 'neon') s.extra = s.width * 1.6;
        overlay.invalidate();
      },
      onEnd: refresh,
    });

    const top = el('div', 'ctl-row paint-top');
    colors = palette(st.color, (c) => (st.color = c));
    hist = historyButtons(icon, {
      onUndo: () => {
        painter.undo();
        refresh();
      },
      onRedo: () => {
        painter.redo();
        refresh();
      },
    });
    top.append(colors.el, hist.el);
    const size = labeled('Kalınlık', {
      min: 2,
      max: BRUSH_MAX,
      value: st.size,
      def: 14,
      onInput: (v) => {
        st.size = v;
        painter.previewSize();
      },
    });
    const op = labeled('Saydamlık', {
      min: 10,
      max: 100,
      value: st.opacity,
      def: 100,
      fmt: (v) => `%${Math.round(v)}`,
      onInput: (v) => (st.opacity = v),
    });
    const strip = itemStrip(BRUSHES, st.brush, (id) => {
      st.brush = id;
      colors.el.classList.toggle('is-dim', id === 'rainbow' || id === 'erase');
      op.row.classList.toggle('is-dim', id === 'erase');
    });
    body.append(top, size.row, op.row, strip.el);
    refresh();
    void BRUSH_MIN;
  }

  function render() {
    const out = createCanvas(W, H);
    const o = out.getContext('2d');
    o.drawImage(host.image, 0, 0);
    const strokes = painter.strokes.map((s) => (s.brush === 'neon' ? { ...s, extra: s.width * 1.6 } : s));
    const box = strokesBounds(strokes, W, H, 4);
    if (!box) return out;
    // Silgi yalnız çizimi silsin diye vuruşlar ayrı bir katmanda toplanır.
    const lay = createCanvas(box.w, box.h);
    const lc = lay.getContext('2d');
    for (const s of strokes) drawStroke(lc, s, 1, -box.x, -box.y);
    o.drawImage(lay, box.x, box.y);
    return out;
  }

  return {
    title: 'Çizim',
    mount,
    apply() {
      if (!painter.strokes.some((s) => s.brush !== 'erase')) return null;
      return { label: 'Çizim', render };
    },
    destroy() {
      painter?.destroy();
      overlay?.destroy();
    },
  };
}
