# Zeko Foto — iPhone için fotoğraf düzenleyici

Safari’de çalışan, “Ana Ekrana Ekle” ile bağımsız uygulama gibi açılan Türkçe fotoğraf düzenleyici.
Apple Developer hesabı ve sunucu gerekmez; GitHub Pages üzerinde ücretsiz yayınlanır.
Fotoğraflar yalnızca cihazda, ekran kartıyla (WebGL2) işlenir.

## Özellikler (sürüm 0.4)

- **Düzenle:** kırpma (serbest, orijinal, 1:1, 4:5, 3:4, 2:3, 9:16, 16:9 …), sola/sağa 90°, yatay/dikey aynalama,
  ±45° açı düzeltme, dikey/yatay perspektif, yeniden boyutlandırma. Kırpma her zaman fotoğrafın içinde kalır.
- **Ayarla:** otomatik iyileştirme, parlaklık, pozlama, kontrast, doygunluk, canlılık, sıcaklık, renk tonu,
  vurgular, gölgeler, beyazlar, siyahlar, netlik, keskinlik, soldurma, gren, vinyet, **eğriler** (RGB/K/Y/M),
  **HSL** (8 renk), **renk dengesi** (gölge/orta ton/vurgu).
- **Filtreler:** Kamera kategorisi: Meitu'daki Flash Film, DSLR, HDF, Glowy Flash, Hard Flash ve G7x
  filtrelerinin ölçülerek yapılmış karşılıkları, **G7X v2** (Meitu'nun G7X'ine daha yakın; %70 yoğunlukta
  Meitu'nun görünümü, %100'de daha güçlü) ve CCD (parlama, renk kayması, dijital gürültü, tarih damgası);
  39 renk filtresi (Portre, Film, Retro, Yemek, Manzara, Siyah-Beyaz) ve 8 sanatsal efekt
  (karakalem, renkli kalem, yağlı boya, suluboya, çizgi roman, pop art, neon, kabartma); yoğunluk ayarlı.
- **Tarih damgası:** eski dijital kameralardaki turuncu tarih; çekim tarihi fotoğrafın EXIF bilgisinden okunur.
  CCD gibi filtrelerde kendiliğinden açılır, her filtreyle açılıp kapatılabilir.
- **Cihazda yapay zekâ (✦ işaretli filtreler):** G7x derinlik tahminiyle yakını aydınlatıp uzağı karartır (flaşlı
  kompakt kamera), Hard Flash ve G7x ışığı algılanan yüze verir. İlk kullanımda modeller bir kez indirilir
  (yaklaşık 41 MB); sonra internetsiz çalışır. Fotoğraflar telefondan çıkmaz.
- Basılı tutunca önceki hal, iki parmakla ya da çift dokunuşla yakınlaştırma.
- Geri al / yinele (25 adım); uygulama kapanırsa **kaldığın yerden devam**.
- **Kaydet:** JPEG (yüksek/orta) ya da PNG; iOS paylaşım menüsünde “Görüntüyü Kaydet” ile Fotoğraflar’a.
- Çevrimdışı çalışır.

Sıradaki aşamalar: yazı ve süsleme, güzellik/rötuş, cihazda yapay zekâ araçları (bkz. [GELISTIRME.md](GELISTIRME.md)).

## GitHub Pages’te yayınlama

### Yol A — Tarayıcıdan (kurulum gerekmez)

1. <https://github.com> → sağ üstte **+** → **New repository**.
2. **Repository name**: ör. `zeko-foto`. **Public** seçili olsun (ücretsiz hesapta Pages için gerekir). **Create repository**.
3. Açılan sayfada **uploading an existing file** bağlantısı.
4. Bu klasördeki her şeyi (`index.html`, `manifest.webmanifest`, `sw.js`, `.nojekyll`, `css`, `js`, `icons`,
   `vendor`, `models`; isterseniz `tests`, `tools`, `README.md`, `GELISTIRME.md`, `package.json`) sürükleyip
   bırakın. Klasör yapısı korunmalı (`js/core/color.js` gibi). `tests/out` klasörünü ve `node_modules`
   klasörlerini yüklemeyin. **Not:** tarayıcıdan yükleme dosya başına 25 MB ile sınırlı;
   `models/depth-anything-v2-small-q8.onnx` (26 MB) için Yol B’yi (GitHub Desktop) kullanın.
5. **Commit changes**.
6. **Settings** → **Pages** → **Source: Deploy from a branch**, **Branch: main**, **/(root)** → **Save**.
7. 1–2 dakika sonra adres görünür: `https://KULLANICI-ADINIZ.github.io/zeko-foto/`.

