// Hazır filtreler. Tarifler bu uygulamaya aittir: color.js'teki kaydırıcı
// adlarıyla yazılır ve ekran kartı için 3B renk tablosuna çevrilir.
// Sanatsal filtreler renk tablosu değil, gölgelendirici efektidir (fx).

export const FILTER_CATEGORIES = [
  { id: 'portre', label: 'Portre' },
  { id: 'film', label: 'Film' },
  { id: 'retro', label: 'Retro' },
  { id: 'yemek', label: 'Yemek' },
  { id: 'manzara', label: 'Manzara' },
  { id: 'sb', label: 'Siyah-Beyaz' },
  { id: 'sanat', label: 'Sanatsal' },
];

// Gölgelendiricideki efekt numaraları (js/gl/shaders.js → FX_*).
// radius: etki yarıçapı, fotoğrafın uzun kenarına oranla.
export const EFFECTS = {
  sketch: { id: 1, radius: 0.0022 },
  colorSketch: { id: 2, radius: 0.0022 },
  oil: { id: 3, radius: 0.0042 },
  watercolor: { id: 4, radius: 0.0019 },
  comic: { id: 5, radius: 0.0012 },
  pop: { id: 6, radius: 0.0013 },
  neon: { id: 7, radius: 0.0011 },
  emboss: { id: 8, radius: 0.0009 },
};

const BW = [0.3, 0.59, 0.11];

const f = (id, name, cat, look, amount = 80) => ({ id, name, cat, look, amount });
const fx = (id, name, effect, amount = 100) => ({ id, name, cat: 'sanat', fx: effect, amount });

