// Ana ekran: büyük "Düzenle" ve "Kamera" düğmeleri, araç ızgarası ve filtre
// koleksiyonları (Meitu'nun ana ekran düzeni). Koleksiyon kartlarındaki
// önizlemeler uygulamanın içinde çizilen bir örnek sahneye filtrenin kendisi
// uygulanarak, ekran kartında üretilir (dışarıdan görsel kullanılmaz).
import { el, escapeHtml, icon } from './ui.js';
import { createCanvas, releaseCanvas } from './image-io.js';
import { FILTERS, FILTER_CATEGORIES, findFilter } from './core/presets.js';
import { filterSpec, bakeFilter } from './tools/filters.js';

// Araç ızgarası: fotoğraf seçilince doğrudan ilgili araç açılır.
export const HOME_TOOLS = [
  { label: 'Filtreler', icon: 'filter', tool: 'filters', opts: {} },
  { label: 'Düzenle', icon: 'crop', tool: 'crop', opts: { tab: 'crop' } },
  { label: 'Ayarla', icon: 'adjust', tool: 'adjust', opts: {} },
  { label: 'Metin', icon: 'text', tool: 'text', opts: {} },
  { label: 'Çizim', icon: 'pen', tool: 'draw', opts: {} },
  { label: 'Silgi', icon: 'eraser', tool: 'eraser', opts: {}, ai: true },
  { label: 'Bulanıklaştır', icon: 'blurDrop', tool: 'blur', opts: { mode: 'circle' } },
  { label: 'Portre modu', icon: 'focusCircle', tool: 'blur', opts: { mode: 'smart' }, ai: true },
  { label: 'Mozaik', icon: 'mosaic', tool: 'mosaic', opts: {} },
  { label: 'Arka plan', icon: 'background', tool: 'background', opts: {}, ai: true },
  { label: 'Akıllı iyileştir', icon: 'sparkle', tool: 'adjust', opts: { start: 'auto' } },
  { label: 'Sanatsal', icon: 'brush', tool: 'filters', opts: { category: 'sanat' } },
];

// scene: koleksiyonun önizleme sahnesi (bkz. SCENES).
const COLLECTIONS = [
  { cat: 'kamera', title: 'Kamera filtreleri', scene: 'koy' },
  { cat: 'portre', title: 'Portre', scene: 'cicek' },
  { cat: 'film', title: 'Film', scene: 'koy' },
  { cat: 'retro', title: 'Retro', scene: 'manzara' },
  { cat: 'yemek', title: 'Yemek', scene: 'yemek' },
  { cat: 'manzara', title: 'Manzara', scene: 'manzara' },
  { cat: 'sb', title: 'Siyah-Beyaz', scene: 'koy' },
  { cat: 'sanat', title: 'Sanatsal efektler', scene: 'cicek' },
];

const PW = 240; // önizleme boyutu (3:4)
const PH = 320;

// Tekrarlanabilir rastgele sayılar (sahne her açılışta aynı görünsün).
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Fotoğraf gibi görünsün diye hafif doku.
function grain(g, w, h, R, k = 7) {
  const d = g.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (R() - 0.5) * k;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
}

