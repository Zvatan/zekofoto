// Fırçalı araçların ortak parçaları (Çizim, Mozaik, Silgi, Arka plan fırçası):
//  - tek parmakla boyama; vuruşlar görüntü pikselinde saklanır, böylece
//    önizlemeden bağımsız olarak tam çözünürlükte yeniden çizilebilir,
//  - iki parmakla yakınlaştırma/kaydırma görüntüleyicide kalır (ikinci parmak
//    değince yarım vuruş iptal edilir),
//  - fırça halkası, sahneyi kaplayan önizleme tuvali, vuruş geri al/yinele.
import { el } from '../ui.js';

// Fırça çapı ekran pikseli olarak seçilir; yakınlaştırınca görüntüde incelir.
export const BRUSH_MIN = 8;
export const BRUSH_MAX = 90;

// Vuruşu bir 2B bağlama çizer. s: görüntü pikselinden hedef piksele ölçek,
// ox/oy: hedefte görüntünün (0, 0) noktası. Tek noktalı vuruş daire olur.
export function tracePath(ctx, pts, s = 1, ox = 0, oy = 0) {
  ctx.beginPath();
  ctx.moveTo(ox + pts[0][0] * s, oy + pts[0][1] * s);
  if (pts.length === 1) {
    ctx.lineTo(ox + pts[0][0] * s + 0.01, oy + pts[0][1] * s);
    return;
  }
  // Orta noktalardan geçen ikinci derece eğriler: köşesiz, akıcı çizgi.
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    ctx.quadraticCurveTo(ox + x0 * s, oy + y0 * s, ox + ((x0 + x1) / 2) * s, oy + ((y0 + y1) / 2) * s);
  }
  const [xl, yl] = pts[pts.length - 1];
  ctx.lineTo(ox + xl * s, oy + yl * s);
}

// Vuruşların kapladığı dikdörtgen (görüntü pikseli, kalınlık dahil).
export function strokesBounds(strokes, W, H, pad = 2) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes) {
    const r = s.width / 2 + pad + (s.extra || 0);
    for (const [x, y] of s.points) {
      x0 = Math.min(x0, x - r);
      y0 = Math.min(y0, y - r);
      x1 = Math.max(x1, x + r);
      y1 = Math.max(y1, y + r);
    }
  }
  if (x0 === Infinity) return null;
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(W, Math.ceil(x1));
  y1 = Math.min(H, Math.ceil(y1));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

// Sahneyi kaplayan, cihaz pikselinde bir önizleme tuvali. draw(ctx, view)
// her yerleşim değişiminde ve invalidate() çağrısında yeniden çizer;
// view = { s, ox, oy }: görüntü pikselinden tuval pikseline dönüşüm.
export function createOverlay(host, draw) {
  let canvas = el('canvas', 'paint-ov');
  host.overlay.append(canvas);
  let ctx = canvas.getContext('2d');
  let frame = 0;
  let dpr = 1;
  let fresh = false;

  function view() {
    const r = host.viewer.imageRect();
    return { s: r.scale * dpr, ox: r.left * dpr, oy: r.top * dpr, rect: r, dpr };
  }

  function render() {
    frame = 0;
    if (fresh) {
      // Yeni tuval öğesi: eski arabellekten hiçbir şey kalmaz.
      fresh = false;
      const c = el('canvas', 'paint-ov');
      canvas.replaceWith(c);
      canvas.width = canvas.height = 0;
      canvas = c;
      ctx = c.getContext('2d');
    }
    const st = host.stage;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(st.clientWidth * dpr);
    const h = Math.round(st.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    } else {
      ctx.clearRect(0, 0, w, h);
    }
    ctx.save();
    draw(ctx, view());
    ctx.restore();
  }

  // reset: tuval öğesi yenisiyle değiştirilir. Uzun bir işten (ör. yapay
  // zekâyla silme) sonra Chrome'un eski kareyi göstermeye devam ettiği görüldü;
  // ne clearRect ne boyut ataması bunu gideriyordu.
  function invalidate(reset = false) {
    if (reset) fresh = true;
    if (!frame) frame = requestAnimationFrame(render);
  }

  const off = host.viewer.onLayout(() => invalidate());
  invalidate();
  return {
    get canvas() {
      return canvas;
    },
    invalidate,
    render,
    destroy() {
      off();
      cancelAnimationFrame(frame);
      canvas.remove();
    },
  };
}

