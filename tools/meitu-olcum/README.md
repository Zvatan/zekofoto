# Meitu filtre ölçümü

Meitu'daki bir filtrenin, kullanıcının referans fotoğrafındaki önizlemesini ölçer ve bu uygulamanın filtre
motoruna (kanal eğrileri, doygunluk, HSL, netlik, vinyet) oturtur. Meitu'nun dosyaları kullanılmaz; yalnızca
ekran görüntüleri karşılaştırılır. Uygulama bu klasöre ihtiyaç duymaz (yayınlamak gerekmez).

## Gerekenler

- Ekran görüntüleri klasörü (varsayılan `Desktop\meitu-ekran`, `MEITU_DIR` ortam değişkeniyle değiştirilir):
  - `referans foto.jpeg`: filtresiz özgün fotoğraf
  - her filtrenin Meitu'daki önizlemesinin ekran görüntüsü (**aynı fotoğraf**); dosya adı ↔ filtre adı
    eşlemesi `veri.mjs` → `THUMBS`
- Bu klasörde `npm i playwright-core` (ya da `PLAYWRIGHT_CORE` ile başka bir kopyanın `index.mjs` adresi)
  ve sistemde Google Chrome.

## Adımlar

1. `node oturt.mjs` → hizalama, ölçüm ve oturtma. Yazdıkları:
   - `olcum/presets.txt`: `js/core/presets.js` → `MEITU` dizisine konacak tarifler
   - `olcum/uyum.png`: her filtre için [özgün | Meitu | bizim]
2. Tarifleri `presets.js`'e ekle/güncelle; yeni kimliği `dogrula.mjs` → `IDS` eşlemesine ekle.
3. `node dogrula.mjs` → referans fotoğraf uygulamanın kendi motoruyla işlenir, Meitu önizlemesiyle ΔE
   karşılaştırması ve `olcum/dogrulama.png`, `olcum/tam-*.jpg`.

## Tam çözünürlüklü örnek (ör. `g7x.jpeg`)

Meitu’nun referans fotoğrafa uyguladığı filtrenin tam boy çıktısı varsa, flaş gibi konuma/derinliğe bağlı
etkiler de ölçülebilir:

1. `node derinlik.mjs` → referansın derinlik haritası ve yüzleri (uygulamanın kendi modelleriyle).
2. `node tam-oturt.mjs g7x.jpeg` → uzak/yakın iki tarif + derinlik geçişi (`olcum/g7x-model.json`).
3. `node yuz-flas.mjs g7x.jpeg` → yüz merkezli flaşın en iyi miktarı ve boyutu.
4. Tarifleri `presets.js`’e işle, sonra `node tam-dogrula.mjs g7x.jpeg g7x` → uygulamanın içinden ΔE ve
   yakın plan karşılaştırmaları.

Çıktılar kişisel fotoğraf içerir; bu yüzden proje klasörüne değil, ekran görüntülerinin yanına (`olcum/`)
yazılır. Yöntem ve sonuçlar: `GELISTIRME.md` §5.2–5.3.
