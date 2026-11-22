# Zeko Foto — Geliştirici notları

Bu belge projeyi devralan geliştirici (ya da yapay zekâ asistanı) içindir: amaç, kullanıcıyla alınan kararlar,
mimari, ayar noktaları, tuzaklar ve yol haritası.

## 1. Amaç ve kısıtlar

- Meitu’nun (美图秀秀) **fotoğraf düzenleme** bölümüne olabildiğince yakın bir düzenleyici. Kolaj, video,
  toplu işlem ve belge tarama kapsam dışı.
- iPhone’da **Safari → Ana Ekrana Ekle** ile kullanılan PWA. Derleme adımı yok, GitHub Pages’te yayın.
- **Sunucu yok, kullanım başına ücret yok.** Bütün işlem cihazda; yapay zekâ özellikleri de cihazda çalışacak.
- Tek kullanıcı (kişisel kullanım).
- Meitu’nun kodu, filtre dosyaları, modelleri, sticker’ları ve yazı tipleri **kullanılmaz**. Kullanıcının
  önerdiği REA (morluto/rea, tersine mühendislik aracı) ile Meitu’nun ikili dosyaları çözülmedi. Kurulu
  uygulama yalnızca **özellik listesi** için referanstır. Filtre tarifleri, efektler ve simgeler bu projeye aittir.

## 2. Ürün kararları (kullanıcı onaylı, 2026-11-22)

- Ad: **Zeko Foto**. Tema: **hep koyu**. Vurgu rengi mor (`#6d4dff`) → pembe geçiş; Meitu’nun pembesinden ayrı.
- **Arşiv yok:** düzenle → Kaydet/Paylaş. Yalnız son düzenleme oturumu, iOS uygulamayı kapatırsa kaybolmasın
  diye IndexedDB’de tutulur (ana ekranda “Yarım kalan düzenleme”). Düzenleyiciden ✕ ile çıkınca silinir.
- Özellik listesi kullanıcıyla tek tek onaylandı. Aşamalar:
  1. **Temel** (bu sürüm): Düzenle, Ayarla, Filtreler, geçmiş, karşılaştırma, kaydet.
  2. Yazı ve süsleme: yazı, sticker/emoji, çerçeve, çizim kalemi, sihirli kalem, mozaik/bulanıklık kalemi,
     renk vurgusu.
  3. Güzellik: yüz noktaları (cihazda) ile cilt yumuşatma, beyazlatma, leke silme, göz altı, kırışıklık,
     yağlanma, yüz/göz şekillendirme, göz/diş, makyaj, saç rengi, bacak uzatma, parmakla şekillendirme.
  4. AI araçları (cihazda): arka plan silme/değiştirme, portre modu, vesikalık, AI silgi, HD kalite artırma,
     gökyüzü, AI stil (anime).
  5. Cihazda yapılamayanlar (AI genişletme, yazıyla düzenleme): kullanıcının **kendi ücretsiz API anahtarı**
     telefondan doğrudan çağrılarak; o aşamada güncel ücretsiz kotalar doğrulanacak ⚑.
- Kullanıcı, ilerlemenin **soru sorarak** yapılmasını istiyor: büyük kararlar ve yeni aşamalar başlamadan önce sorulur.

## 3. Hızlı başlangıç

```bash
node tests/run.mjs                  # çekirdek testleri (Node 18+, bağımlılık yok)
npx http-server -p 8080 -c-1 .      # ya da herhangi bir statik sunucu; http://localhost:8080
```

Çalışma klasörü OneDrive masaüstünde. Git deposu **OneDrive dışında** tutulmalı (README → Yol B).

## 4. Mimari

### 4.1 Dosya haritası

