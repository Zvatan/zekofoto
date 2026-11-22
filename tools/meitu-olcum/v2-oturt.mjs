// "v2" oturtma (ör. G7X v2): tam-oturt.mjs'in uzak/yakın tariflerinden başlar ve
// Meitu çıktısına daha ayrıntılı oturtur. Motorun sırasıyla:
//   renk = karışım(uzak(c), yakın(c), w(derinlik)) → yüz elipsinde yüz(c) ile karışım
//   her bölge = tarif (eğriler, doygunluk, HSL) + 5³ renk düzeltme ızgarası
//   × derinliğe göre ışık eğrisi × yüz flaşı × vinyet
// Oturtma Meitu'nun gücündedir; "Meitu %70'te yakalansın" gibi ölçek uygulamada
// (extras.meituAt) yapılır.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeAll, DIR, REF } from './veri.mjs';

// Kullanım: node v2-oturt.mjs [meitu-ciktisi.jpeg] [meitu-yoğunluğu=0.7]
// (önce: node derinlik.mjs, node tam-oturt.mjs <dosya>)
const TARGET = process.argv[2] || 'g7x.jpeg';
const AT = Number(process.argv[3] || 0.7);
const NAME = TARGET.replace(/\.[^.]+$/, '');

const PROJ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const { compileLook, applyPost } = await import(pathToFileURL(`${PROJ}/js/core/color.js`).href);
const OUT = join(DIR, 'olcum');

const [ref, meitu] = await decodeAll([REF, TARGET]);
const W = ref.w, H = ref.h, NP = W * H;
const dj = JSON.parse(readFileSync(join(OUT, 'derinlik.json'), 'utf8'));
const dmap = new Uint8Array(readFileSync(join(OUT, 'derinlik.bin')));
let V1;
try {
  V1 = JSON.parse(readFileSync(join(OUT, `${NAME}-model.json`), 'utf8'));
} catch {
  console.error(`olcum/${NAME}-model.json yok: önce node tam-oturt.mjs ${TARGET}`);
  process.exit(1);
}
const face = dj.faces?.[0] || null;

const GK = [0, 0.15, 0.3, 0.4, 0.5, 0.6, 0.75, 1]; // ışık eğrisi düğümleri (shaders.js → GK)
const GN = 5; // düzeltme ızgarası: GN³ düğüm
const CX = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];
const clone = (o) => JSON.parse(JSON.stringify(o));
const toLook = (P) => {
  const hsl = {};
  for (const [k, v] of Object.entries(P.hsl)) {
    const [b, key] = k.split('.');
    hsl[b] = hsl[b] || { h: 0, s: 0, l: 0 };
    hsl[b][key] = v;
  }
  return { saturation: P.saturation, hsl, curves: { r: CX.map((x, i) => [x, P.curve.r[i]]), g: CX.map((x, i) => [x, P.curve.g[i]]), b: CX.map((x, i) => [x, P.curve.b[i]]) } };
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
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
const gainAt = (G, d) => {
  for (let i = 0; i < GK.length - 1; i++) if (d <= GK[i + 1]) return G[i] + (G[i + 1] - G[i]) * ((d - GK[i]) / (GK[i + 1] - GK[i]));
  return G[GK.length - 1];
};
// Izgaranın üç doğrusal ağırlıkları (8 düğüm); color.js → sampleGrid ile aynı.
const gridW = (c) => {
  const f = c.map((v) => Math.min(GN - 1.0001, Math.max(0, v * (GN - 1))));
  const i0 = f.map(Math.floor), t = f.map((v, k) => v - i0[k]);
  const idx = [], w = [];
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    idx.push((i0[2] + dz) * GN * GN + (i0[1] + dy) * GN + (i0[0] + dx));
    w.push((dx ? t[0] : 1 - t[0]) * (dy ? t[1] : 1 - t[1]) * (dz ? t[2] : 1 - t[2]));
  }
  return { idx, w };
};
const gridAt = (R, gw, q) => { let s = 0; for (let k = 0; k < 8; k++) s += R[gw.idx[k] * 3 + q] * gw.w[k]; return s; };

