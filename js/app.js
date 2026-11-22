// Uygulama denetleyicisi: ana ekran, düzenleyici, araçlar, geçmiş ve kayıt.
import { Engine, defaultSpec } from './gl/engine.js';
import { Viewer } from './viewer.js';
import { History } from './history.js';
import * as store from './store.js';
import { fileToCanvas, scaledCanvas, releaseCanvas, photoDate } from './image-io.js';
import { icon, hydrateIcons, toast, busy, nextFrame, confirmDialog, sheet, escapeHtml, el } from './ui.js';
import { openSave } from './export.js';
import { adjustTool } from './tools/adjust.js';
import { filtersTool } from './tools/filters.js';
import { cropTool } from './tools/crop.js';
import { drawTool } from './tools/draw.js';
import { eraserTool } from './tools/eraser.js';
import { blurTool } from './tools/blur.js';
import { mosaicTool } from './tools/mosaic.js';
import { textTool } from './tools/text.js';
import { backgroundTool } from './tools/background.js';
import { buildToolGrid, buildFeed } from './home.js';
import { estimateDepth } from './ai/depth.js';
import { detectFaces } from './ai/faces.js';

export const VERSION = '0.5.0';
const SCREENS = ['home', 'editor'];
const COMPARE_SIDE = 2048;
const $ = (sel, root = document) => root.querySelector(sel);

// Düzenleyicinin alt çubuğundaki araçlar (Meitu'daki sırayla).
const TOOLS = [
  { id: 'crop', label: 'Düzenle', icon: 'crop', create: cropTool },
  { id: 'adjust', label: 'Ayarla', icon: 'adjust', create: adjustTool },
  { id: 'filters', label: 'Filtreler', icon: 'filter', create: filtersTool },
  { id: 'draw', label: 'Çizim', icon: 'pen', create: drawTool },
  { id: 'eraser', label: 'Silgi', icon: 'eraser', create: eraserTool, ai: true },
  { id: 'blur', label: 'Bulanıklaştır', icon: 'blurDrop', create: blurTool },
  { id: 'mosaic', label: 'Mozaik', icon: 'mosaic', create: mosaicTool },
  { id: 'text', label: 'Metin', icon: 'text', create: textTool },
  { id: 'background', label: 'Arka plan', icon: 'background', create: backgroundTool, ai: true },
];


const app = {
  engine: null,
  viewer: null,
  doc: null, // { canvas, hasAlpha, history, small: Map, compare: { w, h } | null }
  tool: null,
  pendingStart: null,
  resumable: null,
};