```
index.html, css/app.css        arayüz (iki ekran: ana ekran, düzenleyici)
js/app.js                      denetleyici: ekranlar, araç açma/uygulama, geçmiş, kaydet, oturum
js/viewer.js                   sahne: sığdırma, yakınlaştırma/kaydırma, karşılaştırma, çizim zamanlaması
js/gl/engine.js                WebGL2 motoru: dokular, renk tabloları, önizleme ve karolu tam çıktı
js/gl/shaders.js               gölgelendiriciler: develop (ayar/filtre), effect (sanatsal), blur
js/tools/crop.js               Düzenle aracı (kırp, döndür, perspektif, boyut)
js/tools/adjust.js             Ayarla aracı (kaydırıcılar, eğriler, HSL, renk dengesi, otomatik)
js/tools/filters.js            Filtreler aracı (kategoriler, küçük resimler, yoğunluk)
js/widgets/slider.js           kaydırıcı; js/widgets/curve.js eğri düzenleyici
js/history.js, js/store.js     geri alma geçmişi ve IndexedDB
js/export.js                   Kaydet sayfası ve iOS paylaşımı
js/image-io.js, js/ui.js       fotoğraf okuma; simgeler, bildirim, alt sayfa
js/core/color.js               renk zinciri → 3B renk tabloları (DOM’suz, Node’da test edilir)
js/core/presets.js             filtre tarifleri ve efekt tanımları
js/core/geometry.js            kırpma/döndürme/perspektif matematiği (DOM’suz)
js/core/auto.js                otomatik iyileştirme (histogram)
sw.js, manifest.webmanifest    çevrimdışı ve ana ekran uygulaması
```

### 4.2 Araç modeli

Meitu’daki gibi: araç açılır → canlı önizleme → ✓ ile **tam çözünürlükte** uygulanır ve geçmişe yeni adım
eklenir; ✕ ile vazgeçilir. Her araç `create(host, opts)` ile kurulur ve şu nesneyi döner:

```js
{ title, compare?: false, mount(panelBody), isDirty(), apply() → { spec, w, h, label } | null, destroy() }
```

`host`: `engine`, `viewer`, `W`, `H`, `image` (güncel kanvas), `stage`, `overlay`, `small(side)`.
Araç, sahneye `viewer.setContent({ w, h, spec(compare) })` ile ne çizileceğini söyler. `apply()` bir çizim
tarifi (spec) döner; `app.applyTool` bunu `engine.renderImage` ile tam boyutta çizer.

Yeni araç eklemek: `js/tools/` altına dosya, `app.js` → `TOOLS` (ve istenirse `SHORTCUTS`), `sw.js` → `FILES`.

### 4.3 Motor (js/gl/engine.js)

- Kaynak fotoğraf mip seviyeli `RGBA8` doku. Önizleme küçültmesi mip ile, örnekler `textureGrad` ile.
- **Rehber doku:** kaynağın 384 px’e küçültülüp Gauss (σ=6) ile bulanıklaştırılmış kopyası. Vurgular,
  gölgeler ve netlik bunu yerel ortalama olarak kullanır (düz ton eğrisi yerine; yerel kontrast korunur).
- **Renk tabloları:** 33³ `RGBA16F` 3B doku × 2. Ön tablo: beyaz dengesi + pozlama (doğrusal ışıkta). Son tablo:
  ayar zinciri ya da filtre tarifi. JS’te hesaplanır (~4 ms), kaydırıcı her değiştiğinde yeniden yüklenir.
- **spec** (çizim tarifi): `{ source, matrix, outW, outH, pre, post, postAmount, tone, fx, seed, effect, outside }`.
  `matrix`: çıktı (0..1) → kaynak doku koordinatı, 3×3 sütun öncelikli (kırpma/döndürme/perspektif).
- **Çıktı:** 2048’lik karolar halinde ara dokuya çizilir, `readPixels` ile okunup 2B kanvasa `putImageData`.
  Görünen tuval yeniden boyutlanmaz, bellek tepe noktası sınırlı kalır.
- Sanatsal efektler tek geçişlidir; komşu örnekler kaynaktan alınır. Yarıçap görüntü boyuna orantılıdır ve
  çizim pikselinden küçük olamaz (`gR`), bu yüzden küçük resimde ve önizlemede de görünür.

