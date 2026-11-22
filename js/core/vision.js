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

// Kutu ortalaması (yarıçap r, kenarda pencere kırpılır), ayrılabilir kayan toplam.
function boxMean(src, w, h, r, out, tmp) {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) s += src[row + x];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / (Math.min(w - 1, x + r) - Math.max(0, x - r) + 1);
      if (x + r + 1 < w) s += src[row + x + r + 1];
      if (x - r >= 0) s -= src[row + x - r];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) s += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / (Math.min(h - 1, y + r) - Math.max(0, y - r) + 1);
      if (y + r + 1 < h) s += tmp[(y + r + 1) * w + x];
      if (y - r >= 0) s -= tmp[(y - r) * w + x];
    }
  }
  return out;
}

// Derinlik haritasını fotoğrafın kenarlarına oturtur. Düşük çözünürlüklü
// modelin geçişi nesnenin dışına taşar; yakın/uzak sınırı o bulanık çizgiyi
// izlerse nesnenin çevresinde hale çıkar. Renk rehberli süzgeç (guided filter,
// He ve ark.): her pencerede derinlik ≈ a·renk + b doğrusal modeli haritanın
// kendi çözünürlüğünde kurulur, büyük kopyanın her pikselinde o pikselin
// rengiyle uygulanır; sınır renk kenarına oturur, düz bölgeler değişmez.
// depth: Uint8Array dw×dh; lo: RGBA dw×dh (fotoğrafın aynı boydaki kopyası);
// hi: RGBA W×H. Dönen: Uint8Array W×H (0..255).
export function refineDepth(depth, dw, dh, lo, hi, W, H, { r = 3, eps = 4e-3 } = {}) {
  const n = dw * dh;
  const F = () => new Float32Array(n);
  const p = F();
  const I = [F(), F(), F()];
  for (let i = 0; i < n; i++) {
    p[i] = depth[i] / 255;
    for (let c = 0; c < 3; c++) I[c][i] = lo[i * 4 + c] / 255;
  }
  const tmp = F();
  const prod = F();
  const box = (src) => boxMean(src, dw, dh, r, F(), tmp);
  const boxOf = (a, b) => {
    for (let i = 0; i < n; i++) prod[i] = a[i] * b[i];
    return box(prod);
  };
  const mI = I.map(box);
  const mp = box(p);
  const cov = I.map((ic, c) => {
    const m = boxOf(ic, p);
    for (let i = 0; i < n; i++) m[i] -= mI[c][i] * mp[i];
    return m;
  });
  // Renk kovaryansı (simetrik 3×3): rr, rg, rb, gg, gb, bb
  const PAIRS = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]];
  const v = PAIRS.map(([a, b]) => {
    const m = boxOf(I[a], I[b]);
    for (let i = 0; i < n; i++) m[i] -= mI[a][i] * mI[b][i];
    return m;
  });
  const A = [F(), F(), F()];
  const B = F();
  for (let i = 0; i < n; i++) {
    const s00 = v[0][i] + eps, s01 = v[1][i], s02 = v[2][i], s11 = v[3][i] + eps, s12 = v[4][i], s22 = v[5][i] + eps;
    // Simetrik 3×3'ün tersi (kofaktörlerle).
    const c00 = s11 * s22 - s12 * s12, c01 = s02 * s12 - s01 * s22, c02 = s01 * s12 - s02 * s11;
    const c11 = s00 * s22 - s02 * s02, c12 = s01 * s02 - s00 * s12, c22 = s00 * s11 - s01 * s01;
    const det = s00 * c00 + s01 * c01 + s02 * c02;
    const k0 = cov[0][i], k1 = cov[1][i], k2 = cov[2][i];
    const a0 = (c00 * k0 + c01 * k1 + c02 * k2) / det;
    const a1 = (c01 * k0 + c11 * k1 + c12 * k2) / det;
    const a2 = (c02 * k0 + c12 * k1 + c22 * k2) / det;
    A[0][i] = a0; A[1][i] = a1; A[2][i] = a2;
    B[i] = mp[i] - a0 * mI[0][i] - a1 * mI[1][i] - a2 * mI[2][i];
  }
  const mA = A.map(box);
  const mB = box(B);
  // Büyük kopyada: katsayılar çift doğrusal (doku merkezleri), renk o pikselin.
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(dh - 1, Math.max(0, ((y + 0.5) * dh) / H - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(dh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(dw - 1, Math.max(0, ((x + 0.5) * dw) / W - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(dw - 1, x0 + 1);
      const tx = fx - x0;
      const i00 = y0 * dw + x0, i01 = y0 * dw + x1, i10 = y1 * dw + x0, i11 = y1 * dw + x1;
      const w00 = (1 - tx) * (1 - ty), w01 = tx * (1 - ty), w10 = (1 - tx) * ty, w11 = tx * ty;
      const o = (y * W + x) * 4;
      let q = mB[i00] * w00 + mB[i01] * w01 + mB[i10] * w10 + mB[i11] * w11;
      for (let c = 0; c < 3; c++) {
        const m = mA[c];
        q += (m[i00] * w00 + m[i01] * w01 + m[i10] * w10 + m[i11] * w11) * (hi[o + c] / 255);
      }
      out[y * W + x] = q <= 0 ? 0 : q >= 1 ? 255 : Math.round(q * 255);
    }
  }
  return out;
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
