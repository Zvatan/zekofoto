// Kırpma, döndürme, aynalama ve perspektif geometrisi (DOM'suz).
//
// Koordinat uzayları:
//  - kaynak : fotoğraf pikselleri, W×H
//  - çerçeve: 90° döndürme/aynalamadan sonraki tuval, Wf×Hf (piksel). Kırpma
//             dikdörtgeni burada, 0..1 aralığında saklanır.
//  - çıktı  : kırpılmış görüntü, 0..1
// İleri dönüşüm (kaynak → çerçeve): F = R(açı) · P(perspektif) · O(yön).
// Açı ve perspektif çerçeve uzayında tanımlıdır; kullanıcı 90° döndürünce ya
// da aynalayınca bu değerler ekranda aynı anlamı koruyacak şekilde dönüştürülür.
//
// Matrisler satır öncelikli 3×3 dizilerdir: [a, b, c, d, e, f, g, h, i].

export const PERSPECTIVE_STRENGTH = 0.3;
export const MIN_CROP_PX = 32;

export function identityGeom() {
  return {
    orient: [1, 0, 0, 1], // kaynak → çerçeve 2×2 tam sayı matrisi (döndürme/aynalama)
    angle: 0, // düzeltme açısı, derece (-45..45)
    persV: 0, // dikey perspektif (-100..100): + üst kenar daralır
    persH: 0, // yatay perspektif (-100..100): + sağ kenar daralır
    crop: { x: 0, y: 0, w: 1, h: 1 },
    cropAuto: true, // kullanıcı kırpmaya dokunmadıysa, açı değişince en büyük kırpma yeniden hesaplanır
    aspect: null, // null: serbest; sayı: genişlik/yükseklik (piksel)
    resize: null, // null ya da çıktının uzun kenarı (piksel)
  };
}

export function isIdentityGeom(g) {
  const [a, b, c, d] = g.orient;
  return (
    a === 1 && b === 0 && c === 0 && d === 1 &&
    !g.angle && !g.persV && !g.persH &&
    g.crop.x === 0 && g.crop.y === 0 && g.crop.w === 1 && g.crop.h === 1 &&
    !g.resize
  );
}

// --- matrisler -----------------------------------------------------------

export function mul(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    }
  }
  return o;
}

export function inv(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Tekil matris');
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

export function apply(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

// Dört nokta eşlemesinden homografi (src[i] → dst[i]).
export function homography(src, dst) {
  const A = [];
  const bv = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    bv.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    bv.push(v);
  }
  // Kısmi pivotlamalı Gauss eleme.
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [bv[col], bv[piv]] = [bv[piv], bv[col]];
    const p = A[col][col];
    if (Math.abs(p) < 1e-12) throw new Error('Homografi çözülemedi');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = A[r][col] / p;
      if (!k) continue;
      for (let c = col; c < n; c++) A[r][c] -= k * A[col][c];
      bv[r] -= k * bv[col];
    }
  }
  const h = bv.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// --- dönüşüm zinciri -----------------------------------------------------

export function frameSize(geom, W, H) {
  return geom.orient[0] === 0 ? [H, W] : [W, H];
}

function orientMatrix(o, W, H, Wf, Hf) {
  const [a, b, c, d] = o;
  return [a, b, Wf / 2 - a * (W / 2) - b * (H / 2), c, d, Hf / 2 - c * (W / 2) - d * (H / 2), 0, 0, 1];
}

export function perspectiveQuad(persV, persH, Wf, Hf) {
  const k = PERSPECTIVE_STRENGTH;
  const v = persV / 100;
  const h = persH / 100;
  const q = [
    [0, 0],
    [Wf, 0],
    [Wf, Hf],
    [0, Hf],
  ];
  const dx = (Math.abs(v) * k * Wf) / 2;
  const dy = (Math.abs(h) * k * Hf) / 2;
  if (v > 0) {
    q[0][0] += dx;
    q[1][0] -= dx;
  } else if (v < 0) {
    q[3][0] += dx;
    q[2][0] -= dx;
  }
  if (h > 0) {
    q[1][1] += dy;
    q[2][1] -= dy;
  } else if (h < 0) {
    q[0][1] += dy;
    q[3][1] -= dy;
  }
  return q;
}