// 5×5 kutu ortalaması: ince doku ve iki JPEG'in sıkıştırma izi oturtmayı bozmasın.
const boxImg = (img) => {
  const tmp = new Float32Array(NP * 3), out = new Float32Array(NP * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += img.px[(y * W + Math.min(W - 1, Math.max(0, x + k))) * 4 + c];
    tmp[(y * W + x) * 3 + c] = s / 5 / 255;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += tmp[(Math.min(H - 1, Math.max(0, y + k)) * W + x) * 3 + c];
    out[(y * W + x) * 3 + c] = s / 5;
  }
  return out;
};
const RB = boxImg(ref), MB = boxImg(meitu);
// Yüz elipsi (shaders.js → uFaceBox): yarıçaplar kutunun 0,55 katı.
const fcx = face ? face.x + face.w / 2 : 0, fcy = face ? face.y + face.h / 2 : 0;
const faceMaskAt = (x, y) => (face ? 1 - smooth(0.75, 1.1, Math.hypot((x - fcx) / (face.w * 0.55), (y - fcy) / (face.h * 0.55))) : 0);
const asp = [W / Math.max(W, H), H / Math.max(W, H)], alen = Math.hypot(...asp);
const vigAt = (u, v, amt) => {
  if (!amt) return 1;
  const r = Math.hypot((u - 0.5) * 2 * asp[0], (v - 0.5) * 2 * asp[1]) / alen;
  let m = smooth(0.3, 1.2, r);
  m *= m;
  return 1 - amt * m * 0.9;
};

// Örnekler: 3 pikselde bir (değerlendirme), eniyileme için beşte biri.
const S = [];
for (let y = 2; y < H - 2; y += 3) {
  for (let x = 2; x < W - 2; x += 3) {
    const i = y * W + x;
    const c = [RB[i * 3], RB[i * 3 + 1], RB[i * 3 + 2]];
    S.push({
      x, y, u: (x + 0.5) / W, v: (y + 0.5) / H, c, gw: gridW(c),
      t: [MB[i * 3], MB[i * 3 + 1], MB[i * 3 + 2]],
      d: depthAt((x + 0.5) / W, (y + 0.5) / H), fm: faceMaskAt(x, y), dist: face ? Math.hypot(x - fcx, y - fcy) : 1e9,
      raw: [ref.px[i * 4] / 255, ref.px[i * 4 + 1] / 255, ref.px[i * 4 + 2] / 255],
      traw: [meitu.px[i * 4] / 255, meitu.px[i * 4 + 1] / 255, meitu.px[i * 4 + 2] / 255],
    });
  }
}
const sub = S.filter((_, k) => k % 5 === 0);
console.log(`örnek ${S.length}, eniyileme ${sub.length}, yüz ${S.filter((s) => s.fm > 0.5).length}`);

const M = {
  bg: clone(V1.bg), fg: clone(V1.fg), face: clone(V1.fg),
  Rbg: new Array(GN ** 3 * 3).fill(0), Rfg: new Array(GN ** 3 * 3).fill(0), Rface: new Array(GN ** 3 * 3).fill(0),
  center: V1.center, width: V1.width, G: GK.map(() => 1), flash: face ? 0.3 : 0, fsize: 0.7, vig: 0,
};

