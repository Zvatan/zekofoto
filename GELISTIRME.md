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
js/image-io.js, js/ui.js       fotoğraf okuma (+ çekim tarihi); simgeler, bildirim, alt sayfa
js/stamp.js                    tarih damgası (yedi parçalı turuncu rakamlar, yazı tipi kullanmaz)
js/core/color.js               renk zinciri → 3B renk tabloları (DOM’suz, Node’da test edilir)
js/core/presets.js             filtre tarifleri, kamera ekleri ve efekt tanımları
js/core/exif.js                JPEG EXIF’inden çekim tarihi (DOM’suz)
js/core/vision.js              derinlik normalleştirme, yüz kutuları, NMS (DOM’suz)
js/ai/runtime.js               ONNX Runtime Web’i ve modelleri ilk kullanımda ilerlemeli yükler
js/ai/depth.js, js/ai/faces.js derinlik tahmini (Depth Anything V2 Small), yüz algılama (UltraFace)
vendor/ort/, models/           çalıştırıcı (14 MB) ve modeller (26 + 1,2 MB); lisanslar models/LISANSLAR.md
tools/meitu-olcum/             Meitu filtre ölçüm ve doğrulama betikleri (uygulamaya dahil değil)
js/core/geometry.js            kırpma/döndürme/perspektif matematiği (DOM’suz)
js/core/auto.js                otomatik iyileştirme (histogram)
sw.js, manifest.webmanifest    çevrimdışı ve ana ekran uygulaması
```

### 4.2 Araç modeli

Meitu’daki gibi: araç açılır → canlı önizleme → ✓ ile **tam çözünürlükte** uygulanır ve geçmişe yeni adım
eklenir; ✕ ile vazgeçilir. Her araç `create(host, opts)` ile kurulur ve şu nesneyi döner:

```js
{ title, compare?: false, mount(panelBody), isDirty(), apply() → { spec, w, h, label, post? } | null, destroy() }
```

`host`: `engine`, `viewer`, `W`, `H`, `image` (güncel kanvas), `stage`, `overlay`, `small(side)`, `photoDate`.
`post(canvas)`: tam boyutlu çıktı çizildikten sonra 2B kanvasa ek çizim (ör. tarih damgası).
Araç, sahneye `viewer.setContent({ w, h, spec(compare) })` ile ne çizileceğini söyler. `apply()` bir çizim
tarifi (spec) döner; `app.applyTool` bunu `engine.renderImage` ile tam boyutta çizer.

Yeni araç eklemek: `js/tools/` altına dosya, `app.js` → `TOOLS` (ve istenirse `SHORTCUTS`), `sw.js` → `FILES`.

### 4.3 Motor (js/gl/engine.js)

- Kaynak fotoğraf mip seviyeli `RGBA8` doku. Önizleme küçültmesi mip ile, örnekler `textureGrad` ile.
- **Rehber doku:** kaynağın 384 px’e küçültülüp Gauss (σ=6) ile bulanıklaştırılmış kopyası. Vurgular,
  gölgeler ve netlik bunu yerel ortalama olarak kullanır (düz ton eğrisi yerine; yerel kontrast korunur).
- **Renk tabloları:** 33³ `RGBA16F` 3B doku × 4. Ön tablo: beyaz dengesi + pozlama (doğrusal ışıkta). Son tablo:
  ayar zinciri ya da filtre tarifi. `fg` (derinlikle yakın plan) ve `face` (yüz elipsi) yalnız ölçülmüş
  kamera filtrelerinde. JS’te hesaplanır (~4 ms), kaydırıcı her değiştiğinde yeniden yüklenir.
- **spec** (çizim tarifi): `{ source, matrix, outW, outH, pre, post, postAmount, tone, fx, seed, effect, outside,
  glow, lens, leak, flashAt, depthMix, depthGain, faceMix }`.
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

- `meta["session"]`: `{ id, entries: [{ key, label, w, h }], index, hasAlpha, seq, createdAt, photoDate }`
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
ve `mixer` (3×3). Varsayılan yoğunluk renk filtrelerinde 80, kamera filtrelerinde 90, S-B ve efektlerde 100.
Görsel kontrol: `node tests/run.mjs` → `tests/out/filtreler.png`, `tests/out/ayarlar.png`.

### 5.1 Kamera filtreleri ve ekler (2026-11-22, sürüm 0.2)

Kullanıcı, Meitu telefon uygulamasındaki ücretli kamera filtrelerinin (ör. “Canon G7X”, CCD) ücretsiz
karşılıklarını istedi; hedef “orijinalin tıpatıp aynısı”. Meitu’nun filtre dosyaları kullanılmaz: Meitu’dan
gelen filtreler §5.2’deki gibi ölçülerek, diğerleri (CCD) gerçek kameranın karakterine göre ayarlanır.

Renk tarifine ek olarak `extras` (0..1, yoğunlukla ölçeklenir), develop gölgelendiricisinde:

| Ek | Uygulama |
|---|---|
| `bloom`, `threshold` | Rehber doku + 8 halka örneği (~%3 yarıçap), eşik üstü parlak bölgeler ekran karışımıyla |
| `halation` | Aynı kaynaktan kırmızı-turuncu hale (film) |
| `ca` | Kırmızı ve mavi kanal merkezden zıt yönlere kayar (renk kayması) |
| `flash` | Ortası aydınlanır, kenarlara doğru düşer |
| `soft` | 4 komşu ortalaması; yarıçap görüntüye orantılı (uzun kenarın %0,06’sı) |
| `noise` | Piksel düzeyinde renkli sensör gürültüsü, gölgelerde güçlü |
| `leak` | `{ color, at, size, amount }` ışık sızması (Gauss leke + gürültü) |
| `date` | Tarih damgası varsayılan olarak açık |

Tarih damgası ekran kartı dışında çizilir: önizlemede sahne üstündeki `.stamp-ov` kanvası, çıktıda aracın
`apply()` sonucundaki `post(canvas)` kancası (`app.applyTool` bunu `renderImage` sonrası çağırır).
Tarih: EXIF DateTimeOriginal → dosya tarihi → bugün; oturumda `meta.photoDate` olarak saklanır.
Biçim `'26 11 22` (yıl, ay, gün). Kullanıcı düğmeye dokunduysa seçimi filtre değişince korunur.

