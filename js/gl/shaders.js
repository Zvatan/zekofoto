// GLSL ES 3.00 gölgelendiricileri.
//
// Ortak sözleşme:
//  - Çizim tek bir tam ekran üçgeniyle yapılır (köşe niteliği yok).
//  - Piksel koordinatı yukarıdan aşağıya sayılır. Tuvale çizerken (uFlip=1)
//    WebGL'in alttan başlayan satırları çevrilir; ara dokulara (FBO) çizerken
//    çevrilmez, böylece readPixels satırları doğrudan yukarıdan aşağıya verir.
//  - Kaynak doku koordinatı v aşağı doğrudur (dokular çevrilmeden yüklenir).
//  - iOS'ta mediump 16 bittir; 4096 piksellik dokuda koordinat hassasiyeti için
//    her yerde highp kullanılır.

export const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const PRELUDE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;

uniform sampler2D uSrc;
uniform mat3 uH;        // çıktı (0..1) → kaynak doku koordinatı
uniform vec4 uView;     // çıktı = piksel * uView.xy + uView.zw
uniform vec2 uTarget;   // çizim hedefinin boyutu (piksel)
uniform float uFlip;
uniform vec2 uOut;      // çıktı görüntüsünün boyutu (piksel)
uniform vec3 uBg;       // görüntü dışı (önizleme)
uniform vec3 uOutside;  // fotoğrafın dışında kalan çerçeve alanı (kırpma görünümü)
uniform float uChecker; // 1: saydam alanlar dama deseni üstünde gösterilir
uniform float uCell;    // dama hücresi (piksel)

out vec4 outColor;

vec2 gO;   // çıktı koordinatı
vec2 gDx;  // komşu çıktı pikseline geçince doku koordinatındaki değişim
vec2 gDy;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Sinüssüz özet fonksiyonu (Dave Hoskins); büyük koordinatlarda da kararlı.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 checker(vec2 px) {
  vec2 q = floor(px / uCell);
  return mod(q.x + q.y, 2.0) < 1.0 ? vec3(0.22) : vec3(0.3);
}

// Ortak giriş: çıktı ve kaynak koordinatını hesaplar. Görüntü dışındaysa
// rengi yazıp false döner.
bool locate(out vec2 uv, out vec2 px) {
  px = vec2(gl_FragCoord.x, uFlip > 0.5 ? uTarget.y - gl_FragCoord.y : gl_FragCoord.y);
  gO = px * uView.xy + uView.zw;
  vec3 h = uH * vec3(gO, 1.0);
  uv = h.xy / h.z;
  // Türevler dallanmadan önce alınmalı.
  gDx = dFdx(uv);
  gDy = dFdy(uv);
  if (any(lessThan(gO, vec2(0.0))) || any(greaterThan(gO, vec2(1.0)))) {
    outColor = vec4(uBg, 1.0);
    return false;
  }
  // Kırpma sınırında kayan nokta hatası kenarda koyu çizgi bırakmasın:
  // bir çizim pikseli kadar taşma kenara kenetlenir.
  vec2 tol = abs(gDx) + abs(gDy);
  if (any(lessThan(uv, -tol)) || any(greaterThan(uv, 1.0 + tol))) {
    outColor = vec4(uOutside, 1.0);
    return false;
  }
  uv = clamp(uv, 0.0, 1.0);
  return true;
}

void finish(vec3 c, float a, vec2 px) {
  c = clamp(c, 0.0, 1.0);
  if (uChecker > 0.5) {
    outColor = vec4(mix(checker(px), c, a), 1.0);
  } else {
    outColor = vec4(c, a);
  }
}

