// G7X: derinliğe göre iki renk dönüşümü (uzak/yakın) + yumuşak geçiş, tam
// çözünürlüklü Meitu çıktısına (g7x.jpeg) oturtulur.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeAll, luma, DIR } from './veri.mjs';

// Kullanım: node tam-oturt.mjs [meitu-ciktisi.jpeg]  (önce: node derinlik.mjs)
const TARGET = process.argv[2] || 'g7x.jpeg';
const NAME = TARGET.replace(/\.[^.]+$/, '');

const PROJ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const { compileLook, applyPost } = await import(pathToFileURL(`${PROJ}/js/core/color.js`).href);
const { encodePng } = await import(pathToFileURL(`${PROJ}/tests/png.mjs`).href);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, 'olcum');

const [ref, out] = await decodeAll(['referans foto.jpeg', TARGET]);
const W = ref.w, H = ref.h;
const dj = JSON.parse(readFileSync(join(OUT, 'derinlik.json'), 'utf8'));
const dmap = new Uint8Array(readFileSync(join(OUT, 'derinlik.bin')));
// Gölgelendiricideki gibi çift doğrusal örnekleme (doku merkezleri).
const depthAt = (u, v) => {
  const x = Math.min(dj.w - 1, Math.max(0, u * dj.w - 0.5));
  const y = Math.min(dj.h - 1, Math.max(0, v * dj.h - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(dj.w - 1, x0 + 1), y1 = Math.min(dj.h - 1, y0 + 1);
  const tx = x - x0, ty = y - y0;
  const g = (xx, yy) => dmap[yy * dj.w + xx] / 255;
  return (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty;
};

// Örnekler: 3 pikselde bir (değerlendirme), eniyileme için alt küme.
const S = [];
for (let y = 1; y < H; y += 3) {
  for (let x = 1; x < W; x += 3) {
    const i = y * W + x;
    S.push({
      inp: [ref.px[i * 4] / 255, ref.px[i * 4 + 1] / 255, ref.px[i * 4 + 2] / 255],
      out: [out.px[i * 4] / 255, out.px[i * 4 + 1] / 255, out.px[i * 4 + 2] / 255],
      d: depthAt((x + 0.5) / W, (y + 0.5) / H),
      x, y,
    });
  }
}
// Ten pikselleri göz için en önemlisi ama yakın bölgede masa örtüsü ve gömleğin
// yanında azınlıkta kalıyor: kayıpta ağırlıkları artırılır.
for (const p of S) {
  const [r, g, b] = p.inp;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), ch = mx - mn;
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  const skin = r === mx && r > g && g > b && ch > 0.1 && L > 0.25 && L < 0.85 && (g - b) / ch > 0.15 && (g - b) / ch < 0.8;
  p.wt = skin && p.d > 0.45 ? 6 : 1;
}
const sub = S.filter((_, k) => k % 6 === 0);
console.log(`örnek: ${S.length}, eniyileme: ${sub.length}, ten ağırlıklı: ${sub.filter((p) => p.wt > 1).length}`);

const CX = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];
const HSL = [['red', 's'], ['orange', 's'], ['orange', 'l'], ['yellow', 's'], ['green', 's'], ['aqua', 'h'], ['aqua', 's'], ['blue', 'h'], ['blue', 's'], ['blue', 'l']];
const newLook = () => ({ curve: { r: CX.slice(), g: CX.slice(), b: CX.slice() }, saturation: 0, hsl: Object.fromEntries(HSL.map(([b, k]) => [`${b}.${k}`, 0])) });
const toLook = (P) => {
  const hsl = {};
  for (const [b, k] of HSL) {
    hsl[b] = hsl[b] || { h: 0, s: 0, l: 0 };
    hsl[b][k] = P.hsl[`${b}.${k}`];
  }
  return { saturation: P.saturation, hsl, curves: { r: CX.map((x, i) => [x, P.curve.r[i]]), g: CX.map((x, i) => [x, P.curve.g[i]]), b: CX.map((x, i) => [x, P.curve.b[i]]) } };
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const M = { bg: newLook(), fg: newLook(), center: 0.55, width: 0.2 };

function predict(Mod, set, outArr) {
  const kb = compileLook(toLook(Mod.bg)).post;
  const kf = compileLook(toLook(Mod.fg)).post;
  const cb = new Float64Array(3), cf = new Float64Array(3);
  let se = 0;
  let wsum = 0;
  set.forEach((p, n) => {
    cb[0] = cf[0] = p.inp[0]; cb[1] = cf[1] = p.inp[1]; cb[2] = cf[2] = p.inp[2];
    applyPost(cb, kb);
    applyPost(cf, kf);
    const w = smooth(Mod.center - Mod.width, Mod.center + Mod.width, p.d);
    for (let q = 0; q < 3; q++) {
      const v = cb[q] + (cf[q] - cb[q]) * w;
      if (outArr) outArr[n * 3 + q] = v;
      se += p.wt * (v - p.out[q]) ** 2;
    }
    wsum += p.wt;
  });
  return se / (wsum * 3);
}

function reg(Mod) {
  let r = 0;
  for (const L of [Mod.bg, Mod.fg]) {
    for (const ch of ['r', 'g', 'b']) {
      const y = L.curve[ch];
      for (let i = 1; i < y.length - 1; i++) r += (y[i - 1] - 2 * y[i] + y[i + 1]) ** 2 * 2e-3;
    }
    for (const v of Object.values(L.hsl)) r += (v / 100) ** 2 * 4e-4;
  }
  return r;
}
const loss = () => predict(M, sub) + reg(M);

function params(which) {
  const L = [];
  for (const key of which) {
    if (key === 'blend') {
      L.push({ get: () => M.center, set: (v) => (M.center = v), min: 0.05, max: 0.95, step: 0.05, minStep: 0.002 });
      L.push({ get: () => M.width, set: (v) => (M.width = v), min: 0.02, max: 0.5, step: 0.04, minStep: 0.002 });
      continue;
    }
    const Lk = M[key];
    for (const ch of ['r', 'g', 'b']) for (let i = 0; i < CX.length; i++) L.push({ get: () => Lk.curve[ch][i], set: (v) => (Lk.curve[ch][i] = v), min: 0, max: 1, step: 0.04, minStep: 0.001 });
    L.push({ get: () => Lk.saturation, set: (v) => (Lk.saturation = v), min: -100, max: 100, step: 10, minStep: 0.5 });
    for (const k of Object.keys(Lk.hsl)) L.push({ get: () => Lk.hsl[k], set: (v) => (Lk.hsl[k] = v), min: -60, max: 60, step: 10, minStep: 1 });
  }
  return L;
}

function descend(which, rounds = 50) {
  const P = params(which);
  let best = loss();
  for (let r = 0; r < rounds; r++) {
    let improved = false;
    for (const p of P) {
      for (const dir of [1, -1]) {
        let moved = false;
        for (;;) {
          const old = p.get();
          const nv = Math.min(p.max, Math.max(p.min, old + dir * p.step));
          if (nv === old) break;
          p.set(nv);
          const l = loss();
          if (l < best - 1e-10) { best = l; improved = moved = true; } else { p.set(old); break; }
        }
        if (moved) break;
      }
    }
    if (!improved) {
      let any = false;
      for (const p of P) if (p.step > p.minStep) { p.step /= 2; any = true; }
      if (!any) break;
    }
  }
  return best;
}

const t0 = Date.now();
// Önceki oturtmadan başla (varsa); yalnız yakın bölge ve geçiş yeniden ayarlanır.
try {
  const prev = JSON.parse(readFileSync(join(OUT, `-model.json`), 'utf8'));
  Object.assign(M, prev);
  console.log('önceki modelden başlanıyor');
  descend(['fg'], 40);
  descend(['blend'], 30);
  descend(['fg', 'blend'], 30);
} catch {
  descend(['bg', 'fg'], 30);
  descend(['blend'], 40);
  descend(['bg', 'fg', 'blend'], 40);
}
console.log(`bitti ${(Date.now() - t0) / 1000}s, geçiş merkez ${M.center.toFixed(3)} genişlik ${M.width.toFixed(3)}`);

// Değerlendirme: tüm örneklerde ΔE (CIE76), tek dönüşümle karşılaştırmalı.
const lab = (c) => {
  const lin = c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
  const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const pred = new Float64Array(S.length * 3);
predict(M, S, pred);
let de0 = 0, de1 = 0;
const deMap = new Float32Array(S.length);
S.forEach((p, n) => {
  const a = lab(p.out);
  const b = lab([pred[n * 3], pred[n * 3 + 1], pred[n * 3 + 2]]);
  const c = lab(p.inp);
  const e = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  deMap[n] = e;
  de1 += e;
  de0 += Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
});
console.log(`ΔE: filtresiz ${(de0 / S.length).toFixed(2)} → bizim ${(de1 / S.length).toFixed(2)}`);
const sorted = Float32Array.from(deMap).sort();
console.log(`ΔE dağılımı: %50 ${sorted[Math.floor(sorted.length * 0.5)].toFixed(2)}, %90 ${sorted[Math.floor(sorted.length * 0.9)].toFixed(2)}, %99 ${sorted[Math.floor(sorted.length * 0.99)].toFixed(2)}`);

writeFileSync(join(OUT, `-model.json`), JSON.stringify(M, null, 1));

// Görsel: tahmin edilen tam görüntü (3 pikselde bir örneklerden) ve hata haritası.
{
  const w = Math.ceil((W - 1) / 3), h = Math.ceil((H - 1) / 3);
  const img = new Uint8Array(w * h * 4), err = new Uint8Array(w * h * 4);
  S.forEach((p, n) => {
    const x = (p.x - 1) / 3, y = (p.y - 1) / 3;
    const o = (y * w + x) * 4;
    for (let q = 0; q < 3; q++) img[o + q] = Math.round(Math.min(1, Math.max(0, pred[n * 3 + q])) * 255);
    img[o + 3] = 255;
    const e = Math.min(255, deMap[n] * 18);
    err[o] = e; err[o + 1] = e; err[o + 2] = e; err[o + 3] = 255;
  });
  writeFileSync(join(OUT, `-tahmin.png`), encodePng(img, w, h));
  writeFileSync(join(OUT, `-hata.png`), encodePng(err, w, h));
}
