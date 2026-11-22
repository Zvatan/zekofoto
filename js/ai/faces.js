// Yüz algılama: UltraFace RFB-320 (MIT), cihazda. Görüntü oranı bozulmadan
// 320×240 girdiye yerleştirilir; kutular özgün piksellere çevrilir.
import { getSession } from './runtime.js';
import { letterbox, decodeFaces } from '../core/vision.js';

export const FACE_MODEL = new URL('../../models/ultraface-rfb-320.onnx', import.meta.url).href;
const MODEL_SIZE = 1.27e6;
const IN_W = 320;
const IN_H = 240;

// Dönen: [{ x, y, w, h, score }] (büyükten küçüğe), özgün piksel cinsinden.
export async function detectFaces(source, { onProgress, threshold = 0.7 } = {}) {
  const { ort, session } = await getSession('faces', FACE_MODEL, MODEL_SIZE, onProgress);
  const lb = letterbox(source.width, source.height, IN_W, IN_H);
  const c = document.createElement('canvas');
  c.width = IN_W;
  c.height = IN_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = 'rgb(127,127,127)';
  g.fillRect(0, 0, IN_W, IN_H);
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, lb.ox, lb.oy, lb.w, lb.h);
  const px = g.getImageData(0, 0, IN_W, IN_H).data;
  c.width = c.height = 0;
  const plane = IN_W * IN_H;
  const data = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    for (let ch = 0; ch < 3; ch++) data[ch * plane + i] = (px[i * 4 + ch] - 127) / 128;
  }
  const res = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, IN_H, IN_W]) });
  const scores = res.scores ?? res[session.outputNames[0]];
  const boxes = res.boxes ?? res[session.outputNames[1]];
  const n = scores.dims[1];
  return decodeFaces(scores.data, boxes.data, n, { inW: IN_W, inH: IN_H, srcW: source.width, srcH: source.height, lb, threshold });
}
