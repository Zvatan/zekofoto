// Özne maskesi (Arka plan aracı), cihazda:
//  - kişi: MODNet (portre matı, Apache-2.0, 6,6 MB), kısa kenar 512;
//  - diğerleri: IS-Net general-use (Apache-2.0, 44 MB), 1024×1024.
// Modelin düşük çözünürlüklü maskesi fotoğrafın kenarlarına oturtularak
// büyütülür (refineDepth ile aynı renk rehberli süzgeç).
import { getSession, releaseSession, canvasPixels } from './runtime.js';
import { refineDepth, keepComponents } from '../core/vision.js';

export const PERSON_MODEL = new URL('../../models/modnet-q8.onnx', import.meta.url).href;
export const OBJECT_MODEL = new URL('../../models/isnet-general-use-q8.onnx', import.meta.url).href;

async function personRaw(source, onProgress, short) {
  const { ort, session } = await getSession('modnet', PERSON_MODEL, 6.64e6, onProgress);
  const k = short / Math.min(source.width, source.height);
  const w = Math.max(32, Math.round((source.width * k) / 32) * 32);
  const h = Math.max(32, Math.round((source.height * k) / 32) * 32);
  const px = canvasPixels(source, w, h);
  const n = w * h;
  const data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) data[c * n + i] = (px[i * 4 + c] / 255 - 0.5) / 0.5;
  const res = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, h, w]) });
  const o = res[session.outputNames[0]];
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(Math.min(1, Math.max(0, o.data[i])) * 255);
  return { w, h, data: out, px };
}

async function objectRaw(source, onProgress) {
  const { ort, session } = await getSession('isnet', OBJECT_MODEL, 44.4e6, onProgress);
  const S = 1024;
  const px = canvasPixels(source, S, S);
  const n = S * S;
  const data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) data[c * n + i] = px[i * 4 + c] / 255 - 0.5;
  const res = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, S, S]) });
  const o = res[session.outputNames[0]].data;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < n; i++) {
    mn = Math.min(mn, o[i]);
    mx = Math.max(mx, o[i]);
  }
  const out = new Uint8Array(n);
  const k = mx > mn ? 255 / (mx - mn) : 0;
  for (let i = 0; i < n; i++) out[i] = Math.round((o[i] - mn) * k);
  // Büyük model tek seferlik: belleği bırak.
  releaseSession('isnet');
  return { w: S, h: S, data: out, px };
}

// source: kanvas. person: kişi modeli mi? faces: yüz kutuları (kaynak pikseli);
// maskede yüzlere bağlı olmayan kopuk parçalar (ör. arkadaki birinin yüzü)
// atılır. short: kişi modelinin kısa kenarı. crisp: kenar sıkılaştırma
// aralığı (yarı saydam hale kalmasın). Dönen: { w, h, data } (255 = özne),
// uzun kenarı en çok maxSide.
// Ölçümler (referans fotoğraf): kişi modeli 512'de en iyi; 640/768'de alın ya da
// gövdede delik açabiliyor. Sıkılaştırma (0,3–0,7) yarı saydam haleyi siler.
export async function subjectMatte(source, { person, faces = [], onProgress, maxSide = 2048, short = 512, crisp = [0.3, 0.7], r = 4, eps = 1e-3, erode = 3 } = {}) {
  const raw = person ? await personRaw(source, onProgress, short) : await objectRaw(source, onProgress);
  const kx = raw.w / source.width;
  const ky = raw.h / source.height;
  const seeds = faces.map((f) => ({ x: f.x * kx, y: f.y * ky, w: f.w * kx, h: f.h * ky }));
  const keep = keepComponents(raw.data, raw.w, raw.h, seeds, { erode, dilate: 3 });
  for (let i = 0; i < raw.data.length; i++) if (!keep[i]) raw.data[i] = 0;
  const s = Math.min(1, maxSide / Math.max(source.width, source.height));
  const W = Math.max(1, Math.round(source.width * s));
  const H = Math.max(1, Math.round(source.height * s));
  const hi = canvasPixels(source, W, H);
  const data = refineDepth(raw.data, raw.w, raw.h, raw.px, hi, W, H, { r, eps });
  if (crisp) {
    const [a, b] = crisp;
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      const t = Math.min(1, Math.max(0, (v / 255 - a) / (b - a)));
      lut[v] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    for (let i = 0; i < data.length; i++) data[i] = lut[data[i]];
  }
  return { w: W, h: H, data };
}
