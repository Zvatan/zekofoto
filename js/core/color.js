// Renk zinciri (DOM'suz): ayar kaydırıcıları ve filtre tarifleri.
//
// Ekran kartı her pikselde iki 3B renk tablosuna (LUT) bakar:
//  - ön tablo : beyaz dengesi ve pozlama; doğrusal ışıkta, parlak uçta yumuşak omuzla
//  - son tablo: siyahlar/beyazlar, parlaklık, kontrast, soldurma, eğriler,
//               doygunluk/canlılık, HSL, renk dengesi; filtre tarifleri de buraya girer
// Arada gölgelendirici yerel tonu (vurgular, gölgeler, netlik) ve konuma bağlı
// efektleri (keskinlik, gren, vinyet) uygular: bkz. js/gl/shaders.js.
// Tablolar bu dosyadaki fonksiyonlarla hesaplanır; Node testleri aynı kodu sınar.

export const LUT_SIZE = 33;
const TONE_N = 1024;

// Tüm kaydırıcılar -100..100 (keskinlik, gren ve soldurma 0..100) aralığındadır.
export const ADJUST_KEYS = [
  'exposure',
  'brightness',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'saturation',
  'vibrance',
  'temperature',
  'tint',
  'sharpen',
  'clarity',
  'fade',
  'grain',
  'vignette',
];

export function neutralAdjust() {
  const a = {};
  for (const k of ADJUST_KEYS) a[k] = 0;
  return a;
}

// HSL renk bantları; ton merkezleri derece cinsinden, çember üzerinde sıralı.
export const HSL_BANDS = [
  { id: 'red', label: 'Kırmızı', hue: 0, color: '#ff4f4f' },
  { id: 'orange', label: 'Turuncu', hue: 30, color: '#ff9a3c' },
  { id: 'yellow', label: 'Sarı', hue: 58, color: '#ffd83a' },
  { id: 'green', label: 'Yeşil', hue: 115, color: '#45d16a' },
  { id: 'aqua', label: 'Turkuaz', hue: 180, color: '#36d6d6' },
  { id: 'blue', label: 'Mavi', hue: 225, color: '#4f7dff' },
  { id: 'purple', label: 'Mor', hue: 275, color: '#a65cff' },
  { id: 'magenta', label: 'Pembe', hue: 320, color: '#ff4fc3' },
];

export function neutralHsl() {
  const o = {};
  for (const b of HSL_BANDS) o[b.id] = { h: 0, s: 0, l: 0 };
  return o;
}

export function neutralGrade() {
  return {
    shadows: { hue: 215, sat: 0 },
    midtones: { hue: 35, sat: 0 },
    highlights: { hue: 45, sat: 0 },
    balance: 0,
  };
}

export function neutralCurves() {
  return { rgb: [[0, 0], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] };
}

export function isIdentityCurve(pts) {
  return !pts || pts.every(([x, y]) => Math.abs(x - y) < 1e-4);
}

export function isNeutralHsl(hsl) {
  return !hsl || Object.values(hsl).every((v) => !v.h && !v.s && !v.l);
}

export function isNeutralGrade(g) {
  return !g || (!g.shadows?.sat && !g.midtones?.sat && !g.highlights?.sat);
}

