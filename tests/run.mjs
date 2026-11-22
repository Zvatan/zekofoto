// Çekirdek testleri (Node 18+, bağımlılık yok):  node tests/run.mjs
// Renk zinciri, filtre tarifleri, geometri ve otomatik iyileştirme sınanır;
// filtrelerin görsel kontrolü için tests/out/ altına PNG yazılır.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileLook, applyLook, applyPre, applyPost, bakeLut, sampleLut, curveTable, bandWeights,
  neutralAdjust, HSL_BANDS, LUT_SIZE,
} from '../js/core/color.js';
import { FILTERS, FILTER_CATEGORIES, EFFECTS } from '../js/core/presets.js';
import {
  identityGeom, forwardMatrix, renderMatrix, validPolygon, rectInPolygon, maxRect, fitRect, refreshCrop,
  rotate90, flip, frameSize, cropToPx, outputSize, inv, mul, apply, homography, constrainMove, snapCrop,
} from '../js/core/geometry.js';
import { autoAdjust } from '../js/core/auto.js';
import { exifDate, parseExifDate } from '../js/core/exif.js';
import { normalizeDepth, letterbox, nms, decodeFaces } from '../js/core/vision.js';
import { encodePng } from './png.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≉ ${b} (±${eps})`);
const run = (look, rgb) => applyLook(Float64Array.from(rgb), compileLook(look));

// --- renk ---------------------------------------------------------------

console.log('Renk zinciri');

test('nötr ayarlar birim dönüşümdür', () => {
  const k = compileLook({ ...neutralAdjust() });
  assert.equal(k.pre, null);
  assert.equal(k.post.active, false);
  const lut = bakeLut((c) => applyLook(c, k));
  for (let i = 0; i < lut.length; i += 4) {
    const j = i / 4;
    const r = (j % LUT_SIZE) / (LUT_SIZE - 1);
    near(lut[i], r, 1e-6);
  }
});

test('pozlama tekdüze artar, beyazlar kesilmez', () => {
  let prev = -1;
  for (let x = 0; x <= 1.0001; x += 0.05) {
    const y = run({ exposure: 60 }, [x, x, x])[0];
    assert.ok(y >= prev - 1e-9, `x=${x}`);
    assert.ok(y <= 1);
    prev = y;
  }
  near(run({ exposure: 60 }, [1, 1, 1])[0], 1, 0.01);
  assert.ok(run({ exposure: 60 }, [0.4, 0.4, 0.4])[0] > 0.55);
  assert.ok(run({ exposure: -60 }, [0.4, 0.4, 0.4])[0] < 0.3);
});

test('sıcaklık griyi ısıtır, parlaklığı korur', () => {
  const [r, g, b] = run({ temperature: 60 }, [0.5, 0.5, 0.5]);
  assert.ok(r > g && g > b);
  near(0.299 * r + 0.587 * g + 0.114 * b, 0.5, 0.04);
});

test('kontrast 0, 0.5 ve 1 noktalarını korur', () => {
  for (const ct of [-80, 50, 100]) {
    near(run({ contrast: ct }, [0, 0, 0])[0], 0, 1e-3);
    near(run({ contrast: ct }, [0.5, 0.5, 0.5])[0], 0.5, 1e-3);
    near(run({ contrast: ct }, [1, 1, 1])[0], 1, 1e-3);
  }
  assert.ok(run({ contrast: 60 }, [0.25, 0.25, 0.25])[0] < 0.25);
  assert.ok(run({ contrast: -60 }, [0.25, 0.25, 0.25])[0] > 0.25);
});

test('doygunluk -100 griye çevirir; +100 tonu kaydırmaz', () => {
  const [r, g, b] = run({ saturation: -100 }, [0.8, 0.3, 0.2]);
  near(r, g, 1e-9);
  near(g, b, 1e-9);
  const c = run({ saturation: 100 }, [0.6, 0.4, 0.3]);
  assert.ok(c[0] > 0.6 && c[2] < 0.3);
  assert.ok(c.every((v) => v >= 0 && v <= 1));
  // sıra korunur (ton kaymaz)
  assert.ok(c[0] > c[1] && c[1] > c[2]);
});

