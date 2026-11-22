// Silgi: istenmeyen nesnenin üstü fırçayla boyanır, parmak kalkınca yapay
// zekâ (MI-GAN, cihazda) o bölgeyi çevresine uygun doldurur. Art arda silinebilir;
// her silme geri alınabilir. Doldurma, boyanan yerin çevresinden kırpılan
// (en çok 1024 piksellik) bölgede yapılır ve yalnız boyanan yere, yumuşak
// kenarla yerleştirilir: fotoğrafın geri kalanı piksel piksel aynı kalır.
import { el, icon, busy, toast } from '../ui.js';
import { createCanvas, releaseCanvas } from '../image-io.js';
import { defaultSpec } from '../gl/engine.js';
import { inpaint } from '../ai/inpaint.js';
import { createPainter, createOverlay, tracePath, strokesBounds, historyButtons, BRUSH_MIN, BRUSH_MAX } from './paint.js';
import { labeled } from './kit.js';


export function eraserTool(host) {
  const W = host.W;
  const H = host.H;
  const st = { size: 36 };
  let work = null; // düzenlenen tam boy kopya
  let painter = null;
  let overlay = null;
  let hist = null;
  let running = false;
  const undo = [];
  const redo = [];

  function drawOverlay(ctx, v) {
    const s = painter?.current;
    if (!s) return;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 64, 110, 0.55)';
    ctx.lineWidth = s.width * v.s;
    tracePath(ctx, s.points, v.s, v.ox, v.oy);
    ctx.stroke();
  }

  function refresh() {
    hist?.update(undo.length > 0 && !running, redo.length > 0 && !running);
  }

  function show() {
    host.engine.setSource(work);
    host.viewer.invalidate();
  }

  // Bir dikdörtgenin anlık kopyası (geri al/yinele için).
  function snap(r) {
    const c = createCanvas(r.w, r.h);
    c.getContext('2d').drawImage(work, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    return c;
  }

  async function erase(stroke) {
    const b = strokesBounds([stroke], W, H, 2 + stroke.width * 0.08);
    if (!b) return;
    // MI-GAN deliğin çevresinden sabit 128 piksel bağlam alıp 512'ye ölçekler.
    // Büyük delikte bu bağlam oransal olarak küçülür ve dolgu bozulur; bu
    // yüzden bölge, delik modelde ~220 piksel olacak kadar küçültülür.
    const k = Math.min(1, 220 / Math.max(b.w, b.h));
    const pad = Math.ceil(170 / k);
    const x0 = Math.max(0, b.x - pad);
    const y0 = Math.max(0, b.y - pad);
    const r = { x: x0, y: y0, w: Math.min(W, b.x + b.w + pad) - x0, h: Math.min(H, b.y + b.h + pad) - y0 };
    const cw = Math.max(8, Math.round(r.w * k));
    const ch = Math.max(8, Math.round(r.h * k));
    // Model girdisi: bölgenin küçültülmüş kopyası + maske (0 = doldur).
    const crop = createCanvas(cw, ch);
    const cg = crop.getContext('2d', { willReadFrequently: true });
    cg.imageSmoothingQuality = 'high';
    cg.drawImage(work, r.x, r.y, r.w, r.h, 0, 0, cw, ch);
    const mc = createCanvas(cw, ch);
    const mg = mc.getContext('2d', { willReadFrequently: true });
    mg.fillStyle = '#fff';
    mg.fillRect(0, 0, cw, ch);
    mg.strokeStyle = '#000';
    mg.lineCap = mg.lineJoin = 'round';
    // Boyanan yerden biraz geniş: nesnenin kenarı ve gölgesi de dolsun.
    mg.lineWidth = stroke.width * k * 1.15 + 4;
    tracePath(mg, stroke.points, k, -r.x * k, -r.y * k);
    mg.stroke();
    const md = mg.getImageData(0, 0, cw, ch).data;
    const keep = new Uint8Array(cw * ch);
    for (let i = 0; i < keep.length; i++) keep[i] = md[i * 4] > 127 ? 255 : 0;
    const filled = await inpaint(crop, keep, {
      onProgress: (p) => busy.text(p < 1 ? `Yapay zekâ modeli indiriliyor… %${Math.round(p * 100)}` : 'Siliniyor…'),
    });
    cg.putImageData(new ImageData(filled, cw, ch), 0, 0);
    // Tam boyda yerleştirme: yalnız boyanan yer, yumuşak kenarla.
    const before = snap(r);
    const patch = createCanvas(r.w, r.h);
    const pg = patch.getContext('2d');
    pg.lineCap = pg.lineJoin = 'round';
    pg.strokeStyle = '#000';
    pg.lineWidth = stroke.width * 1.15 + 4 / k;
    pg.shadowColor = '#000';
    pg.shadowBlur = Math.max(2, stroke.width * 0.12);
    tracePath(pg, stroke.points, 1, -r.x, -r.y);
    pg.stroke();
    pg.globalCompositeOperation = 'source-in';
    pg.shadowBlur = 0;
    pg.imageSmoothingQuality = 'high';
    pg.drawImage(crop, 0, 0, cw, ch, 0, 0, r.w, r.h);
    work.getContext('2d').drawImage(patch, r.x, r.y);
    // Geçici tuvaller hemen bırakılır (iOS'ta tuval belleği sınırlı).
    for (const c of [crop, mc, patch]) releaseCanvas(c);
    undo.push({ r, before, after: snap(r) });
    redo.length = 0;
    show();
  }

  function restore(item, which) {
    work.getContext('2d').drawImage(item[which], item.r.x, item.r.y);
    show();
    refresh();
  }

  function mount(body) {
    body.classList.add('panel-paint');
    work = createCanvas(W, H);
    work.getContext('2d').drawImage(host.image, 0, 0);
    host.viewer.setContent({ w: W, h: H, spec: () => defaultSpec(W, H) }, { keepView: true, singlePointer: 'none' });
    overlay = createOverlay(host, drawOverlay);
    painter = createPainter(host, {
      size: () => st.size,
      enabled: () => !running,
      onMove: () => overlay.invalidate(),
      onEnd: async (s) => {
        painter.clear();
        running = true;
        refresh();
        busy.show('Siliniyor…');
        try {
          await erase(s);
        } catch (err) {
          console.error(err);
          toast('Silinemedi: ' + err.message);
        } finally {
          running = false;
          busy.hide();
          overlay.invalidate(true);
          refresh();
        }
      },
    });
    const top = el('div', 'ctl-row paint-top');
    top.append(el('p', 'ctl-hint', 'Silmek istediğin yerin üstünü boya.'));
    hist = historyButtons(icon, {
      onUndo: () => {
        const it = undo.pop();
        if (!it) return;
        redo.push(it);
        restore(it, 'before');
      },
      onRedo: () => {
        const it = redo.pop();
        if (!it) return;
        undo.push(it);
        restore(it, 'after');
      },
    });
    top.append(hist.el);
    const size = labeled('Fırça', {
      min: BRUSH_MIN,
      max: BRUSH_MAX,
      value: st.size,
      def: 36,
      onInput: (v) => {
        st.size = v;
        painter.previewSize();
      },
    });
    body.append(top, size.row);
    refresh();
  }

  return {
    title: 'Silgi',
    mount,
    apply() {
      if (!undo.length || running) return null;
      return { label: 'Silgi', render: () => work };
    },
    destroy() {
      painter?.destroy();
      overlay?.destroy();
      // Uygulanmadıysa motor yeniden özgün görüntüyü göstersin.
      if (work && host.image !== work) host.engine.setSource(host.image);
    },
  };
}
