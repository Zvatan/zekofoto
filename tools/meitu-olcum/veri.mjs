// Meitu ölçüm verisi: referans fotoğraf + önizlemeler → hizalanmış ızgaralar.
// Her filtre için N×N (önizleme kutusu çözünürlüğünde) girdi, rehber (bizim
// motorun bulanık kopyasıyla aynı ölçek), çıktı ve maske.
// playwright-core: bu klasörde `npm i` ile kurulur ya da PLAYWRIGHT_CORE ortam değişkeni başka bir kopyayı gösterir.
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DIR = process.env.MEITU_DIR || 'C:\\Users\\zeker\\OneDrive\\Desktop\\meitu-ekran';
export const REF = 'referans foto.jpeg';
export const THUMBS = [
  ['WhatsApp Image 2026-11-22 at 15.39.52.jpeg', 'Flash Film'],
  ['WhatsApp Image 2026-11-22 at 15.40.10.jpeg', 'DSLR'],
  ['WhatsApp Image 2026-11-22 at 15.40.28.jpeg', 'HDF'],
  ['WhatsApp Image 2026-11-22 at 15.40.56.jpeg', 'Glowy Flash'],
  ['WhatsApp Image 2026-11-22 at 15.41.29.jpeg', 'Hard Flash'],
  ['WhatsApp Image 2026-11-22 at 15.43.28.jpeg', 'G7x'],
];

export const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

export async function decodeAll(files) {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const page = await browser.newPage();
  const srcs = files.map((f) => 'data:image/jpeg;base64,' + readFileSync(join(DIR, f)).toString('base64'));
  const decoded = await page.evaluate(async (list) => {
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
    const res = [];
    for (const s of list) {
      const im = await load(s);
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let bin = '';
      for (let i = 0; i < d.length; i += 0x8000) bin += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
      res.push({ w: c.width, h: c.height, b64: btoa(bin) });
    }
    return res;
  }, srcs);
  await browser.close();
  return decoded.map((d) => ({ w: d.w, h: d.h, px: new Uint8Array(Buffer.from(d.b64, 'base64')) }));
}

export function integral(img, ch) {
  const { w, h, px } = img;
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      row += ch === 3 ? luma(px[o], px[o + 1], px[o + 2]) : px[o + ch];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  return I;
}

export function boxMean(I, w, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.round(x0));
  y0 = Math.max(0, Math.round(y0));
  x1 = Math.max(x0 + 1, Math.round(x1));
  y1 = Math.max(y0 + 1, Math.round(y1));
  const W = w + 1;
  return (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
}

export function findBox(img) {
  const { w, h, px } = img;
  const bright = (x, y) => {
    const o = (y * w + x) * 4;
    return px[o] + px[o + 1] + px[o + 2] > 90;
  };
  const rows = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (bright(x, y)) n++;
    rows.push(n / w);
  }
  let best = [0, 0];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const full = y < h && rows[y] > 0.6;
    if (full && start < 0) start = y;
    if (!full && start >= 0) {
      if (y - start > best[1] - best[0]) best = [start, y];
      start = -1;
    }
  }
  const [y0, y1] = best;
  const mid = Math.round((y0 + y1) / 2);
  let x0 = 0;
  let x1 = w;
  while (x0 < w && !bright(x0, mid)) x0++;
  while (x1 > 0 && !bright(x1 - 1, mid)) x1--;
  return { x0, y0, x1, y1 };
}

export function maskOf(n) {
  const m = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const v = (j + 0.5) / n;
      const badge = u < 0.32 && v < 0.33;
      const corner = Math.min(Math.hypot(u, v), Math.hypot(1 - u, v), Math.hypot(u, 1 - v), Math.hypot(1 - u, 1 - v)) < 0.11;
      const edge = u < 0.03 || v < 0.03 || u > 0.97 || v > 0.97;
      m[j * n + i] = badge || corner || edge ? 0 : 1;
    }
  }
  return m;
}

function corr(a, b, m) {
  let n = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) if (m[i]) { n++; sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    if (!m[i]) continue;
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / Math.sqrt(da * db + 1e-12);
}

