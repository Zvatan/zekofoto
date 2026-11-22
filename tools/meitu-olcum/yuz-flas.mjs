// G7x: derinlik modelinin Ã¼stÃ¼ne yÃ¼z merkezli hafif flaÅŸ â€” miktar ve boyut taramasÄ±.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeAll, DIR } from './veri.mjs';

// Kullanım: node yuz-flas.mjs [meitu-ciktisi.jpeg]  (önce: tam-oturt.mjs)
const TARGET = process.argv[2] || 'g7x.jpeg';
const NAME = TARGET.replace(/\.[^.]+$/, '');

const PROJ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const { compileLook, applyPost } = await import(pathToFileURL(`${PROJ}/js/core/color.js`).href);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, 'olcum');
const [ref, out] = await decodeAll(['referans foto.jpeg', TARGET]);
const W = ref.w, H = ref.h;
const M = JSON.parse(readFileSync(join(OUT, `-model.json`), 'utf8'));
const dj = JSON.parse(readFileSync(join(OUT, 'derinlik.json'), 'utf8'));
const dmap = new Uint8Array(readFileSync(join(OUT, 'derinlik.bin')));
const face = dj.faces[0];
const fcx = face.x + face.w / 2, fcy = face.y + face.h / 2;
const CX = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];
const toLook = (P) => {
  const hsl = {};
  for (const [k, v] of Object.entries(P.hsl)) {
    const [b, key] = k.split('.');
    hsl[b] = hsl[b] || { h: 0, s: 0, l: 0 };
    hsl[b][key] = v;
  }
  return { saturation: P.saturation, hsl, curves: { r: CX.map((x, i) => [x, P.curve.r[i]]), g: CX.map((x, i) => [x, P.curve.g[i]]), b: CX.map((x, i) => [x, P.curve.b[i]]) } };
};
const kb = compileLook(toLook(M.bg)).post, kf = compileLook(toLook(M.fg)).post;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const depthAt = (u, v) => {
  const x = Math.min(dj.w - 1, Math.max(0, u * dj.w - 0.5)), y = Math.min(dj.h - 1, Math.max(0, v * dj.h - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(dj.w - 1, x0 + 1), y1 = Math.min(dj.h - 1, y0 + 1);
  const tx = x - x0, ty = y - y0, g = (xx, yy) => dmap[yy * dj.w + xx] / 255;
  return (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty;
};
const lab = (c) => {
  const lin = c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
  const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
// Ã–n hesap: flaÅŸsÄ±z tahmin ve hedef Lab.
const S = [];
const cb = new Float64Array(3), cf = new Float64Array(3);
for (let y = 1; y < H; y += 3) {
  for (let x = 1; x < W; x += 3) {
    const i = (y * W + x) * 4;
    for (let q = 0; q < 3; q++) cb[q] = cf[q] = ref.px[i + q] / 255;
    applyPost(cb, kb);
    applyPost(cf, kf);
    const w = smooth(M.center - M.width, M.center + M.width, depthAt((x + 0.5) / W, (y + 0.5) / H));
    const p = [0, 1, 2].map((q) => cb[q] + (cf[q] - cb[q]) * w);
    const inFace = x > face.x && x < face.x + face.w && y > face.y && y < face.y + face.h;
    S.push({ p, t: lab([out.px[i] / 255, out.px[i + 1] / 255, out.px[i + 2] / 255]), dist: Math.hypot(x - fcx, y - fcy), inFace });
  }
}
const evalFlash = (a, size) => {
  let all = 0, fsum = 0, fn = 0;
  const R = size * face.h;
  for (const s of S) {
    const r = s.dist / R;
    const g = 1 + a * 0.5 * (1 - smooth(0, 1, r));
    const c = s.p.map((v) => Math.min(1, v * g));
    const L = lab(c);
    const e = Math.hypot(L[0] - s.t[0], L[1] - s.t[1], L[2] - s.t[2]);
    all += e;
    if (s.inFace) { fsum += e; fn++; }
  }
  return { all: all / S.length, face: fsum / fn };
};
const base = evalFlash(0, 1);
console.log(`flaÅŸsÄ±z: tÃ¼m ${base.all.toFixed(3)}, yÃ¼z ${base.face.toFixed(3)}`);
let best = { score: Infinity };
for (const a of [0.15, 0.2, 0.25, 0.3, 0.35, 0.4]) {
  for (const size of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
    const r = evalFlash(a, size);
    // Hem bÃ¼tÃ¼n gÃ¶rÃ¼ntÃ¼ hem yÃ¼z Ã¶nemli: ikisinin toplamÄ±.
    const score = r.all + r.face;
    if (score < best.score) best = { score, a, size, ...r };
  }
}
console.log(`en iyi: miktar ${best.a}, boyut ${best.size} â†’ tÃ¼m ${best.all.toFixed(3)}, yÃ¼z ${best.face.toFixed(3)}`);
