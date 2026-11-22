// Fotoğraf okuma ve kanvas yardımcıları.
import { exifDate } from './core/exif.js';

// iOS Safari'de kanvas alanı en fazla 16.777.216 pikseldir. Uzun kenar
// 4096 ile sınırlanır; 12 MP iPhone fotoğrafları küçültülmeden işlenir.
export const MAX_SIDE = 4096;
export const MAX_PIXELS = 16_000_000;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görüntü çözülemedi'));
    img.src = url;
  });
}

export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// iOS'ta kanvas belleği, boyut sıfırlanınca hemen geri verilir.
export function releaseCanvas(c) {
  if (c && c.width) {
    c.width = 0;
    c.height = 0;
  }
}

// Dosyayı yönü düzeltilmiş (EXIF) ve boyutu sınırlanmış bir kanvasa çizer.
// Saydamlık korunur (ör. PNG); { canvas, hasAlpha, scaled } döner.
export async function fileToCanvas(blob, maxSide = MAX_SIDE) {
  const url = URL.createObjectURL(blob);
  try {
    // createImageBitmap yerine <img>: Safari sürümleri arasında EXIF yönü tutarlı.
    const img = await loadImage(url);
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error('Görüntü boyutu okunamadı');
    const s = Math.min(1, maxSide / Math.max(w0, h0), Math.sqrt(MAX_PIXELS / (w0 * h0)));
    const w = Math.max(1, Math.round(w0 * s));
    const h = Math.max(1, Math.round(h0 * s));
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const hasAlpha = /png|webp|gif/i.test(blob.type) ? detectAlpha(img) : false;
    return { canvas: c, hasAlpha, scaled: s < 1 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Fotoğrafın çekim tarihi (tarih damgası için): EXIF, yoksa dosya tarihi.
export async function photoDate(file) {
  try {
    const d = exifDate(await file.slice(0, 196608).arrayBuffer());
    if (d) return d;
  } catch (err) {
    console.error(err);
  }
  return file.lastModified ? new Date(file.lastModified) : new Date();
}

function detectAlpha(img) {
  const s = 64;
  const c = createCanvas(s, s);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, s, s);
  const d = ctx.getImageData(0, 0, s, s).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

export function scaledCanvas(src, maxSide) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * s));
  const h = Math.max(1, Math.round(src.height * s));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

export function imageData(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
}

export function canvasToBlob(c, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Görüntü kodlanamadı'))), type, quality);
  });
}

// JPEG saydamlığı desteklemez; saydam alanlar beyaz zemine oturtulur.
export function flattenCanvas(src, color = '#fff') {
  const c = createCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  return c;
}
