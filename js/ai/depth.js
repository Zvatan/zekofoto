// Derinlik tahmini: Depth Anything V2 Small (Apache-2.0), cihazda.
// Kısa kenarı 392 piksel (14'ün katları) olan küçük bir kopya üzerinde
// çalışır; sonuç fotoğrafın kenarlarına oturtularak büyütülür.
import { getSession } from './runtime.js';
import { normalizeDepth, refineDepth } from '../core/vision.js';

export const DEPTH_MODEL = new URL('../../models/depth-anything-v2-small-q8.onnx', import.meta.url).href;
const MODEL_SIZE = 27.3e6;
// 392: nesne kenarları 280'e göre belirgin daha doğru (yakın/uzak geçişinde
// hata ~%10 az); 518 aynı kalitede ama iki kat yavaş (GELISTIRME.md §5.5).
const SHORT = 392;
// Oturtulmuş haritanın uzun kenarı: 12 MP fotoğrafta bir harita pikseli ≈ 2,6 piksel.
const REFINED = 1536;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

// Kaynağın w×h kopyasının pikselleri (saydam alanlar nötr gri).
function pixels(source, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#808080';
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  c.width = c.height = 0;
  return px;
}

// source: kanvas. Dönen: { w, h, data: Uint8Array } (255 = en yakın).
export async function estimateDepth(source, { onProgress } = {}) {
  const { ort, session } = await getSession('depth', DEPTH_MODEL, MODEL_SIZE, onProgress);
  const k = SHORT / Math.min(source.width, source.height);
  const w = Math.max(14, Math.round((source.width * k) / 14) * 14);
  const h = Math.max(14, Math.round((source.height * k) / 14) * 14);
  const px = pixels(source, w, h);
  const plane = w * h;
  const data = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    for (let ch = 0; ch < 3; ch++) data[ch * plane + i] = (px[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
  }
  const res = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, h, w]) });
  const out = res[session.outputNames[0]];
  const dims = out.dims;
  const oh = dims[dims.length - 2];
  const ow = dims[dims.length - 1];
  const map = normalizeDepth(out.data, ow, oh);
  const lo = ow === w && oh === h ? px : pixels(source, ow, oh);
  const s = Math.min(1, REFINED / Math.max(source.width, source.height));
  const W = Math.max(1, Math.round(source.width * s));
  const H = Math.max(1, Math.round(source.height * s));
  return { w: W, h: H, data: refineDepth(map.data, ow, oh, lo, pixels(source, W, H), W, H) };
}
