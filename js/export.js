// Kaydet: fotoğrafı JPEG ya da PNG olarak hazırlayıp iOS paylaşım menüsüyle
// verir ("Görüntüyü Kaydet" ile Fotoğraflar'a eklenir).
//
// Safari paylaşım menüsünü yalnız dokunma anında (bekleme olmadan) açar. Bu
// yüzden dosya sayfa açılırken hazırlanır, "Paylaş" düğmesi hazır dosyayı
// hemen paylaşır.
import { sheet, toast, icon, escapeHtml } from './ui.js';
import { canvasToBlob, flattenCanvas, releaseCanvas } from './image-io.js';

const PREF_FORMAT = 'zf.format';
const PREF_QUALITY = 'zf.quality';
const QUALITY = { high: 0.95, medium: 0.85 };

function pref(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function setPref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* özel mod */
  }
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function fileName(ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `ZekoFoto_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

function canShare(files) {
  try {
    return !!(navigator.share && navigator.canShare && navigator.canShare({ files }));
  } catch {
    return false;
  }
}

function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

async function prepare(doc, format, quality) {
  if (format === 'png') {
    const blob = await canvasToBlob(doc.canvas, 'image/png');
    return new File([blob], fileName('png'), { type: 'image/png' });
  }
  // JPEG saydamlık taşımaz: saydam fotoğraf beyaz zemine oturtulur.
  const src = doc.hasAlpha ? flattenCanvas(doc.canvas) : doc.canvas;
  try {
    const blob = await canvasToBlob(src, 'image/jpeg', QUALITY[quality] || QUALITY.high);
    return new File([blob], fileName('jpg'), { type: 'image/jpeg' });
  } finally {
    if (src !== doc.canvas) releaseCanvas(src);
  }
}

export function openSave(doc) {
  const st = {
    format: pref(PREF_FORMAT, doc.hasAlpha ? 'png' : 'jpeg'),
    quality: pref(PREF_QUALITY, 'high'),
    file: null,
    token: 0,
  };
  const { width: w, height: h } = doc.canvas;

  sheet((panel) => {
    panel.insertAdjacentHTML(
      'beforeend',
      `<div class="sheet__title">Kaydet</div>
       <div class="sheet__sub">${w} × ${h} piksel${doc.hasAlpha ? ' · saydam' : ''}</div>
       <div class="seg" data-key="format" role="radiogroup" aria-label="Biçim">
         <button type="button" data-v="jpeg" role="radio">JPEG</button>
         <button type="button" data-v="png" role="radio">PNG</button>
       </div>
       <div class="opt" data-show="jpeg">
         <span class="opt__label">Kalite</span>
         <div class="seg seg--small" data-key="quality" role="radiogroup" aria-label="Kalite">
           <button type="button" data-v="high" role="radio">Yüksek</button>
           <button type="button" data-v="medium" role="radio">Orta</button>
         </div>
       </div>
       <p class="sheet__text" data-info></p>
       <button type="button" class="btn btn--primary btn--block btn--lg" data-share disabled></button>`,
    );
    const info = panel.querySelector('[data-info]');
    const shareBtn = panel.querySelector('[data-share]');

    const sync = () => {
      for (const seg of panel.querySelectorAll('.seg')) {
        for (const b of seg.querySelectorAll('button')) {
          const on = st[seg.dataset.key] === b.dataset.v;
          b.classList.toggle('is-selected', on);
          b.setAttribute('aria-checked', on);
        }
      }
      panel.querySelector('[data-show="jpeg"]').hidden = st.format !== 'jpeg';
    };

    const run = async () => {
      const token = ++st.token;
      st.file = null;
      shareBtn.disabled = true;
      shareBtn.innerHTML = '<span class="spinner spinner--small"></span>Hazırlanıyor…';
      info.textContent = '';
      try {
        const file = await prepare(doc, st.format, st.quality);
        if (token !== st.token) return;
        st.file = file;
        const sharable = canShare([file]);
        shareBtn.disabled = false;
        shareBtn.innerHTML = sharable ? `${icon('share')}Paylaş / Fotoğraflar'a kaydet` : `${icon('download')}İndir`;
        info.innerHTML =
          `${escapeHtml(formatSize(file.size))} ${st.format.toUpperCase()}. ` +
          (sharable ? 'Açılan menüde <b>“Görüntüyü Kaydet”</b> ile Fotoğraflar’a eklenir.' : '');
      } catch (err) {
        if (token !== st.token) return;
        console.error(err);
        shareBtn.textContent = 'Hazırlanamadı';
        info.textContent = err.message;
      }
    };

    for (const seg of panel.querySelectorAll('.seg')) {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || st[seg.dataset.key] === b.dataset.v) return;
        st[seg.dataset.key] = b.dataset.v;
        setPref(seg.dataset.key === 'format' ? PREF_FORMAT : PREF_QUALITY, b.dataset.v);
        sync();
        run();
      });
    }

    shareBtn.addEventListener('click', () => {
      const file = st.file;
      if (!file) return;
      if (!canShare([file])) {
        download(file);
        return;
      }
      // Bekleme yok: paylaşım, dokunma olayının içinde başlamalı.
      navigator.share({ files: [file] }).catch((err) => {
        if (err && err.name !== 'AbortError') toast('Paylaşılamadı: ' + err.message);
      });
    });

    sync();
    run();
  });
}
