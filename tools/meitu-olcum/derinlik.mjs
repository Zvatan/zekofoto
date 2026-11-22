// Derinlik ve yüz algılamayı uygulamanın modülleriyle referans fotoğrafta dener.
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve } from './sunucu.mjs';
import { DIR, REF } from './veri.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const { encodePng } = await import(pathToFileURL(join(PROJ, 'tests', 'png.mjs')).href);
const PHOTO = process.argv[2] || join(DIR, REF);
const OUT = join(DIR, 'olcum');
mkdirSync(OUT, { recursive: true });

const server = await serve(PROJ);
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('konsol:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const res = await page.evaluate(async (src) => {
  const img = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const { estimateDepth } = await import('/js/ai/depth.js');
  const { detectFaces } = await import('/js/ai/faces.js');
  const prog = [];
  let t0 = performance.now();
  const d = await estimateDepth(c, { onProgress: (p) => prog.push(Math.round(p * 100)) });
  const tDepth1 = performance.now() - t0;
  t0 = performance.now();
  await estimateDepth(c);
  const tDepth2 = performance.now() - t0;
  t0 = performance.now();
  const faces = await detectFaces(c);
  const tFace = performance.now() - t0;
  let s = '';
  for (let i = 0; i < d.data.length; i += 0x8000) s += String.fromCharCode.apply(null, d.data.subarray(i, i + 0x8000));
  return { w: d.w, h: d.h, b64: btoa(s), faces, tDepth1, tDepth2, tFace, prog: [prog[0], prog[Math.floor(prog.length / 2)], prog[prog.length - 1], prog.length] };
}, 'data:image/jpeg;base64,' + readFileSync(PHOTO).toString('base64'));
await browser.close();
server.close();

console.log(`derinlik ${res.w}×${res.h}; ilk çalıştırma (indirme+kurulum) ${res.tDepth1.toFixed(0)} ms, ikinci ${res.tDepth2.toFixed(0)} ms; yüz ${res.tFace.toFixed(0)} ms`);
console.log('ilerleme örnekleri:', res.prog.join(', '));
console.log('yüzler:', JSON.stringify(res.faces.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.w), h: Math.round(f.h), s: +f.score.toFixed(3) }))));
const depth = new Uint8Array(Buffer.from(res.b64, 'base64'));
writeFileSync(join(OUT, 'derinlik.bin'), depth);
writeFileSync(join(OUT, 'derinlik.json'), JSON.stringify({ w: res.w, h: res.h, faces: res.faces }));
const img = new Uint8Array(res.w * res.h * 4);
for (let i = 0; i < res.w * res.h; i++) {
  img[i * 4] = img[i * 4 + 1] = img[i * 4 + 2] = depth[i];
  img[i * 4 + 3] = 255;
}
writeFileSync(join(OUT, 'derinlik.png'), encodePng(img, res.w, res.h));