function blob(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// Yemek: tahta masada üstten tabak; yeşillik, domates, limon, sos.
function foodScene(w, h) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const R = rng(11);
  let gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#8a5a3a');
  gr.addColorStop(1, '#5b3a25');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(30,15,5,${(0.08 + R() * 0.12).toFixed(3)})`;
    g.fillRect(0, R() * h, w, 1 + R() * 2);
  }
  const cx = w * 0.5;
  const cy = h * 0.5;
  const pr = w * 0.42;
  blob(g, cx + 6, cy + 10, pr, 'rgba(0,0,0,0.35)');
  gr = g.createRadialGradient(cx - pr * 0.3, cy - pr * 0.3, 0, cx, cy, pr);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#d9d4cc');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(cx, cy, pr, 0, Math.PI * 2);
  g.fill();
  blob(g, cx, cy, pr * 0.78, '#efe9df');
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2;
    const d = R() * pr * 0.45;
    blob(g, cx - pr * 0.2 + Math.cos(a) * d, cy + Math.sin(a) * d, pr * (0.09 + R() * 0.08), ['#3f8f3a', '#5fae3f', '#2f6e2d', '#86c34f'][i % 4]);
  }
  for (let i = 0; i < 4; i++) {
    const x = cx + pr * (0.2 + R() * 0.25);
    const y = cy + pr * (R() - 0.5) * 0.9;
    blob(g, x, y, pr * 0.13, '#d8342c');
    blob(g, x - pr * 0.03, y - pr * 0.03, pr * 0.04, 'rgba(255,255,255,0.45)');
  }
  blob(g, cx + pr * 0.05, cy - pr * 0.42, pr * 0.14, '#f5d33a');
  blob(g, cx + pr * 0.05, cy - pr * 0.42, pr * 0.1, '#fbe68a');
  blob(g, cx - pr * 0.35, cy + pr * 0.4, pr * 0.12, '#b8641e');
  grain(g, w, h, R, 6);
  return c;
}

// Manzara: karlı dağlar, bulutlu gökyüzü, göl ve çayır.
function landscapeScene(w, h) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const R = rng(5);
  let gr = g.createLinearGradient(0, 0, 0, h * 0.55);
  gr.addColorStop(0, '#2f6bc4');
  gr.addColorStop(1, '#a9d0f2');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  // Bulutlar: yumuşak kenarlı, yatay uzun öbekler.
  for (let i = 0; i < 4; i++) {
    const cx = R() * w;
    const cy = h * (0.06 + R() * 0.16);
    for (let j = 0; j < 7; j++) {
      const x = cx + (R() - 0.5) * w * 0.35;
      const y = cy + (R() - 0.5) * h * 0.03;
      const r = w * (0.05 + R() * 0.06);
      g.save();
      g.translate(x, y);
      g.scale(1.8, 0.7);
      gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.75)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
    }
  }
  const peak = (x0, x1, top, base, color, snow) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x0, base);
    g.lineTo((x0 + x1) / 2, top);
    g.lineTo(x1, base);
    g.closePath();
    g.fill();
    if (snow) {
      g.fillStyle = '#f4f7fb';
      g.beginPath();
      const sx = (x0 + x1) / 2;
      const k = 0.28;
      g.moveTo(sx, top);
      g.lineTo(sx - (sx - x0) * k, top + (base - top) * k);
      g.lineTo(sx, top + (base - top) * k * 0.8);
      g.lineTo(sx + (x1 - sx) * k, top + (base - top) * k);
      g.closePath();
      g.fill();
    }
  };
  peak(-w * 0.2, w * 0.55, h * 0.22, h * 0.55, '#5d6f8c', true);
  peak(w * 0.3, w * 1.1, h * 0.17, h * 0.55, '#4d5f7d', true);
  peak(w * 0.05, w * 0.7, h * 0.33, h * 0.56, '#3f6b4a', false);
  gr = g.createLinearGradient(0, h * 0.55, 0, h * 0.72);
  gr.addColorStop(0, '#6f9ccc');
  gr.addColorStop(1, '#3d6f9c');
  g.fillStyle = gr;
  g.fillRect(0, h * 0.55, w, h * 0.17);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(255,255,255,${(0.1 + R() * 0.2).toFixed(3)})`;
    g.fillRect(R() * w, h * (0.56 + R() * 0.15), w * (0.05 + R() * 0.1), 1);
  }
  gr = g.createLinearGradient(0, h * 0.72, 0, h);
  gr.addColorStop(0, '#79a83b');
  gr.addColorStop(1, '#3f6d22');
  g.fillStyle = gr;
  g.fillRect(0, h * 0.72, w, h * 0.28);
  for (let i = 0; i < 40; i++) blob(g, R() * w, h * (0.74 + R() * 0.26), 1.5 + R() * 2.5, ['#f2d14b', '#ffffff', '#e0614c'][i % 3]);
  grain(g, w, h, R, 6);
  return c;
}