### 5.2 Meitu filtrelerinin ölçülmesi (2026-11-22, sürüm 0.3)

Veri (kullanıcının `Desktop\meitu-ekran` klasörü, depoda değil): filtresiz `referans foto.jpeg` (960×1280) ve
Meitu’nun aynı fotoğraftaki filtre önizlemelerinin ekran görüntüleri (premium üyelik olmadığı için yalnız
küçük önizlemeler; ~128 px, WhatsApp sıkıştırmalı). Araçlar: `tools/meitu-olcum/` (README’si orada).

Yöntem:
1. Hizalama: önizlemeler fotoğrafın **tam ortadaki karesini** gösteriyor (x=0, y=160, kenar 960; korelasyon ≈0,99).
2. Referans 128 ızgaraya alan ortalamasıyla indirilir; iki taraf 3×3 hücreyle yumuşatılır; rozet ve köşeler maskelenir.
3. Motorun sırası taklit edilerek (netlik → son tablo → vinyet) parametreler koordinat inişiyle en küçük RGB
   farkına oturtulur: R/G/B eğrileri (x = 0, .15, .3, .5, .7, .85, 1), doygunluk, 7 HSL değeri (±50, büyüklük
   cezalı; tek fotoğrafta az pikselli bant uç değere kaçmasın), netlik, vinyet.
4. Önizlemelerin ortak bulanıklığı ölçümün kendisidir: DSLR ve Glowy Flash’ta bulunan netlik (−14,1) hepsinden düşülür.
5. Doğrulama: referans, uygulamanın WebGL motoruyla işlenip aynı kesitte Meitu önizlemesiyle karşılaştırılır.

Sonuç (uygulamanın motoruyla, ortalama ΔE; ölçüm gürültüsü ≈2):