test('canlılık ten rengini daha az etkiler', () => {
  const skin = [0.85, 0.62, 0.5];
  const blue = [0.4, 0.5, 0.7];
  const ds = run({ vibrance: 80 }, skin);
  const db = run({ vibrance: 80 }, blue);
  const chroma = (c) => Math.max(...c) - Math.min(...c);
  const gainSkin = chroma(ds) / chroma(skin);
  const gainBlue = chroma(db) / chroma(blue);
  assert.ok(gainBlue > gainSkin, `${gainBlue} > ${gainSkin}`);
});

test('eğri: birim eğri birimdir, tekdüze noktalarda taşma yok', () => {
  const id = curveTable([[0, 0], [1, 1]]);
  for (let i = 0; i < id.length; i++) near(id[i], i / (id.length - 1), 1e-6);
  const s = curveTable([[0, 0], [0.25, 0.15], [0.5, 0.5], [0.75, 0.85], [1, 1]]);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] >= s[i - 1] - 1e-7);
  near(s[Math.round(0.25 * (s.length - 1))], 0.15, 0.003);
});

test('HSL bant ağırlıklarının toplamı 1', () => {
  for (let h = 0; h < 360; h += 7) {
    const [, , a, b] = bandWeights(h);
    near(a + b, 1, 1e-9, `h=${h}`);
  }
  const [i, , wi] = bandWeights(HSL_BANDS[5].hue);
  assert.equal(i, 5);
  near(wi, 1, 1e-9);
});

test('HSL: mavi doygunluğu yalnızca maviyi etkiler', () => {
  const look = { hsl: { blue: { h: 0, s: -100, l: 0 } } };
  const blue = run(look, [0.2, 0.35, 0.9]);
  const red = run(look, [0.9, 0.2, 0.2]);
  assert.ok(Math.max(...blue) - Math.min(...blue) < 0.1);
  near(red[0], 0.9, 1e-6);
});

test('renk dengesi: gölgelere mavi verir, griyi bozmaz', () => {
  const look = { grade: { shadows: { hue: 220, sat: 60 }, midtones: { hue: 0, sat: 0 }, highlights: { hue: 0, sat: 0 }, balance: 0 } };
  const d = run(look, [0.1, 0.1, 0.1]);
  assert.ok(d[2] > d[0]);
  const w = run(look, [0.95, 0.95, 0.95]);
  assert.ok(Math.abs(w[2] - w[0]) < 0.01);
});

test('3B tablo örneklemesi doğrudan hesapla uyuşur', () => {
  const k = compileLook({ contrast: 30, saturation: 20, temperature: 15, hsl: { red: { h: 20, s: 10, l: 0 } } });
  const lut = bakeLut((c) => applyLook(c, k));
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const c = [Math.random(), Math.random(), Math.random()];
    const a = sampleLut(lut, c);
    const b = applyLook(Float64Array.from(c), k);
    worst = Math.max(worst, ...a.map((v, j) => Math.abs(v - b[j])));
  }
  assert.ok(worst < 0.03, `en kötü fark ${worst}`);
});

// --- filtreler -----------------------------------------------------------

console.log('Filtreler');

test('her filtrenin geçerli kategorisi ve benzersiz kimliği var', () => {
  const ids = new Set();
  const cats = new Set(FILTER_CATEGORIES.map((c) => c.id));
  for (const f of FILTERS) {
    assert.ok(!ids.has(f.id), f.id);
    ids.add(f.id);
    assert.ok(cats.has(f.cat), f.id);
    if (f.fx) assert.ok(EFFECTS[f.fx], f.id);
  }
  for (const c of cats) assert.ok(FILTERS.some((f) => f.cat === c), c);
});

