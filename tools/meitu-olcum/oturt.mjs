// Ölçülen Meitu dönüşümlerine bizim filtre motorumuzun parametrelerini oturtur.
// Model, motorun sırasını taklit eder: yerel ton (netlik) → son tablo (kanal
// eğrileri, doygunluk, HSL) → flaş → vinyet.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadData, luma, DIR } from './veri.mjs';

const PROJ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const { compileLook, applyPost } = await import(pathToFileURL(`${PROJ}/js/core/color.js`).href);
const { encodePng } = await import(pathToFileURL(`${PROJ}/tests/png.mjs`).href);
const HERE = dirname(fileURLToPath(import.meta.url));
// Çıktılar kişisel fotoğraf içerir: proje dışında, ekran görüntülerinin yanında.
const OUT = join(DIR, 'olcum');
mkdirSync(OUT, { recursive: true });

const CX = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const HSL_KEYS = [['red', 's'], ['orange', 's'], ['orange', 'l'], ['yellow', 's'], ['green', 's'], ['aqua', 's'], ['blue', 's']];

function initParams() {
  const P = { curve: { r: CX.slice(), g: CX.slice(), b: CX.slice() }, saturation: 0, hsl: {}, clarity: 0, flash: 0, fx: 0.5, fy: 0.45, fr: 0.6, vignette: 0 };
  for (const [b, k] of HSL_KEYS) P.hsl[`${b}.${k}`] = 0;
  return P;
}

function lookOf(P) {
  const hsl = {};
  for (const [b, k] of HSL_KEYS) {
    hsl[b] = hsl[b] || { h: 0, s: 0, l: 0 };
    hsl[b][k] = P.hsl[`${b}.${k}`];
  }
  return {
    saturation: P.saturation,
    curves: {
      r: CX.map((x, i) => [x, P.curve.r[i]]),
      g: CX.map((x, i) => [x, P.curve.g[i]]),
      b: CX.map((x, i) => [x, P.curve.b[i]]),
    },
    hsl,
  };
}

// js/gl/shaders.js → localTone (yalnız netlik) ile aynı.
function clarityTone(c, g, cl) {
  if (!cl) return;
  if (cl < 0) for (let k = 0; k < 3; k++) c[k] += (g[k] - c[k]) * -cl * 0.65;
  const L = Math.max(luma(c[0], c[1], c[2]), 0);
  const Lb = luma(g[0], g[1], g[2]);
  let Lt = L;
  if (cl > 0) {
    const mid = 1 - Math.pow(Math.abs(2 * L - 1), 2);
    Lt += (L - Lb) * cl * 1.4 * mid;
  }
  const ratio = Math.min(Lt / Math.max(L, 1e-4), 3);
  const w = 0.65 * smooth(0.02, 0.2, L);
  for (let k = 0; k < 3; k++) {
    const cm = c[k] * ratio;
    const ca = c[k] + (Lt - L);
    c[k] = ca + (cm - ca) * w;
  }
}

function render(P, d, idx, out) {
  const k = compileLook(lookOf(P));
  const { N, align: a, refSize: [W, H] } = d;
  const cell = a.s / N;
  const asp = [W / Math.max(W, H), H / Math.max(W, H)];
  const alen = Math.hypot(asp[0], asp[1]);
  const c = new Float64Array(3);
  const g = new Float64Array(3);
  for (const p of idx) {
    const i = p % N;
    const j = (p / N) | 0;
    for (let q = 0; q < 3; q++) {
      c[q] = d.inp[p * 3 + q];
      g[q] = d.guide[p * 3 + q];
    }
    clarityTone(c, g, P.clarity / 100);
    applyPost(c, k.post);
    const u = (a.x + (i + 0.5) * cell) / W;
    const v = (a.y + (j + 0.5) * cell) / H;
    if (P.flash) {
      const r = Math.hypot((u - P.fx) * 2 * asp[0], (v - P.fy) * 2 * asp[1]) / (P.fr * alen);
      const f = 1 + P.flash * 0.5 * (1 - smooth(0, 1, r));
      for (let q = 0; q < 3; q++) c[q] *= f;
    }
    if (P.vignette) {
      const r = Math.hypot((u - 0.5) * 2 * asp[0], (v - 0.5) * 2 * asp[1]) / alen;
      let m = smooth(0.3, 1.2, r);
      m *= m;
      const vg = P.vignette / 100;
      for (let q = 0; q < 3; q++) c[q] = vg > 0 ? c[q] * (1 - vg * m * 0.9) : c[q] + (1 - c[q]) * -vg * m * 0.8;
    }
    for (let q = 0; q < 3; q++) out[p * 3 + q] = clamp01(c[q]);
  }
}

