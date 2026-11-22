// Ayarla aracı: ışık ve renk kaydırıcıları, otomatik iyileştirme, eğriler,
// HSL ve renk dengesi. Değerler renk tablolarına (bkz. core/color.js) ve
// gölgelendirici parametrelerine çevrilip canlı önizlenir; ✓ ile tam
// çözünürlükte uygulanır.
import { createSlider } from '../widgets/slider.js';
import { createCurveEditor } from '../widgets/curve.js';
import { icon, el, escapeHtml } from '../ui.js';
import {
  compileLook, bakeLut, applyPre, applyPost, lutLength, neutralAdjust, neutralCurves, neutralHsl, neutralGrade,
  HSL_BANDS, isIdentityCurve, isNeutralHsl, isNeutralGrade,
} from '../core/color.js';
import { autoAdjust } from '../core/auto.js';
import { defaultSpec } from '../gl/engine.js';
import { imageData } from '../image-io.js';

const ITEMS = [
  { id: 'auto', label: 'Otomatik', icon: 'sparkle', min: 0 },
  { id: 'brightness', label: 'Parlaklık', icon: 'brightness' },
  { id: 'exposure', label: 'Pozlama', icon: 'exposure' },
  { id: 'contrast', label: 'Kontrast', icon: 'contrast' },
  { id: 'saturation', label: 'Doygunluk', icon: 'saturation' },
  { id: 'vibrance', label: 'Canlılık', icon: 'vibrance' },
  { id: 'temperature', label: 'Sıcaklık', icon: 'temperature', track: 'linear-gradient(90deg,#3d7dff,#d9dde6,#ffb21f)' },
  { id: 'tint', label: 'Renk tonu', icon: 'tint', track: 'linear-gradient(90deg,#2ccf5c,#d9dde6,#e544f2)' },
  { id: 'highlights', label: 'Vurgular', icon: 'highlights' },
  { id: 'shadows', label: 'Gölgeler', icon: 'shadows' },
  { id: 'whites', label: 'Beyazlar', icon: 'whites' },
  { id: 'blacks', label: 'Siyahlar', icon: 'blacks' },
  { id: 'clarity', label: 'Netlik', icon: 'clarity' },
  { id: 'sharpen', label: 'Keskinlik', icon: 'sharpen', min: 0 },
  { id: 'fade', label: 'Soldurma', icon: 'fade', min: 0 },
  { id: 'grain', label: 'Gren', icon: 'grain', min: 0 },
  { id: 'vignette', label: 'Vinyet', icon: 'vignette' },
  { id: 'curves', label: 'Eğriler', icon: 'curves', panel: true },
  { id: 'hsl', label: 'HSL', icon: 'hsl', panel: true },
  { id: 'grade', label: 'Renk dengesi', icon: 'grade', panel: true },
];

const GRADE_RANGES = [
  { id: 'shadows', label: 'Gölgeler' },
  { id: 'midtones', label: 'Orta tonlar' },
  { id: 'highlights', label: 'Vurgular' },
];

const CURVE_CHANNELS = [
  { id: 'rgb', label: 'RGB' },
  { id: 'r', label: 'Kırmızı' },
  { id: 'g', label: 'Yeşil' },
  { id: 'b', label: 'Mavi' },
];

const signed = (v) => (v > 0 ? `+${Math.round(v)}` : String(Math.round(v)));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const hueColor = (h) => `hsl(${((h % 360) + 360) % 360}, 90%, 58%)`;