| Filtre | Filtresiz | Bizim | Not |
|---|---|---|---|
| Flash Film | 6,8 | 3,1 | soğuk açık tonlar, kontrast |
| DSLR | 6,9 | 2,7 | nötr beyaz dengesi, doygunluk −14 |
| HDF | 9,4 | 3,1 | açılmış mavimsi gölgeler, pus (netlik −35) |
| Glowy Flash | 2,6 | 1,8 | çok hafif |
| Hard Flash | 6,1 | 5,0 | Meitu ışığı **yüze** veriyor (yüz algılama); ten parlaklığıyla (turuncu L +24) yaklaşıldı |
| G7x | 8,1 | 3,3 | güçlü S-eğrisi, soğuk beyazlar, yumuşaklık (netlik −25) |

Sınırlar: 128 px önizlemede gren, keskinlik ve parlama dokusu ölçülemez; tam çözünürlüklü önizleme gelirse
yeniden ölçülmeli. Hard Flash 0.4’te yüz merkezli flaşa geçti (`faceFlash: { amount 0,272, size 1,02 }`,
yarıçap ≈ yüz yüksekliği; ΔE 5,0).

### 5.3 G7x — tam çözünürlüklü ölçüm ve derinlikli flaş (sürüm 0.4)

Kullanıcı önizlemeden ölçülen G7x’i yanlış buldu ve Meitu’nun aynı fotoğrafa uyguladığı tam çözünürlüklü
çıktıyı (`meitu-ekran\g7x.jpeg`, 960×1280, kaymasız) gönderdi. Bulgular (`tools/meitu-olcum`):
- G7x yapay zekâlı bir **flaş**: kameraya yakın olan (kişi, masa, masa lambası) aydınlanıyor, uzak olan (deniz −0,15,
  orman −0,14, gökyüzü −0,09, arkadaki insanlar, iskele) kararıyor. Arkadaki insanlar da karardığı için kişi
  bölütleme değil **derinlik** kullanılmalı (kullanıcı onayladı: ilk kullanımda ~41 MB indirme).
- Gökyüzü ~10° maviye kayıyor; yüz ayrıca aydınlanıyor; lamba kubbesinde flaş yansıması (taklit edilmedi).
- Önizlemeden yapılan eski ölçüm bu yüzden tutmamıştı: önizleme görünüşü gerçek çıktıyı temsil etmiyor.

Model (motorda): uzak bölge ana tarif, yakın bölge `extras.depth.look`; geçiş
`smoothstep(center ± width, derinlik)`; derinlik kenar duyarlı büyütülür (joint bilateral, 3×3, renk
benzerliği `exp(−40·|Δc|²)`), yoksa nesne çevresinde hale olur. Üstüne yüz merkezli flaş
(`faceFlash: { amount 0,3, size 0,7 }`). Oturtma: iki tarifin R/G/B eğrileri, doygunluk ve HSL’i + geçiş,
koordinat inişiyle (22 bin örnek). Sonuç (uygulamanın içinden, tüm görüntü): **ΔE 10,4 → 3,8** (ortanca 2,6;
yüzde 6,6 → 5,7). Kalan fark çoğunlukla ince doku ve iki JPEG’in sıkıştırma izi. Yumuşatma eklemek ΔE’yi biraz
düşürüyor ama yüzü Meitu’dakinden yumuşak gösterdiği için kullanılmadı.

Yeni bir tam çözünürlüklü örnek gelirse: `node derinlik.mjs` → `node tam-oturt.mjs <dosya>` →
`node yuz-flas.mjs <dosya>` → tarifleri `presets.js`’e işle → `node tam-dogrula.mjs <dosya> <kimlik>`.
Daha yakın “v2” için ayrıca `node v2-oturt.mjs <dosya> 0.7` (§5.5).

### 5.4 Cihazda yapay zekâ

- **Çalıştırıcı:** ONNX Runtime Web 1.31.1, yalnız WASM (SIMD, tek iş parçacığı: GitHub Pages COOP/COEP
  vermediği için SharedArrayBuffer yok). `.wasm` ve model `fetch` ile ilerlemeli indirilir, `env.wasm.wasmBinary`
  ile verilir. Model dosyalarındaki zararsız uyarılar `logSeverityLevel: 3` ile susturulur.
- **Derinlik:** kısa kenar 392 px (14’ün katı; 0.4.2’ye kadar 280), ImageNet normalleştirme; çıktı göreli ters
  derinlik, %2–%98 aralığına yayılıp 0..255 (255 = yakın). Masaüstü Chrome’da ~1,4 sn; iPhone’da ölçülmedi.
