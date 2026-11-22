// Görüntü motoru: WebGL2 ile önizleme ve tam çözünürlüklü çıktı.
//
// Kaynak fotoğraf mip seviyeli bir dokuya yüklenir; önizleme ekrandaki
// boyutta, çıktı ise 2048'lik karolar halinde ara dokuya çizilip readPixels
// ile 2B tuvale aktarılır. Karolar bellek tepe noktasını sınırlar ve
// tuval boyutunu değiştirmeyi (titreme) gerektirmez.
//
// "spec" bir çizim tarifidir (bkz. araçlar):
//   { source: 'main'|'compare', matrix, outW, outH,
//     pre, post, postAmount, tone: [vurgu, gölge, netlik], fx: [keskinlik, gren, vinyet],
//     seed, effect: null | { id, amount, radius }, outside: [r, g, b] }
import { VERT, DEVELOP_FRAG, EFFECT_FRAG, BLUR_FRAG } from './shaders.js';
import { LUT_SIZE } from '../core/color.js';
import { IDENTITY_RENDER } from '../core/geometry.js';

export const TILE = 2048;
const GUIDE_SIDE = 384;
const GUIDE_SIGMA = 6;
const BG = [0, 0, 0];

function gaussTaps(sigma) {
  const R = Math.ceil(sigma * 3);
  let k = [];
  let sum = 0;
  for (let i = 0; i <= R; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    sum += i ? 2 * v : v;
  }
  k = k.map((v) => v / sum);
  const W = [k[0]];
  const O = [0];
  for (let i = 1; i <= R; i += 2) {
    const a = k[i];
    const b = i + 1 <= R ? k[i + 1] : 0;
    W.push(a + b);
    O.push((i * a + (i + 1) * b) / (a + b));
  }
  while (W.length < 12) {
    W.push(0);
    O.push(0);
  }
  return { W: new Float32Array(W.slice(0, 12)), O: new Float32Array(O.slice(0, 12)), n: Math.min(12, Math.ceil(R / 2) + 1) };
}

const GAUSS = gaussTaps(GUIDE_SIGMA);