function makeLoss(d, idx) {
  const pred = new Float64Array(d.N * d.N * 3);
  return (P) => {
    render(P, d, idx, pred);
    let se = 0;
    for (const p of idx) for (let q = 0; q < 3; q++) se += (pred[p * 3 + q] - d.out[p * 3 + q]) ** 2;
    let reg = 0;
    for (const ch of ['r', 'g', 'b']) {
      const y = P.curve[ch];
      for (let i = 1; i < y.length - 1; i++) reg += (y[i - 1] - 2 * y[i] + y[i + 1]) ** 2; // pürüzsüzlük
    }
    // Renk bantları tek fotoğraftan zayıf belirlenir: az pikseli olan bant
    // uç değere kaçmasın diye büyüklükleri cezalandırılır.
    let hreg = 0;
    for (const v of Object.values(P.hsl)) hreg += (v / 100) ** 2;
    return se / (idx.length * 3) + reg * 2e-3 + hreg * 4e-4;
  };
}

function paramList(P, which) {
  const L = [];
  if (which.includes('curve')) for (const ch of ['r', 'g', 'b']) for (let i = 0; i < CX.length; i++) L.push({ get: () => P.curve[ch][i], set: (v) => (P.curve[ch][i] = v), min: 0, max: 1, step: 0.04, minStep: 0.001 });
  if (which.includes('sat')) L.push({ get: () => P.saturation, set: (v) => (P.saturation = v), min: -100, max: 100, step: 10, minStep: 0.5 });
  if (which.includes('hsl')) for (const key of Object.keys(P.hsl)) L.push({ get: () => P.hsl[key], set: (v) => (P.hsl[key] = v), min: -50, max: 50, step: 10, minStep: 1 });
  if (which.includes('clarity')) L.push({ get: () => P.clarity, set: (v) => (P.clarity = v), min: -100, max: 100, step: 15, minStep: 1 });
  if (which.includes('flash') && P.flashMode !== 'off') {
    L.push({ get: () => P.flash, set: (v) => (P.flash = v), min: 0, max: 1, step: 0.15, minStep: 0.01 });
    if (P.flashMode !== 'fixed') {
      L.push({ get: () => P.fx, set: (v) => (P.fx = v), min: 0.2, max: 0.8, step: 0.08, minStep: 0.005 });
      L.push({ get: () => P.fy, set: (v) => (P.fy = v), min: 0.2, max: 0.8, step: 0.08, minStep: 0.005 });
    }
    L.push({ get: () => P.fr, set: (v) => (P.fr = v), min: 0.15, max: 1.5, step: 0.15, minStep: 0.01 });
  }
  if (which.includes('vignette')) L.push({ get: () => P.vignette, set: (v) => (P.vignette = v), min: -100, max: 100, step: 15, minStep: 1 });
  return L;
}

