// Mozaik desenleri (DOM'suz piksel işlemleri; Node'da test edilir).
// Hücre boyutu görüntü pikselidir ve ızgara görüntünün (0, 0) noktasına
// hizalanır: önizlemede ve tam boyutta aynı desen çıkar.

// Altıgen ızgara (sivri tepeli): bir noktanın ait olduğu hücrenin merkezi.
export function hexCenter(x, y, size) {
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / size;
  const r = ((2 / 3) * y) / size;
  // Küp koordinatında yuvarlama.
  let rx = Math.round(q);
  let rz = Math.round(r);
  const ry = Math.round(-q - r);
  const dx = Math.abs(rx - q);
  const dy = Math.abs(ry - (-q - r));
  const dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  return [size * Math.sqrt(3) * (rx + rz / 2), size * 1.5 * rz];
}

// Kare pikseller: her hücre kendi ortalama rengini alır. src/dst: RGBA,
// w×h bölge; (ox, oy): bölgenin görüntüdeki yeri; cell: hücre (piksel).
export function pixelate(src, w, h, ox, oy, cell, dst = new Uint8ClampedArray(src.length)) {
  const c = Math.max(1, cell);
  const gx0 = Math.floor(ox / c);
  const gy0 = Math.floor(oy / c);
  const gx1 = Math.floor((ox + w - 1) / c);
  const gy1 = Math.floor((oy + h - 1) / c);
  for (let gy = gy0; gy <= gy1; gy++) {
    const y0 = Math.max(0, Math.round(gy * c) - oy);
    const y1 = Math.min(h, Math.round((gy + 1) * c) - oy);
    for (let gx = gx0; gx <= gx1; gx++) {
      const x0 = Math.max(0, Math.round(gx * c) - ox);
      const x1 = Math.min(w, Math.round((gx + 1) * c) - ox);
      if (x1 <= x0 || y1 <= y0) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
        }
      }
      const n = (x1 - x0) * (y1 - y0);
      r /= n;
      g /= n;
      b /= n;
      a /= n;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          dst[i] = r;
          dst[i + 1] = g;
          dst[i + 2] = b;
          dst[i + 3] = a;
        }
      }
    }
  }
  return dst;
}

// Altıgen hücreler: hücrenin rengi, merkezindeki küçük bölgenin ortalaması.
// Hücre renkleri eksenel koordinatla dizilen bir tabloda bir kez hesaplanır.
export function hexagons(src, w, h, ox, oy, cell, dst = new Uint8ClampedArray(src.length)) {
  const size = Math.max(1, cell) / Math.sqrt(3);
  const rr = Math.max(1, Math.round(cell * 0.3));
  const k3 = Math.sqrt(3) / 3;
  const rzMin = Math.floor(((2 / 3) * oy) / size) - 2;
  const rzMax = Math.ceil(((2 / 3) * (oy + h)) / size) + 2;
  const rxMin = Math.floor((k3 * ox - (oy + h) / 3) / size) - 2;
  const rxMax = Math.ceil((k3 * (ox + w) - oy / 3) / size) + 2;
  const nq = rxMax - rxMin + 1;
  const cols = new Float32Array(nq * (rzMax - rzMin + 1) * 4).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x + ox + 0.5;
      const Y = y + oy + 0.5;
      const q = (k3 * X - Y / 3) / size;
      const r = ((2 / 3) * Y) / size;
      let rx = Math.round(q);
      let rz = Math.round(r);
      const ry = Math.round(-q - r);
      const dx = Math.abs(rx - q);
      const dy = Math.abs(ry + q + r);
      const dz = Math.abs(rz - r);
      if (dx > dy && dx > dz) rx = -ry - rz;
      else if (dy <= dz) rz = -rx - ry;
      const ci = ((rz - rzMin) * nq + (rx - rxMin)) * 4;
      if (cols[ci] < 0) {
        const px = Math.round(size * Math.sqrt(3) * (rx + rz / 2) - ox);
        const py = Math.round(size * 1.5 * rz - oy);
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let sa = 0;
        let n = 0;
        for (let yy = Math.max(0, py - rr); yy <= Math.min(h - 1, py + rr); yy++) {
          for (let xx = Math.max(0, px - rr); xx <= Math.min(w - 1, px + rr); xx++) {
            const i = (yy * w + xx) * 4;
            sr += src[i];
            sg += src[i + 1];
            sb += src[i + 2];
            sa += src[i + 3];
            n++;
          }
        }
        if (!n) {
          // Merkez bölgenin dışında (kenar hücresi): en yakın piksel.
          const i = (Math.min(h - 1, Math.max(0, py)) * w + Math.min(w - 1, Math.max(0, px))) * 4;
          sr = src[i];
          sg = src[i + 1];
          sb = src[i + 2];
          sa = src[i + 3];
          n = 1;
        }
        cols[ci] = sr / n;
        cols[ci + 1] = sg / n;
        cols[ci + 2] = sb / n;
        cols[ci + 3] = sa / n;
      }
      const i = (y * w + x) * 4;
      dst[i] = cols[ci];
      dst[i + 1] = cols[ci + 1];
      dst[i + 2] = cols[ci + 2];
      dst[i + 3] = cols[ci + 3];
    }
  }
  return dst;
}

// Konuma bağlı, tekrarlanabilir gürültü (0..1).
function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Buzlu cam: her piksel, yarıçap içinde rastgele bir komşunun rengini alır.
export function frost(src, w, h, ox, oy, radius, dst = new Uint8ClampedArray(src.length)) {
  const R = Math.max(1, radius);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x + ox;
      const gy = y + oy;
      const sx = Math.min(w - 1, Math.max(0, Math.round(x + (hash(gx, gy) - 0.5) * 2 * R)));
      const sy = Math.min(h - 1, Math.max(0, Math.round(y + (hash(gy + 7919, gx) - 0.5) * 2 * R)));
      const i = (y * w + x) * 4;
      const j = (sy * w + sx) * 4;
      dst[i] = src[j];
      dst[i + 1] = src[j + 1];
      dst[i + 2] = src[j + 2];
      dst[i + 3] = src[j + 3];
    }
  }
  return dst;
}