### Yol B — GitHub Desktop ile (güncellemeler için önerilen)

1. GitHub Desktop → **File → Clone repository** → `zeko-foto`.
2. **Local path** olarak **OneDrive dışında** bir klasör seçin (ör. `C:\Users\KULLANICI\Documents\GitHub\zeko-foto`).
   OneDrive, git’in gizli `.git` klasörünü senkronize ederken depoyu bozabilir.
3. Proje dosyalarını (`.gitignore` ve `.nojekyll` dahil) bu klasöre kopyalayın.
4. **Summary** yazın → **Commit to main** → **Push origin**.
5. Pages açık değilse Yol A’daki 6–7. adımlar.

### Güncelleme yayınlama

1. **`sw.js` içindeki `VERSION`** değerini artırın (ör. `zeko-foto-v0.1.0` → `zeko-foto-v0.2.0`), `js/app.js` içindeki
   `VERSION`’ı da. Sürüm değişmezse iPhone eski dosyaları kullanmaya devam eder.
2. Yeni dosya eklendiyse `sw.js` → `FILES` listesine ekleyin.
3. **Commit to main** → **Push origin**. iPhone’da uygulamayı açınca “Yeni sürüm hazır → Yenile” çıkar.

## iPhone’a kurulum

1. iPhone’da **Safari** ile yayın adresini açın.
2. Alttaki **Paylaş** → **Ana Ekrana Ekle** → **Ekle**.
3. Ana ekrandaki **Zeko Foto** simgesinden açın: adres çubuğu olmadan tam ekran açılır.

Gereksinim: iOS 15 ve üzeri (WebGL2).

## iPhone test listesi

1. **Kurulum:** simgeden açılıyor, adres çubuğu yok, çentik ve alt çubuk alanında içerik kesilmiyor.
2. **Açma:** *Fotoğraf düzenle* ile galeriden, *Kamera* ile çekerek açılıyor; yan/dik fotoğrafların yönü doğru.
3. **Ayarla:** kaydırıcılar akıcı; çift dokunuş değeri sıfırlıyor; *Otomatik* makul; eğri noktası eklenip
   sürükleniyor, kutunun dışına çekince siliniyor; HSL ve renk dengesi çalışıyor; ✓ sonrası sonuç aynı.
4. **Filtreler:** küçük resimler doluyor; kategoriler kaydırıyor; yoğunluk değişiyor; sanatsal efektler ✓ ile uygulanıyor.
5. **Düzenle:** köşe/kenar tutamaçları, oranlar, 90° döndürme, aynalama, açı ve perspektif; kırpma fotoğraftan taşmıyor.
6. **Karşılaştırma ve yakınlaştırma:** sağ alttaki düğmeye basılı tutunca önceki hal; iki parmakla yakınlaştırma keskin.
7. **Geri al / yinele** ve uygulamayı kapatıp açınca **Devam et**.
8. **Kaydet:** *Paylaş* → *Görüntüyü Kaydet* → Fotoğraflar’da tam çözünürlüklü fotoğraf.
9. **Çevrimdışı:** uçak modunda açılıyor ve düzenleme yapılabiliyor.
10. **Yapay zekâ (✦):** Filtreler → Kamera → G7x: ilk seferde “Yapay zekâ modeli indiriliyor… %” ve
    “Derinlik hesaplanıyor…” görünüyor; kişi ve masa aydınlık, deniz/dağ koyu. Süreyi not edin (iPhone 12–14’te
    birkaç saniye beklenir). Hard Flash’ta ışık yüzün üstünde. Uçak modunda (bir kez indirildikten sonra) da çalışıyor.
11. **G7X v2:** yoğunluk 70 ile açılıyor; Meitu’nun G7X’iyle aynı fotoğrafta yan yana bakınca renkler ve
    ışık çok yakın; 100’e çekince daha güçlü, yüzde ya da gökyüzünde kırılma/leke yok. Yakın nesnelerin
    (kişi, lamba) çevresinde hale ya da kesik çizgisi yok; arkalarındaki direk/duvar aydınlanmıyor.

## Geliştirme

Mimari, kararlar, tuzaklar ve yol haritası: **[GELISTIRME.md](GELISTIRME.md)**.

Derleme adımı yoktur; dosyalar olduğu gibi yayınlanır. Yerelde denemek için klasörü herhangi bir statik sunucuyla
açın (service worker için `localhost` ya da HTTPS gerekir).

```bash
node tests/run.mjs     # renk zinciri, filtreler, geometri, otomatik iyileştirme (+ tests/out/*.png)
```