// Görüntüye göre ölçeklenen doku: önizlemede ve çıktıda aynı iri görünür.
vec2 grainCoord() {
  return gO * uOut / max(1.0, max(uOut.x, uOut.y) / 1500.0);
}
`;

// Ana işlem: (keskinlik) → ön tablo → yerel ton → son tablo → vinyet → gren.
export const DEVELOP_FRAG = `${PRELUDE}
uniform sampler2D uGuide;  // küçük, bulanık kopya (yerel ortalama)
uniform sampler3D uPre;
uniform sampler3D uPost;
uniform vec3 uLut;         // x: tablo boyutu, y: ön tablo açık, z: son tablo açık
uniform float uPostAmt;    // son tablonun karışım oranı (filtre yoğunluğu)
uniform vec3 uTone;        // vurgular, gölgeler, netlik (-1..1)
uniform vec4 uFx;          // keskinlik (0..1), gren (0..1), vinyet (-1..1), gren tohumu
// Kamera ekleri (bkz. presets.js → extras):
uniform vec4 uGlow;        // parlama, kırmızı hale, parlama eşiği
uniform vec2 uGlowR;       // parlama yarıçapı (doku koordinatı)
uniform vec4 uLens;        // renk kayması, flaş, yumuşaklık, dijital gürültü
uniform vec2 uSoftR;       // yumuşaklık yarıçapı (doku koordinatı)
uniform vec4 uLeak;        // ışık sızması: renk (rgb) ve miktar
uniform vec3 uLeakAt;      // ışık sızmasının merkezi (çıktı koordinatı) ve yarıçapı
uniform vec3 uFlashAt;     // flaşın merkezi (çıktı koordinatı) ve yarıçapı (1: köşelere kadar)
// Derinliğe göre iki renk dönüşümü (yakın/uzak), ör. flaşlı kamera filtreleri:
uniform sampler2D uDepth;  // 0 uzak … 1 yakın (kaynak doku koordinatında)
uniform sampler3D uFg;     // yakın plan için son tablo
uniform vec3 uDepthMix;    // x: açık, y: geçiş merkezi, z: geçiş genişliği
uniform vec3 uDepthTex;    // derinlik haritasının boyutu (x, y) ve kaynağın ona denk mip seviyesi
uniform float uGain[8];    // derinliğe göre ışık eğrisi (düğümler: GK)
uniform float uGainOn;     // eğrinin miktarı (filtre yoğunluğu; 0: kapalı)
// Yüz bölgesi kendi tablosuyla (algılanan yüzün çevresinde yumuşak elips):
uniform sampler3D uFaceLut;
uniform vec4 uFaceBox;     // elips merkezi (x, y) ve yarıçapları (x, y), çıktı koordinatında
uniform float uFaceOn;

const float GK[8] = float[8](0.0, 0.15, 0.3, 0.4, 0.5, 0.6, 0.75, 1.0);

float depthGain(float d) {
  for (int i = 0; i < 7; i++) {
    if (d <= GK[i + 1]) return mix(uGain[i], uGain[i + 1], (d - GK[i]) / (GK[i + 1] - GK[i]));
  }
  return uGain[7];
}

// Derinlik haritası kaynaktan küçük: kenarları fotoğrafın kenarlarına oturtmak
// için komşu derinlikler, renkleri bu pikselin rengine benzedikçe ağırlıklı
// alınır (joint bilateral). Yoksa nesnenin çevresinde ışık halesi oluşur.
float depthAt(vec2 uv, vec3 c0) {
  vec2 ts = 1.0 / uDepthTex.xy;
  float sw = 0.0;
  float sd = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j)) * ts;
      vec3 cs = textureLod(uSrc, uv + o, uDepthTex.z).rgb;
      vec3 dc = cs - c0;
      float w = exp(-dot(dc, dc) * 40.0) * (i == 0 && j == 0 ? 1.0 : 0.7);
      sw += w;
      sd += w * textureLod(uDepth, uv + o, 0.0).r;
    }
  }
  return sd / max(sw, 1e-4);
}

// Erken dönüşten sonra örtük türev tanımsızdır; tablolarda mip yok, Lod 0 yeterli.
vec3 lut(sampler3D t, vec3 c) {
  float n = uLut.x;
  return textureLod(t, clamp(c, 0.0, 1.0) * ((n - 1.0) / n) + 0.5 / n, 0.0).rgb;
}