export function adjustTool(host, { start = 'brightness' } = {}) {
  const st = {
    adjust: neutralAdjust(),
    auto: 0,
    autoValues: null,
    curves: neutralCurves(),
    hsl: neutralHsl(),
    grade: neutralGrade(),
    item: start,
    band: 'red',
    range: 'shadows',
    channel: 'rgb',
  };
  const preBuf = new Float32Array(lutLength());
  const postBuf = new Float32Array(lutLength());
  const seed = Math.random() * 1000;
  let compiled = compileLook({});
  let frame = 0;
  let ui = null;
  let curveEditor = null;

  function look() {
    const a = { ...st.adjust };
    if (st.auto && st.autoValues) {
      for (const [k, v] of Object.entries(st.autoValues)) a[k] = clamp(a[k] + (v * st.auto) / 100, -100, 100);
    }
    return { ...a, curves: st.curves, hsl: st.hsl, grade: st.grade };
  }

  function compute() {
    compiled = compileLook(look());
    const k = compiled;
    host.engine.setLuts({
      pre: k.pre ? bakeLut((c) => applyPre(c, k.pre), preBuf) : null,
      post: k.post.active ? bakeLut((c) => applyPost(c, k.post), postBuf) : null,
    });
  }

  function update() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      compute();
      host.viewer.invalidate();
      refreshDots();
    });
  }

  function spec(compare) {
    const s = defaultSpec(host.W, host.H);
    if (compare) return s;
    const sp = compiled.spatial;
    s.pre = !!compiled.pre;
    s.post = compiled.post.active;
    s.tone = [sp.highlights, sp.shadows, sp.clarity];
    s.fx = [sp.sharpen, sp.grain, sp.vignette];
    s.seed = seed;
    return s;
  }

  function itemChanged(id) {
    if (id === 'auto') return st.auto > 0;
    if (id === 'curves') return Object.values(st.curves).some((c) => !isIdentityCurve(c));
    if (id === 'hsl') return !isNeutralHsl(st.hsl);
    if (id === 'grade') return !isNeutralGrade(st.grade);
    return st.adjust[id] !== 0;
  }

  const isDirty = () => ITEMS.some((it) => itemChanged(it.id));

  function ensureAuto() {
    if (st.autoValues) return;
    const small = host.small(256);
    const d = imageData(small);
    st.autoValues = autoAdjust(d.data, d.width, d.height);
  }

  // --- arayüz ---------------------------------------------------------------

  // Etiketli küçük kaydırıcı satırı (HSL ve renk dengesi).
  function labeled(label, opts) {
    const row = el('div', 'mini');
    row.innerHTML = `<span class="mini__label">${escapeHtml(label)}</span>`;
    const out = el('output', 'mini__value');
    const fmt = opts.fmt || signed;
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
    return { row, s, show };
  }

  function mount(body) {
    body.classList.add('panel-adjust');
    const controls = el('div', 'tool-controls');
    const strip = el('div', 'item-strip');
    strip.setAttribute('role', 'tablist');
    for (const it of ITEMS) {
      const b = el('button', 'item', `<span class="item__icon">${icon(it.icon)}</span><span class="item__label">${escapeHtml(it.label)}</span><span class="item__dot"></span>`);
      b.dataset.id = it.id;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => select(it.id));
      strip.append(b);
    }
    body.append(controls, strip);
    ui = { controls, strip };

    curveEditor = createCurveEditor({
      onChange: (ch, pts) => {
        st.curves[ch] = pts;
        update();
      },
    });
    curveEditor.el.hidden = true;
    host.overlay.append(curveEditor.el);
    // Eğri kutusu için ışıklılık histogramı.
    const d = imageData(host.small(200)).data;
    const hist = new Array(64).fill(0);
    for (let i = 0; i < d.length; i += 4) hist[Math.min(63, ((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 4) | 0)]++;
    curveEditor.setHistogram(hist);

    host.viewer.setContent({ w: host.W, h: host.H, spec });
    compute();
    select(st.item);
  }

  function select(id) {
    st.item = id;
    const it = ITEMS.find((x) => x.id === id);
    for (const b of ui.strip.children) {
      const on = b.dataset.id === id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-selected', on);
      if (on) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    curveEditor.el.hidden = id !== 'curves';
    if (id === 'auto') {
      ensureAuto();
      if (!st.auto) {
        st.auto = 100;
        update();
      }
    }
    ui.controls.replaceChildren();
    if (id === 'curves') buildCurves();
    else if (id === 'hsl') buildHsl();
    else if (id === 'grade') buildGrade();
    else buildSimple(it);
  }

  function buildSimple(it) {
    const min = it.min ?? -100;
    const head = el(
      'div',
      'ctl-head',
      `<span class="ctl-label">${escapeHtml(it.label)}</span><output class="ctl-value"></output>` +
        `<button class="icon-btn icon-btn--small" aria-label="${escapeHtml(it.label)} sıfırla">${icon('reset')}</button>`,
    );
    const out = head.querySelector('output');
    const get = () => (it.id === 'auto' ? st.auto : st.adjust[it.id]);
    const set = (v) => {
      if (it.id === 'auto') st.auto = v;
      else st.adjust[it.id] = v;
    };
    const show = () => (out.textContent = min < 0 ? signed(get()) : String(Math.round(get())));
    const slider = createSlider({
      min,
      max: 100,
      value: get(),
      def: 0,
      label: it.label,
      track: it.track,
      onInput: (v) => {
        set(v);
        show();
        update();
      },
    });
    head.querySelector('button').addEventListener('click', () => {
      set(0);
      slider.set(0);
      show();
      update();
    });
    show();
    ui.controls.append(head, slider.el);
    if (it.id === 'auto') {
      ui.controls.append(el('p', 'ctl-hint', 'Işık, renk ve beyaz dengesi fotoğrafa göre ayarlandı.'));
    }
  }

  function segmented(options, value, onPick, cls = '') {
    const seg = el('div', `seg seg--small ${cls}`);
    seg.setAttribute('role', 'radiogroup');
    for (const o of options) {
      const b = el('button', '', escapeHtml(o.label));
      b.type = 'button';
      b.dataset.v = o.id;
      b.setAttribute('role', 'radio');
      if (o.color) b.style.setProperty('--dot', o.color);
      b.addEventListener('click', () => {
        for (const x of seg.children) {
          x.classList.toggle('is-selected', x === b);
          x.setAttribute('aria-checked', x === b);
        }
        onPick(o.id);
      });
      const on = o.id === value;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-checked', on);
      seg.append(b);
    }
    return seg;
  }

  function buildCurves() {
    const seg = segmented(CURVE_CHANNELS, st.channel, (ch) => {
      st.channel = ch;
      curveEditor.setChannel(ch);
    }, 'seg--channels');
    const row = el('div', 'ctl-row');
    const hint = el('p', 'ctl-hint', 'Eklemek için dokun, sürükle. Silmek için noktayı kutunun dışına çek.');
    const reset = el('button', 'btn btn--ghost btn--small', `${icon('reset')}Sıfırla`);
    reset.addEventListener('click', () => {
      st.curves[st.channel] = [[0, 0], [1, 1]];
      curveEditor.setCurves(st.curves);
      update();
    });
    row.append(hint, reset);
    ui.controls.append(seg, row);
    curveEditor.setCurves(st.curves);
    curveEditor.setChannel(st.channel);
  }

  function buildHsl() {
    const dots = el('div', 'band-dots');
    dots.setAttribute('role', 'radiogroup');
    const sliders = {};
    const fields = [
      { key: 'h', label: 'Ton' },
      { key: 's', label: 'Doygunluk' },
      { key: 'l', label: 'Parlaklık' },
    ];
    const tracks = (band) => {
      const b = HSL_BANDS.find((x) => x.id === band);
      return {
        h: `linear-gradient(90deg, ${hueColor(b.hue - 30)}, ${hueColor(b.hue)}, ${hueColor(b.hue + 30)})`,
        s: `linear-gradient(90deg, #8a8a8a, ${b.color})`,
        l: `linear-gradient(90deg, #111, ${b.color}, #fff)`,
      };
    };
    const refresh = () => {
      const t = tracks(st.band);
      for (const f of fields) {
        const v = st.hsl[st.band][f.key];
        sliders[f.key].s.configure({ value: v, track: t[f.key] });
        sliders[f.key].show(v);
      }
    };
    for (const b of HSL_BANDS) {
      const btn = el('button', 'band-dot');
      btn.type = 'button';
      btn.style.setProperty('--c', b.color);
      btn.setAttribute('aria-label', b.label);
      btn.setAttribute('role', 'radio');
      btn.dataset.v = b.id;
      btn.addEventListener('click', () => {
        st.band = b.id;
        for (const x of dots.children) {
          x.classList.toggle('is-selected', x === btn);
          x.setAttribute('aria-checked', x === btn);
        }
        refresh();
      });
      const on = b.id === st.band;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-checked', on);
      dots.append(btn);
    }
    ui.controls.append(dots);
    for (const f of fields) {
      const m = labeled(f.label, {
        min: -100,
        max: 100,
        value: st.hsl[st.band][f.key],
        onInput: (v) => {
          st.hsl[st.band][f.key] = v;
          update();
        },
      });
      sliders[f.key] = m;
      ui.controls.append(m.row);
    }
    refresh();
  }

  function buildGrade() {
    const seg = segmented(GRADE_RANGES, st.range, (r) => {
      st.range = r;
      refresh();
    });
    ui.controls.append(seg);
    const rows = {};
    const make = (key, label, opts) => {
      rows[key] = labeled(label, opts);
      ui.controls.append(rows[key].row);
    };
    make('hue', 'Ton', {
      min: 0,
      max: 360,
      def: 0,
      fmt: (v) => `${Math.round(v)}°`,
      track: 'linear-gradient(90deg,#f33,#fd3,#3f5,#3df,#35f,#d3f,#f33)',
      value: st.grade[st.range].hue,
      onInput: (v) => {
        st.grade[st.range].hue = v;
        rows.sat.s.configure({ track: `linear-gradient(90deg, #8a8a8a, ${hueColor(v)})` });
        update();
      },
    });
    make('sat', 'Yoğunluk', {
      min: 0,
      max: 100,
      def: 0,
      fmt: (v) => String(Math.round(v)),
      value: st.grade[st.range].sat,
      onInput: (v) => {
        st.grade[st.range].sat = v;
        update();
      },
    });
    make('bal', 'Denge', {
      min: -100,
      max: 100,
      value: st.grade.balance,
      onInput: (v) => {
        st.grade.balance = v;
        update();
      },
    });
    function refresh() {
      const z = st.grade[st.range];
      rows.hue.s.set(z.hue);
      rows.hue.show(z.hue);
      rows.sat.s.configure({ value: z.sat, track: `linear-gradient(90deg, #8a8a8a, ${hueColor(z.hue)})` });
      rows.sat.show(z.sat);
    }
    refresh();
  }

  function refreshDots() {
    if (!ui) return;
    for (const b of ui.strip.children) b.classList.toggle('has-value', itemChanged(b.dataset.id));
  }

  return {
    title: 'Ayarla',
    mount,
    isDirty,
    apply() {
      if (!isDirty()) return null;
      compute();
      return { spec: spec(false), w: host.W, h: host.H, label: 'Ayarla' };
    },
    destroy() {
      cancelAnimationFrame(frame);
      curveEditor?.el.remove();
    },
  };
}