const REGIONS = ['bg', 'fg', 'face'];
// rcs[n][r]: n. örneğin r. bölge tarifinden geçmiş rengi. only: yalnız o bölge yenilenir.
function regionColors(set, rcs = null, only = null) {
  const out = rcs || set.map(() => [null, null, null]);
  const tmp = new Float64Array(3);
  REGIONS.forEach((name, r) => {
    if (only !== null && only !== r) return;
    const k = compileLook(toLook(M[name])).post;
    set.forEach((s, n) => { tmp.set(s.c); applyPost(tmp, k); out[n][r] = [tmp[0], tmp[1], tmp[2]]; });
  });
  return out;
}
const lightAt = (s) => gainAt(M.G, s.d) * (1 + M.flash * 0.5 * (1 - smooth(0, 1, face ? s.dist / (M.fsize * face.h) : 1))) * vigAt(s.u, s.v, M.vig);
function predict(s, rc) {
  const w = smooth(M.center - M.width, M.center + M.width, s.d);
  const g = lightAt(s);
  const out = [0, 0, 0];
  for (let q = 0; q < 3; q++) {
    const b = rc[0][q] + gridAt(M.Rbg, s.gw, q);
    const f = rc[1][q] + gridAt(M.Rfg, s.gw, q);
    const fc = rc[2][q] + gridAt(M.Rface, s.gw, q);
    const base = b + (f - b) * w;
    out[q] = (base + (fc - base) * s.fm) * g;
  }
  return out;
}
function loss(set, rcs) {
  let se = 0;
  set.forEach((s, n) => { const p = predict(s, rcs[n]); for (let q = 0; q < 3; q++) se += (Math.min(1, Math.max(0, p[q])) - s.t[q]) ** 2; });
  // Işık eğrisi pürüzsüz kalsın: tek fotoğrafa göre dalgalanırsa başka
  // fotoğraflarda belirli bir uzaklıktaki nesneler tuhaf kararır.
  let reg = 0;
  for (let i = 1; i < M.G.length - 1; i++) reg += (M.G[i - 1] - 2 * M.G[i] + M.G[i + 1]) ** 2;
  return se / (set.length * 3) + reg * 3e-3;
}

function descend(params, f, rounds = 40) {
  let best = f();
  for (let r = 0; r < rounds; r++) {
    let improved = false;
    for (const p of params) {
      for (const dir of [1, -1]) {
        let moved = false;
        for (;;) {
          const old = p.get(), nv = Math.min(p.max, Math.max(p.min, old + dir * p.step));
          if (nv === old) break;
          p.set(nv);
          const l = f();
          if (l < best - 1e-11) { best = l; improved = moved = true; } else { p.set(old); break; }
        }
        if (moved) break;
      }
    }
    if (!improved) {
      let any = false;
      for (const p of params) if (p.step > p.minStep) { p.step /= 2; any = true; }
      if (!any) break;
    }
  }
  return best;
}
const P = (get, set, min, max, step, minStep) => ({ get, set, min, max, step, minStep });
const lookParams = (L) => [
  ...['r', 'g', 'b'].flatMap((ch) => CX.map((_, i) => P(() => L.curve[ch][i], (v) => (L.curve[ch][i] = v), 0, 1, 0.03, 0.001))),
  P(() => L.saturation, (v) => (L.saturation = v), -100, 100, 8, 0.5),
  ...Object.keys(L.hsl).map((k) => P(() => L.hsl[k], (v) => (L.hsl[k] = v), -60, 60, 8, 1)),
];

