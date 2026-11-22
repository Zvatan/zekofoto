// Tek dokunuşla akıllı iyileştirme (DOM'suz): küçültülmüş görüntünün
// histogramından kaydırıcı değerleri önerir. Kullanıcı sonra bunları
// değiştirebilir; değerler bilerek ölçülüdür.
import { srgbToLinear } from './color.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function analyze(rgba, w, h) {
  const hist = new Uint32Array(256);
  let n = 0;
  let sumL = 0;
  let sumL2 = 0;
  let sumCh = 0;
  let grayN = 0;
  let gr = 0;
  let gg = 0;
  let gb = 0;
  const step = Math.max(1, Math.floor((w * h) / 120000));
  for (let i = 0; i < w * h; i += step) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue;
    const r = rgba[o] / 255;
    const g = rgba[o + 1] / 255;
    const b = rgba[o + 2] / 255;
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    const ch = Math.max(r, g, b) - Math.min(r, g, b);
    hist[Math.min(255, Math.round(L * 255))]++;
    n++;
    sumL += L;
    sumL2 += L * L;
    sumCh += ch;
    // Belirgin renk kaymasında griler de renkli görünür; eşik bu yüzden geniş.
    if (ch < 0.2 && L > 0.2 && L < 0.92) {
      grayN++;
      gr += r;
      gg += g;
      gb += b;
    }
  }
  const pct = (p) => {
    const target = p * n;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i / 255;
    }
    return 1;
  };
  let dark = 0;
  let bright = 0;
  for (let i = 0; i < 256; i++) {
    if (i < 46) dark += hist[i];
    if (i > 224) bright += hist[i];
  }
  const mean = n ? sumL / n : 0.5;
  return {
    n,
    p01: pct(0.005),
    p99: pct(0.995),
    median: pct(0.5),
    mean,
    std: n ? Math.sqrt(Math.max(0, sumL2 / n - mean * mean)) : 0,
    chroma: n ? sumCh / n : 0,
    darkFrac: n ? dark / n : 0,
    brightFrac: n ? bright / n : 0,
    gray: grayN > n * 0.02 ? [gr / grayN, gg / grayN, gb / grayN] : null,
  };
}

export function autoAdjust(rgba, w, h) {
  const s = analyze(rgba, w, h);
  const a = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0, temperature: 0, tint: 0 };
  if (!s.n) return a;

  // Pozlama: orta ton hedefe yaklaştırılır (fazlası değil).
  const med = Math.max(0.02, s.median);
  if (med < 0.38) {
    const ev = Math.log2(srgbToLinear(0.44) / srgbToLinear(med)) * 0.7;
    a.exposure = clamp(ev, 0, 1.2) * 50;
  } else if (med > 0.66) {
    const ev = Math.log2(srgbToLinear(0.58) / srgbToLinear(med)) * 0.6;
    a.exposure = clamp(ev, -0.5, 0) * 50;
  }

  // Ton aralığını gerer.
  if (s.p01 > 0.06) a.blacks = -Math.min(40, (s.p01 - 0.02) * 400);
  if (s.p99 < 0.92) a.whites = Math.min(40, (0.96 - s.p99) * 400);

  // Gölge ve vurgu kurtarma.
  if (s.darkFrac > 0.22) a.shadows = Math.min(45, s.darkFrac * 100);
  if (s.brightFrac > 0.1) a.highlights = -Math.min(45, s.brightFrac * 150);

  if (s.std < 0.16) a.contrast = Math.min(25, (0.2 - s.std) * 250);
  a.vibrance = s.chroma < 0.22 ? Math.min(30, (0.3 - s.chroma) * 150) : 8;

  // Gri dünya varsayımıyla ölçülü beyaz dengesi.
  if (s.gray) {
    const [r, g, b] = s.gray;
    a.temperature = clamp((b - r) * 250 * 0.6, -25, 25);
    a.tint = clamp((g - (r + b) / 2) * 300 * 0.6, -20, 20);
  }

  for (const k of Object.keys(a)) a[k] = Math.round(a[k]);
  return a;
}
