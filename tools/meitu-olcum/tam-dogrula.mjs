// G7x ve Hard Flash: uygulamanın arayüzünden uçtan uca; G7x çıktısı tam
// çözünürlükte g7x.jpeg ile karşılaştırılır.
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve } from './sunucu.mjs';
import { decodeAll, DIR, REF } from './veri.mjs';

// Kullanım: node tam-dogrula.mjs [meitu-ciktisi.jpeg] [filtre-kimliği]
const TARGET = process.argv[2] || 'g7x.jpeg';
const FILTER = process.argv[3] || 'g7x';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const { encodePng } = await import(pathToFileURL(join(PROJ, 'tests', 'png.mjs')).href);

const OUT = join(DIR, 'olcum');
mkdirSync(OUT, { recursive: true });

const server = await serve(PROJ);
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
const busyTexts = new Set();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text().slice(0, 200)}`));
const check = (c, msg) => {
  if (!c) throw new Error('BAŞARISIZ: ' + msg);
  console.log('  ✓ ' + msg);
};
const idle = () => page.waitForFunction(() => !document.body.classList.contains('is-busy'), null, { timeout: 120000 });

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.setInputFiles('#input-gallery', join(DIR, REF));
  await page.waitForSelector('#screen-editor.is-active');
  await idle();

  console.log(FILTER);
  await page.click('#toolbar [data-tool="filters"]');
  await page.waitForFunction(() => document.querySelectorAll('.fthumb__img canvas').length >= 40, null, { timeout: 60000 });
  check(await page.isVisible(`.fthumb.is-ai[data-id="${FILTER}"]`), `${FILTER} ✦ (yapay zekâ) işaretli`);
  const poll = setInterval(async () => {
    try {
      const t = await page.textContent('#busy .busy__text');
      if (t) busyTexts.add(t.replace(/%\d+/, '%…'));
    } catch {}
  }, 100);
  const t0 = Date.now();
  await page.click(`.fthumb[data-id="${FILTER}"]`);
  await page.waitForFunction((id) => document.querySelector(`.fthumb[data-id="${id}"]`).classList.contains('is-selected'), FILTER, { timeout: 120000 });
  await idle();
  clearInterval(poll);
  console.log(`  derinlik hazırlığı ${Date.now() - t0} ms; mesajlar: ${[...busyTexts].join(' | ')}`);
  const ready = await page.evaluate(async () => (await import('/js/app.js')).host.ai.depthReady);
  check(ready, 'derinlik haritası hazır');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `ui-${FILTER}.png`) });
  await page.click('#tool-apply');
  await idle();
  const ours = await page.evaluate(async () => {
    const { app } = await import('/js/app.js');
    const c = app.doc.canvas;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let s = '';
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return { w: c.width, h: c.height, b64: btoa(s), label: app.doc.history.current.label };
  });
  check(ours.label.startsWith('Filtre:'), `uygulandı (${ours.label})`);

  // Karşılaştırma: g7x.jpeg ile ΔE (CIE76), tüm görüntüde 2 pikselde bir.
  const [ref, meitu] = await decodeAll([REF, TARGET]);
  const px = new Uint8Array(Buffer.from(ours.b64, 'base64'));
  const lab = (r, g, b) => {
    const lin = [r, g, b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
    const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    const Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const des = [];
  let d0 = 0;
  for (let y = 0; y < ours.h; y += 2) {
    for (let x = 0; x < ours.w; x += 2) {
      const i = (y * ours.w + x) * 4;
      const a = lab(meitu.px[i], meitu.px[i + 1], meitu.px[i + 2]);
      const b = lab(px[i], px[i + 1], px[i + 2]);
      const c = lab(ref.px[i], ref.px[i + 1], ref.px[i + 2]);
      des.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
      d0 += Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
    }
  }
  const mean = des.reduce((s, v) => s + v, 0) / des.length;
  des.sort((p, q) => p - q);
  console.log(`  ΔE (${TARGET}'e göre): filtresiz ${(d0 / des.length).toFixed(2)} → uygulamanın G7x'i ${mean.toFixed(2)} (ortanca ${des[des.length >> 1].toFixed(2)}, %90 ${des[Math.floor(des.length * 0.9)].toFixed(2)})`);

  // Yakın planlar: [özgün | Meitu G7X | bizim G7x]
  for (const [name, x0, y0, w, h] of [['tam', 0, 0, 960, 1280], ['yuz', 440, 520, 220, 220], ['lamba', 30, 900, 200, 200], ['deniz', 0, 640, 320, 260]]) {
    const S = name === 'tam' ? 0.5 : 2;
    const cw = Math.round(w * S), ch = Math.round(h * S);
    const MW = cw * 3 + 12;
    const img = new Uint8Array(MW * ch * 4).fill(30);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const sx = x0 + Math.min(w - 1, Math.floor(x / S));
        const sy = y0 + Math.min(h - 1, Math.floor(y / S));
        const i = (sy * ref.w + sx) * 4;
        [ref.px, meitu.px, px].forEach((src, k) => {
          const o = (y * MW + k * (cw + 6) + x) * 4;
          img[o] = src[i];
          img[o + 1] = src[i + 1];
          img[o + 2] = src[i + 2];
          img[o + 3] = 255;
        });
      }
    }
    writeFileSync(join(OUT, `dogrula-${name}.png`), encodePng(img, MW, ch));
  }

  console.log('Hard Flash');
  await page.click('#btn-undo');
  await idle();
  await page.click('#toolbar [data-tool="filters"]');
  await page.waitForSelector('.panel-filters');
  await page.click('.fthumb[data-id="hardflash"]');
  await page.waitForFunction(() => document.querySelector('.fthumb[data-id="hardflash"]').classList.contains('is-selected'), null, { timeout: 60000 });
  await idle();
  const fa = await page.evaluate(async () => {
    const { host } = await import('/js/app.js');
    return { ready: host.ai.facesReady, at: host.ai.flashAt(1.02) };
  });
  check(fa.ready && Math.abs(fa.at[0] - 0.57) < 0.03 && Math.abs(fa.at[1] - 0.50) < 0.03, `flaş yüzün üstünde: ${fa.at.map((v) => v.toFixed(3)).join(', ')}`);
  await page.click('#tool-apply');
  await idle();
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  console.log(errors.length ? `konsol:\n  ${errors.join('\n  ')}` : 'konsolda hata yok');
  await browser.close();
  server.close();
}
