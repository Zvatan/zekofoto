// Filtreler aracı: kategorili hazır filtreler ve sanatsal efektler,
// yoğunluk ayarıyla. Küçük resimler fotoğrafın kendisinden, ekran kartında
// birkaç karede bir parti halinde üretilir.
import { createSlider } from '../widgets/slider.js';
import { el, escapeHtml } from '../ui.js';
import { compileLook, bakeLut, applyLook, lutLength } from '../core/color.js';
import { FILTERS, FILTER_CATEGORIES, EFFECTS, findFilter } from '../core/presets.js';
import { defaultSpec } from '../gl/engine.js';

const THUMB = 144;

function squareMatrix(W, H) {
  const side = Math.min(W, H);
  const sx = side / W;
  const sy = side / H;
  return new Float32Array([sx, 0, 0, 0, sy, 0, (1 - sx) / 2, (1 - sy) / 2, 1]);
}

export function filtersTool(host, { category = null } = {}) {
  const st = { id: null, amounts: new Map() };
  const lutBuf = new Float32Array(lutLength());
  const seed = Math.random() * 1000;
  let compiled = null;
  let ui = null;
  let thumbJob = 0;
  let slider = null;

  const amountOf = (f) => (st.amounts.has(f.id) ? st.amounts.get(f.id) : f.amount);

  // k: filtrenin derlenmiş tarifi (renk filtrelerinde; tablo ayrıca yüklenir).
  function filterSpec(f, amount, k) {
    const s = defaultSpec(host.W, host.H);
    if (!f) return s;
    if (f.fx) {
      const e = EFFECTS[f.fx];
      s.effect = { id: e.id, amount, radius: e.radius };
      return s;
    }
    const sp = k.spatial;
    s.post = true;
    s.postAmount = amount;
    s.tone = [sp.highlights * amount, sp.shadows * amount, sp.clarity * amount];
    s.fx = [sp.sharpen * amount, sp.grain * amount, sp.vignette * amount];
    s.seed = seed;
    return s;
  }

  const current = () => (st.id ? findFilter(st.id) : null);

  function loadLut(f) {
    if (!f || f.fx) return null;
    const k = compileLook(f.look);
    host.engine.setLuts({ post: bakeLut((c) => applyLook(c, k), lutBuf) });
    return k;
  }

  function spec(compare) {
    const f = current();
    if (compare || !f) return defaultSpec(host.W, host.H);
    return filterSpec(f, amountOf(f) / 100, compiled);
  }

  // --- arayüz ---------------------------------------------------------------

  function mount(body) {
    body.classList.add('panel-filters');
    const head = el('div', 'ctl-head ctl-head--filter', '<span class="ctl-label">Yoğunluk</span><output class="ctl-value"></output>');
    const out = head.querySelector('output');
    slider = createSlider({
      min: 0,
      max: 100,
      def: 0,
      value: 80,
      label: 'Filtre yoğunluğu',
      onInput: (v) => {
        const f = current();
        if (!f) return;
        st.amounts.set(f.id, v);
        out.textContent = String(Math.round(v));
        host.viewer.invalidate();
      },
    });
    const amountRow = el('div', 'amount-row');
    amountRow.append(head, slider.el);

    const cats = el('div', 'cat-strip');
    cats.setAttribute('role', 'tablist');
    for (const c of FILTER_CATEGORIES) {
      const b = el('button', 'cat', escapeHtml(c.label));
      b.type = 'button';
      b.dataset.cat = c.id;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => scrollToCategory(c.id));
      cats.append(b);
    }

    const strip = el('div', 'filter-strip');
    strip.setAttribute('role', 'radiogroup');
    strip.setAttribute('aria-label', 'Filtreler');
    const none = thumbButton(null, 'Yok');
    strip.append(none);
    for (const f of FILTERS) strip.append(thumbButton(f, f.name));

    body.append(amountRow, cats, strip);
    ui = { amountRow, out, cats, strip };

    // Görünen kategoriyi işaretle.
    strip.addEventListener('scroll', () => markCategory(), { passive: true });

    host.viewer.setContent({ w: host.W, h: host.H, spec });
    renderNoneThumb(none);
    select(null);
    if (category) requestAnimationFrame(() => scrollToCategory(category, false));
    else markCategory();
    startThumbs();
  }

  function thumbButton(f, label) {
    const b = el('button', 'fthumb');
    b.type = 'button';
    b.dataset.id = f ? f.id : '';
    if (f) b.dataset.cat = f.cat;
    b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="fthumb__img"></span><span class="fthumb__label">${escapeHtml(label)}</span>`;
    b.addEventListener('click', () => select(f ? f.id : null));
    return b;
  }

  function renderNoneThumb(btn) {
    const c = host.engine.renderImage({ ...defaultSpec(host.W, host.H), matrix: squareMatrix(host.W, host.H) }, THUMB, THUMB);
    btn.querySelector('.fthumb__img').append(c);
  }

  // Küçük resimler: her karede birkaç tane; son tablo her partiden sonra
  // seçili filtreye geri yüklenir (önizleme bozulmasın).
  function startThumbs() {
    const job = ++thumbJob;
    const buttons = [...ui.strip.querySelectorAll('.fthumb[data-id]:not([data-id=""])')];
    const matrix = squareMatrix(host.W, host.H);
    let i = 0;
    const step = () => {
      if (job !== thumbJob) return;
      const t0 = performance.now();
      while (i < buttons.length && performance.now() - t0 < 24) {
        const btn = buttons[i++];
        const f = findFilter(btn.dataset.id);
        const k = f.fx ? null : compileLook(f.look);
        if (k) host.engine.setLuts({ post: bakeLut((c) => applyLook(c, k), lutBuf) });
        const spec = filterSpec(f, f.amount / 100, k);
        spec.matrix = matrix;
        const c = host.engine.renderImage(spec, THUMB, THUMB);
        btn.querySelector('.fthumb__img').replaceChildren(c);
      }
      compiled = loadLut(current());
      host.viewer.invalidate();
      if (i < buttons.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function select(id) {
    st.id = id;
    const f = current();
    compiled = loadLut(f);
    for (const b of ui.strip.children) {
      const on = (b.dataset.id || null) === id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-checked', on);
      if (on) b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }
    ui.amountRow.classList.toggle('is-off', !f);
    if (f) {
      const v = amountOf(f);
      slider.set(v);
      ui.out.textContent = String(Math.round(v));
    }
    host.viewer.invalidate();
  }

  function scrollToCategory(cat, smooth = true) {
    const first = ui.strip.querySelector(`.fthumb[data-cat="${cat}"]`);
    if (!first) return;
    ui.strip.scrollTo({ left: first.offsetLeft - 12, behavior: smooth ? 'smooth' : 'auto' });
    setCategory(cat);
  }

  function setCategory(cat) {
    for (const b of ui.cats.children) {
      const on = b.dataset.cat === cat;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-selected', on);
      if (on) b.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }

  function markCategory() {
    const left = ui.strip.scrollLeft + 40;
    let cat = FILTER_CATEGORIES[0].id;
    for (const b of ui.strip.querySelectorAll('.fthumb[data-cat]')) {
      if (b.offsetLeft <= left) cat = b.dataset.cat;
      else break;
    }
    setCategory(cat);
  }

  return {
    title: 'Filtreler',
    mount,
    isDirty: () => !!st.id && amountOf(current()) > 0,
    apply() {
      const f = current();
      if (!f || amountOf(f) <= 0) return null;
      compiled = loadLut(f);
      return { spec: spec(false), w: host.W, h: host.H, label: `Filtre: ${f.name}` };
    },
    destroy() {
      thumbJob++;
    },
  };
}