function align(ref, refL, tI, tw, box) {
  const grid = (I, w, x, y, cw, ch, n) => {
    const g = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = boxMean(I, w, x + i * cw, y + j * ch, x + (i + 1) * cw, y + (j + 1) * ch);
    return g;
  };
  let best = { c: -2 };
  const range = (a, b, st) => { const r = []; for (let v = a; v <= b + 1e-9; v += st) r.push(v); return r; };
  const search = (n, sList, xs, ys) => {
    const tg = grid(tI, tw, box.x0, box.y0, (box.x1 - box.x0) / n, (box.y1 - box.y0) / n, n);
    const m = maskOf(n);
    for (const s of sList) for (const x of xs(s)) for (const y of ys(s)) {
      const c = corr(grid(refL, ref.w, x, y, s / n, s / n, n), tg, m);
      if (c > best.c) best = { c, x, y, s };
    }
  };
  search(24, range(700, 960, 10), (s) => range(0, ref.w - s, 8), (s) => range(0, ref.h - s, 8));
  const b1 = { ...best };
  search(48, range(b1.s - 12, Math.min(960, b1.s + 12), 2), (s) => range(Math.max(0, b1.x - 10), Math.min(ref.w - s, b1.x + 10), 2), (s) => range(Math.max(0, b1.y - 10), Math.min(ref.h - s, b1.y + 10), 2));
  const b2 = { ...best };
  search(96, range(b2.s - 3, Math.min(960, b2.s + 3), 1), (s) => range(Math.max(0, b2.x - 3), Math.min(ref.w - s, b2.x + 3), 1), (s) => range(Math.max(0, b2.y - 3), Math.min(ref.h - s, b2.y + 3), 1));
  return best;
}

// Ayrılabilir Gauss bulanıklığı (N×N×3, kenarlar kenetli).
export function gaussBlur(src, n, sigma) {
  const R = Math.ceil(sigma * 3);
  const k = [];
  let sum = 0;
  for (let i = -R; i <= R; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    sum += v;
  }
  const kk = k.map((v) => v / sum);
  const tmp = new Float64Array(src.length);
  const out = new Float64Array(src.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let i = -R; i <= R; i++) s += src[(y * n + Math.min(n - 1, Math.max(0, x + i))) * 3 + c] * kk[i + R];
    tmp[(y * n + x) * 3 + c] = s;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let i = -R; i <= R; i++) s += tmp[(Math.min(n - 1, Math.max(0, y + i)) * n + x) * 3 + c] * kk[i + R];
    out[(y * n + x) * 3 + c] = s;
  }
  return out;
}

export async function loadData() {
  const imgs = await decodeAll([REF, ...THUMBS.map((t) => t[0])]);
  const ref = imgs[0];
  const refL = integral(ref, 3);
  const refC = [integral(ref, 0), integral(ref, 1), integral(ref, 2)];
  const filters = [];
  for (let t = 0; t < THUMBS.length; t++) {
    const img = imgs[t + 1];
    const box = findBox(img);
    const a = align(ref, refL, integral(img, 3), img.w, box);
    const N = Math.min(box.x1 - box.x0, box.y1 - box.y0);
    const tC = [integral(img, 0), integral(img, 1), integral(img, 2)];
    const inp = new Float64Array(N * N * 3);
    const out = new Float64Array(N * N * 3);
    const cell = a.s / N;
    const bw = (box.x1 - box.x0) / N;
    const bh = (box.y1 - box.y0) / N;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        for (let c = 0; c < 3; c++) {
          // Önizleme JPEG'i hafif bulanık; iki taraf da 3×3 hücreyle yumuşatılır.
          inp[(j * N + i) * 3 + c] = boxMean(refC[c], ref.w, a.x + (i - 1) * cell, a.y + (j - 1) * cell, a.x + (i + 2) * cell, a.y + (j + 2) * cell) / 255;
          out[(j * N + i) * 3 + c] = boxMean(tC[c], img.w, box.x0 + (i - 1) * bw, box.y0 + (j - 1) * bh, box.x0 + (i + 2) * bw, box.y0 + (j + 2) * bh) / 255;
        }
      }
    }
    // Bizim motorun rehber dokusu: uzun kenarın %1,5625'i σ (384 px'te 6 px).
    const sigmaRef = (6 * Math.max(ref.w, ref.h)) / 384;
    const raw = new Float64Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) {
      raw[(j * N + i) * 3 + c] = boxMean(refC[c], ref.w, a.x + i * cell, a.y + j * cell, a.x + (i + 1) * cell, a.y + (j + 1) * cell) / 255;
    }
    const guide = gaussBlur(raw, N, sigmaRef / cell);
    filters.push({ name: THUMBS[t][1], N, align: a, inp, out, guide, mask: maskOf(N), refSize: [ref.w, ref.h] });
  }
  return { ref, refC, filters };
}