test('renk filtreleri sonlu, 0..1 aralığında ve birimden farklı', () => {
  for (const f of FILTERS.filter((x) => x.look)) {
    const k = compileLook(f.look);
    const lut = bakeLut((c) => applyLook(c, k));
    let diff = 0;
    for (let i = 0; i < lut.length; i++) {
      assert.ok(Number.isFinite(lut[i]) && lut[i] >= 0 && lut[i] <= 1, `${f.id} [${i}] = ${lut[i]}`);
    }
    for (let i = 0; i < lut.length; i += 4 * 97) {
      const j = i / 4;
      const r = (j % LUT_SIZE) / (LUT_SIZE - 1);
      diff = Math.max(diff, Math.abs(lut[i] - r));
    }
    const s = k.spatial;
    const spatial = Math.abs(s.clarity) + Math.abs(s.vignette) + s.grain + Math.abs(s.highlights) + Math.abs(s.shadows);
    assert.ok(diff > 0.01 || spatial > 0, `${f.id} etkisiz`);
  }
});

test('kamera eklerinin değerleri geçerli', () => {
  const keys = ['bloom', 'halation', 'ca', 'flash', 'soft', 'noise'];
  assert.ok(FILTERS.filter((f) => f.cat === 'kamera').length >= 7);
  const cams = FILTERS.filter((f) => f.extras);
  assert.ok(cams.length >= 1);
  for (const f of cams) {
    for (const k of Object.keys(f.extras)) {
      assert.ok([...keys, 'threshold', 'leak', 'date', 'faceFlash', 'depth'].includes(k), `${f.id}: bilinmeyen ek ${k}`);
    }
    if (f.extras.faceFlash) {
      const ff = f.extras.faceFlash;
      assert.ok(ff.amount > 0 && ff.amount <= 1 && ff.size > 0, `${f.id}.faceFlash`);
      assert.ok(f.ai, `${f.id} yapay zekâ işaretli olmalı`);
    }
    if (f.extras.depth) {
      const d = f.extras.depth;
      assert.ok(d.center > 0 && d.center < 1 && d.width > 0 && d.look, `${f.id}.depth`);
      assert.ok(f.ai, `${f.id} yapay zekâ işaretli olmalı`);
      // Yakın plan tarifi de geçerli bir tablo üretmeli.
      const lut = bakeLut((c) => applyLook(c, compileLook(d.look)));
      for (let i = 0; i < lut.length; i++) assert.ok(Number.isFinite(lut[i]) && lut[i] >= 0 && lut[i] <= 1);
    }
    for (const k of keys) {
      const v = f.extras[k] ?? 0;
      assert.ok(v >= 0 && v <= 1, `${f.id}.${k} = ${v}`);
    }
    if (f.extras.leak) {
      const l = f.extras.leak;
      assert.ok(l.color.length === 3 && l.at.length === 2 && l.size > 0 && l.amount > 0, `${f.id}.leak`);
    }
  }
});

// --- EXIF ----------------------------------------------------------------

console.log('EXIF tarihi');

// Küçük ama geçerli bir EXIF bloğu: IFD0 → ExifIFD → DateTimeOriginal.
function jpegWithExif(dateStr, little = true) {
  const tiff = new DataView(new ArrayBuffer(64));
  const u16 = (o, v) => tiff.setUint16(o, v, little);
  const u32 = (o, v) => tiff.setUint32(o, v, little);
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  u16(2, 42);
  u32(4, 8);
  u16(8, 1); // IFD0: 1 kayıt
  u16(10, 0x8769);
  u16(12, 4);
  u32(14, 1);
  u32(18, 26); // ExifIFD konumu
  u32(22, 0);
  u16(26, 1); // ExifIFD: 1 kayıt
  u16(28, 0x9003);
  u16(30, 2);
  u32(32, 20);
  u32(36, 44); // metnin konumu
  u32(40, 0);
  for (let i = 0; i < 19; i++) tiff.setUint8(44 + i, dateStr.charCodeAt(i));
  const app1 = new Uint8Array(2 + 2 + 6 + 64);
  const v = new DataView(app1.buffer);
  v.setUint16(0, 0xffe1);
  v.setUint16(2, 2 + 6 + 64);
  app1.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  app1.set(new Uint8Array(tiff.buffer), 10);
  const out = new Uint8Array(2 + app1.length + 4);
  out.set([0xff, 0xd8], 0);
  out.set(app1, 2);
  out.set([0xff, 0xda, 0, 2], 2 + app1.length);
  return out.buffer;
}