// Çiçek: yumuşak, ışık noktalı (bokeh) arka planda pembe çiçekler.
function flowerScene(w, h) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const R = rng(3);
  let gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#f3c6c9');
  gr.addColorStop(0.5, '#e8d4c4');
  gr.addColorStop(1, '#9fb8a4');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 22; i++) {
    const x = R() * w;
    const y = R() * h;
    const r = w * (0.04 + R() * 0.09);
    gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,250,240,0.55)');
    gr.addColorStop(0.8, 'rgba(255,240,230,0.25)');
    gr.addColorStop(1, 'rgba(255,240,230,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = '#4f7a46';
  g.lineWidth = 3;
  const flower = (x, y, r, c1, c2) => {
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + r * 0.4, y + h * 0.25, x - r * 0.2, h + 10);
    g.stroke();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + R() * 0.3;
      g.save();
      g.translate(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45);
      g.rotate(a);
      gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
      gr.addColorStop(0, c1);
      gr.addColorStop(1, c2);
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(0, 0, r * 0.62, r * 0.36, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    blob(g, x, y, r * 0.22, '#f3c13a');
  };
  flower(w * 0.38, h * 0.38, w * 0.28, '#ffd6e0', '#e0607e');
  flower(w * 0.74, h * 0.62, w * 0.2, '#fff0f3', '#ef8aa2');
  grain(g, w, h, R, 5);
  return c;
}

const SCENES = { koy: () => sampleScene(), yemek: () => foodScene(PW, PH), manzara: () => landscapeScene(PW, PH), cicek: () => flowerScene(PW, PH) };

// Örnek sahne: akşam üstü koy; gökyüzü, güneş, tepeler, deniz, iskele ve
// asılı bir fener (sıcak ışık). Filtrelerin renk ve ışık karakteri görünür.
export function sampleScene(w = PW, h = PH) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const R = rng(7);
  let gr = g.createLinearGradient(0, 0, 0, h * 0.6);
  gr.addColorStop(0, '#5a7fbd');
  gr.addColorStop(0.5, '#a9b6d4');
  gr.addColorStop(0.85, '#e9c2a6');
  gr.addColorStop(1, '#f6b989');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h * 0.62);
  const sx = w * 0.68;
  const sy = h * 0.5;
  gr = g.createRadialGradient(sx, sy, 0, sx, sy, w * 0.5);
  gr.addColorStop(0, 'rgba(255,246,222,1)');
  gr.addColorStop(0.07, 'rgba(255,222,170,0.9)');
  gr.addColorStop(0.25, 'rgba(255,190,140,0.3)');
  gr.addColorStop(1, 'rgba(255,190,140,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h * 0.62);
  const hills = (base, amp, color, f, ph) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const y = base - amp * (0.55 + 0.45 * Math.sin((x / w) * Math.PI * f + ph)) - amp * 0.25 * Math.sin((x / w) * Math.PI * f * 3.7 + ph * 2);
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  };
  hills(h * 0.565, h * 0.07, '#7b8aa3', 2.2, 0.6);
  hills(h * 0.6, h * 0.08, '#3d5a45', 1.4, 2.1);
  gr = g.createLinearGradient(0, h * 0.6, 0, h * 0.8);
  gr.addColorStop(0, '#62809f');
  gr.addColorStop(1, '#203750');
  g.fillStyle = gr;
  g.fillRect(0, h * 0.6, w, h * 0.21);
  // Güneşin denizdeki yansıması ve dalgalar.
  for (let i = 0; i < 70; i++) {
    const t = R();
    const y = h * 0.61 + t * h * 0.19;
    const near = sx + (R() - 0.5) * w * (0.12 + t * 0.3);
    const ww = w * (0.03 + R() * 0.08);
    g.fillStyle = `rgba(255,${200 + Math.round(R() * 40)},${150 + Math.round(R() * 50)},${(0.55 * (1 - t)).toFixed(3)})`;
    g.fillRect(near - ww / 2, y, ww, 1 + R() * 1.6);
    g.fillStyle = `rgba(10,25,40,${(0.25 * R()).toFixed(3)})`;
    g.fillRect(R() * w, y, w * (0.05 + R() * 0.15), 1);
  }
  // İskele (ahşap).
  gr = g.createLinearGradient(0, h * 0.8, 0, h);
  gr.addColorStop(0, '#a27a58');
  gr.addColorStop(1, '#583f2c');
  g.fillStyle = gr;
  g.fillRect(0, h * 0.8, w, h * 0.2);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = 'rgba(35,20,10,0.4)';
    g.fillRect(0, h * 0.8 + i * h * 0.026 + i * i * 0.6, w, 1.4);
  }
  // Asılı fener: ip + sıcak ışık.
  const lx = w * 0.24;
  const ly = h * 0.28;
  g.strokeStyle = 'rgba(30,30,35,0.8)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(lx, 0);
  g.lineTo(lx, ly - h * 0.03);
  g.stroke();
  gr = g.createRadialGradient(lx, ly, 0, lx, ly, w * 0.16);
  gr.addColorStop(0, 'rgba(255,214,140,0.95)');
  gr.addColorStop(0.18, 'rgba(255,170,80,0.7)');
  gr.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = gr;
  g.fillRect(lx - w * 0.17, ly - w * 0.17, w * 0.34, w * 0.34);
  g.fillStyle = '#ffd690';
  g.fillRect(lx - w * 0.028, ly - h * 0.03, w * 0.056, h * 0.055);
  g.fillStyle = 'rgba(60,40,25,0.9)';
  g.fillRect(lx - w * 0.034, ly - h * 0.034, w * 0.068, h * 0.008);
  g.fillRect(lx - w * 0.034, ly + h * 0.024, w * 0.068, h * 0.008);
  grain(g, w, h, R, 7);
  return c;
}

