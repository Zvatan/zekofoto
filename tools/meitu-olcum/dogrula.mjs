// Doğrulama: referans fotoğraf uygulamanın kendi motoruyla (WebGL) Meitu
// filtrelerinden geçirilir; ortadaki kare 128 px'e küçültülüp Meitu
// önizlemeleriyle karşılaştırılır (ΔE). Ayrıca tam boy çıktılar kaydedilir.
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve } from './sunucu.mjs';
import { decodeAll, integral, boxMean, findBox, maskOf, DIR, REF, THUMBS, luma } from './veri.mjs';

const PROJ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const { encodePng } = await import(pathToFileURL(`${PROJ}/tests/png.mjs`).href);
const HERE = dirname(fileURLToPath(import.meta.url));
// Çıktılar kişisel fotoğraf içerir: proje dışında, ekran görüntülerinin yanında.
const OUT = join(DIR, 'olcum');
mkdirSync(OUT, { recursive: true });
const IDS = { 'Flash Film': 'flashfilm', DSLR: 'dslr', HDF: 'hdf', 'Glowy Flash': 'glowyflash', 'Hard Flash': 'hardflash', G7x: 'g7x' };

const server = await serve(fileURLToPath(new URL('../../', import.meta.url)));
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.setInputFiles('#input-gallery', join(DIR, REF));
await page.waitForSelector('#screen-editor.is-active');
await page.waitForFunction(() => !document.body.classList.contains('is-busy'));

const renders = await page.evaluate(async (ids) => {
  const { app } = await import('/js/app.js');
  const { findFilter } = await import('/js/core/presets.js');
  const c = await import('/js/core/color.js');
  const { defaultSpec } = await import('/js/gl/engine.js');
  const eng = app.engine;
  const W = app.doc.canvas.width;
  const H = app.doc.canvas.height;
  const buf = new Float32Array(c.lutLength());
  const b64 = (d) => {
    let s = '';
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const out = {};
  for (const [name, id] of Object.entries(ids)) {
    const f = findFilter(id);
    const k = c.compileLook(f.look);
    eng.setLuts({ post: c.bakeLut((x) => c.applyLook(x, k), buf) });
    const a = f.amount / 100;
    const sp = k.spatial;
    const s = defaultSpec(W, H);
    s.post = true;
    s.postAmount = a;
    s.tone = [sp.highlights * a, sp.shadows * a, sp.clarity * a];
    s.fx = [sp.sharpen * a, sp.grain * a, sp.vignette * a];
    const full = eng.renderImage(s, W, H);
    // Ortadaki kare → 128 px (Meitu önizlemesiyle aynı kesit).
    const small = document.createElement('canvas');
    small.width = 128;
    small.height = 128;
    const g = small.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(full, 0, (H - W) / 2, W, W, 0, 0, 128, 128);
    const blob = await new Promise((r) => full.toBlob(r, 'image/jpeg', 0.92));
    const jpg = new Uint8Array(await blob.arrayBuffer());
    out[name] = { small: b64(g.getImageData(0, 0, 128, 128).data), jpg: b64(jpg) };
  }
  return out;
}, IDS);
await browser.close();
server.close();

// Meitu önizlemeleri: aynı 128 ızgarada, iki taraf da aynı yumuşatmayla.
const imgs = await decodeAll(THUMBS.map((t) => t[0]));
const lab = (c) => {
  const lin = c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
  const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const N = 128;
const mask = maskOf(N);
const S = 3;
const sheetW = 2 * N * S + 18;
const sheetH = THUMBS.length * (N * S + 6) + 6;
const sheet = new Uint8Array(sheetW * sheetH * 4).fill(25);
for (let t = 0; t < THUMBS.length; t++) {
  const name = THUMBS[t][1];
  const img = imgs[t];
  const box = findBox(img);
  const tC = [integral(img, 0), integral(img, 1), integral(img, 2)];
  const ours = { w: N, h: N, px: new Uint8Array(Buffer.from(renders[name].small, 'base64')) };
  const oC = [integral(ours, 0), integral(ours, 1), integral(ours, 2)];
  const bw = (box.x1 - box.x0) / N;
  const bh = (box.y1 - box.y0) / N;
  let de = 0;
  let n = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const m = [0, 1, 2].map((c) => boxMean(tC[c], img.w, box.x0 + (i - 2) * bw, box.y0 + (j - 2) * bh, box.x0 + (i + 3) * bw, box.y0 + (j + 3) * bh) / 255);
      const o = [0, 1, 2].map((c) => boxMean(oC[c], N, i - 2, j - 2, i + 3, j + 3) / 255);
      if (mask[j * N + i]) {
        const a = lab(m);
        const b = lab(o);
        de += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        n++;
      }
      // görsel: [Meitu | bizim]
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const tx = Math.min(img.w - 1, Math.floor(box.x0 + (i + (x + 0.5) / S) * bw));
          const ty = Math.min(img.h - 1, Math.floor(box.y0 + (j + (y + 0.5) / S) * bh));
          const to = (ty * img.w + tx) * 4;
          const oy = 6 + t * (N * S + 6) + j * S + y;
          const p1 = (oy * sheetW + 6 + i * S + x) * 4;
          const p2 = (oy * sheetW + 12 + N * S + i * S + x) * 4;
          for (let q = 0; q < 3; q++) {
            sheet[p1 + q] = img.px[to + q];
            sheet[p2 + q] = ours.px[(j * N + i) * 4 + q];
          }
          sheet[p1 + 3] = sheet[p2 + 3] = 255;
        }
      }
    }
  }
  writeFileSync(join(OUT, `tam-${IDS[name]}.jpg`), Buffer.from(renders[name].jpg, 'base64'));
  console.log(`${name.padEnd(12)} uygulamanın motoruyla ΔE = ${(de / n).toFixed(2)}`);
}
writeFileSync(join(OUT, 'dogrulama.png'), encodePng(sheet, sheetW, sheetH));
console.log(errors.length ? `konsol: ${errors.join(' | ')}` : 'konsolda hata yok');
console.log('Görsel: olcum/dogrulama.png (sol Meitu, sağ bizim), tam boy: olcum/tam-*.jpg');
