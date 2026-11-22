// Yeni araçların paylaştığı küçük panel parçaları: etiketli kaydırıcı,
// segmentli seçim, simge şeridi ve renk paleti.
import { createSlider } from '../widgets/slider.js';
import { el, icon, escapeHtml } from '../ui.js';

export const PALETTE = [
  '#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be',
  '#32ade6', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93',
];

// Etiketli küçük kaydırıcı satırı.
export function labeled(label, { fmt = (v) => String(Math.round(v)), ...opts }) {
  const row = el('div', 'mini');
  row.innerHTML = `<span class="mini__label">${escapeHtml(label)}</span>`;
  const out = el('output', 'mini__value');
  const show = (v) => (out.textContent = fmt(v));
  const s = createSlider({
    ...opts,
    label,
    onInput: (v) => {
      show(v);
      opts.onInput?.(v);
    },
  });
  row.append(s.el, out);
  show(opts.value ?? 0);
  return { row, slider: s, show };
}

// Segmentli seçim: options = [{ id, label, icon? }].
export function segmented(options, value, onPick, cls = '') {
  const seg = el('div', `seg seg--small ${cls}`);
  seg.setAttribute('role', 'radiogroup');
  const buttons = [];
  const set = (id) => {
    for (const b of buttons) {
      const on = b.dataset.v === id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-checked', on);
    }
  };
  for (const o of options) {
    const b = el('button', '', `${o.icon ? icon(o.icon) : ''}${escapeHtml(o.label)}`);
    b.type = 'button';
    b.dataset.v = o.id;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => {
      set(o.id);
      onPick(o.id);
    });
    buttons.push(b);
    seg.append(b);
  }
  set(value);
  return { el: seg, set };
}

// Yuvarlak simgeli seçim şeridi (ör. fırça türleri).
export function itemStrip(items, value, onPick) {
  const strip = el('div', 'item-strip');
  strip.setAttribute('role', 'tablist');
  const set = (id) => {
    for (const b of strip.children) {
      const on = b.dataset.id === id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-selected', on);
    }
  };
  for (const it of items) {
    const b = el(
      'button',
      'item',
      `<span class="item__icon"${it.swatch ? ` style="background:${it.swatch}"` : ''}>${it.icon ? icon(it.icon) : ''}</span>` +
        `<span class="item__label">${escapeHtml(it.label)}</span>`,
    );
    b.dataset.id = it.id;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      set(it.id);
      onPick(it.id);
    });
    strip.append(b);
  }
  set(value);
  return { el: strip, set };
}

// Renk paleti; sonda serbest renk seçici.
export function palette(value, onPick, colors = PALETTE) {
  const wrap = el('div', 'swatches');
  // c boşsa hiçbiri seçili değil (ör. degrade seçilince).
  const set = (c) => {
    for (const b of wrap.querySelectorAll('.swatch')) b.classList.toggle('is-selected', !!c && b.dataset.c === c);
    const own = !!c && !colors.includes(c);
    custom.classList.toggle('is-selected', own);
    if (own) custom.style.setProperty('--c', c);
  };
  for (const c of colors) {
    const b = el('button', 'swatch');
    b.type = 'button';
    b.dataset.c = c;
    b.style.setProperty('--c', c);
    b.setAttribute('aria-label', `Renk ${c}`);
    b.addEventListener('click', () => {
      set(c);
      onPick(c);
    });
    wrap.append(b);
  }
  const custom = el('label', 'swatch swatch--custom', '<input type="color" aria-label="Başka renk">');
  const input = custom.querySelector('input');
  input.addEventListener('input', () => {
    set(input.value);
    onPick(input.value);
  });
  wrap.append(custom);
  set(value);
  return { el: wrap, set };
}

// "#rrggbb" → [r, g, b] (0..1)
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
