// Fotoğraf sahnesi: tuval boyutu, sığdırma, iki parmakla yakınlaştırma ve
// kaydırma, çift dokunuşla yakınlaştırma, karşılaştırma ve çizim zamanlaması.
//
// İçerik, bir aracın çıktısıdır: { w, h } piksel boyutu ve çizim tarifini
// veren spec(compare) fonksiyonu. Yakınlaştırınca önizleme ekran
// çözünürlüğünde yeniden çizilir (bulanık büyütme yok).

const MAX_DPR = 3;
const MAX_CANVAS = 2800;

export class Viewer {
  constructor(stage, engine) {
    this.stage = stage;
    this.engine = engine;
    this.canvas = engine.canvas;
    this.content = null;
    this.zoom = 1;
    this.pan = [0, 0];
    this.padding = 12;
    this.comparing = false;
    this.listeners = new Set();
    this.pointers = new Map();
    this.gesture = null;
    this.lastTap = { t: 0, x: 0, y: 0 };
    this.singlePointer = 'pan'; // 'pan' | 'none' (araç tek parmağı kendisi kullanır)
    this.frame = 0;
    this.dpr = 1;

    new ResizeObserver(() => this._resize()).observe(stage);
    stage.addEventListener('pointerdown', (e) => this._down(e));
    stage.addEventListener('pointermove', (e) => this._move(e));
    stage.addEventListener('pointerup', (e) => this._up(e));
    stage.addEventListener('pointercancel', (e) => this._up(e));
    // iOS Safari'nin sayfa yakınlaştırma hareketini engelle.
    stage.addEventListener('gesturestart', (e) => e.preventDefault());
    this._resize();
  }

  // content: { w, h, spec(compare) => spec, compare?: { w, h, spec } }
  setContent(content, { keepView = false, padding = 12, singlePointer = 'pan' } = {}) {
    const sameSize = this.content && content && this.content.w === content.w && this.content.h === content.h;
    this.content = content;
    this.padding = padding;
    this.singlePointer = singlePointer;
    if (!keepView || !sameSize) {
      this.zoom = 1;
      this.pan = [0, 0];
    }
    this._emit();
    this.invalidate();
  }

  onLayout(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    const r = this.imageRect();
    for (const fn of this.listeners) fn(r);
  }

  setCompare(on) {
    if (this.comparing === on) return;
    this.comparing = on;
    this.stage.classList.toggle('is-comparing', on);
    this.invalidate();
  }

  // --- yerleşim -----------------------------------------------------------

  _resize() {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (!w || !h) return;
    let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    dpr = Math.min(dpr, MAX_CANVAS / Math.max(w, h));
    this.dpr = dpr;
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this._clampPan();
    this._emit();
    this.render();
  }

  _dims() {
    const c = this.comparing && this.content?.compare ? this.content.compare : this.content;
    return c ? [c.w, c.h] : [1, 1];
  }

  fitScale(w = this._dims()[0], h = this._dims()[1]) {
    const W = this.stage.clientWidth - this.padding * 2;
    const H = this.stage.clientHeight - this.padding * 2;
    return Math.max(1e-6, Math.min(W / w, H / h));
  }

  maxZoom() {
    return Math.min(12, Math.max(2, 2 / this.fitScale()));
  }

  // İçeriğin sahnedeki yeri (CSS pikseli).
  imageRect() {
    const [w, h] = this._dims();
    const zoom = this.comparing && this.content?.compare ? 1 : this.zoom;
    const pan = this.comparing && this.content?.compare ? [0, 0] : this.pan;
    const s = this.fitScale(w, h) * zoom;
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    return {
      left: (W - w * s) / 2 + pan[0],
      top: (H - h * s) / 2 + pan[1],
      width: w * s,
      height: h * s,
      scale: s,
    };
  }

  toScreen(u, v) {
    const r = this.imageRect();
    return [r.left + u * r.width, r.top + v * r.height];
  }

  toOutput(x, y) {
    const r = this.imageRect();
    return [(x - r.left) / r.width, (y - r.top) / r.height];
  }