// Izgaralar: bölge renkleri ve ışık sabitken doğrusal en küçük kareler
// (komşu düğüm farkı ve büyüklük cezalı), her kanal için 3 × GN³ bilinmeyen.
function solveGrids(set, rcs) {
  const nn = GN ** 3, D = nn * 3;
  const lambdaSmooth = (0.02 * set.length) / nn, ridge = (0.002 * set.length) / nn;
  for (let q = 0; q < 3; q++) {
    const A = Array.from({ length: D }, () => new Float64Array(D));
    const b = new Float64Array(D);
    set.forEach((s, n) => {
      const rc = rcs[n];
      const w = smooth(M.center - M.width, M.center + M.width, s.d);
      const g = lightAt(s);
      const cw = [g * (1 - s.fm) * (1 - w), g * (1 - s.fm) * w, g * s.fm];
      const known = g * ((1 - s.fm) * (rc[0][q] * (1 - w) + rc[1][q] * w) + s.fm * rc[2][q]);
      const r = s.t[q] - known;
      const cols = [], vals = [];
      for (let reg = 0; reg < 3; reg++) {
        if (cw[reg] < 1e-6) continue;
        for (let k = 0; k < 8; k++) { cols.push(reg * nn + s.gw.idx[k]); vals.push(cw[reg] * s.gw.w[k]); }
      }
      for (let a = 0; a < cols.length; a++) {
        b[cols[a]] += vals[a] * r;
        for (let c = 0; c < cols.length; c++) A[cols[a]][cols[c]] += vals[a] * vals[c];
      }
    });
    for (let reg = 0; reg < 3; reg++) {
      for (let z = 0; z < GN; z++) for (let y = 0; y < GN; y++) for (let x = 0; x < GN; x++) {
        const i = reg * nn + z * GN * GN + y * GN + x;
        A[i][i] += ridge;
        for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
          if (x + dx >= GN || y + dy >= GN || z + dz >= GN) continue;
          const j = reg * nn + (z + dz) * GN * GN + (y + dy) * GN + (x + dx);
          A[i][i] += lambdaSmooth; A[j][j] += lambdaSmooth; A[i][j] -= lambdaSmooth; A[j][i] -= lambdaSmooth;
        }
      }
    }
    // Gauss eleme (kısmi pivotlama).
    for (let c = 0; c < D; c++) {
      let p = c;
      for (let r2 = c + 1; r2 < D; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[p][c])) p = r2;
      [A[c], A[p]] = [A[p], A[c]];
      [b[c], b[p]] = [b[p], b[c]];
      for (let r2 = c + 1; r2 < D; r2++) {
        const k = A[r2][c] / A[c][c];
        if (!k) continue;
        for (let c2 = c; c2 < D; c2++) A[r2][c2] -= k * A[c][c2];
        b[r2] -= k * b[c];
      }
    }
    const xs = new Float64Array(D);
    for (let r2 = D - 1; r2 >= 0; r2--) {
      let s = b[r2];
      for (let c2 = r2 + 1; c2 < D; c2++) s -= A[r2][c2] * xs[c2];
      xs[r2] = s / A[r2][r2];
    }
    for (let i = 0; i < nn; i++) { M.Rbg[i * 3 + q] = xs[i]; M.Rfg[i * 3 + q] = xs[nn + i]; M.Rface[i * 3 + q] = xs[2 * nn + i]; }
  }
}

