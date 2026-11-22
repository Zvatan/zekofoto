// Dokunmaya uygun kaydırıcı: varsayılandan dolum (iki yönlü), varsayılana
// yapışma, çift dokunuşla sıfırlama ve sürüklerken değer balonu.
//
// Başparmak yakınından tutulursa göreli sürüklenir (ince ayar için değer
// zıplamaz); izin başka bir yerine dokunulursa değer oraya atlar.

const INSET = 14; // başparmak yarıçapı: uçlarda başparmak izin dışına taşmaz

export function createSlider({
  min = -100,
  max = 100,
  value = 0,
  def = 0,
  step = 1,
  label = '',
  format = (v) => String(Math.round(v)),
  track = '',
  onInput,
  onChange,
} = {}) {
  const root = document.createElement('div');
  root.className = 'slider';
  root.tabIndex = 0;
  root.setAttribute('role', 'slider');
  if (label) root.setAttribute('aria-label', label);
  root.innerHTML =
    '<div class="slider__track"><div class="slider__fill"></div><div class="slider__tick"></div></div>' +
    '<div class="slider__thumb"><span class="slider__bubble"></span></div>';
  const trackEl = root.querySelector('.slider__track');
  const fill = root.querySelector('.slider__fill');
  const tick = root.querySelector('.slider__tick');
  const thumb = root.querySelector('.slider__thumb');
  const bubble = root.querySelector('.slider__bubble');
  if (track) {
    trackEl.style.background = track;
    fill.hidden = true;
    root.classList.add('slider--custom');
  }

  let v = value;
  let dragging = false;
  let offset = 0;
  let lastTap = { t: 0, x: 0 };

  const span = () => max - min;
  const pct = (x) => (x - min) / span();
  const quantize = (x) => {
    x = Math.min(max, Math.max(min, x));
    return step ? Math.round(x / step) * step : x;
  };

  function render() {
    const p = pct(v);
    const d = pct(def);
    const w = root.clientWidth - INSET * 2;
    thumb.style.transform = `translateX(${INSET + p * w}px)`;
    const a = Math.min(p, d);
    const b = Math.max(p, d);
    fill.style.left = `${INSET + a * w}px`;
    fill.style.width = `${(b - a) * w}px`;
    tick.style.left = `${INSET + d * w}px`;
    tick.hidden = def === min || def === max;
    bubble.textContent = format(v);
    root.setAttribute('aria-valuemin', min);
    root.setAttribute('aria-valuemax', max);
    root.setAttribute('aria-valuenow', Math.round(v * 10) / 10);
    root.setAttribute('aria-valuetext', format(v));
    root.classList.toggle('is-changed', Math.abs(v - def) > 1e-9);
  }

  function setValue(x, emit = true) {
    let q = quantize(x);
    // Varsayılan değere yakınken yapış.
    if (Math.abs(q - def) <= span() * 0.015) q = def;
    if (q === v) return;
    v = q;
    render();
    if (emit) onInput?.(v);
  }

  function valueAt(clientX) {
    const r = root.getBoundingClientRect();
    const w = r.width - INSET * 2;
    return min + ((clientX - r.left - INSET) / w) * span();
  }

  root.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    root.focus({ preventScroll: true });
    root.setPointerCapture(e.pointerId);
    const now = performance.now();
    if (now - lastTap.t < 320 && Math.abs(e.clientX - lastTap.x) < 24) {
      lastTap.t = 0;
      setValue(def);
      onChange?.(v);
      return;
    }
    lastTap = { t: now, x: e.clientX };
    const r = root.getBoundingClientRect();
    const thumbX = r.left + INSET + pct(v) * (r.width - INSET * 2);
    dragging = true;
    root.classList.add('is-dragging');
    if (Math.abs(e.clientX - thumbX) < 26) {
      offset = e.clientX - thumbX;
    } else {
      offset = 0;
      setValue(valueAt(e.clientX));
    }
  });

  root.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    setValue(valueAt(e.clientX - offset));
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-dragging');
    onChange?.(v);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  root.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (k) {
      e.preventDefault();
      setValue(v + k * (step || span() / 100) * (e.shiftKey ? 10 : 1));
      onChange?.(v);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setValue(e.key === 'Home' ? min : max);
      onChange?.(v);
    }
  });

  // Yerleşim değişince (ör. panel açılınca) yeniden konumlandır.
  new ResizeObserver(render).observe(root);
  render();

  return {
    el: root,
    get value() {
      return v;
    },
    set(x) {
      v = quantize(x);
      render();
    },
    configure(opts) {
      if (opts.min !== undefined) min = opts.min;
      if (opts.max !== undefined) max = opts.max;
      if (opts.def !== undefined) def = opts.def;
      if (opts.step !== undefined) step = opts.step;
      if (opts.format) format = opts.format;
      if (opts.label) root.setAttribute('aria-label', opts.label);
      if (opts.track !== undefined) {
        trackEl.style.background = opts.track || '';
        fill.hidden = !!opts.track;
        root.classList.toggle('slider--custom', !!opts.track);
      }
      if (opts.value !== undefined) v = quantize(opts.value);
      render();
    },
  };
}