// --- yardımcılar ---------------------------------------------------------

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function smooth(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Tam doygun ton rengi (HSV s=v=1).
function hueRgb(hue, out) {
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const i = Math.floor(h);
  const t = [
    [1, x, 0],
    [x, 1, 0],
    [0, 1, x],
    [0, x, 1],
    [x, 0, 1],
    [1, 0, x],
  ][i % 6];
  out[0] = t[0];
  out[1] = t[1];
  out[2] = t[2];
  return out;
}

// --- eğriler -------------------------------------------------------------

// Kontrol noktalarından geçen, taşma yapmayan (Fritsch–Carlson) kübik eğri.
// Uç noktaların dışında eğri yatay devam eder.
export function curveTable(points, n = TONE_N) {
  const pts = (points || [[0, 0], [1, 1]]).slice().sort((a, b) => a[0] - b[0]);
  const xs = [];
  const ys = [];
  for (const [x, y] of pts) {
    if (xs.length && x - xs[xs.length - 1] < 1e-4) {
      ys[ys.length - 1] = clamp01(y);
      continue;
    }
    xs.push(clamp01(x));
    ys.push(clamp01(y));
  }
  const out = new Float32Array(n);
  const m = xs.length;
  if (m === 1) {
    out.fill(ys[0]);
    return out;
  }
  const d = new Array(m - 1);
  const t = new Array(m);
  for (let i = 0; i < m - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  t[0] = d[0];
  t[m - 1] = d[m - 2];
  for (let i = 1; i < m - 1; i++) t[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < m - 1; i++) {
    if (d[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / d[i];
    const b = t[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * d[i];
      t[i + 1] = k * b * d[i];
    }
  }
  let seg = 0;
  for (let j = 0; j < n; j++) {
    const x = j / (n - 1);
    if (x <= xs[0]) {
      out[j] = ys[0];
      continue;
    }
    if (x >= xs[m - 1]) {
      out[j] = ys[m - 1];
      continue;
    }
    while (x > xs[seg + 1]) seg++;
    const h = xs[seg + 1] - xs[seg];
    const u = (x - xs[seg]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    const v =
      (2 * u3 - 3 * u2 + 1) * ys[seg] +
      (u3 - 2 * u2 + u) * h * t[seg] +
      (-2 * u3 + 3 * u2) * ys[seg + 1] +
      (u3 - u2) * h * t[seg + 1];
    out[j] = clamp01(v);
  }
  return out;
}

function sampleTable(tab, x) {
  const f = clamp01(x) * (tab.length - 1);
  const i = f | 0;
  if (i >= tab.length - 1) return tab[tab.length - 1];
  const t = f - i;
  return tab[i] + (tab[i + 1] - tab[i]) * t;
}

// --- derleme -------------------------------------------------------------

const v100 = (o, k) => (o && o[k] ? o[k] / 100 : 0);

// Beyaz dengesi ve pozlama (doğrusal ışıkta).
function compilePre(look) {
  const ev = v100(look, 'exposure') * 2; // ±2 durak
  const t = v100(look, 'temperature');
  const ti = v100(look, 'tint');
  if (!ev && !t && !ti) return null;
  const gr = 1 + 0.28 * t;
  const gg = 1 - 0.2 * ti;
  const gb = 1 - 0.28 * t;
  // Nötr grinin parlaklığı korunur.
  const n = 0.2126 * gr + 0.7152 * gg + 0.0722 * gb;
  const m = Math.pow(2, ev);
  const r = (gr / n) * m;
  const g = (gg / n) * m;
  const b = (gb / n) * m;
  // Kazanç 1'i aştıkça parlak uçta yumuşak bir omuz başlar; beyazlar kesilmez,
  // tonları kaybolmaz.
  const over = Math.log2(Math.max(r, g, b, 1));
  return { r, g, b, knee: 1 - 0.22 * Math.min(1, over) };
}

function shoulder(x, k) {
  if (x <= k) return x;
  if (k >= 0.999) return x < 1 ? x : 1;
  const s = 1 - k;
  return k + s * (1 - Math.exp(-(x - k) / s));
}

export function applyPre(c, p) {
  if (!p) return c;
  c[0] = linearToSrgb(shoulder(srgbToLinear(c[0]) * p.r, p.knee));
  c[1] = linearToSrgb(shoulder(srgbToLinear(c[1]) * p.g, p.knee));
  c[2] = linearToSrgb(shoulder(srgbToLinear(c[2]) * p.b, p.knee));
  return c;
}

// Kanal başına tek boyutlu ton yığını: siyahlar/beyazlar → parlaklık → kontrast → soldurma.
function toneFn(look) {
  const bl = v100(look, 'blacks');
  const wh = v100(look, 'whites');
  const br = v100(look, 'brightness');
  const ct = v100(look, 'contrast');
  const fd = v100(look, 'fade');
  if (!bl && !wh && !br && !ct && !fd) return null;
  const gamma = Math.pow(2, -br * 0.8);
  const p = ct >= 0 ? 1 + ct : 1 + ct * 0.55;
  return (x) => {
    if (bl) x += bl * 0.12 * (1 - x) * (1 - x);
    if (wh) x += wh * 0.12 * x * x;
    x = clamp01(x);
    if (br) x = Math.pow(x, gamma);
    if (ct) {
      const s = x < 0.5 ? 0.5 * Math.pow(2 * x, p) : 1 - 0.5 * Math.pow(2 * (1 - x), p);
      // Güçlü kontrastta uçlar tamamen ezilmesin diye doğrusalla harmanlanır.
      x = ct > 0 ? x + (s - x) * 0.85 : s;
    }
    if (fd) x = fd * 0.13 + x * (1 - fd * 0.2);
    return x;
  };
}

function compilePost(look) {
  const k = {
    mono: null,
    mixer: null,
    tables: null,
    sat: 1,
    vib: 0,
    hsl: null,
    grade: null,
  };
  if (look.mono) {
    const [r, g, b] = look.mono;
    const s = r + g + b || 1;
    k.mono = [r / s, g / s, b / s];
  }
  if (look.mixer) k.mixer = look.mixer.slice();

  const tone = toneFn(look);
  const cv = look.curves || {};
  const master = isIdentityCurve(cv.rgb) ? null : curveTable(cv.rgb);
  const chan = ['r', 'g', 'b'].map((c) => (isIdentityCurve(cv[c]) ? null : curveTable(cv[c])));
  if (tone || master || chan.some(Boolean)) {
    k.tables = chan.map((ct) => {
      const tab = new Float32Array(TONE_N);
      for (let j = 0; j < TONE_N; j++) {
        let x = j / (TONE_N - 1);
        if (tone) x = tone(x);
        if (master) x = sampleTable(master, x);
        if (ct) x = sampleTable(ct, x);
        tab[j] = clamp01(x);
      }
      return tab;
    });
  }

  const sa = v100(look, 'saturation');
  const fd = v100(look, 'fade');
  k.sat = (sa >= 0 ? 1 + sa * 0.9 : 1 + sa) * (1 - fd * 0.2);
  k.vib = v100(look, 'vibrance');

  if (!isNeutralHsl(look.hsl)) {
    const a = new Float32Array(HSL_BANDS.length * 3);
    HSL_BANDS.forEach((b, i) => {
      const v = look.hsl[b.id] || {};
      a[i * 3] = (v.h || 0) / 100;
      a[i * 3 + 1] = (v.s || 0) / 100;
      a[i * 3 + 2] = (v.l || 0) / 100;
    });
    k.hsl = a;
  }

  if (!isNeutralGrade(look.grade)) {
    const g = look.grade;
    const vec = (z) => {
      const c = hueRgb(z?.hue || 0, [0, 0, 0]);
      const y = luma(c[0], c[1], c[2]);
      const s = ((z?.sat || 0) / 100) * 0.3;
      return [(c[0] - y) * s, (c[1] - y) * s, (c[2] - y) * s];
    };
    k.grade = {
      sh: vec(g.shadows),
      mi: vec(g.midtones),
      hi: vec(g.highlights),
      bal: (g.balance || 0) / 100,
    };
  }
  k.active = !!(k.mono || k.mixer || k.tables || k.sat !== 1 || k.vib || k.hsl || k.grade);
  return k;
}

// Kaydırıcı ve tarif nesnesini (bkz. presets.js) hızlı değerlendirilebilir
// biçime çevirir. spatial: gölgelendiriciye giden değerler (-1..1).
export function compileLook(look = {}) {
  return {
    pre: compilePre(look),
    post: compilePost(look),
    spatial: {
      highlights: v100(look, 'highlights'),
      shadows: v100(look, 'shadows'),
      clarity: v100(look, 'clarity'),
      sharpen: v100(look, 'sharpen'),
      grain: v100(look, 'grain'),
      vignette: v100(look, 'vignette'),
    },
  };
}

// --- piksel başına ------------------------------------------------------

const HUES = HSL_BANDS.map((b) => b.hue);

// Doygunluğu L etrafında f katına çıkarır; renk gamutun dışına taşmaya
// yaklaştıkça artış yumuşakça sınırlanır (ton kaymasın diye).
function scaleChroma(c, L, f) {
  if (f === 1) return;
  if (f > 1) {
    let fmax = Infinity;
    for (let i = 0; i < 3; i++) {
      const d = c[i] - L;
      if (d > 1e-6) fmax = Math.min(fmax, (1 - L) / d);
      else if (d < -1e-6) fmax = Math.min(fmax, L / -d);
    }
    if (fmax !== Infinity && fmax > 1) {
      const room = fmax - 1;
      f = 1 + room * (1 - Math.exp(-(f - 1) / room));
    } else if (fmax !== Infinity) {
      f = 1;
    }
  }
  c[0] = L + (c[0] - L) * f;
  c[1] = L + (c[1] - L) * f;
  c[2] = L + (c[2] - L) * f;
}

function rgbToHsv(c, out) {
  const r = c[0];
  const g = c[1];
  const b = c[2];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 1e-7) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  out[0] = h;
  out[1] = mx > 0 ? d / mx : 0;
  out[2] = mx;
  return out;
}

function hsvToRgb(h, s, v, out) {
  const hh = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0: out[0] = v; out[1] = t; out[2] = p; break;
    case 1: out[0] = q; out[1] = v; out[2] = p; break;
    case 2: out[0] = p; out[1] = v; out[2] = t; break;
    case 3: out[0] = p; out[1] = q; out[2] = v; break;
    case 4: out[0] = t; out[1] = p; out[2] = v; break;
    default: out[0] = v; out[1] = p; out[2] = q;
  }
  return out;
}

const hsv = new Float64Array(3);

// Komşu iki bandın ağırlıkları: toplamları 1'dir (çember üzerinde).
export function bandWeights(hue) {
  const n = HUES.length;
  for (let i = 0; i < n; i++) {
    const a = HUES[i];
    const b = i + 1 < n ? HUES[i + 1] : HUES[0] + 360;
    let h = hue;
    if (i + 1 === n && h < a) h += 360;
    if (h >= a && h < b) {
      const t = smooth(0, 1, (h - a) / (b - a));
      return [i, (i + 1) % n, 1 - t, t];
    }
  }
  return [0, 1, 1, 0];
}

function applyHsl(c, a) {
  const mx = Math.max(c[0], c[1], c[2]);
  const mn = Math.min(c[0], c[1], c[2]);
  const ch = mx - mn;
  if (ch < 1e-4) return;
  rgbToHsv(c, hsv);
  const [i, j, wi, wj] = bandWeights(hsv[0]);
  const cw = smooth(0, 0.16, ch);
  const dh = (a[i * 3] * wi + a[j * 3] * wj) * cw;
  const ds = (a[i * 3 + 1] * wi + a[j * 3 + 1] * wj) * cw;
  const dl = (a[i * 3 + 2] * wi + a[j * 3 + 2] * wj) * cw;
  if (dh) {
    hsvToRgb(hsv[0] + dh * 30, hsv[1], hsv[2], c);
  }
  if (ds) scaleChroma(c, luma(c[0], c[1], c[2]), ds >= 0 ? 1 + ds : 1 + ds);
  if (dl > 0) {
    const k = dl * 0.4;
    for (let q = 0; q < 3; q++) c[q] = 1 - (1 - c[q]) * (1 - k);
  } else if (dl < 0) {
    const k = 1 + dl * 0.5;
    for (let q = 0; q < 3; q++) c[q] *= k;
  }
}

export function applyPost(c, k) {
  if (!k || !k.active) return c;
  if (k.mono) {
    const y = clamp01(c[0] * k.mono[0] + c[1] * k.mono[1] + c[2] * k.mono[2]);
    c[0] = c[1] = c[2] = y;
  }
  if (k.mixer) {
    const m = k.mixer;
    const r = c[0];
    const g = c[1];
    const b = c[2];
    c[0] = clamp01(m[0] * r + m[1] * g + m[2] * b);
    c[1] = clamp01(m[3] * r + m[4] * g + m[5] * b);
    c[2] = clamp01(m[6] * r + m[7] * g + m[8] * b);
  }
  if (k.tables) {
    c[0] = sampleTable(k.tables[0], c[0]);
    c[1] = sampleTable(k.tables[1], c[1]);
    c[2] = sampleTable(k.tables[2], c[2]);
  }
  if (k.sat !== 1 || k.vib) {
    const L = luma(c[0], c[1], c[2]);
    let f = k.sat;
    if (k.vib) {
      const mx = Math.max(c[0], c[1], c[2]);
      const ch = mx - Math.min(c[0], c[1], c[2]);
      if (k.vib > 0) {
        let w = 1 - ch;
        // Ten renklerini (kırmızı ile sarı arası) koru.
        if (c[0] >= c[1] && c[1] >= c[2] && ch > 1e-4) {
          const pos = (c[1] - c[2]) / ch;
          w *= 1 - 0.55 * smooth(0.05, 0.3, pos) * (1 - smooth(0.6, 0.9, pos));
        }
        f *= 1 + k.vib * 1.1 * w;
      } else {
        f *= 1 + k.vib * (0.6 + 0.4 * ch);
      }
    }
    if (f < 0) f = 0;
    scaleChroma(c, L, f);
  }
  if (k.hsl) applyHsl(c, k.hsl);
  if (k.grade) {
    const L = clamp01(luma(c[0], c[1], c[2]) + k.grade.bal * 0.25);
    const ws = (1 - L) * (1 - L);
    const wh = L * L;
    const wm = Math.max(0, 1 - ws - wh);
    const { sh, mi, hi } = k.grade;
    c[0] += ws * sh[0] + wm * mi[0] + wh * hi[0];
    c[1] += ws * sh[1] + wm * mi[1] + wh * hi[1];
    c[2] += ws * sh[2] + wm * mi[2] + wh * hi[2];
  }
  c[0] = clamp01(c[0]);
  c[1] = clamp01(c[1]);
  c[2] = clamp01(c[2]);
  return c;
}

// Ön ve son aşamayı birlikte uygular (tarifler ve CPU tarafı önizlemeler için).
export function applyLook(c, compiled) {
  applyPre(c, compiled.pre);
  applyPost(c, compiled.post);
  return c;
}

// --- tablo üretimi -------------------------------------------------------

export function lutLength(n = LUT_SIZE) {
  return n * n * n * 4;
}

// Renk küpünü dolaşıp fn'i uygular. Düzen: r en hızlı, sonra g, sonra b
// (WebGL 3B dokusunda x=r, y=g, z=b).
export function bakeLut(fn, out = new Float32Array(lutLength()), n = LUT_SIZE) {
  const c = new Float64Array(3);
  let i = 0;
  const s = 1 / (n - 1);
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        c[0] = r * s;
        c[1] = g * s;
        c[2] = b * s;
        fn(c);
        out[i] = c[0];
        out[i + 1] = c[1];
        out[i + 2] = c[2];
        out[i + 3] = 1;
        i += 4;
      }
    }
  }
  return out;
}

export function identityLut(out, n = LUT_SIZE) {
  return bakeLut(() => {}, out, n);
}

// CPU üzerinde 3B tablo ile renk dönüştürme (üçlü doğrusal); testler ve küçük
// önizlemeler için.
export function sampleLut(lut, c, n = LUT_SIZE) {
  const f = [clamp01(c[0]) * (n - 1), clamp01(c[1]) * (n - 1), clamp01(c[2]) * (n - 1)];
  const i0 = f.map((v) => Math.min(n - 2, Math.floor(v)));
  const t = f.map((v, k) => v - i0[k]);
  const out = [0, 0, 0];
  for (let dz = 0; dz < 2; dz++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const w = (dx ? t[0] : 1 - t[0]) * (dy ? t[1] : 1 - t[1]) * (dz ? t[2] : 1 - t[2]);
        const idx = (((i0[2] + dz) * n + (i0[1] + dy)) * n + (i0[0] + dx)) * 4;
        out[0] += lut[idx] * w;
        out[1] += lut[idx + 1] * w;
        out[2] += lut[idx + 2] * w;
      }
    }
  }
  return out;
}