// Araçların kullandığı ortak arayüz.
const host = {
  get engine() {
    return app.engine;
  },
  get viewer() {
    return app.viewer;
  },
  get W() {
    return app.doc.canvas.width;
  },
  get H() {
    return app.doc.canvas.height;
  },
  get image() {
    return app.doc.canvas;
  },
  get stage() {
    return $('#stage');
  },
  get overlay() {
    return $('#stage-overlay');
  },
  // Çekim tarihi (tarih damgası için).
  get photoDate() {
    return new Date(app.doc?.history.meta.photoDate || Date.now());
  },
  // Güncel fotoğrafın küçük kopyası (analiz ve histogram için; önbellekli).
  small(side) {
    const m = app.doc.small;
    if (!m.has(side)) m.set(side, scaledCanvas(app.doc.canvas, side));
    return m.get(side);
  },
  // Cihazda yapay zekâ; sonuçlar güncel görüntü değişene kadar saklanır.
  ai: {
    get depthReady() {
      return !!app.doc?.ai.depth;
    },
    get facesReady() {
      return !!app.doc?.ai.faces;
    },
    // { w, h, data } (255 = yakın) ya da null.
    get depthMap() {
      return app.doc?.ai.depth || null;
    },
    // Derinlik haritası (motora da yüklenir).
    depth(onProgress) {
      const d = app.doc;
      if (!d.ai.depthP) {
        d.ai.depthP = estimateDepth(d.canvas, { onProgress }).then((map) => {
          if (app.doc === d && d.ai.depthP) {
            d.ai.depth = map;
            app.engine.setDepth(map);
          }
          return map;
        });
        d.ai.depthP.catch(() => (d.ai.depthP = null));
      }
      return d.ai.depthP;
    },
    faces(onProgress) {
      const d = app.doc;
      if (!d.ai.facesP) {
        const small = host.small(1280);
        const k = d.canvas.width / small.width;
        d.ai.facesP = detectFaces(small, { onProgress }).then((list) => {
          // Küçük kopyadaki kutular özgün piksellere ölçeklenir.
          const faces = list.map((f) => ({ x: f.x * k, y: f.y * k, w: f.w * k, h: f.h * k, score: f.score }));
          if (app.doc === d && d.ai.facesP) d.ai.faces = faces;
          return faces;
        });
        d.ai.facesP.catch(() => (d.ai.facesP = null));
      }
      return d.ai.facesP;
    },
    // Güncel görüntüye ait, bir kez hesaplanan sonuçlar (ör. özne maskesi).
    memo(key, compute) {
      const d = app.doc;
      if (!d.ai.memo.has(key)) {
        const p = compute();
        d.ai.memo.set(key, p);
        p.catch(() => d.ai.memo.delete(key));
      }
      return d.ai.memo.get(key);
    },
    // Derinlik haritasında bir noktanın çevresinin ortancası (0 uzak … 1 yakın);
    // u, v: görüntüde 0..1. Harita yoksa null.
    depthAt(u, v, r = 3) {
      const m = app.doc?.ai.depth;
      if (!m) return null;
      const cx = Math.round(u * m.w - 0.5);
      const cy = Math.round(v * m.h - 0.5);
      const vals = [];
      for (let y = Math.max(0, cy - r); y <= Math.min(m.h - 1, cy + r); y++) {
        for (let x = Math.max(0, cx - r); x <= Math.min(m.w - 1, cx + r); x++) vals.push(m.data[y * m.w + x]);
      }
      if (!vals.length) return null;
      vals.sort((a, b) => a - b);
      return vals[vals.length >> 1] / 255;
    },
    // Derinlik dağılımının bir yüzdeliği (ör. 0.9: en yakın %10'un sınırı).
    depthPercentile(p) {
      const m = app.doc?.ai.depth;
      if (!m) return null;
      const hist = new Uint32Array(256);
      for (let i = 0; i < m.data.length; i += 7) hist[m.data[i]]++;
      let total = 0;
      for (const n of hist) total += n;
      let acc = 0;
      for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc >= p * total) return v / 255;
      }
      return 1;
    },
    // Yüz bölgesi elipsi (gölgelendiricideki uFaceBox): en büyük yüzün ortası,
    // yarıçaplar kutunun 0,55 katı; çıktı koordinatında. Yüz yoksa null.
    faceBox() {
      const d = app.doc;
      const f = d.ai.faces?.[0];
      if (!f) return null;
      const W = d.canvas.width;
      const H = d.canvas.height;
      return [(f.x + f.w / 2) / W, (f.y + f.h / 2) / H, (0.55 * f.w) / W, (0.55 * f.h) / H];
    },
    // Flaşın merkezi ve yarıçapı (gölgelendiricideki uFlashAt): en büyük yüzün
    // ortası, yarıçap yüz yüksekliği × size. Yüz yoksa kadrajın ortası.
    flashAt(size) {
      const d = app.doc;
      const W = d.canvas.width;
      const H = d.canvas.height;
      const f = d.ai.faces?.[0];
      if (!f) return [0.5, 0.45, 0.25];
      const diag = Math.hypot(W, H);
      return [(f.x + f.w / 2) / W, (f.y + f.h / 2) / H, (2 * size * f.h) / diag];
    },
  },
};

const newAi = () => ({ depth: null, depthP: null, faces: null, facesP: null, memo: new Map() });

// --- gezinme -------------------------------------------------------------

function go(name) {
  const level = SCREENS.indexOf(name);
  for (const s of SCREENS) {
    const e = document.getElementById('screen-' + s);
    e.classList.toggle('is-active', s === name);
    e.classList.toggle('is-behind', SCREENS.indexOf(s) < level);
    e.inert = s !== name;
  }
}

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

function showInstallBanner() {
  let dismissed = false;
  try {
    dismissed = localStorage.getItem('zf.installHint') === '1';
  } catch {
    /* yok say */
  }
  if (!isIOS() || isStandalone() || dismissed) return;
  const b = $('#install-banner');
  b.className = 'banner';
  b.innerHTML =
    `${icon('share')}<p><b>Uygulama gibi kullan:</b> Safari’de Paylaş düğmesine dokunup ` +
    `<b>“Ana Ekrana Ekle”</b>yi seç.</p><button class="icon-btn" aria-label="Kapat">${icon('close')}</button>`;
  b.hidden = false;
  b.querySelector('button').addEventListener('click', () => {
    b.hidden = true;
    try {
      localStorage.setItem('zf.installHint', '1');
    } catch {
      /* yok say */
    }
  });
}