export const FILTERS = [
  // Portre: yumuşak ışık, temiz ten
  f('pamuk', 'Pamuk', 'portre', {
    brightness: 18, exposure: 6, contrast: -14, highlights: -15, shadows: 15,
    saturation: -12, vibrance: 8, temperature: 5, fade: 12, clarity: -18,
  }),
  f('seftali', 'Şeftali', 'portre', {
    temperature: 16, tint: 8, brightness: 10, contrast: -6, vibrance: 10,
    grade: { highlights: { hue: 28, sat: 30 }, shadows: { hue: 350, sat: 16 } },
    hsl: { orange: { s: -8, l: 10 } },
  }),
  f('porselen', 'Porselen', 'portre', {
    temperature: -12, brightness: 16, saturation: -16, highlights: -12, contrast: 8,
    hsl: { orange: { s: -25, l: 25 }, red: { s: -12 }, blue: { s: -10 } },
  }),
  f('gul', 'Gül', 'portre', {
    tint: 14, brightness: 8, vibrance: 6,
    grade: { midtones: { hue: 340, sat: 24 }, highlights: { hue: 10, sat: 14 }, shadows: { hue: 320, sat: 10 } },
    hsl: { red: { s: -10, l: 8 } },
  }),
  f('isilti', 'Işıltı', 'portre', { brightness: 14, clarity: -35, highlights: 12, contrast: 10, vibrance: 8, fade: 6 }),
  f('bal', 'Bal', 'portre', {
    temperature: 24, contrast: 8, saturation: 6,
    grade: { highlights: { hue: 42, sat: 36 }, shadows: { hue: 22, sat: 18 } },
  }),
  f('sis', 'Sis', 'portre', {
    fade: 30, contrast: -14, saturation: -20, brightness: 8, temperature: -4,
    grade: { shadows: { hue: 220, sat: 12 } },
  }),

  // Film: kimyasal film hissi
  f('altin', 'Altın 200', 'film', {
    temperature: 10, contrast: 10, fade: 10, saturation: 6, grain: 18,
    curves: { rgb: [[0, 0.04], [0.25, 0.21], [0.75, 0.8], [1, 0.97]] },
    hsl: { yellow: { h: -10, s: 10 }, green: { h: 15, s: -15 } },
  }),
  f('cam', 'Çam', 'film', {
    tint: -6, contrast: 8, fade: 12, saturation: -6, grain: 15,
    grade: { shadows: { hue: 160, sat: 22 }, highlights: { hue: 50, sat: 10 } },
  }),
  f('pastel', 'Pastel', 'film', {
    fade: 18, contrast: -8, saturation: -10, grain: 12,
    grade: { highlights: { hue: 30, sat: 12 }, shadows: { hue: 210, sat: 14 } },
  }),
  f('sinema', 'Sinema', 'film', {
    contrast: 14, saturation: -4, vignette: 15,
    grade: { shadows: { hue: 195, sat: 32 }, highlights: { hue: 35, sat: 26 } },
    hsl: { orange: { s: 10 }, aqua: { h: -10 } },
  }),
  f('gece', 'Gece', 'film', {
    temperature: -15, tint: 4, contrast: 15, blacks: -15, saturation: -10, vignette: 20,
    grade: { shadows: { hue: 222, sat: 26 } },
  }),
  f('anlik', 'Anlık', 'film', {
    fade: 20, contrast: -6, temperature: 6, vignette: 20, grain: 10,
    grade: { highlights: { hue: 58, sat: 16 }, shadows: { hue: 190, sat: 14 } },
  }),
  f('slayt', 'Slayt', 'film', {
    contrast: 20, saturation: 18, blacks: -10, temperature: -3, grain: 8,
    hsl: { blue: { s: 15 } },
  }),

  // Retro
  f('y1970', '1970', 'retro', {
    temperature: 20, fade: 25, saturation: -15, contrast: -5, grain: 22, vignette: 25,
    grade: { highlights: { hue: 45, sat: 26 }, shadows: { hue: 15, sat: 16 } },
  }),
  f('capraz', 'Çapraz', 'retro', {
    saturation: 10, contrast: 5,
    curves: {
      r: [[0, 0], [0.25, 0.18], [0.75, 0.86], [1, 1]],
      g: [[0, 0], [0.3, 0.26], [0.7, 0.77], [1, 1]],
      b: [[0, 0.16], [1, 0.84]],
    },
  }),
  f('sepya', 'Sepya', 'retro', {
    mono: BW, fade: 10, contrast: 5, grain: 15, vignette: 20,
    grade: { midtones: { hue: 32, sat: 80 }, highlights: { hue: 42, sat: 45 }, shadows: { hue: 22, sat: 60 } },
  }),
  f('kartpostal', 'Kartpostal', 'retro', {
    saturation: -28, fade: 28, temperature: 12, contrast: 4, grain: 10,
    grade: { highlights: { hue: 40, sat: 18 } },
    curves: { rgb: [[0, 0.05], [0.5, 0.52], [1, 0.94]] },
  }),
  f('lomo', 'Lomo', 'retro', {
    contrast: 25, saturation: 22, vignette: 48,
    grade: { shadows: { hue: 230, sat: 16 }, highlights: { hue: 55, sat: 14 } },
  }),
  f('kahve', 'Kahve', 'retro', {
    temperature: 15, saturation: -25, contrast: 8, fade: 12,
    grade: { shadows: { hue: 25, sat: 26 }, highlights: { hue: 40, sat: 16 } },
  }),

  // Yemek: iştah açıcı sıcaklık ve canlılık
  f('lezzet', 'Lezzet', 'yemek', {
    vibrance: 25, saturation: 8, temperature: 8, brightness: 6, contrast: 10, clarity: 15,
    hsl: { red: { s: 10 }, orange: { s: 10 } },
  }),
  f('taze', 'Taze', 'yemek', {
    brightness: 10, contrast: 6, temperature: -2, vibrance: 15, clarity: 10,
    hsl: { green: { s: 20, l: 10 }, yellow: { s: 10 } },
  }),
  f('firin', 'Fırın', 'yemek', {
    temperature: 18, contrast: 10, vibrance: 10, clarity: 10,
    grade: { highlights: { hue: 40, sat: 20 } },
  }),
  f('tatli', 'Tatlı', 'yemek', {
    brightness: 18, highlights: -12, saturation: -8, tint: 8, fade: 12,
    grade: { highlights: { hue: 330, sat: 14 }, shadows: { hue: 280, sat: 8 } },
  }),
  f('kahvalti', 'Kahvaltı', 'yemek', { exposure: 12, shadows: 20, contrast: -6, vibrance: 18, temperature: 10 }),

  // Manzara
  f('canli', 'Canlı', 'manzara', {
    vibrance: 30, contrast: 12, clarity: 20, highlights: -15, shadows: 10,
    hsl: { blue: { s: 10 } },
  }),
  f('gokyuzu', 'Gökyüzü', 'manzara', {
    highlights: -28, contrast: 10, temperature: -4,
    hsl: { blue: { s: 35, l: -22 }, aqua: { s: 25, l: -15 } },
  }),
  f('orman', 'Orman', 'manzara', {
    contrast: 12, clarity: 20, temperature: -3, shadows: 10,
    hsl: { green: { h: 10, s: 25, l: -12 }, yellow: { h: 12, s: 10 } },
  }),
  f('gunbatimi', 'Gün batımı', 'manzara', {
    temperature: 22, tint: 8, contrast: 10, saturation: 10, vignette: 15,
    grade: { highlights: { hue: 30, sat: 30 }, shadows: { hue: 280, sat: 15 } },
  }),
  f('deniz', 'Deniz', 'manzara', {
    temperature: -14, contrast: 8, vibrance: 20, highlights: -10,
    hsl: { blue: { h: -8, s: 28 }, aqua: { h: -10, s: 28 } },
  }),
  f('dram', 'Dram', 'manzara', {
    contrast: 30, clarity: 45, highlights: -35, shadows: 25, saturation: -20, blacks: -12, vignette: 30,
  }),
  f('kis', 'Kış', 'manzara', {
    temperature: -26, brightness: 10, saturation: -28, highlights: 5, fade: 10,
    grade: { shadows: { hue: 210, sat: 26 }, highlights: { hue: 200, sat: 10 } },
  }),

  // Siyah-beyaz
  f('klasik', 'Klasik', 'sb', { mono: BW, contrast: 10 }, 100),
  f('sert', 'Sert', 'sb', { mono: [0.35, 0.55, 0.1], contrast: 40, blacks: -15, clarity: 20 }, 100),
  f('yumusak', 'Yumuşak', 'sb', { mono: BW, contrast: -15, fade: 15, brightness: 5 }, 100),
  f('dramatik', 'Dramatik gök', 'sb', { mono: [0.8, 0.2, 0], contrast: 20 }, 100),
  f('gumus', 'Gümüş', 'sb', {
    mono: [0.25, 0.55, 0.2], fade: 10, contrast: 8,
    grade: { highlights: { hue: 210, sat: 8 }, shadows: { hue: 215, sat: 10 } },
  }, 100),
  f('noir', 'Noir', 'sb', { mono: BW, contrast: 45, blacks: -20, vignette: 40, grain: 25 }, 100),
  f('selenyum', 'Selenyum', 'sb', {
    mono: BW, contrast: 12,
    grade: { shadows: { hue: 280, sat: 16 }, highlights: { hue: 30, sat: 10 } },
  }, 100),

  // Sanatsal: gölgelendirici efektleri
  fx('karakalem', 'Karakalem', 'sketch'),
  fx('renklikalem', 'Renkli kalem', 'colorSketch'),
  fx('yagliboya', 'Yağlı boya', 'oil'),
  fx('suluboya', 'Suluboya', 'watercolor'),
  fx('cizgiroman', 'Çizgi roman', 'comic'),
  fx('popart', 'Pop art', 'pop'),
  fx('neon', 'Neon', 'neon'),
  fx('kabartma', 'Kabartma', 'emboss'),
];

export function findFilter(id) {
  return FILTERS.find((x) => x.id === id) || null;
}