vec3 localTone(vec3 c, vec3 g) {
  float hi = uTone.x;
  float sh = uTone.y;
  float cl = uTone.z;
  if (cl < 0.0) c = mix(c, g, -cl * 0.65);
  float L = max(luma(c), 0.0);
  float Lb = luma(g);
  float Lg = mix(L, Lb, 0.75);
  float Lt = L;
  if (sh != 0.0) {
    float w = 1.0 - smoothstep(0.0, 0.65, Lg);
    float k = sh * w * w;
    Lt = k > 0.0 ? pow(Lt, 1.0 / (1.0 + k * 1.6)) : pow(Lt, 1.0 - k * 1.2);
  }
  if (hi != 0.0) {
    float w = smoothstep(0.35, 1.0, Lg);
    float k = hi * w;
    float inv = 1.0 - Lt;
    inv = k < 0.0 ? pow(inv, 1.0 / (1.0 - k * 1.6)) : pow(inv, 1.0 + k * 1.2);
    Lt = 1.0 - inv;
  }
  if (cl > 0.0) {
    float mid = 1.0 - pow(abs(2.0 * L - 1.0), 2.0);
    Lt += (L - Lb) * cl * 1.4 * mid;
  }
  // Parlaklık değişimi rengi korunarak uygulanır; çok koyu piksellerde
  // gürültü büyümesin diye toplamsal yönteme kayılır.
  float ratio = min(Lt / max(L, 1e-4), 3.0);
  vec3 cm = c * ratio;
  vec3 ca = c + (Lt - L);
  return mix(ca, cm, 0.65 * smoothstep(0.02, 0.2, L));
}