  _clampPan() {
    const [w, h] = this._dims();
    const s = this.fitScale(w, h) * this.zoom;
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    const lim = (size, view) => Math.max(0, (size - view) / 2 + this.padding);
    const lx = lim(w * s, W);
    const ly = lim(h * s, H);
    this.pan[0] = Math.min(lx, Math.max(-lx, this.pan[0]));
    this.pan[1] = Math.min(ly, Math.max(-ly, this.pan[1]));
  }

  setZoom(z, cx, cy) {
    const before = this.toOutput(cx, cy);
    this.zoom = Math.min(this.maxZoom(), Math.max(1, z));
    const r = this.imageRect();
    const after = [r.left + before[0] * r.width, r.top + before[1] * r.height];
    this.pan[0] += cx - after[0];
    this.pan[1] += cy - after[1];
    this._clampPan();
    this._emit();
    this.invalidate();
  }

  resetView() {
    this.zoom = 1;
    this.pan = [0, 0];
    this._emit();
    this.invalidate();
  }

  // --- çizim --------------------------------------------------------------

  invalidate() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  render() {
    if (!this.content) return;
    const useCmp = this.comparing && this.content.compare;
    const spec = useCmp ? this.content.compare.spec() : this.content.spec(this.comparing);
    if (!spec) return;
    const r = this.imageRect();
    const d = this.dpr;
    const view = [1 / (d * r.width), 1 / (d * r.height), -r.left / r.width, -r.top / r.height];
    this.engine.renderView(spec, view, Math.round(9 * d));
  }

  // --- hareketler ---------------------------------------------------------

  _local(e) {
    const b = this.stage.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  }

  _down(e) {
    if (e.button > 0) return;
    this.stage.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, this._local(e));
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = {
        type: 'pinch',
        d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1,
        z0: this.zoom,
        c0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        o0: this.toOutput((a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
      };
      return;
    }
    if (this.pointers.size !== 1) return;
    const [x, y] = this._local(e);
    const now = performance.now();
    if (this.singlePointer === 'pan' && now - this.lastTap.t < 300 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 30) {
      this.lastTap.t = 0;
      if (this.zoom > 1.01) this.resetView();
      else this.setZoom(Math.min(this.maxZoom(), 2.5), x, y);
      this.gesture = null;
      return;
    }
    this.lastTap = { t: now, x, y };
    if (this.singlePointer === 'pan' && this.zoom > 1.01) {
      this.gesture = { type: 'pan', start: [x, y], pan0: this.pan.slice() };
    }
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, this._local(e));
    const g = this.gesture;
    if (!g) return;
    if (g.type === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      this.zoom = Math.min(this.maxZoom(), Math.max(1, (g.z0 * d) / g.d0));
      const r = this.imageRect();
      // Parmakların başta tuttuğu nokta parmakların ortasında kalsın.
      this.pan[0] += c[0] - (r.left + g.o0[0] * r.width);
      this.pan[1] += c[1] - (r.top + g.o0[1] * r.height);
      this._clampPan();
      this._emit();
      this.invalidate();
    } else if (g.type === 'pan') {
      const [x, y] = this._local(e);
      this.pan = [g.pan0[0] + x - g.start[0], g.pan0[1] + y - g.start[1]];
      this._clampPan();
      this._emit();
      this.invalidate();
    }
  }

  _up(e) {
    this.pointers.delete(e.pointerId);
    if (this.gesture?.type === 'pinch' && this.pointers.size === 1) {
      // Bir parmak kalkınca kalan parmakla kaydırmaya devam.
      const [p] = [...this.pointers.values()];
      this.gesture = this.zoom > 1.01 && this.singlePointer === 'pan' ? { type: 'pan', start: p, pan0: this.pan.slice() } : null;
      return;
    }
    if (!this.pointers.size) {
      this.gesture = null;
      if (this.zoom < 1.03 && this.zoom !== 1) this.resetView();
    }
  }

  get isGesturing() {
    return this.pointers.size > 1 || this.gesture?.type === 'pinch';
  }
}
