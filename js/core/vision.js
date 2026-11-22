// Yapay zekâ çıktılarının DOM'suz son işlemleri (Node'da test edilir):
// derinlik normalleştirme, yüz kutularının çözülmesi ve çakışanların elenmesi.

// Ham göreli ters derinlik (büyük = yakın) → 0..255 (255 = en yakın).
// Uçlardaki birkaç yüzde atılır: tek bir aşırı değer ölçeği bozmasın.
export function normalizeDepth(raw, w, h, lo = 0.02, hi = 0.98) {
  const n = w * h;
  const sorted = Float32Array.from(raw.subarray ? raw.subarray(0, n) : raw.slice(0, n)).sort();
  const a = sorted[Math.floor(lo * (n - 1))];
  const b = sorted[Math.floor(hi * (n - 1))];
  const k = b > a ? 255 / (b - a) : 0;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = (raw[i] - a) * k;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  return { w, h, data: out };
}

// Görüntüyü en/boy oranını koruyarak W×H girdiye yerleştirir.
export function letterbox(srcW, srcH, W, H) {
  const scale = Math.min(W / srcW, H / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { scale, ox: (W - w) / 2, oy: (H - h) / 2, w, h };
}

export function iou(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function nms(boxes, threshold = 0.3) {
  const sorted = boxes.slice().sort((p, q) => q.score - p.score);
  const keep = [];
  for (const b of sorted) if (keep.every((k) => iou(k, b) < threshold)) keep.push(b);
  return keep;
}

// UltraFace çıktısı: scores [n×2] (arka plan, yüz), boxes [n×4] (x0, y0, x1, y1;
// girdiye göre 0..1). Kutular özgün görüntü piksellerine çevrilir.
export function decodeFaces(scores, boxes, n, { inW, inH, srcW, srcH, lb, threshold = 0.7 }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = scores[i * 2 + 1];
    if (s < threshold) continue;
    const x0 = (boxes[i * 4] * inW - lb.ox) / lb.scale;
    const y0 = (boxes[i * 4 + 1] * inH - lb.oy) / lb.scale;
    const x1 = (boxes[i * 4 + 2] * inW - lb.ox) / lb.scale;
    const y1 = (boxes[i * 4 + 3] * inH - lb.oy) / lb.scale;
    const x = Math.max(0, Math.min(srcW, x0));
    const y = Math.max(0, Math.min(srcH, y0));
    const w = Math.max(0, Math.min(srcW, x1) - x);
    const h = Math.max(0, Math.min(srcH, y1) - y);
    if (w > 2 && h > 2) out.push({ x, y, w, h, score: s });
  }
  return nms(out).sort((p, q) => q.w * q.h - p.w * p.h);
}