void main() {
  vec2 uv;
  vec2 px;
  if (!locate(uv, px)) return;
  vec4 s = textureGrad(uSrc, uv, gDx, gDy);
  vec3 c = s.rgb;
  if (uLens.x > 0.0) {
    // Renk kayması: kırmızı ve mavi kanal merkezden zıt yönlere kayar.
    vec2 d = (uv - 0.5) * uLens.x * 0.008;
    c.r = textureGrad(uSrc, uv + d, gDx, gDy).r;
    c.b = textureGrad(uSrc, uv - d, gDx, gDy).b;
  }
  if (uFx.x > 0.0) {
    vec3 n = textureGrad(uSrc, uv + gDx, gDx, gDy).rgb + textureGrad(uSrc, uv - gDx, gDx, gDy).rgb
           + textureGrad(uSrc, uv + gDy, gDx, gDy).rgb + textureGrad(uSrc, uv - gDy, gDx, gDy).rgb;
    float d = luma(c) - luma(n) * 0.25;
    c = clamp(c + d * uFx.x * 2.2, 0.0, 1.0);
  }
  if (uLens.z > 0.0) {
    // Kompakt kamera yumuşaklığı: yarıçap görüntüye orantılı, önizlemede
    // çizim pikselinden küçük olmaz.
    vec2 rx = vec2(max(length(gDx), uSoftR.x), 0.0);
    vec2 ry = vec2(0.0, max(length(gDy), uSoftR.y));
    vec3 n = textureGrad(uSrc, uv + rx, gDx, gDy).rgb + textureGrad(uSrc, uv - rx, gDx, gDy).rgb
           + textureGrad(uSrc, uv + ry, gDx, gDy).rgb + textureGrad(uSrc, uv - ry, gDx, gDy).rgb;
    c = mix(c, n * 0.25, uLens.z * 0.75);
  }
  bool tone = uTone.x != 0.0 || uTone.y != 0.0 || uTone.z != 0.0;
  vec3 g = tone ? textureLod(uGuide, uv, 0.0).rgb : c;
  if (uLut.y > 0.5) {
    c = lut(uPre, c);
    if (tone) g = lut(uPre, g);
  }
  if (tone) c = localTone(c, g);
  float dd = -1.0;
  if (uLut.z > 0.5) {
    vec3 cp = lut(uPost, c);
    if (uDepthMix.x > 0.5) {
      // Yakın bölge kendi tablosuyla; geçiş derinlik haritasına göre yumuşak.
      dd = depthAt(uv, s.rgb);
      float w = smoothstep(uDepthMix.y - uDepthMix.z, uDepthMix.y + uDepthMix.z, dd);
      cp = mix(cp, lut(uFg, c), w);
    }
    if (uFaceOn > 0.5) {
      float fm = 1.0 - smoothstep(0.75, 1.1, length((gO - uFaceBox.xy) / uFaceBox.zw));
      cp = mix(cp, lut(uFaceLut, c), fm);
    }
    c = mix(c, cp, uPostAmt);
  }
  if (uGainOn > 0.0) {
    // Flaş ışığı uzaklıkla kademeli değişir.
    if (dd < 0.0) dd = depthAt(uv, s.rgb);
    c *= 1.0 + uGainOn * (depthGain(dd) - 1.0);
  }
  if (uLens.y > 0.0) {
    // Flaş: merkezi (ör. algılanan yüz) aydınlanır, ışık uzaklaştıkça düşer.
    vec2 a = uOut / max(uOut.x, uOut.y);
    float r = length((gO - uFlashAt.xy) * 2.0 * a) / (uFlashAt.z * length(a));
    c *= 1.0 + uLens.y * 0.5 * (1.0 - smoothstep(0.0, 1.0, r));
  }
  if (uGlow.x > 0.0 || uGlow.y > 0.0) {
    // Parlama ve hale: parlak bölgelerin geniş bulanık kopyası ekran
    // karışımıyla eklenir (rehber doku + halka örnekleri).
    vec3 b = textureLod(uGuide, uv, 0.0).rgb * 0.2;
    for (int i = 0; i < 8; i++) {
      float t = float(i) * 0.7853982;
      b += textureLod(uGuide, uv + vec2(cos(t), sin(t)) * uGlowR, 0.0).rgb * 0.1;
    }
    float th = uGlow.z;
    float lb = luma(b);
    vec3 bloom = b * clamp((lb - th) / (1.0 - th), 0.0, 1.0) * uGlow.x * 1.3;
    vec3 halo = vec3(1.0, 0.3, 0.12) * smoothstep(th - 0.15, 1.0, lb) * uGlow.y;
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - clamp(bloom + halo, 0.0, 1.0));
  }
  if (uLeak.a > 0.0) {
    vec2 a = uOut / max(uOut.x, uOut.y);
    float d = length((gO - uLeakAt.xy) * a) / uLeakAt.z;
    float m = exp(-d * d * 1.6) * (0.8 + 0.2 * vnoise(gO * 4.0 + 7.0));
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - uLeak.rgb * m * uLeak.a);
  }
  if (uFx.z != 0.0) {
    vec2 a = uOut / max(uOut.x, uOut.y);
    float r = length((gO - 0.5) * 2.0 * a) / length(a);
    float m = smoothstep(0.3, 1.2, r);
    m *= m;
    if (uFx.z > 0.0) c *= 1.0 - uFx.z * m * 0.9;
    else c = mix(c, vec3(1.0), -uFx.z * m * 0.8);
  }
  if (uFx.y > 0.0) {
    vec2 gp = grainCoord() + uFx.w;
    float n = vnoise(gp) + vnoise(gp * 2.13 + 17.0) * 0.5 - 0.75;
    float L = luma(c);
    c += n * uFx.y * 0.2 * (0.45 + 0.55 * (1.0 - abs(L - 0.5) * 2.0));
  }
  if (uLens.w > 0.0) {
    // Dijital sensör gürültüsü: piksel düzeyinde, renkli, gölgelerde güçlü.
    vec2 np = floor(gO * uOut / max(1.0, max(uOut.x, uOut.y) / 2400.0));
    vec3 n = vec3(hash12(np + 0.31), hash12(np + 17.7), hash12(np + 41.3)) - 0.5;
    float L = luma(c);
    c += (n * 0.7 + (n.r + n.g + n.b) * 0.1) * uLens.w * 0.14 * (1.0 - 0.7 * L);
  }
  finish(c, s.a, px);
}`;

// Sanatsal efektler. Komşu örnekler kaynak dokusundan, "uR" birim yarıçapla
// alınır; yarıçap görüntü boyuna orantılı olduğu için önizleme çıktıya benzer.
export const EFFECT_FRAG = `${PRELUDE}
uniform int uEffect;
uniform float uAmt;
uniform vec2 uR;