test('DateTimeOriginal okunur (Intel ve Motorola bayt sırası)', () => {
  for (const little of [true, false]) {
    const d = exifDate(jpegWithExif('2024:05:17 14:23:05', little));
    assert.ok(d, 'tarih bulunamadı');
    assert.equal(d.getFullYear(), 2024);
    assert.equal(d.getMonth(), 4);
    assert.equal(d.getDate(), 17);
    assert.equal(d.getHours(), 14);
  }
});

test('EXIF yoksa ya da bozuksa null', () => {
  assert.equal(exifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer), null);
  assert.equal(exifDate(new Uint8Array([1, 2, 3, 4]).buffer), null);
  assert.equal(parseExifDate('0000:00:00 00:00:00'), null);
  assert.equal(parseExifDate('abc'), null);
});

// --- yapay zekâ son işlemleri -------------------------------------------

console.log('Derinlik ve yüz');

test('derinlik 0..255 aralığına, uç değerler kırpılarak yayılır', () => {
  const w = 10, h = 10;
  const raw = new Float32Array(w * h);
  for (let i = 0; i < raw.length; i++) raw[i] = i;
  raw[0] = -1000; // aşırı uzak değer ölçeği bozmamalı
  raw[99] = 5000;
  const d = normalizeDepth(raw, w, h);
  assert.equal(d.data.length, 100);
  assert.equal(d.data[0], 0);
  assert.equal(d.data[99], 255);
  assert.ok(d.data[50] > 100 && d.data[50] < 160, `orta ${d.data[50]}`);
  for (let i = 2; i < 97; i++) assert.ok(d.data[i] >= d.data[i - 1], 'tekdüze');
});

test('letterbox oranı korur ve ortalar', () => {
  const lb = letterbox(960, 1280, 320, 240);
  near(lb.scale, 0.1875, 1e-9);
  near(lb.w, 180, 1e-9);
  near(lb.h, 240, 1e-9);
  near(lb.ox, 70, 1e-9);
  near(lb.oy, 0, 1e-9);
});

test('NMS çakışan kutulardan en güçlüsünü tutar', () => {
  const kept = nms([
    { x: 0, y: 0, w: 10, h: 10, score: 0.8 },
    { x: 1, y: 1, w: 10, h: 10, score: 0.95 },
    { x: 50, y: 50, w: 10, h: 10, score: 0.7 },
  ]);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].score, 0.95);
});

test('yüz kutuları özgün piksellere çevrilir, büyükten küçüğe sıralanır', () => {
  const lb = letterbox(960, 1280, 320, 240);
  // Girdide (x0,y0,x1,y1) = (0.5,0.5,0.6,0.7) → piksel (160,120)-(192,168)
  const scores = new Float32Array([0.1, 0.9, 0.9, 0.1, 0.2, 0.8]);
  const boxes = new Float32Array([0.5, 0.5, 0.6, 0.7, 0, 0, 1, 1, 0.3, 0.1, 0.35, 0.2]);
  const faces = decodeFaces(scores, boxes, 3, { inW: 320, inH: 240, srcW: 960, srcH: 1280, lb, threshold: 0.7 });
  assert.equal(faces.length, 2);
  // Model çıktısı 32 bit kayan nokta: tolerans buna göre.
  near(faces[0].x, (0.5 * 320 - 70) / 0.1875, 1e-3);
  near(faces[0].y, (0.5 * 240) / 0.1875, 1e-3);
  near(faces[0].w, (0.1 * 320) / 0.1875, 1e-3);
  assert.ok(faces[0].w * faces[0].h >= faces[1].w * faces[1].h);
});

// --- geometri ------------------------------------------------------------

console.log('Geometri');