function showAbout() {
  sheet((panel, close) => {
    panel.insertAdjacentHTML(
      'beforeend',
      `<div class="sheet__title">Zeko Foto</div>
       <div class="sheet__info">
         <p>Fotoğraflar <b>yalnızca bu cihazda</b> işlenir; hiçbir sunucuya gönderilmez.</p>
         <p>Uygulama bir arşiv tutmaz. Yarım kalan düzenleme, uygulama kapanırsa kaybolmasın diye geçici olarak saklanır.</p>
         <p>Bitirdiğin fotoğrafı <b>Kaydet</b> ile Fotoğraflar’a ekle.</p>
         <p>Sürüm ${VERSION}</p>
       </div>
       <button class="btn btn--secondary btn--block" data-close>Kapat</button>`,
    );
    panel.querySelector('[data-close]').addEventListener('click', () => close());
  });
}

// --- ana ekran -----------------------------------------------------------

let feed = null;

function buildHome() {
  buildToolGrid($('#tool-grid'), (t) => pick('gallery', { tool: t.tool, opts: t.opts }));
  feed = buildFeed($('#home-feed'), {
    engine: app.engine,
    // Motor düzenleyiciyle ortak: önizlemeler yalnız fotoğraf açık değilken.
    active: () => !app.doc,
    onPick: (f) => pick('gallery', { tool: 'filters', opts: { pick: f.id } }),
  });
}

async function refreshResume() {
  const card = $('#resume');
  const h = await History.restore();
  app.resumable = h;
  if (!h) {
    card.hidden = true;
    card.replaceChildren();
    return;
  }
  const blob = await store.getSnap(h.current.key).catch(() => null);
  if (!blob) {
    card.hidden = true;
    return;
  }
  const url = URL.createObjectURL(blob);
  card.hidden = false;
  card.innerHTML =
    `<img class="resume__img" alt="" src="${url}">` +
    `<div class="resume__text"><b>Yarım kalan düzenleme</b><span>${h.meta.entries.length - 1} adım</span></div>` +
    `<button class="btn btn--primary btn--small" data-act="go">Devam et</button>` +
    `<button class="icon-btn" data-act="drop" aria-label="Yarım kalan düzenlemeyi sil">${icon('trash')}</button>`;
  card.querySelector('img').addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
  card.querySelector('[data-act="go"]').addEventListener('click', () => resume());
  card.querySelector('[data-act="drop"]').addEventListener('click', async () => {
    await h.discard();
    app.resumable = null;
    refreshResume();
  });
}

// --- fotoğraf ------------------------------------------------------------

function pick(kind, start = null) {
  app.pendingStart = start;
  const input = $(kind === 'camera' ? '#input-camera' : '#input-gallery');
  input.value = '';
  input.click();
}

async function onPicked(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const start = app.pendingStart;
  app.pendingStart = null;
  busy.show('Fotoğraf açılıyor…');
  await nextFrame();
  try {
    const { canvas, hasAlpha, scaled } = await fileToCanvas(file);
    // Küçültülmediyse özgün dosya ilk adım olarak saklanır (yeniden kodlama yok).
    const original = !scaled && /^image\/(jpeg|png)$/i.test(file.type) ? file : null;
    const date = await photoDate(file);
    const history = await History.start(canvas, { hasAlpha, original, photoDate: date.getTime() });
    const cmp = scaledCanvas(canvas, COMPARE_SIDE);
    openDoc(canvas, hasAlpha, history, cmp);
    releaseCanvas(cmp);
    if (start) openTool(start.tool, start.opts);
    store.requestPersistence();
  } catch (err) {
    console.error(err);
    toast('Fotoğraf açılamadı: ' + err.message);
  } finally {
    busy.hide();
  }
}

async function resume() {
  const h = app.resumable;
  if (!h) return;
  busy.show('Açılıyor…');
  await nextFrame();
  try {
    const { blob } = await h.loadCurrent();
    const { canvas } = await fileToCanvas(blob);
    const orig = await h.originalBlob();
    const cmp = orig ? (await fileToCanvas(orig, COMPARE_SIDE)).canvas : null;
    openDoc(canvas, h.meta.hasAlpha, h, cmp);
    releaseCanvas(cmp);
  } catch (err) {
    console.error(err);
    toast('Düzenleme açılamadı');
  } finally {
    busy.hide();
  }
}

function openDoc(canvas, hasAlpha, history, compareCanvas) {
  closeDoc();
  app.doc = { canvas, hasAlpha, history, small: new Map(), compare: null, ai: newAi() };
  app.engine.setSource(canvas);
  app.engine.setDepth(null);
  app.engine.setCompare(compareCanvas);
  if (compareCanvas) {
    const first = history.meta.entries[0];
    app.doc.compare = { w: first.w, h: first.h };
  }
  go('editor');
  showMain(false);
  updateBar();
}

