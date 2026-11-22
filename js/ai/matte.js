// Özne maskesi (Arka plan aracı), cihazda:
//  - kişi: MODNet (portre matı, Apache-2.0, 6,6 MB), kısa kenar 512;
//  - diğerleri: IS-Net general-use (Apache-2.0, 44 MB), 1024×1024.
// Modelin düşük çözünürlüklü maskesi fotoğrafın kenarlarına oturtularak
// büyütülür (refineDepth ile aynı renk rehberli süzgeç).
import { getSession, releaseSession, canvasPixels } from './runtime.js';
import { refineDepth } from '../core/vision.js';

export const PERSON_MODEL = new URL('../../models/modnet-q8.onnx', import.meta.url).href;
export const OBJECT_MODEL = new URL('../../models/isnet-general-use-q8.onnx', import.meta.url).href;

async function personRaw(source, onProgress) {
  const { ort, session } = await getSession('modnet', PERSON_MODEL, 6.64e6, onProgress);
  const k = 512 / Math.min(source.width, source.height);
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

// source: kanvas. person: kişi modeli mi? Dönen: { w, h, data } (255 = özne),
// uzun kenarı en çok maxSide.
export async function subjectMatte(source, { person, onProgress, maxSide = 2048 } = {}) {
  const raw = person ? await personRaw(source, onProgress) : await objectRaw(source, onProgress);
  const s = Math.min(1, maxSide / Math.max(source.width, source.height));
  const W = Math.max(1, Math.round(source.width * s));
  const H = Math.max(1, Math.round(source.height * s));
  const hi = canvasPixels(source, W, H);
  const data = refineDepth(raw.data, raw.w, raw.h, raw.px, hi, W, H, { r: 4, eps: 1.5e-3 });
  return { w: W, h: H, data };
}
