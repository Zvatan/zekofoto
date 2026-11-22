// JPEG EXIF'inden çekim tarihini okur (DOM'suz). Yalnızca tarih alanlarına
// bakılır; EXIF dosyanın başında olduğu için ilk ~192 KB yeterlidir.
// Öncelik: DateTimeOriginal (0x9003) → DateTimeDigitized (0x9004) → DateTime (0x0132).

export function exifDate(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marker = v.getUint16(o);
    if ((marker & 0xff00) !== 0xff00) return null;
    if (marker === 0xffda) return null; // görüntü verisi başladı
    const len = v.getUint16(o + 2);
    if (marker === 0xffe1 && len >= 16 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966 && v.getUint16(o + 8) === 0) {
      return parseTiff(v, o + 10, Math.min(v.byteLength, o + 2 + len));
    }
    o += 2 + len;
  }
  return null;
}

function parseTiff(v, t, end) {
  if (t + 8 > end) return null;
  const order = v.getUint16(t);
  const le = order === 0x4949;
  if (!le && order !== 0x4d4d) return null;
  const u16 = (p) => v.getUint16(p, le);
  const u32 = (p) => v.getUint32(p, le);
  if (u16(t + 2) !== 42) return null;

  const readIfd = (off) => {
    const p = t + off;
    if (!off || p + 2 > end) return null;
    const n = u16(p);
    const tags = new Map();
    for (let i = 0; i < n; i++) {
      const e = p + 2 + i * 12;
      if (e + 12 > end) break;
      tags.set(u16(e), { type: u16(e + 2), count: u32(e + 4), at: e + 8 });
    }
    return tags;
  };

  const ascii = (entry) => {
    if (!entry || entry.type !== 2) return null;
    const p = entry.count > 4 ? t + u32(entry.at) : entry.at;
    if (p + entry.count > end) return null;
    let s = '';
    for (let i = 0; i < entry.count; i++) {
      const c = v.getUint8(p + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };

  const ifd0 = readIfd(u32(t + 4));
  if (!ifd0) return null;
  let s = null;
  const ptr = ifd0.get(0x8769);
  if (ptr) {
    const exif = readIfd(u32(ptr.at));
    if (exif) s = ascii(exif.get(0x9003)) || ascii(exif.get(0x9004));
  }
  return parseExifDate(s || ascii(ifd0.get(0x0132)));
}

// "YYYY:MM:DD HH:MM:SS" → Date (yerel saat). Geçersizse null.
export function parseExifDate(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s || '');
  if (!m || +m[1] < 1990) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) ? null : d;
}
