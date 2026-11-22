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

Çıktılar kişisel fotoğraf içerir; bu yüzden proje klasörüne değil, ekran görüntülerinin yanına (`olcum/`)
yazılır. Yöntem ve sonuçlar: `GELISTIRME.md` §5.2.
