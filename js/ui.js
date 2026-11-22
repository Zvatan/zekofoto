// Küçük arayüz yardımcıları: simgeler, bildirim, meşgul katmanı, alt sayfa
// ve iletişim kutuları.

const PATHS = {
  camera:
    '<path d="M3.5 8.5a2 2 0 0 1 2-2h1.8l1.3-2h6.8l1.3 2h1.8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
  gallery:
    '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4 17.5l4.6-4.6a1.5 1.5 0 0 1 2.1 0l3.3 3.3M13 15l1.6-1.6a1.5 1.5 0 0 1 2.1 0L20 16.7"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  next: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  undo: '<path d="M9 7.5L5 11.5l4 4"/><path d="M5.5 11.5H15a4.5 4.5 0 0 1 0 9h-3"/>',
  redo: '<path d="M15 7.5l4 4-4 4"/><path d="M18.5 11.5H9a4.5 4.5 0 0 0 0 9h3"/>',
  compare:
    '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 3v18"/><path d="M12 5h6.5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H12z" fill="currentColor" stroke="none" opacity=".45"/>',
  share:
    '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M7 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-1"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5V9H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash:
    '<path d="M4.5 7h15M9.5 7V5h5v2"/><path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/>',
  // araçlar
  crop: '<path d="M7 3v12.5A1.5 1.5 0 0 0 8.5 17H21"/><path d="M3 7h12.5A1.5 1.5 0 0 1 17 8.5V21"/>',
  adjust:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  filter:
    '<circle cx="9" cy="9.5" r="5.2"/><circle cx="15" cy="9.5" r="5.2"/><circle cx="12" cy="14.8" r="5.2"/>',
  magic:
    '<path d="M4 20L15 9"/><path d="M14 4l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" fill="currentColor"/><path d="M19 12l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" stroke="none"/>',
  brush:
    '<path d="M14.5 4.5l5 5-7.8 7.8a2 2 0 0 1-1.4.6H7.5v-2.8a2 2 0 0 1 .6-1.4z"/><path d="M7.5 18c-1 1.6-2.3 2.2-4 2"/>',
  // düzenle
  rotateLeft: '<path d="M8 4.5L4.5 8 8 11.5"/><path d="M5 8h8a6 6 0 0 1 0 12h-2"/>',
  rotateRight: '<path d="M16 4.5L19.5 8 16 11.5"/><path d="M19 8h-8a6 6 0 0 0 0 12h2"/>',
  flipH: '<path d="M12 3v18"/><path d="M8.5 7L3.5 17h5zM15.5 7l5 10h-5z"/>',
  flipV: '<path d="M3 12h18"/><path d="M7 8.5L17 3.5v5zM7 15.5l10 5v-5z"/>',
  straighten: '<path d="M4 14l16-4"/><path d="M4 18h16" opacity=".5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  perspective: '<path d="M7 5h10l3 14H4z"/><path d="M12 5v14M5.5 12h13"/>',
  resize: '<rect x="3.5" y="9.5" width="11" height="11" rx="1.5"/><path d="M12 3.5h8.5V12M20.5 3.5L14 10"/>',
  // ayarla
  brightness:
    '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>',
  exposure: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 20.5l17-17M7 8.5h4M9 6.5v4M13.5 16h4"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  saturation: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/><path d="M9 14.5a3 3 0 0 0 3 3"/>',
  vibrance: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/><path d="M12 9v8M8.5 13h7"/>',
  temperature: '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7.5"/>',
  tint: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
  highlights: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M12 7l4.5-2.2M12 11l7.2-3.2M12 15l8-2.8M12 19l5.5-1.8"/>',
  shadows: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M12 7L7.5 4.8M12 11L4.8 7.8M12 15L4 12.2M12 19l-5.5-1.8"/>',
  whites: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>',
  blacks: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  sharpen: '<path d="M12 3.5l8.5 16h-17z"/><path d="M12 9.5v5"/>',
  clarity: '<path d="M12 3.5l2.4 5.6 5.6 2.4-5.6 2.4L12 19.5l-2.4-5.6L4 11.5l5.6-2.4z"/>',
  fade: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 15l17-5" opacity=".6"/><path d="M8 20.5l12.5-4" opacity=".35"/>',
  grain:
    '<circle cx="7" cy="7" r="1.2" fill="currentColor"/><circle cx="12" cy="9" r="1.2" fill="currentColor"/><circle cx="17" cy="6.5" r="1.2" fill="currentColor"/><circle cx="8" cy="13" r="1.2" fill="currentColor"/><circle cx="14" cy="14" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/><circle cx="6.5" cy="18" r="1.2" fill="currentColor"/><circle cx="12" cy="18.5" r="1.2" fill="currentColor"/><circle cx="17.5" cy="17.5" r="1.2" fill="currentColor"/>',
  vignette: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><ellipse cx="12" cy="12" rx="5.5" ry="4"/>',
  curves: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5" opacity=".5"/><path d="M4 19c6 0 5-6 8-7s4-7 8-8"/>',
  hsl: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v8.5l7.4 4.2M12 12l-7.4 4.2"/>',
  grade: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M12 3.5v2.5M20.5 12H18M12 20.5V18M3.5 12H6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  sparkle:
    '<path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z"/><path d="M18 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

// Statik HTML'deki <i data-icon="..."> yer tutucularını SVG ile değiştirir.
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('i[data-icon]')) {
    el.outerHTML = icon(el.dataset.icon, el.className);
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function el(tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

// --- bildirim ------------------------------------------------------------

let toastTimer = 0;
export function toast(message, { action, onAction, duration = 2400 } = {}) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action;
    b.addEventListener('click', () => {
      t.classList.remove('is-visible');
      onAction?.();
    });
    t.append(b);
  }
  t.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-visible'), action ? duration * 3 : duration);
}