### 4.4 Geçmiş ve oturum

- Bellekte yalnız güncel kanvas. Her adım JPEG 0.95 (saydamsa PNG) olarak IndexedDB’ye yazılır; en çok 25 adım
  (0. adım = özgün fotoğraf, hiç silinmez; küçültülmediyse özgün dosyanın kendisi saklanır).
- Kodlama arka planda sıralı yapılır; eski kanvas, `history.settled()` sonrası serbest bırakılır.
- IndexedDB yoksa (gizli sekme) geçmiş bellekte tutulur.
- Karşılaştırma: özgün fotoğrafın 2048 px kopyası ayrı dokuda (`source: 'compare'`).

### 4.5 Veri modeli (IndexedDB `zeko-foto`, sürüm 1)

- `meta["session"]`: `{ id, entries: [{ key, label, w, h }], index, hasAlpha, seq, createdAt }`
- `snaps["<id>:<sıra>"]`: `{ buf: ArrayBuffer, type }`

## 5. Renk zinciri ve ayar noktaları (js/core/color.js)

Sıra: keskinlik → **ön tablo** (sıcaklık, renk tonu, pozlama) → yerel ton (vurgular, gölgeler, netlik) →
**son tablo** (siyahlar/beyazlar → parlaklık → kontrast → soldurma → eğriler → doygunluk/canlılık → HSL →
renk dengesi) → vinyet → gren.

| Ayar | Aralık | Not |
|---|---|---|
| Pozlama | ±2 durak | Kazanç > 1 olunca parlak uçta yumuşak omuz (beyazlar kesilmez) |
| Sıcaklık / Renk tonu | R/B ±%28, G ±%20 | Nötr gri parlaklığı korunur |
| Parlaklık | γ = 2^(−0.8·b) | Orta tonlar |
| Kontrast | 0.5 eksenli güç S-eğrisi | Pozitifte %85 karışım (uçlar ezilmesin) |
| Doygunluk/Canlılık | | Gamut sınırına yumuşak yaklaşım (ton kaymaz); canlılık ten rengini korur |
| HSL | ton ±30°, doygunluk ×(1±1), parlaklık | 8 bant, komşu bant ağırlıkları toplamı 1; nötrler etkilenmez |
| Renk dengesi | yoğunluk ≤ 0.3 renk kayması | Gölge (1−L)², vurgu L² ağırlığı; denge ±0.25 |

Filtre tarifleri (`presets.js`) aynı kaydırıcı adlarını kullanır; ek olarak `mono` (kanal ağırlıklı siyah-beyaz)
ve `mixer` (3×3). Varsayılan yoğunluk renk filtrelerinde 80, S-B ve efektlerde 100.
Görsel kontrol: `node tests/run.mjs` → `tests/out/filtreler.png`, `tests/out/ayarlar.png`.

## 6. Geometri (js/core/geometry.js)

- İleri dönüşüm kaynak → çerçeve: `F = R(açı) · P(perspektif) · O(90°/aynalama)`. Açı ve perspektif çerçeve
  uzayında; kullanıcı 90° döndürünce/aynalayınca değerler ekrandaki anlamı korunacak şekilde dönüştürülür
  (`rotate90`, `flip`).
- Geçerli bölge: kaynağın çerçevedeki dörtgeni ∩ çerçeve (Sutherland–Hodgman). Kırpma her zaman içinde kalır.
  Kullanıcı kırpmaya dokunmadıysa (`cropAuto`) açı/perspektif değişince en büyük kırpma yeniden hesaplanır
  (`maxRect`, merkezi altın oran aramasıyla); dokunduysa merkez etrafında küçültülür (`fitRect`).
- Çıktı boyutu kaynak piksel yoğunluğunu korur (perspektifte yerel ölçek); döndürme/perspektif yoksa kırpma tam
  piksele oturur (`snapCrop`), yeniden örnekleme bulanıklığı olmaz.