function perspectiveMatrix(persV, persH, Wf, Hf) {
  if (!persV && !persH) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const src = [
    [0, 0],
    [Wf, 0],
    [Wf, Hf],
    [0, Hf],
  ];
  return homography(src, perspectiveQuad(persV, persH, Wf, Hf));
}

function rotationMatrix(deg, Wf, Hf) {
  if (!deg) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const cx = Wf / 2;
  const cy = Hf / 2;
  return [c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy, 0, 0, 1];
}

// Kaynak pikseli → çerçeve pikseli.
export function forwardMatrix(geom, W, H) {
  const [Wf, Hf] = frameSize(geom, W, H);
  const O = orientMatrix(geom.orient, W, H, Wf, Hf);
  const P = perspectiveMatrix(geom.persV, geom.persH, Wf, Hf);
  const R = rotationMatrix(geom.angle, Wf, Hf);
  return mul(R, mul(P, O));
}

// Gölgelendirici için: çıktı (0..1) → kaynak doku koordinatı (0..1).
// WebGL'in beklediği sütun öncelikli Float32Array döner.
export function renderMatrix(geom, W, H, crop = geom.crop) {
  const [Wf, Hf] = frameSize(geom, W, H);
  const G = inv(forwardMatrix(geom, W, H));
  const C = [crop.w * Wf, 0, crop.x * Wf, 0, crop.h * Hf, crop.y * Hf, 0, 0, 1];
  const S = [1 / W, 0, 0, 0, 1 / H, 0, 0, 0, 1];
  return toColumnMajor(mul(S, mul(G, C)));
}

export function toColumnMajor(m) {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

export const IDENTITY_RENDER = toColumnMajor([1, 0, 0, 0, 1, 0, 0, 0, 1]);

// --- geçerli bölge -------------------------------------------------------

// Fotoğrafın çerçeve içinde kalan kısmı (dışbükey çokgen, piksel).
export function validPolygon(geom, W, H) {
  const [Wf, Hf] = frameSize(geom, W, H);
  const F = forwardMatrix(geom, W, H);
  let poly = [
    apply(F, 0, 0),
    apply(F, W, 0),
    apply(F, W, H),
    apply(F, 0, H),
  ];
  // Sutherland–Hodgman ile çerçeveye kırp.
  const planes = [
    (p) => p[0], // x >= 0
    (p) => Wf - p[0], // x <= Wf
    (p) => p[1], // y >= 0
    (p) => Hf - p[1], // y <= Hf
  ];
  for (const dist of planes) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = dist(a);
      const db = dist(b);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    poly = out;
    if (!poly.length) break;
  }
  return poly;
}

export function pointInPolygon(p, poly, eps = 1e-6) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d = cr / len;
    if (Math.abs(d) <= eps) continue;
    const s = d > 0 ? 1 : -1;
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// r: { x, y, w, h } piksel cinsinden.
export function rectInPolygon(r, poly, eps = 1e-3) {
  return (
    pointInPolygon([r.x, r.y], poly, eps) &&
    pointInPolygon([r.x + r.w, r.y], poly, eps) &&
    pointInPolygon([r.x + r.w, r.y + r.h], poly, eps) &&
    pointInPolygon([r.x, r.y + r.h], poly, eps)
  );
}

export function polygonCentroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

function polygonBounds(poly) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

// Merkezi (cx, cy) olan, verilen en/boy oranındaki en geniş dikdörtgen.
function widestAt(poly, aspect, cx, cy, wMax) {
  if (!pointInPolygon([cx, cy], poly, 1e-3)) return 0;
  let lo = 0;
  let hi = wMax;
  for (let i = 0; i < 28; i++) {
    const w = (lo + hi) / 2;
    const h = w / aspect;
    if (rectInPolygon({ x: cx - w / 2, y: cy - h / 2, w, h }, poly)) lo = w;
    else hi = w;
  }
  return lo;
}