// Tek parmakla boyama. begin(point) yeni vuruşun ek bilgisini döner (renk,
// kip vb.); onMove(stroke) çizim sırasında, onEnd(stroke) parmak kalkınca
// çağrılır. size(): fırça çapı (ekran pikseli).
export function createPainter(host, { size, begin = () => ({}), onMove, onEnd, enabled = () => true } = {}) {
  const stage = host.stage;
  const strokes = [];
  const undone = [];
  let cur = null;
  let ring = null;

  const toImage = (e) => {
    const b = stage.getBoundingClientRect();
    const [u, v] = host.viewer.toOutput(e.clientX - b.left, e.clientY - b.top);
    return [u * host.viewer.content.w, v * host.viewer.content.h];
  };

  function showRing(e, d) {
    if (!ring) {
      ring = el('div', 'brush-ring');
      host.overlay.append(ring);
    }
    const b = stage.getBoundingClientRect();
    ring.style.width = ring.style.height = `${d}px`;
    ring.style.transform = `translate(${e.clientX - b.left - d / 2}px, ${e.clientY - b.top - d / 2}px)`;
    ring.hidden = false;
  }

  function hideRing() {
    if (ring) ring.hidden = true;
  }

  function cancel() {
    if (!cur) return;
    cur = null;
    hideRing();
    onMove?.(null);
  }

  function down(e) {
    if (e.button > 0 || !enabled()) return;
    // Görüntüleyici olayı önce aldı: ikinci parmaksa yakınlaştırmadır.
    if (host.viewer.pointers.size > 1) {
      cancel();
      return;
    }
    const d = size();
    const scale = host.viewer.imageRect().scale;
    const meta = begin(toImage(e));
    if (meta === false) return;
    cur = { id: e.pointerId, width: d / scale, points: [toImage(e)], ...meta };
    showRing(e, d);
    onMove?.(cur);
  }

  function move(e) {
    if (!cur || e.pointerId !== cur.id) return;
    if (host.viewer.isGesturing) {
      cancel();
      return;
    }
    const p = toImage(e);
    const last = cur.points[cur.points.length - 1];
    const step = Math.max(0.75, cur.width * 0.08);
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < step) return;
    cur.points.push(p);
    showRing(e, size());
    onMove?.(cur);
  }

  function up(e) {
    if (!cur || e.pointerId !== cur.id) return;
    const s = cur;
    cur = null;
    hideRing();
    delete s.id;
    strokes.push(s);
    undone.length = 0;
    onEnd?.(s);
  }

  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', cancel);

  return {
    strokes,
    get current() {
      return cur;
    },
    get canUndo() {
      return strokes.length > 0;
    },
    get canRedo() {
      return undone.length > 0;
    },
    undo() {
      if (strokes.length) undone.push(strokes.pop());
    },
    redo() {
      if (undone.length) strokes.push(undone.pop());
    },
    clear() {
      strokes.length = 0;
      undone.length = 0;
    },
    // Fırça boyutu değişince sahnenin ortasında halka gösterir.
    previewSize() {
      const b = stage.getBoundingClientRect();
      const d = size();
      showRing({ clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }, d);
      clearTimeout(this._t);
      this._t = setTimeout(hideRing, 700);
    },
    destroy() {
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', cancel);
      ring?.remove();
    },
  };
}

// Geri al / yinele düğmeleri (araç panelinin başında).
export function historyButtons(icon, { onUndo, onRedo }) {
  const wrap = el('div', 'paint-hist');
  wrap.innerHTML =
    `<button class="icon-btn icon-btn--small" data-h="undo" aria-label="Geri al">${icon('undo')}</button>` +
    `<button class="icon-btn icon-btn--small" data-h="redo" aria-label="Yinele">${icon('redo')}</button>`;
  const u = wrap.querySelector('[data-h="undo"]');
  const r = wrap.querySelector('[data-h="redo"]');
  u.addEventListener('click', onUndo);
  r.addEventListener('click', onRedo);
  return {
    el: wrap,
    update(canUndo, canRedo) {
      u.disabled = !canUndo;
      r.disabled = !canRedo;
    },
  };
}