- **Kenara oturtma (0.4.3):** model çıktısı nesnenin dışına 1–2 harita pikseli taşar; 12 MP fotoğrafta bu
  8–15 px’lik bir hale ve keskin bir “kesik” çizgisi demekti (kullanıcının telefonunda görüldü: lamba kubbesinin
  çevresi, kubbenin arkasındaki direk). `vision.js` → `refineDepth`: renk rehberli süzgeç (guided filter,
  r = 3 harita pikseli, eps = 0,004); katsayılar haritanın çözünürlüğünde, sonuç uzun kenarı en çok 1536 px
  olan kopyada her pikselin kendi rengiyle (`q = a·renk + b`). Masaüstünde 12 MP için ~0,1 sn. Motordaki 3×3
  `depthAt` olduğu gibi kalır (artık ~2,6 px ölçekte çalışır).
- **Yüz:** UltraFace RFB-320, oran korunarak 320×240’a yerleştirilir, (x−127)/128; eşik 0,7, NMS 0,3. ~60 ms.
- Sonuçlar görüntü başına bir kez hesaplanır (`app.doc.ai`), görüntü değişince silinir ve motorun derinlik
  dokusu kaldırılır. Filtre seçilince `ensureAi` gerekeni hazırlar; hata olursa filtre yapay zekâsız çalışır.
- **Önbellek:** `sw.js` `/vendor/` ve `/models/` dosyalarını ilk kullanımda `zeko-foto-ai-v1` önbelleğine koyar;
  bu önbellek uygulama sürümü değişince silinmez. Model değişirse adı artırılmalı. Çevrimdışı çalıştığı test edildi.
- Hız yetmezse: WebGPU sürümü (`ort.webgpu.min.mjs` + 27 MB `asyncify.wasm`, iOS 26+).
Sıradaki adaylar (ana sayfada görülen adlar): Fuji XT30, Digicam, Moon Light, Food, Brighten, Kırmızı Işık,
Gece Görünümü; aynı referans fotoğraftaki önizlemeleri gerekiyor.

### 5.5 G7X v2 — ayrıntılı oturtma, Meitu = %70 (sürüm 0.4.1)

Kullanıcı isteği: Meitu’ya olabildiğince yakın yeni bir “G7X v2”; Meitu’nun görünümü **%70 yoğunlukta**
yakalansın, yoğunluk daha da artabilsin. Eski G7x olduğu gibi duruyor (karşılaştırma için).

Kalan farkın tanısı (v1, örneklem içi üst sınırlar, ortalama ΔE 3,80 / yüz 5,57):
- Yakın/uzak bölgelere renk başına serbest düzeltme → 3,27; yalnız yüze ayrı renk → yüz 4,76.
- Keskinleştirme her miktarda kötüleştiriyor (Meitu inceltmiyor); derinliğe göre ışıkta küçük eğilimler var.

Model (motorda, `presets.js` → `g7xv2`):
- Uzak / yakın / yüz için ayrı tarif + her birine **5³ renk düzeltme ızgarası** (`extras.grid`,
  `depth.grid`, `face.grid`; tabloya pişirilirken `sampleGrid` ile eklenir).
- **Yüz bölgesi** (`extras.face`): algılanan yüzün çevresinde yumuşak elips (`uFaceBox`, yarıçap kutunun 0,55
  katı) kendi tablosuyla (`uFaceLut`).
- **Derinliğe göre ışık eğrisi** (`extras.depthGain`, 8 düğüm: `GK` = 0, .15, .3, .4, .5, .6, .75, 1;
  oturtmada pürüzsüzlük cezalı); yüz flaşı (`faceFlash` 0,181 × 0,39); vinyet 12,5.
- Oturtma 5×5 ortalamalı görüntülerde (doku ve JPEG izi dışarıda): uzamsal değerler ve yüz tarifi koordinat
  inişiyle, ızgaralar doğrusal en küçük karelerle (komşu farkı + büyüklük cezalı), 3 tur.