function goldenMax(fn, a, b, iters = 26) {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a);
  let x2 = a + g * (b - a);
  let f1 = fn(x1);
  let f2 = fn(x2);
  for (let i = 0; i < iters; i++) {
    if (f1 < f2) {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + g * (b - a);
      f2 = fn(x2);
    } else {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = b - g * (b - a);
      f1 = fn(x1);
    }
  }
  return f1 > f2 ? x1 : x2;
}

// Çokgene sığan, verilen orandaki en büyük dikdörtgen (piksel).
export function maxRect(poly, aspect) {
  const [x0, y0, x1, y1] = polygonBounds(poly);
  const wMax = Math.min(x1 - x0, (y1 - y0) * aspect) + 1e-6;
  const [gx, gy] = polygonCentroid(poly);
  // Simetrik durumlarda (yalnızca açı) en iyi merkez zaten ağırlık merkezidir.
  const wc = widestAt(poly, aspect, gx, gy, wMax);
  let best = { cx: gx, cy: gy, w: wc };
  const bestX = (cy) => goldenMax((cx) => widestAt(poly, aspect, cx, cy, wMax), x0, x1, 20);
  const cy = goldenMax((y) => widestAt(poly, aspect, bestX(y), y, wMax), y0, y1, 20);
  const cx = bestX(cy);
  const w = widestAt(poly, aspect, cx, cy, wMax);
  if (w > best.w * 1.002) best = { cx, cy, w };
  const h = best.w / aspect;
  return { x: best.cx - best.w / 2, y: best.cy - h / 2, w: best.w, h };
}

// Dikdörtgeni merkezi etrafında küçülterek çokgene sığdırır.
export function fitRect(r, poly) {
  if (rectInPolygon(r, poly)) return r;
  let cx = r.x + r.w / 2;
  let cy = r.y + r.h / 2;
  if (!pointInPolygon([cx, cy], poly, 1e-3)) [cx, cy] = polygonCentroid(poly);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 28; i++) {
    const s = (lo + hi) / 2;
    const w = r.w * s;
    const h = r.h * s;
    if (rectInPolygon({ x: cx - w / 2, y: cy - h / 2, w, h }, poly)) lo = s;
    else hi = s;
  }
  const w = r.w * lo;
  const h = r.h * lo;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// Sürükleme sırasında: önceki geçerli dikdörtgenden önerilene doğru,
// çokgenin içinde kalan en uzak noktaya kadar ilerler.
export function constrainMove(prev, next, poly) {
  if (rectInPolygon(next, poly)) return next;
  let lo = 0;
  let hi = 1;
  const lerp = (t) => ({
    x: prev.x + (next.x - prev.x) * t,
    y: prev.y + (next.y - prev.y) * t,
    w: prev.w + (next.w - prev.w) * t,
    h: prev.h + (next.h - prev.h) * t,
  });
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (rectInPolygon(lerp(t), poly)) lo = t;
    else hi = t;
  }
  return lerp(lo);
}

// --- kırpma dikdörtgeni yardımcıları ------------------------------------

export function cropToPx(crop, Wf, Hf) {
  return { x: crop.x * Wf, y: crop.y * Hf, w: crop.w * Wf, h: crop.h * Hf };
}

export function pxToCrop(r, Wf, Hf) {
  return { x: r.x / Wf, y: r.y / Hf, w: r.w / Wf, h: r.h / Hf };
}