function closeDoc() {
  if (app.tool) closeTool(false);
  const d = app.doc;
  if (!d) return;
  for (const c of d.small.values()) releaseCanvas(c);
  const c = d.canvas;
  d.history.settled().then(() => releaseCanvas(c));
  app.doc = null;
  app.engine.setCompare(null);
  app.engine.setDepth(null);
  app.engine.trim();
}

// Güncel görüntüyü değiştirir; eskisi diske yazıldıktan sonra bırakılır.
function replaceCurrent(canvas) {
  const d = app.doc;
  const old = d.canvas;
  d.canvas = canvas;
  for (const c of d.small.values()) releaseCanvas(c);
  d.small.clear();
  // Derinlik ve yüzler eski görüntüye aitti.
  d.ai = newAi();
  app.engine.setDepth(null);
  app.engine.setSource(canvas);
  d.history.settled().then(() => {
    if (app.doc?.canvas !== old) releaseCanvas(old);
  });
}

// --- düzenleyici ---------------------------------------------------------

function showMain(keepView = true) {
  const d = app.doc;
  if (!d) return;
  const w = d.canvas.width;
  const h = d.canvas.height;
  const content = { w, h, spec: () => defaultSpec(w, h) };
  if (d.compare && d.history.canUndo) {
    const { w: cw, h: ch } = d.compare;
    content.compare = { w: cw, h: ch, spec: () => ({ ...defaultSpec(cw, ch), source: 'compare' }) };
  }
  app.viewer.setContent(content, { keepView });
}

function updateBar() {
  const h = app.doc?.history;
  $('#btn-undo').disabled = !h?.canUndo;
  $('#btn-redo').disabled = !h?.canRedo;
  $('#btn-compare').hidden = app.tool ? app.tool.compare === false : !h?.canUndo;
}

function buildToolbar() {
  const bar = $('#toolbar');
  for (const t of TOOLS) {
    const b = el('button', `tool${t.ai ? ' tool--ai' : ''}`, `${icon(t.icon)}<span>${escapeHtml(t.label)}</span>`);
    b.dataset.tool = t.id;
    b.addEventListener('click', () => openTool(t.id));
    bar.append(b);
  }
}

function openTool(id, opts = {}) {
  if (!app.doc) return;
  if (app.tool) closeTool(false);
  const def = TOOLS.find((t) => t.id === id);
  const tool = def.create(host, opts);
  app.tool = tool;
  $('#tool-title').textContent = tool.title;
  const body = $('#tool-body');
  body.className = 'tool-panel__body';
  body.replaceChildren();
  document.body.classList.add('is-tool');
  $('#tool-panel').hidden = false;
  $('#toolbar').hidden = true;
  updateBar();
  try {
    tool.mount(body);
  } catch (err) {
    console.error(err);
    toast('Araç açılamadı: ' + err.message);
    closeTool();
  }
}

function closeTool(show = true) {
  const t = app.tool;
  if (!t) return;
  t.destroy();
  app.tool = null;
  $('#tool-body').replaceChildren();
  $('#stage-overlay').replaceChildren();
  $('#tool-panel').hidden = true;
  $('#toolbar').hidden = false;
  document.body.classList.remove('is-tool');
  app.engine.setLuts({});
  if (show) showMain(false);
  updateBar();
}

async function applyTool() {
  const t = app.tool;
  if (!t || document.body.classList.contains('is-busy')) return;
  const res = t.apply();
  if (!res) {
    closeTool();
    return;
  }
  busy.show('Uygulanıyor…');
  await nextFrame();
  try {
    // Fırçalı araçlar sonucu kendileri üretir (render); diğerleri motorla çizilir.
    const out = res.render ? await res.render() : app.engine.renderImage(res.spec, res.w, res.h);
    // Ekran kartı dışında çizilenler (ör. tarih damgası).
    await res.post?.(out);
    if (res.alpha && !app.doc.hasAlpha) {
      // Saydam sonuç (ör. arka planı silinmiş): PNG olarak saklanır ve kaydedilir.
      app.doc.hasAlpha = true;
      app.doc.history.meta.hasAlpha = true;
    }
    replaceCurrent(out);
    app.doc.history.push(out, res.label).catch((err) => {
      console.error(err);
      toast('Geçmiş kaydedilemedi');
    });
    closeTool();
  } catch (err) {
    console.error(err);
    toast('Uygulanamadı: ' + err.message);
  } finally {
    busy.hide();
  }
}