const W = 400;
const H = 300;
const colMajorApply = (m, u, v) => {
  const x = m[0] * u + m[3] * v + m[6];
  const y = m[1] * u + m[4] * v + m[7];
  const w = m[2] * u + m[5] * v + m[8];
  return [x / w, y / w];
};

test('birim geometride çıktı köşeleri kaynak köşeleridir', () => {
  const m = renderMatrix(identityGeom(), W, H);
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1], [0.3, 0.7]]) {
    const [x, y] = colMajorApply(m, u, v);
    near(x, u, 1e-6);
    near(y, v, 1e-6);
  }
});

test('homografi dört noktayı eşler', () => {
  const src = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const dst = [[1, 2], [9, 1], [11, 12], [-1, 9]];
  const Hm = homography(src, dst);
  src.forEach((p, i) => {
    const q = apply(Hm, ...p);
    near(q[0], dst[i][0], 1e-6);
    near(q[1], dst[i][1], 1e-6);
  });
  const I = mul(Hm, inv(Hm));
  [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => near(I[i] / I[8], v, 1e-9));
});

test('saat yönünde 90°: çerçeve boyutu ve köşe eşlemesi', () => {
  const g = rotate90(identityGeom(), 1);
  assert.deepEqual(frameSize(g, W, H), [H, W]);
  const F = forwardMatrix(g, W, H);
  // Kaynağın sol üst köşesi saat yönünde dönünce sağ üstte olmalı.
  const [x, y] = apply(F, 0, 0);
  near(x, H, 1e-9);
  near(y, 0, 1e-9);
  const m = renderMatrix(g, W, H);
  const [sx, sy] = colMajorApply(m, 1, 0); // çıktının sağ üstü
  near(sx, 0, 1e-9);
  near(sy, 0, 1e-9);
});

test('dört kez döndürme ve iki kez aynalama başa döner', () => {
  const g = identityGeom();
  g.crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.3 };
  g.persV = 30;
  g.persH = -20;
  for (let i = 0; i < 4; i++) rotate90(g, 1);
  assert.deepEqual(g.orient.map(Math.abs), [1, 0, 0, 1]);
  assert.equal(g.orient[0], 1);
  near(g.crop.x, 0.1, 1e-9);
  near(g.crop.w, 0.5, 1e-9);
  assert.equal(g.persV, 30);
  flip(g, 'h');
  flip(g, 'h');
  assert.deepEqual(g.orient, [1, 0, 0, 1]);
  near(g.crop.x, 0.1, 1e-9);
});

test('döndürüp ters döndürmek kırpmayı korur', () => {
  const g = identityGeom();
  g.crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.3 };
  rotate90(g, 1);
  rotate90(g, -1);
  near(g.crop.x, 0.1, 1e-9);
  near(g.crop.y, 0.2, 1e-9);
  near(g.crop.w, 0.5, 1e-9);
  near(g.crop.h, 0.3, 1e-9);
});

test('açı verilince otomatik kırpma görüntünün içinde kalır', () => {
  for (const angle of [3, -12, 30, 45]) {
    const g = identityGeom();
    g.angle = angle;
    refreshCrop(g, W, H);
    const [Wf, Hf] = frameSize(g, W, H);
    const poly = validPolygon(g, W, H);
    const r = cropToPx(g.crop, Wf, Hf);
    assert.ok(rectInPolygon(r, poly), `açı ${angle}`);
    near(r.w / r.h, W / H, 1e-3, 'oran');
    // simetri: merkezde olmalı
    near(r.x + r.w / 2, Wf / 2, 0.5);
    // Kırpılmış kaynak pikselleri gerçekten görüntünün içinden okunur.
    const m = renderMatrix(g, W, H);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const [x, y] = colMajorApply(m, u, v);
      assert.ok(x >= -1e-4 && x <= 1 + 1e-4 && y >= -1e-4 && y <= 1 + 1e-4, `açı ${angle}: ${x},${y}`);
    }
  }
});

