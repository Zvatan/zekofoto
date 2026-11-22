// Bulanıklaştır: mercek bulanıklığı (ekran kartında, bkz. shaders.js →
// lensBlur). Akıllı: cihazdaki derinlik modeliyle odaklanılan uzaklık net
// kalır, uzaklaştıkça bulanıklaşır (portre modu); dokunulan yer odak olur.
// Daire ve Doğrusal: net alan parmakla taşınır, boyutu ve açısı ayarlanır.
import { el, busy, toast } from '../ui.js';
import { defaultSpec } from '../gl/engine.js';
import { createOverlay } from './paint.js';
import { labeled, segmented } from './kit.js';

const MODES = [
  { id: 'smart', label: 'Akıllı', icon: 'sparkle' },
  { id: 'circle', label: 'Daire', icon: 'focusCircle' },
  { id: 'linear', label: 'Doğrusal', icon: 'focusLine' },
];

export function blurTool(host, { mode = 'smart' } = {}) {
  const W = host.W;
  const H = host.H;
  const long = Math.max(W, H);
  const st = {
    mode,
    amount: 55,
    bokeh: 35,
    focus: null, // akıllı: odak derinliği
    range: 30, // akıllı: net kalan derinlik aralığı
    center: [0.5, 0.5],
    size: 30, // daire/doğrusal: net alanın boyutu
    angle: 0,
  };
  let overlay = null;
  let ui = null;
  let drag = null;
  let showGuide = 0;
  let guideTimer = 0;

  const radius = () => 0.004 + (st.amount / 100) * 0.05;

  function spec(compare) {
    const s = defaultSpec(W, H);
    if (compare || st.amount <= 0) return s;
    const b = { radius: radius(), bokeh: st.bokeh / 100 };
    if (st.mode === 'smart') {
      if (st.focus === null) return s;
      const tol = 0.02 + (st.range / 100) * 0.3;
      s.blur = { ...b, mode: 1, b: [st.focus - tol, 0.12 + (st.range / 100) * 0.25] };
    } else {
      const r = 0.03 + (st.size / 100) * 0.45;
      const a = (st.angle * Math.PI) / 180;
      s.blur = {
        ...b,
        mode: st.mode === 'circle' ? 2 : 3,
        a: [st.center[0], st.center[1], r * (st.mode === 'linear' ? 0.5 : 1), r * 0.6 + 0.03],
        b: [-Math.sin(a), Math.cos(a)],
      };
    }
    return s;
  }

  function update() {
    host.viewer.invalidate();
    overlay?.invalidate();
  }

  // Net alanın kılavuzu (yalnız ayarlarken görünür).
  function drawGuide(ctx, v) {
    if (!showGuide || st.mode === 'smart') return;
    const sx = (x) => v.ox + x * W * v.s;
    const sy = (y) => v.oy + y * H * v.s;
    const L = long * v.s;
    const r = (0.03 + (st.size / 100) * 0.45) * L;
    const f = (r / L) * 0.6 * L + 0.03 * L;
    ctx.lineWidth = 1.5 * v.dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4 * v.dpr;
    const cx = sx(st.center[0]);
    const cy = sy(st.center[1]);
    if (st.mode === 'circle') {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([6 * v.dpr, 6 * v.dpr]);
      ctx.beginPath();
      ctx.arc(cx, cy, r + f, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const a = (st.angle * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const nx = -dy;
      const ny = dx;
      const ext = Math.hypot(W, H) * v.s;
      const line = (d, dash) => {
        ctx.setLineDash(dash ? [6 * v.dpr, 6 * v.dpr] : []);
        ctx.beginPath();
        ctx.moveTo(cx + nx * d - dx * ext, cy + ny * d - dy * ext);
        ctx.lineTo(cx + nx * d + dx * ext, cy + ny * d + dy * ext);
        ctx.stroke();
      };
      for (const sgn of [-1, 1]) {
        line(sgn * r * 0.5, false);
        line(sgn * (r * 0.5 + f), true);
      }
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, 5 * v.dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  function flashGuide() {
    showGuide = 1;
    clearTimeout(guideTimer);
    guideTimer = setTimeout(() => {
      if (drag) return;
      showGuide = 0;
      overlay?.invalidate();
    }, 900);
    overlay?.invalidate();
  }

  // --- dokunma ------------------------------------------------------------

  const toUV = (e) => {
    const b = host.stage.getBoundingClientRect();
    return host.viewer.toOutput(e.clientX - b.left, e.clientY - b.top);
  };

  function down(e) {
    if (e.button > 0 || host.viewer.pointers.size > 1) {
      drag = null;
      return;
    }
    const [u, v] = toUV(e);
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    if (st.mode === 'smart') {
      // Dokunulan yer odak olur.
      const d = host.ai.depthAt(u, v);
      if (d !== null) {
        st.focus = d;
        update();
      }
      return;
    }
    drag = { id: e.pointerId, du: st.center[0] - u, dv: st.center[1] - v };
    showGuide = 1;
    overlay.invalidate();
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (host.viewer.isGesturing) {
      drag = null;
      return;
    }
    const [u, v] = toUV(e);
    st.center = [Math.min(1, Math.max(0, u + drag.du)), Math.min(1, Math.max(0, v + drag.dv))];
    update();
  }

  function up(e) {
    if (drag && e.pointerId === drag.id) {
      drag = null;
      flashGuide();
    }
  }

  // --- yapay zekâ -----------------------------------------------------------

  async function ensureDepth() {
    if (host.ai.depthReady && st.focus !== null) return true;
    busy.show('Yapay zekâ hazırlanıyor…');
    try {
      const prog = (label) => (p) => busy.text(p < 1 ? `Yapay zekâ modeli indiriliyor… %${Math.round(p * 100)}` : label);
      await host.ai.depth(prog('Derinlik hesaplanıyor…'));
      const faces = await host.ai.faces(prog('Yüz aranıyor…')).catch(() => []);
      // Varsayılan odak: en büyük yüz, yoksa en yakın bölge.
      const f = faces[0];
      st.focus = f ? host.ai.depthAt((f.x + f.w / 2) / W, (f.y + f.h / 2) / H, 4) : host.ai.depthPercentile(0.9);
      return true;
    } catch (err) {
      console.error(err);
      toast('Yapay zekâ çalıştırılamadı: ' + err.message);
      return false;
    } finally {
      busy.hide();
    }
  }

  async function setMode(id) {
    st.mode = id;
    if (id === 'smart' && !(await ensureDepth())) {
      st.mode = 'circle';
      ui?.modes.set('circle');
    }
    buildControls();
    update();
    if (st.mode !== 'smart') flashGuide();
  }

  function buildControls() {
    const c = ui.controls;
    c.replaceChildren();
    const amount = labeled('Bulanıklık', { min: 0, max: 100, value: st.amount, def: 55, onInput: (v) => ((st.amount = v), update()) });
    const bokeh = labeled('Işık noktası', { min: 0, max: 100, value: st.bokeh, def: 35, onInput: (v) => ((st.bokeh = v), update()) });
    c.append(amount.row, bokeh.row);
    if (st.mode === 'smart') {
      const range = labeled('Net alan', { min: 0, max: 100, value: st.range, def: 30, onInput: (v) => ((st.range = v), update()) });
      c.append(range.row, el('p', 'ctl-hint', 'Net kalacak yere dokun.'));
    } else {
      const size = labeled('Net alan', {
        min: 0,
        max: 100,
        value: st.size,
        def: 30,
        onInput: (v) => {
          st.size = v;
          flashGuide();
          update();
        },
      });
      c.append(size.row);
      if (st.mode === 'linear') {
        const ang = labeled('Açı', {
          min: -90,
          max: 90,
          value: st.angle,
          def: 0,
          fmt: (v) => `${Math.round(v)}°`,
          onInput: (v) => {
            st.angle = v;
            flashGuide();
            update();
          },
        });
        c.append(ang.row);
      }
    }
  }

  function mount(body) {
    body.classList.add('panel-blur');
    host.viewer.setContent({ w: W, h: H, spec }, { keepView: true, singlePointer: 'none' });
    overlay = createOverlay(host, drawGuide);
    host.stage.addEventListener('pointerdown', down);
    host.stage.addEventListener('pointermove', move);
    host.stage.addEventListener('pointerup', up);
    host.stage.addEventListener('pointercancel', up);
    const modes = segmented(MODES, st.mode, (id) => setMode(id));
    const controls = el('div', 'blur-controls');
    body.append(modes.el, controls);
    ui = { modes, controls };
    setMode(st.mode);
  }

  return {
    title: 'Bulanıklaştır',
    mount,
    apply() {
      const s = spec(false);
      if (!s.blur) return null;
      return { spec: s, w: W, h: H, label: 'Bulanıklaştır' };
    },
    destroy() {
      clearTimeout(guideTimer);
      host.stage.removeEventListener('pointerdown', down);
      host.stage.removeEventListener('pointermove', move);
      host.stage.removeEventListener('pointerup', up);
      host.stage.removeEventListener('pointercancel', up);
      overlay?.destroy();
    },
  };
}
