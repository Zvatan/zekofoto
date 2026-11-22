// Hazır filtreler. Tarifler bu uygulamaya aittir: color.js'teki kaydırıcı
// adlarıyla yazılır ve ekran kartı için 3B renk tablosuna çevrilir.
// Sanatsal filtreler renk tablosu değil, gölgelendirici efektidir (fx).

export const FILTER_CATEGORIES = [
  { id: 'kamera', label: 'Kamera' },
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

// Kamera filtreleri: renk tarifine ek olarak lens/sensör etkileri (extras):
//   bloom, halation (kırmızı hale), threshold (parlama eşiği), ca (renk kayması),
//   flash, soft (yumuşaklık), noise (dijital gürültü), 0..1;
//   leak: { color: [r, g, b], at: [x, y] (çıktı 0..1), size, amount } ışık sızması;
//   date: true → tarih damgası varsayılan olarak açık;
//   faceFlash: { amount, size } → flaş en büyük yüzün ortasına, yarıçapı yüz
//     yüksekliği × size (yüz algılama gerekir; yüz yoksa kadrajın ortası);
//   depth: { center, width, look } → derinlik haritasına göre yakın bölge "look"
//     tarifiyle, uzak bölge ana tarifle işlenir (derinlik tahmini gerekir).
// ai: true olan filtreler (✦) ilk kullanımda cihazdaki yapay zekâ modelini indirir.
const cam = (id, name, look, extras, amount = 90) => ({
  id,
  name,
  cat: 'kamera',
  look,
  extras,
  amount,
  ai: !!(extras && (extras.depth || extras.faceFlash)),
});

// Meitu filtrelerinin ölçülmüş karşılıkları (2026-11-22). Meitu'nun dosyaları
// kullanılmadı: kullanıcının referans fotoğrafı ile Meitu'nun aynı fotoğraftaki
// önizlemeleri karşılaştırılıp bu motorun parametreleri en küçük renk farkına
// oturtuldu. Önizlemelerin ortak bulanıklığı (netlik −14) ölçümden düşüldü.
// Ayrıntı: GELISTIRME.md §5.2.
const MEITU = [
  cam('flashfilm', 'Flash Film', {
    curves: {
      r: [[0, 0], [0.15, 0.115], [0.3, 0.265], [0.5, 0.515], [0.7, 0.75], [0.85, 0.892], [1, 0.995]],
      g: [[0, 0], [0.15, 0.129], [0.3, 0.292], [0.5, 0.526], [0.7, 0.762], [0.85, 0.916], [1, 1]],
      b: [[0, 0], [0.15, 0.114], [0.3, 0.279], [0.5, 0.553], [0.7, 0.806], [0.85, 0.956], [1, 1]],
    },
    saturation: -9,
    clarity: -6,
    vignette: -4,
    hsl: { red: { s: 5 }, orange: { s: 3, l: -1 }, yellow: { s: -6 }, aqua: { s: 1 }, blue: { s: 1 } },
  }, null, 100),
  cam('dslr', 'DSLR', {
    curves: {
      r: [[0, 0], [0.15, 0.117], [0.3, 0.269], [0.5, 0.509], [0.7, 0.742], [0.85, 0.882], [1, 0.956]],
      g: [[0, 0], [0.15, 0.148], [0.3, 0.316], [0.5, 0.542], [0.7, 0.762], [0.85, 0.9], [1, 0.996]],
      b: [[0, 0], [0.15, 0.144], [0.3, 0.309], [0.5, 0.553], [0.7, 0.802], [0.85, 0.943], [1, 1]],
    },
    saturation: -14,
    hsl: { red: { s: 4 }, orange: { s: 14, l: -3 }, yellow: { s: -7 }, green: { s: -2 }, aqua: { s: -1 }, blue: { s: -2 } },
  }, null, 100),
  cam('hdf', 'HDF', {
    curves: {
      r: [[0, 0], [0.15, 0.179], [0.3, 0.366], [0.5, 0.582], [0.7, 0.788], [0.85, 0.909], [1, 0.963]],
      g: [[0, 0], [0.15, 0.162], [0.3, 0.342], [0.5, 0.579], [0.7, 0.776], [0.85, 0.907], [1, 0.975]],
      b: [[0, 0.011], [0.15, 0.198], [0.3, 0.382], [0.5, 0.61], [0.7, 0.803], [0.85, 0.925], [1, 1]],
    },
    saturation: -20,
    clarity: -35,
    hsl: { red: { s: 11 }, orange: { s: -2, l: 7 }, yellow: { s: -4 } },
  }, null, 100),
  cam('glowyflash', 'Glowy Flash', {
    curves: {
      r: [[0, 0], [0.15, 0.145], [0.3, 0.304], [0.5, 0.499], [0.7, 0.689], [0.85, 0.851], [1, 1]],
      g: [[0, 0], [0.15, 0.134], [0.3, 0.293], [0.5, 0.486], [0.7, 0.691], [0.85, 0.852], [1, 1]],
      b: [[0, 0], [0.15, 0.135], [0.3, 0.287], [0.5, 0.488], [0.7, 0.697], [0.85, 0.854], [1, 0.998]],
    },
    saturation: -8,
    vignette: 6,
    hsl: { red: { s: 3 }, orange: { s: 3, l: -2 }, yellow: { s: -2 } },
  }, null, 100),
  // Meitu ışığı yüze veriyor: flaş algılanan yüzün ortasında (yüz algılama ile
  // ölçüldü, yarıçap ≈ yüz yüksekliği), ten biraz daha aydınlık, gerisi koyu.
  cam('hardflash', 'Hard Flash', {
    curves: {
      r: [[0, 0], [0.15, 0.089], [0.3, 0.218], [0.5, 0.423], [0.7, 0.687], [0.85, 0.873], [1, 1]],
      g: [[0, 0], [0.15, 0.082], [0.3, 0.228], [0.5, 0.456], [0.7, 0.671], [0.85, 0.869], [1, 1]],
      b: [[0, 0], [0.15, 0.079], [0.3, 0.214], [0.5, 0.438], [0.7, 0.661], [0.85, 0.871], [1, 1]],
    },
    saturation: -16,
    clarity: -13,
    hsl: { red: { s: -7 }, orange: { s: -2, l: 21 }, yellow: { s: 4 }, green: { s: -1 }, aqua: { s: 3 }, blue: { s: 4 } },
  }, { faceFlash: { amount: 0.272, size: 1.02 } }, 100),
  // G7x: tam çözünürlüklü Meitu çıktısından (g7x.jpeg) ölçüldü. Flaşlı kompakt
  // kamera: yakın olan (kişi, masa) aydınlanır, uzak olan (deniz, dağ, gökyüzü)
  // yaklaşık 1 durak kararır ve maviye kayar; yüz ayrıca biraz aydınlanır.
  // Ana tarif uzak bölgenin, depth.look yakın bölgenin dönüşümüdür.
  // Bkz. GELISTIRME.md §5.3.
  cam('g7x', 'G7x', {
    curves: {
      r: [[0, 0], [0.15, 0.077], [0.3, 0.176], [0.5, 0.333], [0.7, 0.529], [0.85, 0.737], [1, 0.95]],
      g: [[0, 0], [0.15, 0.081], [0.3, 0.179], [0.5, 0.334], [0.7, 0.52], [0.85, 0.746], [1, 1]],
      b: [[0, 0], [0.15, 0.073], [0.3, 0.18], [0.5, 0.353], [0.7, 0.574], [0.85, 0.822], [1, 1]],
    },
    saturation: -23,
    hsl: { red: { s: -1 }, orange: { s: 1 }, aqua: { h: -1, s: -1 }, blue: { h: -7, s: -5, l: 26 } },
  }, {
    faceFlash: { amount: 0.3, size: 0.7 },
    depth: {
      center: 0.386,
      width: 0.052,
      look: {
        curves: {
          r: [[0, 0], [0.15, 0.137], [0.3, 0.313], [0.5, 0.52], [0.7, 0.739], [0.85, 0.898], [1, 0.999]],
          g: [[0, 0], [0.15, 0.134], [0.3, 0.304], [0.5, 0.514], [0.7, 0.744], [0.85, 0.898], [1, 1]],
          b: [[0, 0], [0.15, 0.13], [0.3, 0.3], [0.5, 0.53], [0.7, 0.771], [0.85, 0.904], [1, 1]],
        },
        saturation: -14,
        hsl: { red: { s: 3 }, orange: { l: 1 }, yellow: { s: 1 }, blue: { s: -1 } },
      },
    },
  }, 100),
];

export const FILTERS = [
  // Kamera: Meitu'dan ölçülenler, ardından bu uygulamanın kendi kamera filtreleri
  ...MEITU,
  cam(
    'ccd',
    'CCD',
    {
      exposure: 10, contrast: 12, highlights: 10, whites: 12, temperature: -10, tint: -4,
      saturation: 8, vibrance: 6, fade: 8,
      curves: { rgb: [[0, 0.05], [0.5, 0.53], [0.85, 0.93], [1, 1]] },
      hsl: { orange: { l: 6 }, green: { h: -6, s: 10 }, blue: { s: 12 } },
      grade: { shadows: { hue: 190, sat: 22 }, highlights: { hue: 60, sat: 8 } },
    },
    { bloom: 0.45, noise: 0.35, ca: 0.4, soft: 0.2, date: true },
  ),

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