test('perspektif kırpması dörtgenin içinde ve olabildiğince büyük', () => {
  const g = identityGeom();
  g.persV = 60;
  refreshCrop(g, W, H);
  const [Wf, Hf] = frameSize(g, W, H);
  const poly = validPolygon(g, W, H);
  const r = cropToPx(g.crop, Wf, Hf);
  assert.ok(rectInPolygon(r, poly));
  assert.ok(r.w * r.h > 0.6 * Wf * Hf * 0.7, `alan ${r.w * r.h}`);
  const [ow, oh] = outputSize(g, W, H);
  assert.ok(ow >= Math.round(r.w), 'çözünürlük korunur');
  near(ow / oh, r.w / r.h, 0.02);
});

test('serbest kırpma sürüklemesi sınırda durur', () => {
  const g = identityGeom();
  g.angle = 10;
  refreshCrop(g, W, H);
  const [Wf, Hf] = frameSize(g, W, H);
  const poly = validPolygon(g, W, H);
  const prev = cropToPx(g.crop, Wf, Hf);
  const next = { ...prev, x: prev.x - 200, w: prev.w + 200 };
  const r = constrainMove(prev, next, poly);
  assert.ok(rectInPolygon(r, poly));
  assert.ok(r.w >= prev.w - 1e-6);
  const shrunk = fitRect({ x: -50, y: -50, w: Wf + 100, h: Hf + 100 }, poly);
  assert.ok(rectInPolygon(shrunk, poly));
});

test('maxRect kare oranda içeride', () => {
  const g = identityGeom();
  g.angle = 20;
  const poly = validPolygon(g, W, H);
  const r = maxRect(poly, 1);
  assert.ok(rectInPolygon(r, poly));
  near(r.w, r.h, 1e-6);
});

test('kırpma tam piksele oturur ve çıktı boyutu doğru', () => {
  const g = identityGeom();
  g.crop = { x: 0.1234, y: 0.25, w: 0.5, h: 0.5 };
  g.crop = snapCrop(g, W, H);
  near(g.crop.x * W, Math.round(g.crop.x * W), 1e-9);
  assert.deepEqual(outputSize(g, W, H), [200, 150]);
  g.resize = 100;
  assert.deepEqual(outputSize(g, W, H), [100, 75]);
  assert.deepEqual(outputSize(identityGeom(), 8000, 6000), [4096, 3072]);
});

// --- otomatik -----------------------------------------------------------

console.log('Otomatik iyileştirme');

function synthImage(w, h, fn) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x / w, y / h);
      const o = (y * w + x) * 4;
      px[o] = r * 255;
      px[o + 1] = g * 255;
      px[o + 2] = b * 255;
      px[o + 3] = 255;
    }
  }
  return px;
}

test('karanlık fotoğrafı aydınlatır', () => {
  const img = synthImage(120, 90, (u, v) => [0.05 + 0.2 * u, 0.05 + 0.18 * v, 0.06 + 0.15 * u]);
  const a = autoAdjust(img, 120, 90);
  assert.ok(a.exposure > 10, JSON.stringify(a));
  assert.ok(a.shadows > 0);
});

test('düşük kontrastlı fotoğrafı gerer', () => {
  const img = synthImage(120, 90, (u) => [0.4 + 0.15 * u, 0.42 + 0.15 * u, 0.4 + 0.15 * u]);
  const a = autoAdjust(img, 120, 90);
  assert.ok(a.contrast > 0 && a.blacks < 0 && a.whites > 0, JSON.stringify(a));
});

test('mavi kaymayı ısıtarak düzeltir', () => {
  const img = synthImage(120, 90, (u, v) => [0.45 + 0.2 * v, 0.5 + 0.2 * v, 0.62 + 0.2 * v]);
  const a = autoAdjust(img, 120, 90);
  assert.ok(a.temperature > 5, JSON.stringify(a));
});

// --- görsel kontrol ------------------------------------------------------

