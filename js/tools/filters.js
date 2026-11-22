// Filtreler aracı: kategorili hazır filtreler, kamera filtreleri ve sanatsal
// efektler, yoğunluk ayarıyla; isteğe bağlı tarih damgası. Küçük resimler
// fotoğrafın kendisinden, ekran kartında birkaç karede bir parti halinde
// üretilir.
import { createSlider } from '../widgets/slider.js';
import { el, escapeHtml, icon, busy, toast } from '../ui.js';
import { compileLook, bakeLut, applyLook, lutLength } from '../core/color.js';
import { FILTERS, FILTER_CATEGORIES, EFFECTS, findFilter } from '../core/presets.js';
import { defaultSpec } from '../gl/engine.js';
import { drawStamp, stampText } from '../stamp.js';

const THUMB = 144;

function squareMatrix(W, H) {
  const side = Math.min(W, H);
  const sx = side / W;
  const sy = side / H;
  return new Float32Array([sx, 0, 0, 0, sy, 0, (1 - sx) / 2, (1 - sy) / 2, 1]);
}

export function filtersTool(host, { category = null } = {}) {
  // date: tarih damgası açık mı; dateTouched: kullanıcı kendisi değiştirdi mi
  const st = { id: null, amounts: new Map(), date: false, dateTouched: false };
  const lutBuf = new Float32Array(lutLength());
  const fgBuf = new Float32Array(lutLength());
  const seed = Math.random() * 1000;
  let compiled = null;
  let ui = null;
  const thumbQueue = [];
  let thumbRunning = false;
  let destroyed = false;
  let selectToken = 0;
  let slider = null;
  let stampCanvas = null;
  let offLayout = null;

  const amountOf = (f) => (st.amounts.has(f.id) ? st.amounts.get(f.id) : f.amount);
  const current = () => (st.id ? findFilter(st.id) : null);

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
    const x = f.extras;
    if (x) {
      s.glow = [(x.bloom || 0) * amount, (x.halation || 0) * amount, x.threshold ?? 0.62];
      s.lens = [(x.ca || 0) * amount, (x.flash || 0) * amount, (x.soft || 0) * amount, (x.noise || 0) * amount];
      if (x.leak) s.leak = { ...x.leak, amount: x.leak.amount * amount };
      if (x.faceFlash) {
        s.lens[1] = x.faceFlash.amount * amount;
        s.flashAt = host.ai.flashAt(x.faceFlash.size);
      }
      // Derinlik haritası henüz yoksa motor geçişi kendiliğinden atlar.
      if (x.depth) s.depthMix = { center: x.depth.center, width: x.depth.width };
    }
    return s;
  }

  // Ana tarifin (ve varsa yakın plan tarifinin) tablolarını motora yükler.
  function bake(f) {
    const k = compileLook(f.look);
    const luts = { post: bakeLut((c) => applyLook(c, k), lutBuf) };
    if (f.extras?.depth) {
      const kf = compileLook(f.extras.depth.look);
      luts.fg = bakeLut((c) => applyLook(c, kf), fgBuf);
    }
    host.engine.setLuts(luts);
    return k;
  }

  function loadLut(f) {
    if (!f || f.fx) return null;
    return bake(f);
  }

  // Yapay zekâ gerektiren filtre için derinlik/yüz hazırlığı (ilk seferde
  // model indirilir). Başarısızsa false; filtre yine de yapay zekâsız çalışır.
  async function ensureAi(f) {
    const x = f?.extras;
    if (!x) return true;
    const jobs = [];
    if (x.depth && !host.ai.depthReady) jobs.push(['depth', 'Derinlik hesaplanıyor…']);
    if (x.faceFlash && !host.ai.facesReady) jobs.push(['faces', 'Yüz aranıyor…']);
    if (!jobs.length) return true;
    busy.show('Yapay zekâ hazırlanıyor…');
    try {
      for (const [job, label] of jobs) {
        await host.ai[job]((p) => busy.text(p < 1 ? `Yapay zekâ modeli indiriliyor… %${Math.round(p * 100)}` : label));
      }
      return true;
    } catch (err) {
      console.error(err);
      toast('Yapay zekâ çalıştırılamadı: ' + err.message);
      return false;
    } finally {
      busy.hide();
    }
  }

  function spec(compare) {
    const f = current();
    if (compare || !f) return defaultSpec(host.W, host.H);
    return filterSpec(f, amountOf(f) / 100, compiled);
  }

  // --- tarih damgası --------------------------------------------------------

  function layoutStamp(r = host.viewer.imageRect()) {
    if (!stampCanvas) return;
    stampCanvas.hidden = !st.date;
    if (!st.date) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    stampCanvas.style.transform = `translate(${r.left}px, ${r.top}px)`;
    stampCanvas.style.width = `${r.width}px`;
    stampCanvas.style.height = `${r.height}px`;
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (stampCanvas.width !== w || stampCanvas.height !== h) {
      stampCanvas.width = w;
      stampCanvas.height = h;
    } else {
      stampCanvas.getContext('2d').clearRect(0, 0, w, h);
    }
    drawStamp(stampCanvas, stampText(host.photoDate));
  }

  function setDate(on, touched = false) {
    st.date = on;
    if (touched) st.dateTouched = true;
    if (ui) {
      ui.dateBtn.classList.toggle('is-on', on);
      ui.dateBtn.setAttribute('aria-pressed', on);
    }
    layoutStamp();
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
    const amount = el('div', 'amount');
    amount.append(head, slider.el);
    const dateBtn = el('button', 'stamp-btn', `${icon('calendar')}<span>Tarih</span>`);
    dateBtn.type = 'button';
    dateBtn.setAttribute('aria-pressed', 'false');
    dateBtn.setAttribute('aria-label', 'Tarih damgası');
    dateBtn.addEventListener('click', () => setDate(!st.date, true));
    const amountRow = el('div', 'amount-row');
    amountRow.append(amount, dateBtn);

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
    ui = { amount, out, cats, strip, dateBtn };

    // Önizlemedeki tarih damgası: fotoğrafın üstünde, aynı oranlarla.
    stampCanvas = el('canvas', 'stamp-ov');
    stampCanvas.hidden = true;
    host.overlay.append(stampCanvas);
    offLayout = host.viewer.onLayout((r) => layoutStamp(r));

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
    if (f?.ai) b.classList.add('is-ai');
    b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="fthumb__img"></span><span class="fthumb__label">${escapeHtml(label)}</span>`;
    b.addEventListener('click', () => select(f ? f.id : null));
    return b;
  }

  function renderNoneThumb(btn) {
    const c = host.engine.renderImage({ ...defaultSpec(host.W, host.H), matrix: squareMatrix(host.W, host.H) }, THUMB, THUMB);
    btn.querySelector('.fthumb__img').append(c);
  }

  // Küçük resimler: sıradaki kimlikler her karede birkaç tane çizilir; son
  // tablo her partiden sonra seçili filtreye geri yüklenir (önizleme bozulmasın).
  // only: yalnız bu kimlikler sıraya eklenir (ör. yapay zekâ hazır olunca).
  function startThumbs(only = null) {
    const ids = only || [...ui.strip.querySelectorAll('.fthumb[data-id]:not([data-id=""])')].map((b) => b.dataset.id);
    for (const id of ids) if (!thumbQueue.includes(id)) thumbQueue.push(id);
    if (thumbRunning) return;
    thumbRunning = true;
    const matrix = squareMatrix(host.W, host.H);
    const date = stampText(host.photoDate);
    const step = () => {
      if (destroyed) return;
      const t0 = performance.now();
      while (thumbQueue.length && performance.now() - t0 < 24) {
        const id = thumbQueue.shift();
        const btn = ui.strip.querySelector(`.fthumb[data-id="${id}"]`);
        const f = findFilter(id);
        if (!btn || !f) continue;
        const k = f.fx ? null : bake(f);
        const spec = filterSpec(f, f.amount / 100, k);
        spec.matrix = matrix;
        const c = host.engine.renderImage(spec, THUMB, THUMB);
        if (f.extras?.date) drawStamp(c, date, { scale: 2.2 });
        btn.querySelector('.fthumb__img').replaceChildren(c);
      }
      compiled = loadLut(current());
      host.viewer.invalidate();
      if (thumbQueue.length) requestAnimationFrame(step);
      else thumbRunning = false;
    };
    requestAnimationFrame(step);
  }

  async function select(id) {
    const token = ++selectToken;
    const f0 = id ? findFilter(id) : null;
    if (f0?.ai) {
      const before = host.ai.depthReady + host.ai.facesReady;
      await ensureAi(f0);
      if (destroyed) return;
      // Yeni hazırlanan yapay zekâ sonuçlarıyla ilgili küçük resimler yenilenir.
      if (host.ai.depthReady + host.ai.facesReady !== before) {
        startThumbs(FILTERS.filter((x) => x.ai).map((x) => x.id));
      }
      if (token !== selectToken) return; // bu arada başka filtre seçildi
    }
    st.id = id;
    const f = current();
    compiled = loadLut(f);
    for (const b of ui.strip.children) {
      const on = (b.dataset.id || null) === id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-checked', on);
      if (on) b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }
    ui.amount.classList.toggle('is-off', !f);
    if (f) {
      const v = amountOf(f);
      slider.set(v);
      ui.out.textContent = String(Math.round(v));
    }
    // Tarih damgalı kamera filtrelerinde damga kendiliğinden açılır;
    // kullanıcı düğmeye dokunduysa onun seçimi korunur.
    if (!st.dateTouched) setDate(!!f?.extras?.date);
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

  const active = () => {
    const f = current();
    return !!f && amountOf(f) > 0;
  };

  return {
    title: 'Filtreler',
    mount,
    isDirty: () => active() || st.date,
    apply() {
      if (!active() && !st.date) return null;
      const f = active() ? current() : null;
      compiled = loadLut(f);
      const text = stampText(host.photoDate);
      return {
        spec: f ? spec(false) : defaultSpec(host.W, host.H),
        w: host.W,
        h: host.H,
        label: f ? `Filtre: ${f.name}${st.date ? ' + tarih' : ''}` : 'Tarih damgası',
        post: st.date ? (canvas) => drawStamp(canvas, text) : null,
      };
    },
    destroy() {
      destroyed = true;
      offLayout?.();
      stampCanvas?.remove();
    },
  };
}
