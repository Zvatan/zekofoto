// Eski dijital kameraların turuncu tarih damgası: yedi parçalı (LED)
// rakamlar, hafif eğik ve parlak. Yazı tipi kullanılmaz; parçalar çizilir,
// böylece her cihazda aynı görünür.

const SEGMENTS = {
  0: 'abcdef',
  1: 'bc',
  2: 'abdeg',
  3: 'abcdg',
  4: 'bcfg',
  5: 'acdfg',
  6: 'acdefg',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
  '-': 'g',
};

const DIGIT_W = 0.58; // rakam genişliği (yüksekliğe oranla)
const THICK = 0.13; // parça kalınlığı
const GAP = 0.025; // parçalar arası boşluk
const ADVANCE = { digit: DIGIT_W + 0.2, space: 0.42, tick: 0.26 };

// Klasik biçim: '26 11 22 (yıl, ay, gün; başta kesme işareti).
export function stampText(date) {
  const yy = String(date.getFullYear()).slice(2);
  return `'${yy} ${date.getMonth() + 1} ${date.getDate()}`;
}

function hexH(ctx, x0, x1, yc, t) {
  ctx.moveTo(x0, yc);
  ctx.lineTo(x0 + t / 2, yc - t / 2);
  ctx.lineTo(x1 - t / 2, yc - t / 2);
  ctx.lineTo(x1, yc);
  ctx.lineTo(x1 - t / 2, yc + t / 2);
  ctx.lineTo(x0 + t / 2, yc + t / 2);
  ctx.closePath();
}

function hexV(ctx, xc, y0, y1, t) {
  ctx.moveTo(xc, y0);
  ctx.lineTo(xc + t / 2, y0 + t / 2);
  ctx.lineTo(xc + t / 2, y1 - t / 2);
  ctx.lineTo(xc, y1);
  ctx.lineTo(xc - t / 2, y1 - t / 2);
  ctx.lineTo(xc - t / 2, y0 + t / 2);
  ctx.closePath();
}

// Tek rakamın parçalarını yola ekler; (x, y) sol üst köşe, h yükseklik.
function digitPath(ctx, ch, x, y, h) {
  const segs = SEGMENTS[ch];
  if (!segs) return;
  const w = DIGIT_W * h;
  const t = THICK * h;
  const g = GAP * h;
  const L = x + t / 2;
  const R = x + w - t / 2;
  const T = y + t / 2;
  const M = y + h / 2;
  const B = y + h - t / 2;
  for (const s of segs) {
    if (s === 'a') hexH(ctx, L + g, R - g, T, t);
    else if (s === 'g') hexH(ctx, L + g, R - g, M, t);
    else if (s === 'd') hexH(ctx, L + g, R - g, B, t);
    else if (s === 'f') hexV(ctx, L, T + g, M - g, t);
    else if (s === 'b') hexV(ctx, R, T + g, M - g, t);
    else if (s === 'e') hexV(ctx, L, M + g, B - g, t);
    else if (s === 'c') hexV(ctx, R, M + g, B - g, t);
  }
}

function textWidth(text) {
  let w = 0;
  for (const ch of text) w += ch === ' ' ? ADVANCE.space : ch === "'" ? ADVANCE.tick : ADVANCE.digit;
  return w;
}

// Damgayı tuvalin sağ alt köşesine çizer. scale > 1 küçük önizlemelerde
// okunur kalsın diye rakamları büyütür.
export function drawStamp(canvas, text, { scale = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const side = Math.min(W, H);
  const h = Math.max(6, side * 0.036 * scale);
  const margin = side * 0.05;
  const total = textWidth(text) * h;
  const x0 = W - margin - total;
  const y0 = H - margin - h;

  ctx.save();
  // Hafif italik: rakamlar sağa yatık.
  ctx.translate(x0, y0 + h);
  ctx.transform(1, 0, -0.1, 1, 0, 0);
  ctx.translate(0, -h);
  ctx.beginPath();
  let x = 0;
  for (const ch of text) {
    if (ch === "'") {
      hexV(ctx, x + 0.08 * h, 0, 0.3 * h, THICK * h * 0.9);
      x += ADVANCE.tick * h;
    } else if (ch === ' ') {
      x += ADVANCE.space * h;
    } else {
      digitPath(ctx, ch, x, 0, h);
      x += ADVANCE.digit * h;
    }
  }
  // Önce parıltı, sonra çekirdek: filme düşmüş LED ışığı gibi.
  ctx.shadowColor = 'rgba(255, 105, 20, 0.9)';
  ctx.shadowBlur = h * 0.5;
  ctx.fillStyle = 'rgba(255, 130, 35, 0.92)';
  ctx.fill();
  ctx.shadowBlur = h * 0.12;
  ctx.fillStyle = 'rgba(255, 190, 110, 0.95)';
  ctx.fill();
  ctx.restore();
}