// --- meşgul katmanı ------------------------------------------------------

let busyDepth = 0;
let busyTimer = 0;
export const busy = {
  show(text = 'İşleniyor…') {
    busyDepth++;
    const b = document.getElementById('busy');
    b.querySelector('.busy__text').textContent = text;
    // Kısa işlerde katman göz kırpmasın diye azıcık gecikmeyle görünür.
    clearTimeout(busyTimer);
    if (b.hidden) busyTimer = setTimeout(() => (b.hidden = false), 150);
    document.body.classList.add('is-busy');
  },
  text(text) {
    document.querySelector('#busy .busy__text').textContent = text;
  },
  hide() {
    busyDepth = Math.max(0, busyDepth - 1);
    if (busyDepth) return;
    clearTimeout(busyTimer);
    document.getElementById('busy').hidden = true;
    document.body.classList.remove('is-busy');
  },
};

// Tarayıcıya bir kare çizme fırsatı verir (meşgul katmanı görünsün diye).
export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

// --- alt sayfa -----------------------------------------------------------

// İçeriği alttan açılan sayfada gösterir. close() ile kapanır.
export function sheet(build, { onClose } = {}) {
  // Açık bildirim sayfanın üstünde kalmasın.
  document.getElementById('toast').classList.remove('is-visible');
  const root = document.getElementById('overlay-root');
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = '<div class="overlay__scrim"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet__grip"></div></div>';
  const panel = wrap.querySelector('.sheet');
  let closed = false;
  const close = (value) => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('is-open');
    setTimeout(() => wrap.remove(), 280);
    onClose?.(value);
  };
  wrap.querySelector('.overlay__scrim').addEventListener('click', () => close());
  const mounted = build(panel, close);
  root.append(wrap);
  if (typeof mounted === 'function') mounted();
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('is-open')));
  return close;
}

export function confirmDialog({ title, message = '', ok = 'Tamam', danger = false }) {
  return new Promise((resolve) => {
    sheet(
      (panel, close) => {
        panel.insertAdjacentHTML(
          'beforeend',
          `<div class="sheet__title">${escapeHtml(title)}</div>` +
            (message ? `<p class="sheet__text">${escapeHtml(message)}</p>` : '') +
            `<div class="sheet__row"><button class="btn btn--ghost" data-v="0">Vazgeç</button>` +
            `<button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-v="1">${escapeHtml(ok)}</button></div>`,
        );
        panel.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => close(b.dataset.v === '1')));
      },
      { onClose: (v) => resolve(v === true) },
    );
  });
}