// Etkin yarıçap: çizim pikselinden küçük olamaz. Küçük resimde ve uzak
// görünümde efekt bu sayede kaybolmaz; tam boyutta uR geçerlidir.
vec2 gR;

vec3 tap(vec2 uv, vec2 o) { return textureGrad(uSrc, uv + o * gR, gDx, gDy).rgb; }
float ltap(vec2 uv, vec2 o) { return luma(tap(uv, o)); }

float sobelL(vec2 uv, float r) {
  float tl = ltap(uv, vec2(-r, -r));
  float t = ltap(uv, vec2(0.0, -r));
  float tr = ltap(uv, vec2(r, -r));
  float l = ltap(uv, vec2(-r, 0.0));
  float rr = ltap(uv, vec2(r, 0.0));
  float bl = ltap(uv, vec2(-r, r));
  float b = ltap(uv, vec2(0.0, r));
  float br = ltap(uv, vec2(r, r));
  float gx = (tr + 2.0 * rr + br) - (tl + 2.0 * l + bl);
  float gy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
  return length(vec2(gx, gy));
}

vec3 blur9(vec2 uv, float r) {
  vec3 s = tap(uv, vec2(0.0)) * 0.25;
  s += (tap(uv, vec2(r, 0.0)) + tap(uv, vec2(-r, 0.0)) + tap(uv, vec2(0.0, r)) + tap(uv, vec2(0.0, -r))) * 0.125;
  s += (tap(uv, vec2(r, r)) + tap(uv, vec2(-r, r)) + tap(uv, vec2(r, -r)) + tap(uv, vec2(-r, -r))) * 0.0625;
  return s;
}

// Seyrek ızgarada örtüşme olmasın diye örnek, ızgara hücresi kadar
// süzülmüş mip seviyesinden alınır.
vec3 tapCell(vec2 uv, vec2 o, float cell) {
  vec2 gx = length(gDx) > gR.x * cell ? gDx : vec2(gR.x * cell, 0.0);
  vec2 gy = length(gDy) > gR.y * cell ? gDy : vec2(0.0, gR.y * cell);
  return textureGrad(uSrc, uv + o * gR, gx, gy).rgb;
}

// Kuwahara: dört çeyreğin en az değişkenlikli olanına yumuşak ağırlık.
vec3 kuwahara(vec2 uv, float r) {
  vec3 m0 = vec3(0.0); vec3 m1 = vec3(0.0); vec3 m2 = vec3(0.0); vec3 m3 = vec3(0.0);
  vec3 s0 = vec3(0.0); vec3 s1 = vec3(0.0); vec3 s2 = vec3(0.0); vec3 s3 = vec3(0.0);
  for (int j = -3; j <= 3; j++) {
    for (int i = -3; i <= 3; i++) {
      vec3 c = tapCell(uv, vec2(float(i), float(j)) * (r / 3.0), r / 3.0);
      vec3 c2 = c * c;
      if (i <= 0 && j <= 0) { m0 += c; s0 += c2; }
      if (i >= 0 && j <= 0) { m1 += c; s1 += c2; }
      if (i <= 0 && j >= 0) { m2 += c; s2 += c2; }
      if (i >= 0 && j >= 0) { m3 += c; s3 += c2; }
    }
  }
  m0 /= 16.0; m1 /= 16.0; m2 /= 16.0; m3 /= 16.0;
  vec3 v0 = s0 / 16.0 - m0 * m0;
  vec3 v1 = s1 / 16.0 - m1 * m1;
  vec3 v2 = s2 / 16.0 - m2 * m2;
  vec3 v3 = s3 / 16.0 - m3 * m3;
  float w0 = pow(1.0 + 600.0 * max(v0.r + v0.g + v0.b, 0.0), -4.0);
  float w1 = pow(1.0 + 600.0 * max(v1.r + v1.g + v1.b, 0.0), -4.0);
  float w2 = pow(1.0 + 600.0 * max(v2.r + v2.g + v2.b, 0.0), -4.0);
  float w3 = pow(1.0 + 600.0 * max(v3.r + v3.g + v3.b, 0.0), -4.0);
  return (m0 * w0 + m1 * w1 + m2 * w2 + m3 * w3) / max(w0 + w1 + w2 + w3, 1e-8);
}