function descend(P, loss, which, maxRounds = 60) {
  const params = paramList(P, which);
  let best = loss(P);
  for (let round = 0; round < maxRounds; round++) {
    let improved = false;
    for (const p of params) {
      for (const dir of [1, -1]) {
        let moved = false;
        for (;;) {
          const old = p.get();
          const nv = Math.min(p.max, Math.max(p.min, old + dir * p.step));
          if (nv === old) break;
          p.set(nv);
          const l = loss(P);
          if (l < best - 1e-10) {
            best = l;
            improved = moved = true;
          } else {
            p.set(old);
            break;
          }
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

function deltaE(rgbA, rgbB) {
  const lab = (c) => {
    const lin = c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
    const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    const Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const a = lab(rgbA);
  const b = lab(rgbB);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const { filters } = await loadData();
const report = [];
const visuals = [];
for (const d of filters) {
  const all = [];
  for (let p = 0; p < d.N * d.N; p++) if (d.mask[p]) all.push(p);
  const sub = all.filter((p) => (p % d.N) % 2 === 0 && ((p / d.N) | 0) % 2 === 0);
  const P = initParams();
  // Flaş yalnız Hard Flash'ta; ışık şimdilik sabit noktada (yüz algılama gelene kadar).
  if (d.name === 'Hard Flash') {
    P.flashMode = 'fixed';
    P.fx = 0.5;
    P.fy = 0.45;
    P.fr = 0.4;
  } else {
    P.flashMode = 'off';
  }
  const loss = makeLoss(d, sub);
  descend(P, loss, ['curve', 'sat']);
  descend(P, loss, ['hsl']);
  descend(P, loss, ['clarity', 'flash', 'vignette']);
  descend(P, loss, ['curve', 'sat', 'hsl', 'clarity', 'flash', 'vignette'], 40);
  // Değerlendirme: bütün maskeli pikseller.
  const pred = new Float64Array(d.N * d.N * 3);
  render(P, d, all, pred);
  let se0 = 0, se1 = 0, de0 = 0, de1 = 0;
  for (const p of all) {
    const o = [d.out[p * 3], d.out[p * 3 + 1], d.out[p * 3 + 2]];
    const i = [d.inp[p * 3], d.inp[p * 3 + 1], d.inp[p * 3 + 2]];
    const m = [pred[p * 3], pred[p * 3 + 1], pred[p * 3 + 2]];
    for (let q = 0; q < 3; q++) {
      se0 += (i[q] - o[q]) ** 2;
      se1 += (m[q] - o[q]) ** 2;
    }
    de0 += deltaE(i, o);
    de1 += deltaE(m, o);
  }
  const n = all.length;
  const r = {
    name: d.name,
    rmse_filtresiz: +(Math.sqrt(se0 / (n * 3)) * 255).toFixed(1),
    rmse_bizim: +(Math.sqrt(se1 / (n * 3)) * 255).toFixed(1),
    dE_filtresiz: +(de0 / n).toFixed(2),
    dE_bizim: +(de1 / n).toFixed(2),
    params: {
      curves: Object.fromEntries(['r', 'g', 'b'].map((ch) => [ch, P.curve[ch].map((v) => +v.toFixed(3))])),
      saturation: +P.saturation.toFixed(1),
      hsl: Object.fromEntries(Object.entries(P.hsl).map(([k, v]) => [k, +v.toFixed(1)])),
      clarity: +P.clarity.toFixed(1),
      flash: +P.flash.toFixed(3),
      flashAt: [+P.fx.toFixed(3), +P.fy.toFixed(3), +P.fr.toFixed(3)],
      vignette: +P.vignette.toFixed(1),
    },
  };
  report.push(r);
  visuals.push({ d, pred });
  console.log(`${d.name.padEnd(12)} RMSE ${r.rmse_filtresiz} → ${r.rmse_bizim}   ΔE ${r.dE_filtresiz} → ${r.dE_bizim}   netlik ${r.params.clarity} flaş ${r.params.flash} @${r.params.flashAt} vinyet ${r.params.vignette} doyg ${r.params.saturation}`);
}
writeFileSync(join(OUT, 'uyum.json'), JSON.stringify(report, null, 1));

// Görsel: [özgün | Meitu | bizim] ×3 büyütme, filtre başına bir satır.
{
  const S = 3;
  const N = 128;
  const W = 3 * N * S + 4 * 6;
  const H = visuals.length * (N * S + 6) + 6;
  const out = new Uint8Array(W * H * 4).fill(25);
  visuals.forEach(({ d, pred }, row) => {
    const srcs = [d.inp, d.out, pred];
    srcs.forEach((arr, col) => {
      const ox = 6 + col * (N * S + 6);
      const oy = 6 + row * (N * S + 6);
      for (let y = 0; y < N * S; y++) {
        for (let x = 0; x < N * S; x++) {
          const i = Math.min(d.N - 1, Math.floor((x / (N * S)) * d.N));
          const j = Math.min(d.N - 1, Math.floor((y / (N * S)) * d.N));
          const p = j * d.N + i;
          const o = ((oy + y) * W + ox + x) * 4;
          const masked = !d.mask[p] && col === 1;
          for (let q = 0; q < 3; q++) out[o + q] = masked ? 40 : Math.round(clamp01(arr[p * 3 + q]) * 255);
          out[o + 3] = 255;
        }
      }
    });
  });
  writeFileSync(join(OUT, 'uyum.png'), encodePng(out, W, H));
}
console.log('Çıktılar: olcum/uyum.json, olcum/uyum.png (sütunlar: özgün | Meitu | bizim)');

// presets.js için tarif kodu. Önizlemelerin ortak bulanıklığı (ölçümün kendisi)
// DSLR ve Glowy Flash'ta ölçülen netlikten alınıp hepsinden düşülür.
{
  const byName = Object.fromEntries(report.map((r) => [r.name, r]));
  const base = (byName['DSLR'].params.clarity + byName['Glowy Flash'].params.clarity) / 2;
  const ids = { 'Flash Film': 'flashfilm', DSLR: 'dslr', HDF: 'hdf', 'Glowy Flash': 'glowyflash', 'Hard Flash': 'hardflash', G7x: 'g7x' };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const lines = [`  // Meitu ölçümü (2026-11-22): referans fotoğraf + önizlemeler; önizleme bulanıklığı payı ${base.toFixed(1)}`];
  for (const r of report) {
    const p = r.params;
    const curve = (ch) => `[${p.curves[ch].map((y, i) => `[${CX[i]}, ${r3(y)}]`).join(', ')}]`;
    const hsl = {};
    for (const [k, v] of Object.entries(p.hsl)) {
      const rv = Math.round(v);
      if (!rv) continue;
      const [band, key] = k.split('.');
      hsl[band] = hsl[band] || {};
      hsl[band][key] = rv;
    }
    const hslStr = Object.entries(hsl).map(([b, o]) => `${b}: { ${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(', ')} }`).join(', ');
    const clarity = Math.round(p.clarity - base);
    const look = [
      `curves: { r: ${curve('r')}, g: ${curve('g')}, b: ${curve('b')} }`,
      `saturation: ${Math.round(p.saturation)}`,
      clarity ? `clarity: ${clarity}` : null,
      Math.round(p.vignette) ? `vignette: ${Math.round(p.vignette)}` : null,
      hslStr ? `hsl: { ${hslStr} }` : null,
    ].filter(Boolean);
    const extras = p.flash > 0.005 ? `{ flash: ${r3(p.flash)}, flashAt: [${p.flashAt.join(', ')}] }` : 'null';
    lines.push(`  cam('${ids[r.name]}', '${r.name}', {\n    ${look.join(',\n    ')},\n  }, ${extras}, 100),`);
  }
  writeFileSync(join(OUT, 'presets.txt'), lines.join('\n') + '\n');
  console.log(`Önizleme bulanıklığı payı: ${base.toFixed(1)}  → olcum/presets.txt`);
}