async function step(dir) {
  const h = app.doc?.history;
  if (!h || app.tool || document.body.classList.contains('is-busy')) return;
  if (dir < 0 ? !h.canUndo : !h.canRedo) return;
  const label = dir < 0 ? h.current.label : h.meta.entries[h.meta.index + 1].label;
  busy.show();
  try {
    const r = dir < 0 ? await h.undo() : await h.redo();
    if (!r) return;
    const { canvas } = await fileToCanvas(r.blob);
    replaceCurrent(canvas);
    showMain(false);
    toast(`${dir < 0 ? 'Geri alındı' : 'Yinelendi'}: ${label}`, { duration: 1400 });
  } catch (err) {
    console.error(err);
    toast('Geçmiş adımı açılamadı');
  } finally {
    updateBar();
    busy.hide();
  }
}

async function exitEditor() {
  const d = app.doc;
  if (!d) return;
  if (d.history.edited) {
    const ok = await confirmDialog({
      title: 'Düzenlemeden çıkılsın mı?',
      message: 'Kaydetmediğin değişiklikler silinir.',
      ok: 'Çık',
      danger: true,
    });
    if (!ok) return;
  }
  const h = d.history;
  closeDoc();
  go('home');
  feed?.resume();
  await h.discard().catch(() => {});
  refreshResume();
}

// --- bağlama -------------------------------------------------------------

function bind() {
  hydrateIcons();
  buildHome();
  buildToolbar();
  $('#input-camera').addEventListener('change', onPicked);
  $('#input-gallery').addEventListener('change', onPicked);
  document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => pick(b.dataset.pick)));
  $('#home-info').addEventListener('click', showAbout);
  $('#btn-close').addEventListener('click', exitEditor);
  $('#btn-undo').addEventListener('click', () => step(-1));
  $('#btn-redo').addEventListener('click', () => step(1));
  $('#btn-save').addEventListener('click', () => app.doc && !app.tool && openSave(app.doc));
  $('#tool-cancel').addEventListener('click', () => closeTool());
  $('#tool-apply').addEventListener('click', applyTool);

  // Basılı tutunca önceki hal görünür.
  const cmp = $('#btn-compare');
  const on = (e) => {
    e.preventDefault();
    // Sahne de pointerdown dinler; olayı alırsa yakalamayı düğmeden çalar ve
    // parmak kalkınca karşılaştırma kapanmaz.
    e.stopPropagation();
    cmp.setPointerCapture?.(e.pointerId);
    app.viewer.setCompare(true);
  };
  const off = () => app.viewer.setCompare(false);
  cmp.addEventListener('pointerdown', on);
  cmp.addEventListener('pointerup', off);
  cmp.addEventListener('pointercancel', off);
  cmp.addEventListener('lostpointercapture', off);
  cmp.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (!app.doc || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    step(e.shiftKey ? 1 : -1);
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // İlk kurulumda denetleyici değişimi yeniden yükleme gerektirmez.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => {
      toast('Yeni sürüm hazır', {
        action: 'Yenile',
        onAction: () => worker.postMessage({ type: 'activate' }),
      });
    };
    if (!hadController) return; // ilk kurulum: güncelleme teklif edilmez
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed') offer(w);
      });
    });
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    location.reload();
  });
}

function fatal(message) {
  document.getElementById('app').innerHTML = `<div class="fatal">${icon('info')}<h2>Bu cihazda açılamadı</h2><p>${escapeHtml(message)}</p></div>`;
}

async function main() {
  try {
    app.engine = new Engine($('#gl'));
  } catch (err) {
    console.error(err);
    fatal(`${err.message}. iOS 15 ya da daha yeni bir sürümle Safari'de açmayı deneyin.`);
    return;
  }
  app.viewer = new Viewer($('#stage'), app.engine);
  app.engine.onRestore = async () => {
    // Ekran kartı bağlamı geri geldi: dokular yeniden yüklenir.
    const d = app.doc;
    if (!d) return;
    app.engine.setSource(d.canvas);
    const orig = await d.history.originalBlob().catch(() => null);
    if (orig && app.doc === d) {
      const { canvas } = await fileToCanvas(orig, COMPARE_SIDE);
      app.engine.setCompare(canvas);
      releaseCanvas(canvas);
    }
    app.viewer.invalidate();
  };
  bind();
  go('home');
  showInstallBanner();
  refreshResume().catch((err) => console.error(err));
  registerServiceWorker();
}

main();

// Uçtan uca testler için.
export { app, host, openTool, applyTool, step };