// Açı, perspektif ya da oran değiştikten sonra kırpmayı geçerli hale getirir.
export function refreshCrop(geom, W, H) {
  const [Wf, Hf] = frameSize(geom, W, H);
  const poly = validPolygon(geom, W, H);
  if (poly.length < 3) return geom;
  let r;
  if (geom.cropAuto) {
    const aspect = geom.aspect || Wf / Hf;
    r = maxRect(poly, aspect);
  } else {
    r = cropToPx(geom.crop, Wf, Hf);
    if (geom.aspect) {
      // Oran değiştiyse alanı koruyarak yeni orana geçir.
      const area = r.w * r.h;
      const w = Math.sqrt(area * geom.aspect);
      const h = w / geom.aspect;
      r = { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
    }
    r = fitRect(r, poly);
  }
  geom.crop = pxToCrop(r, Wf, Hf);
  return geom;
}

// Ekranda saat yönünde (dir = 1) ya da tersine (dir = -1) 90° döndürür.
export function rotate90(geom, dir) {
  const [a, b, c, d] = geom.orient;
  const R = dir > 0 ? [0, -1, 1, 0] : [0, 1, -1, 0];
  geom.orient = [R[0] * a + R[1] * c, R[0] * b + R[1] * d, R[2] * a + R[3] * c, R[2] * b + R[3] * d];
  const { x, y, w, h } = geom.crop;
  geom.crop = dir > 0 ? { x: 1 - y - h, y: x, w: h, h: w } : { x: y, y: 1 - x - w, w: h, h: w };
  const pv = geom.persV;
  const ph = geom.persH;
  if (dir > 0) {
    geom.persH = pv;
    geom.persV = -ph;
  } else {
    geom.persH = -pv;
    geom.persV = ph;
  }
  if (geom.aspect) geom.aspect = 1 / geom.aspect;
  geom.orient = geom.orient.map((v) => v || 0); // -0 → 0
  return geom;
}

// axis: 'h' yatay (sol-sağ), 'v' dikey (üst-alt) aynalama.
export function flip(geom, axis) {
  const [a, b, c, d] = geom.orient;
  if (axis === 'h') {
    geom.orient = [-a, -b, c, d];
    geom.crop = { ...geom.crop, x: 1 - geom.crop.x - geom.crop.w };
    geom.persH = -geom.persH;
  } else {
    geom.orient = [a, b, -c, -d];
    geom.crop = { ...geom.crop, y: 1 - geom.crop.y - geom.crop.h };
    geom.persV = -geom.persV;
  }
  geom.angle = -geom.angle || 0;
  geom.persV = geom.persV || 0;
  geom.persH = geom.persH || 0;
  geom.orient = geom.orient.map((v) => v || 0);
  return geom;
}

// Kırpma, tam piksellere oturtulur (döndürme/perspektif yoksa yeniden
// örnekleme bulanıklığı olmaz).
export function snapCrop(geom, W, H) {
  const [Wf, Hf] = frameSize(geom, W, H);
  const x0 = Math.round(geom.crop.x * Wf);
  const y0 = Math.round(geom.crop.y * Hf);
  const x1 = Math.max(x0 + 1, Math.round((geom.crop.x + geom.crop.w) * Wf));
  const y1 = Math.max(y0 + 1, Math.round((geom.crop.y + geom.crop.h) * Hf));
  return { x: x0 / Wf, y: y0 / Hf, w: (x1 - x0) / Wf, h: (y1 - y0) / Hf };
}

// Çıktı boyutu: kaynaktaki piksel yoğunluğu korunur (perspektifte görüntü
// küçüldüyse çıktı buna göre büyür), sonra isteğe bağlı yeniden boyutlandırma
// ve cihaz sınırları uygulanır.
export function outputSize(geom, W, H, { maxSide = 4096, maxPixels = 16e6 } = {}) {
  const [Wf, Hf] = frameSize(geom, W, H);
  const cw = geom.crop.w * Wf;
  const ch = geom.crop.h * Hf;
  let scale = 1;
  if (geom.persV || geom.persH) {
    const F = forwardMatrix(geom, W, H);
    const G = inv(F);
    const [sx, sy] = apply(G, (geom.crop.x + geom.crop.w / 2) * Wf, (geom.crop.y + geom.crop.h / 2) * Hf);
    const e = 1;
    const p0 = apply(F, sx, sy);
    const px = apply(F, sx + e, sy);
    const py = apply(F, sx, sy + e);
    const det = (px[0] - p0[0]) * (py[1] - p0[1]) - (px[1] - p0[1]) * (py[0] - p0[0]);
    scale = Math.sqrt(Math.abs(det)) || 1;
  }
  let w = cw / scale;
  let h = ch / scale;
  if (geom.resize) {
    const k = geom.resize / Math.max(w, h);
    w *= k;
    h *= k;
  }
  const k = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(maxPixels / (w * h)));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  return [w, h];
}

// Doğal (yeniden boyutlandırmasız) çıktı boyutu.
export function naturalSize(geom, W, H) {
  return outputSize({ ...geom, resize: null }, W, H, { maxSide: Infinity, maxPixels: Infinity });
}
