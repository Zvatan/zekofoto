// Arka plan: özne cihazdaki yapay zekâyla ayrılır (js/ai/subject.js; Portre
// moduyla ortak), arka plan bulanıklaşır, renk/degrade ya da galeriden bir
// görsel olur veya silinir (saydam PNG). Fırçayla maskeye eklenip
// çıkarılabilir. Birleştirme ekran kartında yapılır (bkz. shaders.js →
// uBgMode, lensBlur).
import { el, icon, busy, toast } from '../ui.js';
import { createCanvas, fileToCanvas, releaseCanvas } from '../image-io.js';
import { defaultSpec } from '../gl/engine.js';
import { subject } from '../ai/subject.js';
import { createPainter, tracePath, historyButtons, BRUSH_MIN, BRUSH_MAX } from './paint.js';
import { labeled, segmented, palette, hexToRgb } from './kit.js';

const TABS = [
  { id: 'blur', label: 'Bulanık' },
  { id: 'color', label: 'Renk' },
  { id: 'image', label: 'Görsel' },
  { id: 'clear', label: 'Saydam' },
  { id: 'brush', label: 'Fırça' },
];

const GRADIENTS = [
  ['#ff9a9e', '#fad0c4'],
  ['#a18cd1', '#fbc2eb'],
  ['#84fab0', '#8fd3f4'],
  ['#f6d365', '#fda085'],
  ['#e0c3fc', '#8ec5fc'],
  ['#fccb90', '#d57eeb'],
  ['#30cfd0', '#330867'],
  ['#0f2027', '#2c5364'],
  ['#ff5f6d', '#ffc371'],
  ['#232526', '#414345'],
];

