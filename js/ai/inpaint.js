// Yapay zekâ silgisi: MI-GAN (Picsart AI Research, MIT), cihazda. "Pipeline"
// sürümü maskenin çevresini kendisi kırpar, 512'de doldurur ve aynı boyda
// sonuç verir; girdi/çıktı uint8.
import { getSession } from './runtime.js';

export const INPAINT_MODEL = new URL('../../models/migan-pipeline-v2.onnx', import.meta.url).href;
const MODEL_SIZE = 28.1e6;

// canvas: doldurulacak bölge; keep: Uint8Array (w×h; 255 = koru, 0 = doldur).
// Dönen: Uint8ClampedArray RGBA (w×h).
export async function inpaint(canvas, keep, { onProgress } = {}) {
  const { ort, session } = await getSession('inpaint', INPAINT_MODEL, MODEL_SIZE, onProgress);
  const w = canvas.width;
  const h = canvas.height;
  const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const n = w * h;
  const img = new Uint8Array(3 * n);
  for (let i = 0; i < n; i++) {
    img[i] = px[i * 4];
    img[n + i] = px[i * 4 + 1];
    img[2 * n + i] = px[i * 4 + 2];
  }
  const res = await session.run({
    [session.inputNames[0]]: new ort.Tensor('uint8', img, [1, 3, h, w]),
    [session.inputNames[1]]: new ort.Tensor('uint8', keep, [1, 1, h, w]),
  });
  const o = res[session.outputNames[0]].data;
  const out = new Uint8ClampedArray(4 * n);
  for (let i = 0; i < n; i++) {
    out[i * 4] = o[i];
    out[i * 4 + 1] = o[n + i];
    out[i * 4 + 2] = o[2 * n + i];
    out[i * 4 + 3] = 255;
  }
  return out;
}