**%70 ölçeği (`extras.meituAt: 0.7`):** tablolar T yerine `c + (T(c) − c) / 0.7` ile pişirilir (0..1 dışına
taşabilir; `RGBA16F`, `bakeLut` kenetlemez), uzamsal etkiler × 1/0.7, ışık eğrisi `1 + (g − 1) / 0.7`.
Yoğunluk a iken sonuç `c + a/0.7 · (Meitu − c)`: %70 = ölçülen görünüm, %100 ≈ 1,43 kat. Varsayılan yoğunluk 70.

Sonuç (uygulamanın içinden, %70, tüm görüntü; v1 → v2): ortalama **ΔE 3,82 → 3,22**, ortanca 2,61 → 1,95,
%90 8,30 → 7,48 (oturtmada yüz 5,7 → 4,4). %100’de kırpılan piksel %0,22 (Meitu %0,19), %70 ile aynı.
Sınır: tek fotoğrafa oturtuldu; ızgaralar bu fotoğrafta bulunmayan renklerde komşularından yumuşak devam eder.
Başka sahnelerde sapma olursa yeni tam boy örneklerle yeniden oturtulmalı (`node v2-oturt.mjs`).

Yakın/uzak sınırları (piksellerin %6’sı, hatanın %11’i; ΔE 6,1, dışı 3,05): yakın bir nesnenin hemen
arkasındaki uzak alan ince bir şerit halinde aydınlık kalıyor (ör. lamba kubbesinin altındaki deniz; v1’de de var).
- `depthAt` komşuluğunu büyütmek (5×5, 7×7, daha ince mip, daha keskin renk ağırlığı) fark etmiyor (5,91 → 5,88):
  şerit büyütmeden değil, derinlik haritasının kendisinden.
- Derinlik modelinin kısa kenarı 280 → 392 → 518: masaüstünde 0,6 / 1,4 / 3,1 sn; geçiş bölgesinde ΔE
  5,91 → 5,33 → 5,28. **0.4.2’den beri 392** (518 aynı kalitede, iki kat yavaş).

0.4.2: derinlik 392 px’e alındı ve v2 yeniden oturtuldu; `v2-oturt.mjs` artık uzak/yakın tarifleri de
ayarlıyor (eğri/HSL büyüklük cezalı, ızgara yalnız ince düzeltme). Uygulamanın içinden, %70: **ΔE 3,14**
(ortanca 1,90, %90 7,27), geçiş bölgesi 6,07 → 5,45; kubbe altındaki şerit neredeyse kayboldu. Eski G7x de
daha iyi derinlikle 3,82 → 3,75. %100’de kırpılan piksel %0,32 (Meitu %0,19).

0.4.3: derinlik kenara oturtuldu (§5.4) ve v2 buna göre yeniden oturtuldu (geçiş 0,386 ± 0,064). Referansın
kendi boyunda (960×1280) sonuç aynı: v2 3,15, v1 3,75. Kazanç büyük fotoğraflarda: referans 3024×4032’ye
büyütülerek denendi, direkteki aydınlık bant ve kubbe çevresindeki kesik çizgi kayboldu.

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
14. **Derinlik dokusu (R8)** yüklenirken `UNPACK_ALIGNMENT = 1` olmalı (satırlar 4’ün katı olmayabilir).
15. Derinlik ve yüzler **yalnız güncel görüntüye** aittir; `replaceCurrent` ve `openDoc` bunları sıfırlar.
16. GitHub’a tarayıcıdan yükleme 25 MB ile sınırlı; derinlik modeli 26 MB → GitHub Desktop ile gönderilmeli.
17. **`meituAt`’lı filtrelerin tabloları 0..1 dışına taşar:** `bakeLut` kenetlememeli, tablo `RGBA16F` kalmalı;
    yoksa %70’te ölçülen görünüm tutmaz.
18. **Küçük resimler fotoğrafın ortadaki karesini gösterir:** yüze bağlı konumlar (`flashAt`, `faceMix`)
    `toSquare` ile o karenin koordinatına taşınır.
19. **Derinlik haritası fotoğrafa oturtulmuş haliyle saklanır** (`estimateDepth` → `refineDepth`, ≤1536 px).
    Ölçüm araçları (`derinlik.mjs` → `olcum/derinlik.bin`) aynı haritayı kullanır; oturtma değişirse filtreler
    yeniden oturtulmalı (`v2-oturt.mjs`).

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