const t0 = Date.now();
let rcs = regionColors(sub);
const L = () => loss(sub, rcs);
const spatial = [
  P(() => M.center, (v) => (M.center = v), 0.05, 0.95, 0.03, 0.002),
  P(() => M.width, (v) => (M.width = v), 0.01, 0.4, 0.02, 0.002),
  ...M.G.map((_, i) => P(() => M.G[i], (v) => (M.G[i] = v), 0.5, 1.6, 0.04, 0.002)),
  P(() => M.vig, (v) => (M.vig = v), -0.6, 0.6, 0.05, 0.005),
  ...(face ? [P(() => M.flash, (v) => (M.flash = v), 0, 1, 0.05, 0.005), P(() => M.fsize, (v) => (M.fsize = v), 0.3, 4, 0.2, 0.02)] : []),
];
// Bölge tarifinin eğri ve HSL'i sıfırdan uzaklaştıkça hafif ceza: ızgara
// yalnız ince düzeltmeyi taşısın, ana dönüşüm başka fotoğraflara da genellenen
// pürüzsüz tarifte kalsın.
const lookReg = (Lk) => {
  let r = 0;
  for (const ch of ['r', 'g', 'b']) { const y = Lk.curve[ch]; for (let i = 1; i < y.length - 1; i++) r += (y[i - 1] - 2 * y[i] + y[i + 1]) ** 2 * 2e-3; }
  for (const v of Object.values(Lk.hsl)) r += (v / 100) ** 2 * 4e-4;
  return r;
};
// Grid'ler o turda sabitken bir bölge tarifini iner (yalnız o bölgenin rengi yeniden hesaplanır).
function tuneLook(r, set, rounds) {
  const name = REGIONS[r];
  const local = regionColors(set);
  return descend(lookParams(M[name]), () => { regionColors(set, local, r); return loss(set, local) + lookReg(M[name]); }, rounds);
}
const fsub = sub.filter((s) => s.fm > 0.3);
for (let round = 0; round < 4; round++) {
  descend(spatial, L, 30);
  // Uzak ve yakın tarifler (örneklerin yarısıyla, hız için), yüz tarifi yüz çevresinde.
  const half = sub.filter((_, k) => k % 2 === round % 2);
  tuneLook(0, half, 12);
  tuneLook(1, half, 12);
  if (face) tuneLook(2, fsub, 15);
  rcs = regionColors(sub);
  solveGrids(sub, rcs);
  console.log(`tur ${round + 1}: kayıp ${L().toExponential(3)} (${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
}

// Değerlendirme: tüm örneklerde ΔE (CIE76), ham ve 5×5 ortalamalı.
const lab = (c) => {
  const lin = c.map((v) => { v = Math.min(1, Math.max(0, v)); return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
  const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const rcAll = regionColors(S);
const rcRaw = regionColors(S.map((s) => ({ c: s.raw })));
let eA = 0, eB = 0, e0 = 0, fA = 0, fn = 0;
S.forEach((s, n) => {
  const a = dE(predict({ ...s, gw: gridW(s.raw) }, rcRaw[n]), s.traw);
  eA += a;
  eB += dE(predict(s, rcAll[n]), s.t);
  e0 += dE(s.raw, s.traw);
  if (s.fm > 0.5) { fA += a; fn++; }
});
console.log(`ΔE (Meitu gücünde): filtresiz ${(e0 / S.length).toFixed(2)} → ${(eA / S.length).toFixed(2)} (5×5 ortalamalı ${(eB / S.length).toFixed(2)})${fn ? `, yüzde ${(fA / fn).toFixed(2)}` : ''}`);
console.log(`geçiş ${M.center.toFixed(3)}/${M.width.toFixed(3)}, ışık eğrisi ${M.G.map((v) => v.toFixed(3)).join(' ')}, flaş ${M.flash.toFixed(3)} × ${M.fsize.toFixed(2)}, vinyet ${M.vig.toFixed(3)}`);
writeFileSync(join(OUT, `${NAME}-v2-model.json`), JSON.stringify(M));

// presets.js için tarif metni.
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;
const look = (Lk, ind, extra = '') => {
  const c = (ch) => `[${Lk.curve[ch].map((y, i) => `[${CX[i]}, ${r3(y)}]`).join(', ')}]`;
  const hsl = {};
  for (const [k, v] of Object.entries(Lk.hsl)) {
    const rv = Math.round(v);
    if (!rv) continue;
    const [b, key] = k.split('.');
    (hsl[b] = hsl[b] || {})[key] = rv;
  }
  const hs = Object.entries(hsl).map(([b, o]) => `${b}: { ${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(', ')} }`).join(', ');
  return (
    `{\n${ind}  curves: {\n${ind}    r: ${c('r')},\n${ind}    g: ${c('g')},\n${ind}    b: ${c('b')},\n${ind}  },\n` +
    `${ind}  saturation: ${Math.round(Lk.saturation)},\n` +
    (extra ? `${ind}  ${extra},\n` : '') +
    (hs ? `${ind}  hsl: { ${hs} },\n` : '') +
    `${ind}}`
  );
};
const grid = (R) => `[${R.map(r4).join(', ')}]`;
const text =
  `  cam('${NAME.toLowerCase()}v2', '${NAME.toUpperCase()} v2', ${look(M.bg, '  ', `vignette: ${r3(M.vig * 100)}`)}, {\n` +
  `    meituAt: ${AT},\n` +
  `    grid: ${grid(M.Rbg)},\n` +
  `    depth: {\n      center: ${r3(M.center)},\n      width: ${r3(M.width)},\n      look: ${look(M.fg, '      ')},\n      grid: ${grid(M.Rfg)},\n    },\n` +
  `    depthGain: [${M.G.map(r3).join(', ')}],\n` +
  (face ? `    face: {\n      look: ${look(M.face, '      ')},\n      grid: ${grid(M.Rface)},\n    },\n` : '') +
  (face ? `    faceFlash: { amount: ${r3(M.flash)}, size: ${r3(M.fsize)} },\n` : '') +
  `  }, ${Math.round(AT * 100)}),\n`;
writeFileSync(join(OUT, `${NAME}-v2-tarif.txt`), text);
console.log(`tarif: olcum/${NAME}-v2-tarif.txt (presets.js → MEITU)`);