// Fotoğrafa benzeyen sentetik sahne: gökyüzü, güneş, ten, yeşillik, renk
// örnekleri ve gri rampa.
function scene(w, h) {
  return synthImage(w, h, (u, v) => {
    let c;
    if (v < 0.45) {
      const t = v / 0.45;
      c = [0.35 + 0.35 * t, 0.55 + 0.3 * t, 0.9 - 0.1 * t];
      const d = Math.hypot(u - 0.78, v - 0.15);
      if (d < 0.07) c = [1, 0.93, 0.75];
    } else if (v < 0.75) {
      const n = Math.sin(u * 60) * 0.03;
      c = [0.18 + n, 0.42 + 0.2 * (v - 0.45) + n, 0.15];
    } else if (v < 0.9) {
      const i = Math.floor(u * 8);
      c = [
        [0.85, 0.2, 0.2], [0.95, 0.55, 0.2], [0.95, 0.85, 0.25], [0.3, 0.75, 0.35],
        [0.25, 0.75, 0.8], [0.25, 0.4, 0.85], [0.55, 0.3, 0.8], [0.9, 0.35, 0.7],
      ][i];
    } else {
      c = [u, u, u];
    }
    const fd = Math.hypot((u - 0.3) / 0.75, v - 0.55);
    if (fd < 0.16) {
      const s = 1 - fd / 0.16;
      c = [0.78 + 0.12 * s, 0.56 + 0.12 * s, 0.45 + 0.1 * s];
    }
    return c;
  });
}

function applyCpu(src, w, h, fn) {
  const out = new Uint8ClampedArray(src.length);
  const c = new Float64Array(3);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    c[0] = src[o] / 255;
    c[1] = src[o + 1] / 255;
    c[2] = src[o + 2] / 255;
    fn(c);
    out[o] = c[0] * 255;
    out[o + 1] = c[1] * 255;
    out[o + 2] = c[2] * 255;
    out[o + 3] = 255;
  }
  return out;
}

function sheet(items, w, h, cols) {
  const rows = Math.ceil(items.length / cols);
  const pad = 4;
  const SW = cols * (w + pad) + pad;
  const SH = rows * (h + pad) + pad;
  const out = new Uint8ClampedArray(SW * SH * 4).fill(30);
  items.forEach((img, k) => {
    const ox = pad + (k % cols) * (w + pad);
    const oy = pad + Math.floor(k / cols) * (h + pad);
    for (let y = 0; y < h; y++) {
      out.set(img.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * SW + ox) * 4);
    }
  });
  return { data: out, w: SW, h: SH };
}

{
  const w = 160;
  const h = 120;
  const src = scene(w, h);
  const looks = FILTERS.filter((f) => f.look);
  const imgs = [src, ...looks.map((f) => {
    const k = compileLook(f.look);
    const lut = bakeLut((c) => applyLook(c, k));
    const amt = f.amount / 100;
    return applyCpu(src, w, h, (c) => {
      const o = sampleLut(lut, c);
      for (let i = 0; i < 3; i++) c[i] += (o[i] - c[i]) * amt;
    });
  })];
  const s = sheet(imgs, w, h, 8);
  writeFileSync(join(OUT, 'filtreler.png'), encodePng(s.data, s.w, s.h));

  const keys = ['exposure', 'brightness', 'contrast', 'whites', 'blacks', 'saturation', 'vibrance', 'temperature', 'tint', 'fade'];
  const adj = [];
  for (const key of keys) {
    for (const v of [-100, 100]) {
      if (v < 0 && key === 'fade') {
        adj.push(src);
        continue;
      }
      const k = compileLook({ [key]: v });
      adj.push(applyCpu(src, w, h, (c) => applyLook(c, k)));
    }
  }
  const s2 = sheet(adj, w, h, 4);
  writeFileSync(join(OUT, 'ayarlar.png'), encodePng(s2.data, s2.w, s2.h));
  console.log(`Görsel kontrol: tests/out/filtreler.png (${looks.length} filtre), tests/out/ayarlar.png`);
}

console.log(`\n${passed} geçti, ${failed} kaldı`);
if (failed) process.exit(1);
