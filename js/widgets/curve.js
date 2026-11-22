// Eğri düzenleyici: fotoğrafın üstünde yarı saydam kare.
// Boş yere dokununca nokta eklenir, nokta sürüklenir; uç olmayan bir nokta
// kutunun dışına çekilip bırakılırsa ya da çift dokunulursa silinir.
import { curveTable } from '../core/color.js';

const COLORS = { rgb: '#ffffff', r: '#ff5a5a', g: '#4fdc6a', b: '#5a8dff' };
const HIT = 24;

export function createCurveEditor({ onChange }) {
  const root = document.createElement('div');
  root.className = 'curve-editor';
  const canvas = document.createElement('canvas');
  root.append(canvas);
  const ctx = canvas.getContext('2d');

  let channel = 'rgb';
  let curves = { rgb: [[0, 0], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] };
  let hist = null;
  let drag = null;
  let lastTap = { t: 0, i: -1 };

  function size() {
    const r = root.getBoundingClientRect();
    return Math.max(1, Math.min(r.width, r.height));
  }

  function toPx(p, s) {
    return [p[0] * s, (1 - p[1]) * s];
  }

  function draw() {
    const s = size();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(s * dpr)) {
      canvas.width = Math.round(s * dpr);
      canvas.height = Math.round(s * dpr);
      canvas.style.width = `${s}px`;
      canvas.style.height = `${s}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(10,10,14,0.55)';
    ctx.fillRect(0, 0, s, s);
    if (hist) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      const m = Math.max(...hist) || 1;
      const bw = s / hist.length;
      hist.forEach((v, i) => {
        const h = (v / m) * s * 0.85;
        ctx.fillRect(i * bw, s - h, bw + 0.5, h);
      });
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      ctx.moveTo((s * i) / 4, 0);
      ctx.lineTo((s * i) / 4, s);
      ctx.moveTo(0, (s * i) / 4);
      ctx.lineTo(s, (s * i) / 4);
    }
    ctx.moveTo(0, s);
    ctx.lineTo(s, 0);
    ctx.stroke();

    const plot = (ch, alpha, width) => {
      const tab = curveTable(curves[ch], 256);
      ctx.strokeStyle = COLORS[ch];
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * s;
        const y = (1 - tab[i]) * s;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    for (const ch of ['rgb', 'r', 'g', 'b']) if (ch !== channel) plot(ch, 0.28, 1.2);
    plot(channel, 1, 2.2);

    const pts = curves[channel];
    pts.forEach((p, i) => {
      const [x, y] = toPx(p, s);
      ctx.beginPath();
      ctx.arc(x, y, drag && drag.i === i ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = drag && drag.i === i && drag.out ? 'rgba(255,90,95,0.9)' : COLORS[channel];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
    });
  }

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function emit() {
    onChange?.(channel, curves[channel].map((p) => p.slice()));
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    const s = size();
    const [x, y] = local(e);
    const pts = curves[channel];
    let best = -1;
    let bd = HIT;
    pts.forEach((p, i) => {
      const [px, py] = toPx(p, s);
      const d = Math.hypot(px - x, py - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    const now = performance.now();
    if (best >= 0 && now - lastTap.t < 320 && lastTap.i === best && best > 0 && best < pts.length - 1) {
      pts.splice(best, 1);
      lastTap = { t: 0, i: -1 };
      emit();
      draw();
      return;
    }
    if (best < 0) {
      const nx = Math.min(1, Math.max(0, x / s));
      if (pts.some((p) => Math.abs(p[0] - nx) < 0.03)) return;
      const ny = Math.min(1, Math.max(0, 1 - y / s));
      pts.push([nx, ny]);
      pts.sort((a, b) => a[0] - b[0]);
      best = pts.findIndex((p) => p[0] === nx);
      emit();
    }
    lastTap = { t: now, i: best };
    drag = { i: best, out: false };
    draw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    e.stopPropagation();
    const s = size();
    const [x, y] = local(e);
    const pts = curves[channel];
    const i = drag.i;
    const end = i === 0 || i === pts.length - 1;
    drag.out = !end && (y < -32 || y > s + 32 || x < -32 || x > s + 32);
    const lo = i > 0 ? pts[i - 1][0] + 0.01 : 0;
    const hi = i < pts.length - 1 ? pts[i + 1][0] - 0.01 : 1;
    pts[i] = [Math.min(hi, Math.max(lo, x / s)), Math.min(1, Math.max(0, 1 - y / s))];
    emit();
    draw();
  });

  const up = (e) => {
    if (!drag) return;
    e.stopPropagation();
    if (drag.out) {
      curves[channel].splice(drag.i, 1);
      emit();
    }
    drag = null;
    draw();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  new ResizeObserver(draw).observe(root);

  return {
    el: root,
    setChannel(ch) {
      channel = ch;
      draw();
    },
    setCurves(c) {
      curves = { rgb: c.rgb.map((p) => p.slice()), r: c.r.map((p) => p.slice()), g: c.g.map((p) => p.slice()), b: c.b.map((p) => p.slice()) };
      draw();
    },
    setHistogram(h) {
      hist = h;
      draw();
    },
  };
}