export function defaultSpec(w, h) {
  return {
    source: 'main',
    matrix: IDENTITY_RENDER,
    outW: w,
    outH: h,
    pre: false,
    post: false,
    postAmount: 1,
    tone: [0, 0, 0],
    fx: [0, 0, 0],
    seed: 0,
    // Kamera ekleri: parlama, hale, eşik | renk kayması, flaş, yumuşaklık, gürültü
    glow: [0, 0, 0.62],
    lens: [0, 0, 0, 0],
    leak: null, // { color: [r, g, b], at: [x, y], size, amount }
    flashAt: [0.5, 0.5, 1], // flaş merkezi (çıktı 0..1) ve yarıçapı
    depthMix: null, // { center, width }: yakın plan "fg" tablosuyla (derinlik haritası gerekir)
    effect: null,
    outside: [0.08, 0.08, 0.09],
  };
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('Bu cihazda WebGL2 kullanılamıyor');
    this.gl = gl;
    this.lost = false;
    this.onRestore = null;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this._init();
      if (this.depthMap) this.setDepth(this.depthMap);
      this.onRestore?.();
    });
    this.depthMap = null;
    this._init();
  }

  _init() {
    const gl = this.gl;
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.vao = gl.createVertexArray();
    this.pDevelop = this._program(DEVELOP_FRAG, 'develop');
    this.pEffect = this._program(EFFECT_FRAG, 'effect');
    this.pBlur = this._program(BLUR_FRAG, 'blur');
    this.src = null;
    this.cmp = null;
    this.guide = null;
    this.tile = null;
    this.lutPre = this._lut3d();
    this.lutPost = this._lut3d();
    this.lutFg = this._lut3d();
    this.depthTex = null;
    this.blank = this._tex2d(1, 1, new Uint8Array([0, 0, 0, 255]));
  }

  // Derinlik haritası (0 uzak … 255 yakın), güncel kaynak için. null: kaldır.
  setDepth(map) {
    const gl = this.gl;
    this.depthMap = map;
    if (this.depthTex) gl.deleteTexture(this.depthTex);
    this.depthTex = null;
    if (!map) return;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    // Tek kanallı satırlar 4 baytın katı olmayabilir.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, map.w, map.h, 0, gl.RED, gl.UNSIGNED_BYTE, map.data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.depthTex = t;
  }

  _program(frag, name) {
    const gl = this.gl;
    const compile = (type, text) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const log = gl.getShaderInfoLog(s);
        throw new Error(`Gölgelendirici derlenemedi (${name}): ${log}`);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`Gölgelendirici bağlanamadı (${name}): ${gl.getProgramInfoLog(p)}`);
    }
    const loc = new Proxy(
      {},
      {
        get: (cache, key) => {
          if (!(key in cache)) cache[key] = gl.getUniformLocation(p, key);
          return cache[key];
        },
      },
    );
    return { p, loc };
  }

  _tex2d(w, h, data = null, { mips = false } = {}) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  _target(w, h) {
    const gl = this.gl;
    const tex = this._tex2d(w, h);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  _freeTarget(t) {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  _lut3d() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, t);
    const n = LUT_SIZE;
    // RGBA16F doğrusal süzülebilir (ES 3.0); kayan noktalı veri doğrudan yüklenir.
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, null);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  // --- kaynaklar --------------------------------------------------------

  // Ana kaynak (düzenlenen fotoğraf). source: tuval ya da ImageBitmap.
  setSource(source) {
    const gl = this.gl;
    if (this.src) gl.deleteTexture(this.src.tex);
    const w = source.width;
    const h = source.height;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.src = { tex, w, h };
    this._buildGuide();
  }

  // Karşılaştırma için özgün fotoğrafın küçük kopyası.
  setCompare(source) {
    const gl = this.gl;
    if (this.cmp) gl.deleteTexture(this.cmp.tex);
    this.cmp = null;
    if (!source) return;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.cmp = { tex, w: source.width, h: source.height };
  }

  // Yerel ton işlemleri için küçük ve bulanık kopya.
  _buildGuide() {
    const gl = this.gl;
    const { w, h } = this.src;
    const s = Math.min(1, GUIDE_SIDE / Math.max(w, h));
    const gw = Math.max(1, Math.round(w * s));
    const gh = Math.max(1, Math.round(h * s));
    if (!this.guide || this.guide.a.w !== gw || this.guide.a.h !== gh) {
      if (this.guide) {
        this._freeTarget(this.guide.a);
        this._freeTarget(this.guide.b);
      }
      this.guide = { a: this._target(gw, gh), b: this._target(gw, gh) };
    }
    const { p, loc } = this.pBlur;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.uniform1i(loc.uIn, 0);
    gl.uniform2f(loc.uSize, gw, gh);
    gl.uniform1fv(loc.uW, GAUSS.W);
    gl.uniform1fv(loc.uO, GAUSS.O);
    gl.uniform1i(loc.uTaps, GAUSS.n);
    gl.activeTexture(gl.TEXTURE0);
    gl.viewport(0, 0, gw, gh);
    const pass = (from, to, mode, dir, texel) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
      gl.bindTexture(gl.TEXTURE_2D, from);
      gl.uniform1i(loc.uMode, mode);
      gl.uniform2f(loc.uDir, dir[0], dir[1]);
      gl.uniform2f(loc.uTexel, texel[0], texel[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    pass(this.src.tex, this.guide.a, 0, [0, 0], [1 / w, 1 / h]);
    pass(this.guide.a.tex, this.guide.b, 1, [1, 0], [1 / gw, 1 / gh]);
    pass(this.guide.b.tex, this.guide.a, 1, [0, 1], [1 / gw, 1 / gh]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // data: Float32Array (LUT_SIZE³ × 4) ya da null (kapalı). fg: yakın plan tablosu.
  setLuts({ pre, post, fg } = {}) {
    const gl = this.gl;
    const n = LUT_SIZE;
    for (const [data, tex] of [[pre, this.lutPre], [post, this.lutPost], [fg, this.lutFg]]) {
      if (!data) continue;
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, n, n, n, gl.RGBA, gl.FLOAT, data);
    }
  }

  // --- çizim ------------------------------------------------------------

  _draw(spec, view, tw, th, { flip, checker, cell = 10 }) {
    const gl = this.gl;
    const prog = spec.effect ? this.pEffect : this.pDevelop;
    const { p, loc } = prog;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    const src = spec.source === 'compare' && this.cmp ? this.cmp : this.src;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src ? src.tex : this.blank);
    gl.uniform1i(loc.uSrc, 0);
    gl.uniformMatrix3fv(loc.uH, false, spec.matrix);
    gl.uniform4f(loc.uView, view[0], view[1], view[2], view[3]);
    gl.uniform2f(loc.uTarget, tw, th);
    gl.uniform1f(loc.uFlip, flip ? 1 : 0);
    gl.uniform2f(loc.uOut, spec.outW, spec.outH);
    gl.uniform3fv(loc.uBg, BG);
    gl.uniform3fv(loc.uOutside, spec.outside || BG);
    gl.uniform1f(loc.uChecker, checker ? 1 : 0);
    gl.uniform1f(loc.uCell, cell);

    if (spec.effect) {
      const e = spec.effect;
      const long = Math.max(src.w, src.h);
      gl.uniform1i(loc.uEffect, e.id);
      gl.uniform1f(loc.uAmt, e.amount);
      const rpx = Math.max(1.5, e.radius * long);
      gl.uniform2f(loc.uR, rpx / src.w, rpx / src.h);
    } else {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.guide && spec.source !== 'compare' ? this.guide.a.tex : this.blank);
      gl.uniform1i(loc.uGuide, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_3D, this.lutPre);
      gl.uniform1i(loc.uPre, 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_3D, this.lutPost);
      gl.uniform1i(loc.uPost, 3);
      gl.uniform3f(loc.uLut, LUT_SIZE, spec.pre ? 1 : 0, spec.post ? 1 : 0);
      gl.uniform1f(loc.uPostAmt, spec.postAmount ?? 1);
      const t = spec.tone || [0, 0, 0];
      gl.uniform3f(loc.uTone, t[0], t[1], t[2]);
      const f = spec.fx || [0, 0, 0];
      gl.uniform4f(loc.uFx, f[0], f[1], f[2], spec.seed || 0);
      const glow = spec.source === 'compare' ? [0, 0, 0.62] : spec.glow || [0, 0, 0.62];
      gl.uniform4f(loc.uGlow, glow[0], glow[1], glow[2] ?? 0.62, 0);
      const minSide = Math.min(src.w, src.h);
      gl.uniform2f(loc.uGlowR, (0.028 * minSide) / src.w, (0.028 * minSide) / src.h);
      const l = spec.lens || [0, 0, 0, 0];
      gl.uniform4f(loc.uLens, l[0], l[1], l[2], l[3]);
      const long = Math.max(src.w, src.h);
      gl.uniform2f(loc.uSoftR, (0.0006 * long) / src.w, (0.0006 * long) / src.h);
      const k = spec.leak;
      gl.uniform4f(loc.uLeak, k ? k.color[0] : 0, k ? k.color[1] : 0, k ? k.color[2] : 0, k ? k.amount : 0);
      gl.uniform3f(loc.uLeakAt, k ? k.at[0] : 0, k ? k.at[1] : 0, k ? k.size : 1);
      const fa = spec.flashAt || [0.5, 0.5, 1];
      gl.uniform3f(loc.uFlashAt, fa[0], fa[1], Math.max(0.01, fa[2]));
      // Derinlik geçişi yalnız ana kaynakta ve harita hazırsa.
      const dm = spec.source !== 'compare' && this.depthTex ? spec.depthMix : null;
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.depthTex || this.blank);
      gl.uniform1i(loc.uDepth, 4);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_3D, this.lutFg);
      gl.uniform1i(loc.uFg, 5);
      gl.uniform3f(loc.uDepthMix, dm ? 1 : 0, dm ? dm.center : 0, dm ? Math.max(0.001, dm.width) : 0);
      if (dm) {
        const m = this.depthMap;
        gl.uniform3f(loc.uDepthTex, m.w, m.h, Math.max(0, Math.log2(src.w / m.w)));
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Önizleme: view, tuval pikselini (yukarıdan aşağı) çıktı koordinatına
  // çeviren [ölçekX, ölçekY, kaymaX, kaymaY] dizisidir.
  renderView(spec, view, cell) {
    if (this.lost || !this.src) return;
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    this._draw(spec, view, width, height, { flip: true, checker: true, cell });
  }

  // Tam çözünürlüklü çıktı: yeni bir 2B tuval döner.
  renderImage(spec, outW, outH) {
    if (this.lost) throw new Error('Ekran kartı bağlamı kayboldu, tekrar deneyin');
    const gl = this.gl;
    const T = Math.min(TILE, this.maxTexture);
    const tw0 = Math.min(T, outW);
    const th0 = Math.min(T, outH);
    if (!this.tile || this.tile.w < tw0 || this.tile.h < th0) {
      this._freeTarget(this.tile);
      this.tile = this._target(Math.max(tw0, this.tile?.w || 0), Math.max(th0, this.tile?.h || 0));
    }
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    const buf = new Uint8ClampedArray(tw0 * th0 * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tile.fbo);
    for (let ty = 0; ty < outH; ty += T) {
      for (let tx = 0; tx < outW; tx += T) {
        const tw = Math.min(T, outW - tx);
        const th = Math.min(T, outH - ty);
        gl.viewport(0, 0, tw, th);
        const view = [1 / outW, 1 / outH, tx / outW, ty / outH];
        this._draw(spec, view, tw, th, { flip: false, checker: false });
        const px = new Uint8ClampedArray(buf.buffer, 0, tw * th * 4);
        gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, px);
        ctx.putImageData(new ImageData(px, tw, th), tx, ty);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  // Ara karo dokusunu bırakır (iOS'ta bellek).
  trim() {
    this._freeTarget(this.tile);
    this.tile = null;
  }
}