## 7. Test

### 7.1 Çekirdek testleri (depoda)

`node tests/run.mjs`: renk zinciri (birim dönüşüm, tekdüzelik, gamut, HSL ağırlıkları, LUT doğruluğu),
filtrelerin geçerliliği, geometri (döndürme/aynalama tersinirliği, kırpmanın içeride kalması, çıktı boyutu),
otomatik iyileştirme. Görsel kontrol çıktıları `tests/out/`.

### 7.2 Uçtan uca (2026-11-22’de yapıldı, betikler depoda değil)

`playwright-core` + sistemdeki Chrome (`executablePath`), `--use-angle=swiftshader --enable-unsafe-swiftshader`
(başsız Chrome’da WebGL2 için). Bağlam: 390×844, `isMobile`, `hasTouch`, iPhone Safari kullanıcı ajanı, `tr-TR`.
Test fotoğrafı olarak Windows duvar kâğıtları (`C:\Windows\Web\Wallpaper\ThemeC\img28.jpg`).

- `navigator.share`/`canShare` `addInitScript` ile taklit edilir, paylaşılan dosya kaydedilir.
- Senaryolar: açma; Ayarla (kaydırıcılar, otomatik, eğri ekleme/sürükleme, HSL, renk dengesi, uygulama);
  Filtreler (küçük resimler, renk filtresi, 6 efekt, uygulama); Düzenle (1:1, köşe sürükleme, 90°, açı,
  perspektif, boyut, uygulama → kare çıktı); geri al/yinele; karşılaştırma basılı/bırakınca; çift dokunuşla
  yakınlaştırma; kaydet (JPEG); sayfa yenileyince “Devam et” ve geri alma; çıkışta oturumun silinmesi.
  Hepsi geçti, konsolda hata yok.
- Ayrıca bütün filtre ve efektler gerçek fotoğrafta ekran kartı yoluyla kontak sayfasına çizilip gözle kontrol edildi.
- Yağlı boya, SwiftShader’da (yazılım GPU) 9 MP fotoğrafta ~7 sn; gerçek iPhone GPU’sunda çok daha hızlı olmalı.

### 7.3 Gerçek cihaz

README → “iPhone test listesi”. Masaüstünde görülemeyenler: Safari’nin WebGL2/`RGBA16F` davranışı, bellek
sınırları, galeri/kamera seçici, paylaşım menüsü, ana ekran modu, dokunma hareketleri.

## 8. Tuzaklar (bunları bozmayın)

1. **Paylaşım dokunma anında başlamalı.** `navigator.share` öncesinde `await` olmamalı; dosya önceden hazırlanır.
2. **highp:** iOS’ta `mediump` 16 bit; 4096 piksellik dokuda koordinat hatası verir. Bütün gölgelendiriciler highp.
3. **Türevler dallanmadan önce:** `dFdx/dFdy` `locate()` içinde erken dönüşten önce alınır; sonrasında örtük
   türevli `texture()` kullanılmaz (`textureGrad`/`textureLod`).
4. **Satır yönü:** tuvale çizerken `uFlip=1`, ara dokuya çizerken 0. Böylece `readPixels` satırları yukarıdan aşağıya.
5. **Kırpma sınırı:** `locate()` bir çizim pikseli kadar taşmayı kenara kenetler; yoksa kenarda koyu çizgi çıkar.
6. **Sahnenin içindeki düğmeler** (`#btn-compare` vb.) `pointerdown`’da `stopPropagation` yapmalı; yoksa sahne
   işaretçi yakalamasını çalar ve bırakma olayı düğmeye gelmez.
7. **Kanvas belleği:** `MAX_SIDE = 4096`, `MAX_PIXELS = 16e6`. İşi biten kanvas `releaseCanvas()` ile bırakılır;
   güncel kanvas ancak geçmiş kaydı bitince (`history.settled()`).