// Koleksiyon kartları; önizlemeler görünür oldukça üretilir. Motor düzenleyiciyle
// ortak olduğundan önizleme yalnız ana ekrandayken çizilir (active()).
export function buildFeed(root, { engine, onPick, active }) {
  const scenes = new Map(); // ad → tuval
  let loaded = null; // motorda yüklü sahne
  const queue = [];
  let running = false;

  function renderPreview(f, kind) {
    if (!scenes.has(kind)) scenes.set(kind, SCENES[kind]());
    if (loaded !== kind) {
      engine.setSource(scenes.get(kind));
      loaded = kind;
    }
    const k = f.fx ? null : bakeFilter(engine, f);
    return engine.renderImage(filterSpec(f, f.amount / 100, k, PW, PH, { seed: 3 }), PW, PH);
  }

  function pump() {
    if (running) return;
    running = true;
    const step = () => {
      if (!active()) {
        running = false;
        return;
      }
      // Kare başına birkaç önizleme: ekran takılmasın.
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 12) {
        const { f, slot, kind } = queue.shift();
        try {
          const c = renderPreview(f, kind);
          c.toBlob((b) => {
            releaseCanvas(c);
            if (!b) return;
            const img = new Image();
            img.alt = '';
            img.src = URL.createObjectURL(b);
            img.onload = () => URL.revokeObjectURL(img.src);
            slot.replaceChildren(img);
          }, 'image/jpeg', 0.88);
        } catch (err) {
          console.error(err);
        }
      }
      if (queue.length) requestAnimationFrame(step);
      else running = false;
    };
    requestAnimationFrame(step);
  }

  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        seen.unobserve(e.target);
        const f = findFilter(e.target.dataset.id);
        if (f) queue.push({ f, slot: e.target.querySelector('.fcard__img'), kind: e.target.dataset.scene });
      }
      pump();
    },
    { rootMargin: '200px' },
  );

  for (const col of COLLECTIONS) {
    const list = FILTERS.filter((f) => f.cat === col.cat);
    if (!list.length) continue;
    const label = FILTER_CATEGORIES.find((c) => c.id === col.cat)?.label || col.title;
    const sec = el('section', 'feed-sec');
    sec.innerHTML = `<h2 class="section-title">${escapeHtml(col.title)}</h2>`;
    const strip = el('div', 'card-strip');
    strip.setAttribute('aria-label', label);
    for (const f of list) {
      const b = el('button', `fcard${f.ai ? ' is-ai' : ''}`, `<span class="fcard__img"></span><span class="fcard__name">${escapeHtml(f.name)}</span>`);
      b.type = 'button';
      b.dataset.id = f.id;
      b.dataset.scene = col.scene;
      b.addEventListener('click', () => onPick(f));
      strip.append(b);
      seen.observe(b);
    }
    sec.append(strip);
    root.append(sec);
  }

  return {
    // Ana ekrana dönünce: motor bu arada fotoğrafa geçtiyse örnek sahne
    // yeniden yüklenir, bekleyen önizlemeler sürer.
    resume() {
      loaded = null;
      pump();
    },
  };
}

// Araç ızgarası.
export function buildToolGrid(root, onPick) {
  for (const t of HOME_TOOLS) {
    const b = el('button', `htool${t.ai ? ' is-ai' : ''}`, `<span class="htool__icon">${icon(t.icon)}</span><span class="htool__label">${escapeHtml(t.label)}</span>`);
    b.type = 'button';
    b.addEventListener('click', () => onPick(t));
    root.append(b);
  }
}