vec3 fxSketch(vec2 uv, bool colored) {
  vec3 c = tap(uv, vec2(0.0));
  float g = luma(c);
  float sum = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 d = vec2(cos(a), sin(a));
    sum += ltap(uv, d * 0.45) + ltap(uv, d) * 0.6;
  }
  float b = sum / 19.2;
  float dodge = clamp(g / max(b, 0.02), 0.0, 1.0);
  float v = pow(dodge, 4.0) * mix(1.0, smoothstep(0.0, 0.85, g), 0.28);
  vec2 pp = grainCoord();
  float n = vnoise(pp * 0.9) * 0.05 + vnoise(pp * 0.21) * 0.04;
  vec3 paper = vec3(0.985, 0.975, 0.95) - n;
  // Kalem taraması: koyu bölgelerde eğik, ince uzun çizgiler.
  vec2 q = mat2(0.866, 0.5, -0.5, 0.866) * pp;
  float hatch = smoothstep(0.35, 0.75, vnoise(q * vec2(0.08, 1.6)));
  float dark = 1.0 - smoothstep(0.15, 0.75, g);
  v *= 1.0 - dark * 0.35 * hatch;
  if (colored) {
    vec3 col = clamp(mix(vec3(g), c, 1.5), 0.0, 1.0);
    col = mix(vec3(1.0), col, 0.5 + 0.3 * (1.0 - g));
    return paper * col * mix(1.0, v, 0.95) * (0.88 + 0.12 * hatch);
  }
  return paper * v;
}

vec3 fxOil(vec2 uv) {
  vec3 k = kuwahara(uv, 1.0);
  // Boya kabartısı: ışık sol üstten vurur.
  float rel = ltap(uv, vec2(-0.6, -0.6)) - ltap(uv, vec2(0.6, 0.6));
  k *= 1.0 + rel * 0.9;
  // Fırça izleri: iki yönde uzamış gürültü.
  vec2 pp = grainCoord();
  float n = vnoise(pp * vec2(0.18, 0.9)) * 0.6 + vnoise(pp * vec2(0.9, 0.18)) * 0.4 - 0.5;
  k *= 1.0 + n * 0.1;
  k = mix(vec3(luma(k)), k, 1.25);
  return (k - 0.5) * 1.08 + 0.5;
}

vec3 fxWater(vec2 uv) {
  vec3 k = kuwahara(uv, 1.0);
  float e = sobelL(uv, 1.3);
  vec3 c = mix(vec3(luma(k)), k, 1.12);
  c = mix(c, vec3(1.0), 0.14);
  c *= 1.0 - smoothstep(0.05, 0.4, e) * 0.28;
  vec2 pp = grainCoord();
  float paper = vnoise(pp * 0.5) * 0.5 + vnoise(pp * 0.13) * 0.5;
  c *= 0.93 + 0.07 * paper;
  c *= 0.97 + 0.03 * vnoise(pp * 1.7);
  return c;
}