export function backgroundTool(host) {
  const W = host.W;
  const H = host.H;
  const st = { tab: 'blur', blur: 55, color: '#ffffff', grad: null, look: 'blur', brushAdd: true, size: 34 };
  let ui = null;
  let matte = null; // { w, h, data } (motorla paylaşılan)
  let mc = null; // fırça için maske tuvali
  let painter = null;
  let hist = null;
  let bgImg = null;
  let imgXf = [1, 1, 0, 0];
  let focus = null; // kişi varsa yüzün derinliği (bulanık arka plan uzaklığa göre)
  const undo = [];
  const redo = [];

  // Fırça sekmesinde son seçilen görünüm korunur, özne dama üstünde görünür.
  function spec(compare) {
    const s = defaultSpec(W, H);
    if (compare || !matte) return s;
    const look = st.tab === 'brush' ? 'clear' : st.look;
    if (look === 'blur') {
      const radius = 0.004 + (st.blur / 100) * 0.05;
      // Kişi varsa portre modu gibi: özne keskin, gerisi uzaklaştıkça daha bulanık
      // (en az %60); yoksa maskenin dışı eşit bulanık.
      s.blur = focus !== null ? { mode: 5, radius, bokeh: 0.3, b: [focus - 0.04, 0.3, 0.6] } : { mode: 4, radius, bokeh: 0.3 };
    } else if (look === 'color') {
      const g = st.grad;
      s.bg = { mode: 1, a: hexToRgb(g ? g[0] : st.color), b: hexToRgb(g ? g[1] : st.color), dir: [0, 1] };
    } else if (look === 'image' && bgImg) s.bg = { mode: 2, xf: imgXf };
    else if (look === 'clear') s.bg = { mode: 3 };
    return s;
  }

  const update = () => host.viewer.invalidate();

  // --- maske ----------------------------------------------------------------

  async function prepare() {
    busy.show('Özne ayrılıyor…');
    try {
      const prog = (label) => (p) => busy.text(p < 1 ? `Yapay zekâ modeli indiriliyor… %${Math.round(p * 100)}` : label);
      const sb = await subject(host, prog);
      const m = sb.matte;
      if (sb.person && sb.face) focus = host.ai.depthAt((sb.face.x + sb.face.w / 2) / W, (sb.face.y + sb.face.h / 2) / H, 4);
      // Fırça değişiklikleri önbellekteki maskeyi bozmasın: kopya.
      matte = { w: m.w, h: m.h, data: m.data.slice() };
      host.engine.setMatte(matte);
      mc = createCanvas(matte.w, matte.h);
      const g = mc.getContext('2d', { willReadFrequently: true });
      const img = g.createImageData(matte.w, matte.h);
      for (let i = 0; i < matte.data.length; i++) {
        const v = matte.data[i];
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      update();
      return true;
    } catch (err) {
      console.error(err);
      toast('Özne ayrılamadı: ' + err.message);
      return false;
    } finally {
      busy.hide();
    }
  }

  // --- fırça ----------------------------------------------------------------

  // Vuruşun son parçasını maske tuvaline çizer ve değişen bölgeyi yükler.
  function paintSegment(s, from) {
    if (!mc) return;
    const k = matte.w / W;
    const g = mc.getContext('2d', { willReadFrequently: true });
    const pts = s.points.slice(Math.max(0, from - 1));
    g.save();
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = s.add ? '#fff' : '#000';
    g.lineWidth = s.width * k;
    g.shadowColor = g.strokeStyle;
    g.shadowBlur = Math.max(1, s.width * k * 0.25);
    tracePath(g, pts, k);
    g.stroke();
    g.restore();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const r = s.width * k * 0.9 + 2;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x * k - r);
      y0 = Math.min(y0, y * k - r);
      x1 = Math.max(x1, x * k + r);
      y1 = Math.max(y1, y * k + r);
    }
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(matte.w, Math.ceil(x1));
    y1 = Math.min(matte.h, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return;
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) matte.data[y * matte.w + x] = d[((y - y0) * (x1 - x0) + (x - x0)) * 4];
    }
    host.engine.updateMatte(x0, y0, x1 - x0, y1 - y0);
    update();
  }

  function snapshot() {
    return { data: matte.data.slice(), canvas: (() => {
      const c = createCanvas(mc.width, mc.height);
      c.getContext('2d').drawImage(mc, 0, 0);
      return c;
    })() };
  }

  function restore(snap) {
    matte.data.set(snap.data);
    const g = mc.getContext('2d');
    g.clearRect(0, 0, mc.width, mc.height);
    g.drawImage(snap.canvas, 0, 0);
    host.engine.updateMatte(0, 0, matte.w, matte.h);
    update();
    hist?.update(undo.length > 0, redo.length > 0);
  }

  // --- panel ------------------------------------------------------------

  function buildTab() {
    const c = ui.tabBody;
    c.replaceChildren();
    if (st.tab !== 'brush' && st.tab !== 'image') st.look = st.tab;
    if (st.tab === 'blur') {
      const b = labeled('Bulanıklık', { min: 0, max: 100, value: st.blur, def: 55, onInput: (v) => ((st.blur = v), update()) });
      c.append(b.row);
    } else if (st.tab === 'color') {
      const solid = palette(st.grad ? '' : st.color, (col) => {
        st.color = col;
        st.grad = null;
        grads.querySelectorAll('.swatch').forEach((x) => x.classList.remove('is-selected'));
        update();
      });
      const grads = el('div', 'swatches swatches--grad');
      for (const gr of GRADIENTS) {
        const b = el('button', 'swatch');
        b.style.setProperty('--c', `linear-gradient(180deg, ${gr[0]}, ${gr[1]})`);
        b.setAttribute('aria-label', 'Degrade');
        b.addEventListener('click', () => {
          st.grad = gr;
          grads.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('is-selected', x === b));
          solid.set('');
          update();
        });
        grads.append(b);
      }
      c.append(solid.el, grads);
    } else if (st.tab === 'image') {
      const pick = el('button', 'btn btn--secondary btn--small', `${icon('gallery')}${bgImg ? 'Başka görsel seç' : 'Galeriden görsel seç'}`);
      const input = el('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.hidden = true;
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        if (!f) return;
        busy.show('Görsel açılıyor…');
        try {
          const { canvas } = await fileToCanvas(f, 2048);
          host.engine.setBgImage(canvas);
          // Görsel çerçeveyi kaplasın (ortalanmış, taşan kısmı kırpılır).
          const A = W / H;
          const B = canvas.width / canvas.height;
          imgXf = B > A ? [A / B, 1, (1 - A / B) / 2, 0] : [1, B / A, 0, (1 - B / A) / 2];
          if (bgImg) releaseCanvas(bgImg);
          bgImg = canvas;
          st.look = 'image';
          pick.lastChild.textContent = 'Başka görsel seç';
          update();
        } catch (err) {
          console.error(err);
          toast('Görsel açılamadı');
        } finally {
          busy.hide();
        }
      });
      pick.addEventListener('click', () => input.click());
      c.append(pick, input, el('p', 'ctl-hint', 'Seçtiğin görsel öznenin arkasına yerleşir.'));
      if (bgImg) st.look = 'image';
    } else if (st.tab === 'clear') {
      c.append(el('p', 'ctl-hint', 'Arka plan silinir; fotoğraf saydam PNG olarak kaydedilir.'));
    } else {
      const top = el('div', 'ctl-row');
      const mode = segmented(
        [{ id: 'add', label: 'Ekle', icon: 'plus' }, { id: 'sub', label: 'Çıkar', icon: 'eraser' }],
        st.brushAdd ? 'add' : 'sub',
        (id) => (st.brushAdd = id === 'add'),
      );
      hist = historyButtons(icon, {
        onUndo: () => {
          const s = undo.pop();
          if (!s) return;
          redo.push(snapshot());
          restore(s);
        },
        onRedo: () => {
          const s = redo.pop();
          if (!s) return;
          undo.push(snapshot());
          restore(s);
        },
      });
      hist.update(undo.length > 0, redo.length > 0);
      top.append(mode.el, hist.el);
      const size = labeled('Fırça', {
        min: BRUSH_MIN,
        max: BRUSH_MAX,
        value: st.size,
        def: 34,
        onInput: (v) => {
          st.size = v;
          painter.previewSize();
        },
      });
      c.append(top, size.row);
    }
    update();
  }

  function mount(body) {
    body.classList.add('panel-bg');
    host.viewer.setContent({ w: W, h: H, spec }, { keepView: true, singlePointer: 'none' });
    const tabs = segmented(TABS, st.tab, (id) => {
      st.tab = id;
      buildTab();
    }, 'seg--tabs');
    const tabBody = el('div', 'bg-tab');
    body.append(tabs.el, tabBody);
    ui = { tabBody };
    painter = createPainter(host, {
      size: () => st.size,
      enabled: () => st.tab === 'brush' && !!mc,
      begin: () => {
        undo.push(snapshot());
        redo.length = 0;
        return { add: st.brushAdd, drawn: 0 };
      },
      onMove: (s) => {
        if (!s) return;
        paintSegment(s, s.drawn);
        s.drawn = s.points.length;
      },
      onEnd: () => {
        painter.clear();
        hist?.update(undo.length > 0, redo.length > 0);
      },
    });
    buildTab();
    prepare();
  }

  return {
    title: 'Arka plan',
    mount,
    apply() {
      if (!matte) return null;
      const s = spec(false);
      if (!s.blur && !s.bg) return null;
      const clear = s.bg?.mode === 3;
      return { spec: s, w: W, h: H, label: 'Arka plan', alpha: clear };
    },
    destroy() {
      painter?.destroy();
      host.engine.setMatte(null);
      host.engine.setBgImage(null);
      if (bgImg) releaseCanvas(bgImg);
    },
  };
}