8. **IndexedDB’de Blob değil ArrayBuffer** saklanır (Safari’de okunan Blob’lar sonradan okunamayabiliyor).
9. **EXIF yönü:** fotoğraf `<img>` ile çözülür; `createImageBitmap`’e geçmeyin. HEIC için `accept="image/*"` yeterli.
10. **`#app { overflow: clip }`:** ekran dışındaki ekranlar odak ya da `scrollIntoView` ile kapsayıcıyı kaydırmasın.
11. **Ekranlar `display:none` ile gizlenmez** (kanvas ölçümleri ve ResizeObserver bozulur).
12. **Service worker:** yeni dosya → `sw.js` `FILES`; her yayında `VERSION`. İlk kurulumda “Yeni sürüm” teklif edilmez.
13. Renk tabloları motorda tektir: bir araç açıkken başka bir araç tabloyu değiştirmemeli; araç kapanınca
    `engine.setLuts({})` ve ana görünüm tablo kullanmaz.

## 9. Yayın kontrol listesi

1. `node tests/run.mjs` geçmeli; `tests/out/*.png` gözle kontrol.
2. Yeni dosya → `sw.js` `FILES`. `sw.js` ve `js/app.js` → `VERSION`.
3. Commit → Push; iPhone’da “Yeni sürüm hazır → Yenile”, README test listesinin ilgili maddeleri.

## 10. Yol haritası

⚑ işaretliler kullanıcının kararını gerektirir; başlamadan önce seçenekler kısaca anlatılıp sorulur.

- **Aşama 2 — Yazı ve süsleme:** yazı katmanı (sürükle/döndür/ölçekle, yazı tipi, renk, kontur, gölge, hazır
  stiller), sticker/emoji (iPhone emojileri + kendi çizdiğimiz set), çerçeveler, fırça araçları (çizim, sihirli
  kalem, mozaik/bulanıklık, renk vurgusu, silgi). Yazı tipleri: OFL lisanslı Google Fonts, depoya gömülü ⚑ (hangi tipler).
- **Aşama 3 — Güzellik:** MediaPipe Face Landmarker (Apache-2.0, ~4 MB, cihazda) ile yüz noktaları; ten maskesi
  + kenar koruyan yumuşatma; bükme (liquify) ile yüz/göz şekillendirme; saç rengi için saç bölütleme modeli.
  Model ilk kullanımda indirilip önbelleğe alınır ⚑ (depoya mı gömülsün, CDN’den mi).
- **Aşama 4 — AI araçları (cihazda):** arka plan silme (bölütleme modeli), portre modu, vesikalık, AI silgi
  (MI-GAN benzeri hafif doldurma modeli), HD 2–4× (küçük süper çözünürlük modeli), gökyüzü, anime stili.
  ONNX Runtime Web (iOS 26+ WebGPU, yoksa WASM). Model lisansları tek tek kontrol edilecek ⚑.
- **Aşama 5:** AI genişletme ve yazıyla düzenleme için kullanıcının kendi ücretsiz API anahtarı ⚑.
- Diğer: Display P3 renk alanı (iPhone fotoğraflarının geniş gamutu), EXIF tarih/konum koruma ⚑, açılış
  ekranları, iPad yerleşimi.

## 11. Kod stili

- Derleme yok: tarayıcının doğrudan yüklediği ES modülleri; harici kütüphane yok (AI aşamasında model
  çalıştırıcıları istisna olacak).
- 2 boşluk girinti, tek tırnak, noktalı virgül, satır ≤ ~120 karakter.
- Yorumlar Türkçe ve “neden”i anlatır. Arayüz metinleri Türkçe ve kısa.
- `js/core/` DOM’dan bağımsız kalır; yeni piksel/geometri mantığı oraya yazılıp `tests/run.mjs`’e eklenir.
- Kullanıcıya görünen hatalar `toast()` ile Türkçe; ayrıntı `console.error`’a.