vec3 fxComic(vec2 uv) {
  vec3 c = blur9(uv, 0.8);
  float L = luma(c);
  vec3 q = floor(c * 5.0 + 0.5) / 5.0;
  q = mix(vec3(luma(q)), q, 1.3);
  float ink = smoothstep(0.18, 0.4, sobelL(uv, 1.0));
  float cell = max(3.0, max(uOut.x, uOut.y) * 0.0045);
  vec2 p = mat2(0.7071, 0.7071, -0.7071, 0.7071) * (gO * uOut / cell);
  vec2 f = fract(p) - 0.5;
  float dr = sqrt(clamp(1.0 - L * 1.4, 0.0, 1.0)) * 0.5;
  float dotv = 1.0 - smoothstep(dr - 0.08, dr + 0.08, length(f));
  q *= 1.0 - dotv * 0.35;
  return mix(q, vec3(0.05), ink);
}

vec3 fxPop(vec2 uv) {
  vec3 c = blur9(uv, 1.0);
  float L = luma(c);
  vec3 col = L < 0.28 ? vec3(0.12, 0.08, 0.38)
           : L < 0.5 ? vec3(0.93, 0.16, 0.52)
           : L < 0.72 ? vec3(0.13, 0.78, 0.86)
           : vec3(1.0, 0.9, 0.18);
  float cell = max(3.0, max(uOut.x, uOut.y) * 0.006);
  vec2 f = fract(gO * uOut / cell) - 0.5;
  float d = 1.0 - smoothstep(0.18, 0.24, length(f));
  col = mix(col, col * 0.8, d * 0.5);
  return mix(col, vec3(0.06), smoothstep(0.2, 0.45, sobelL(uv, 1.0)));
}

vec3 fxNeon(vec2 uv) {
  vec3 c = tap(uv, vec2(0.0));
  float e = sobelL(uv, 1.0);
  float glow = sobelL(uv, 3.0);
  vec3 hue = c / max(max(c.r, max(c.g, c.b)), 0.05);
  hue = clamp(mix(vec3(luma(hue)), hue, 1.6), 0.0, 1.0);
  return hue * (smoothstep(0.08, 0.5, e) * 1.4 + smoothstep(0.05, 0.6, glow) * 0.45);
}

vec3 fxEmboss(vec2 uv) {
  float a = ltap(uv, vec2(-1.0, -1.0));
  float b = ltap(uv, vec2(1.0, 1.0));
  float v = clamp(0.5 + (a - b) * 2.2, 0.0, 1.0);
  vec3 c = tap(uv, vec2(0.0));
  return mix(vec3(v), vec3(v) * (0.85 + 0.3 * c), 0.25);
}

void main() {
  vec2 uv;
  vec2 px;
  if (!locate(uv, px)) return;
  gR = max(uR, vec2(length(gDx), length(gDy)) * 1.25);
  vec4 s = textureGrad(uSrc, uv, gDx, gDy);
  vec3 e = s.rgb;
  if (uEffect == 1) e = fxSketch(uv, false);
  else if (uEffect == 2) e = fxSketch(uv, true);
  else if (uEffect == 3) e = fxOil(uv);
  else if (uEffect == 4) e = fxWater(uv);
  else if (uEffect == 5) e = fxComic(uv);
  else if (uEffect == 6) e = fxPop(uv);
  else if (uEffect == 7) e = fxNeon(uv);
  else if (uEffect == 8) e = fxEmboss(uv);
  finish(mix(s.rgb, e, uAmt), s.a, px);
}`;

// Yerel ortalama için küçültme ve ayrılabilir Gauss bulanıklığı.
export const BLUR_FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uIn;
uniform vec2 uSize;     // çıktı boyutu
uniform vec2 uTexel;    // 1 / girdi boyutu
uniform vec2 uDir;
uniform int uMode;      // 0: küçült (mip), 1: Gauss
uniform int uTaps;
uniform float uW[12];
uniform float uO[12];
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  if (uMode == 0) {
    outColor = texture(uIn, uv);
    return;
  }
  vec4 s = textureLod(uIn, uv, 0.0) * uW[0];
  for (int i = 1; i < 12; i++) {
    if (i >= uTaps) break;
    vec2 o = uDir * uO[i] * uTexel;
    s += (textureLod(uIn, uv + o, 0.0) + textureLod(uIn, uv - o, 0.0)) * uW[i];
  }
  outColor = s;
}`;
