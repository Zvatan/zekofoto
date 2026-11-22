// Cihazda yapay zekâ: ONNX Runtime Web (WASM). Çalıştırıcı ve modeller ilk
// kullanımda indirilir; service worker onları önbelleğe aldığı için sonraki
// açılışlarda internet gerekmez.
//
// GitHub Pages çapraz köken yalıtımı (COOP/COEP) sunmaz; SharedArrayBuffer
// olmadığından tek iş parçacığıyla çalışılır.

const ORT_DIR = new URL('../../vendor/ort/', import.meta.url).href;
const WASM_URL = `${ORT_DIR}ort-wasm-simd-threaded.wasm`;
const WASM_SIZE = 14.2e6; // ilerleme payı için yaklaşık boyut

let ortPromise = null;
const sessions = new Map();

// İlerlemeli indirme. onProgress(alınan, toplam) bayt.
async function download(url, onProgress, sizeHint) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`İndirilemedi (${res.status})`);
  const total = Number(res.headers.get('content-length')) || sizeHint || 0;
  if (!res.body || !onProgress) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got, Math.max(total, got));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function loadOrt(onProgress) {
  if (!ortPromise) {
    ortPromise = (async () => {
      const [ort, wasm] = await Promise.all([import(`${ORT_DIR}ort.wasm.min.mjs`), download(WASM_URL, onProgress, WASM_SIZE)]);
      ort.env.wasm.wasmPaths = ORT_DIR;
      ort.env.wasm.wasmBinary = wasm;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      // Model dosyalarındaki zararsız "initializer" uyarıları konsolu doldurmasın.
      ort.env.logLevel = 'error';
      return ort;
    })();
    ortPromise.catch(() => (ortPromise = null));
  }
  return ortPromise;
}

// Model oturumu (ad başına bir kez kurulur).
// onProgress(0..1): çalıştırıcı ve model indirmesi birlikte.
export function getSession(name, url, sizeHint, onProgress) {
  if (!sessions.has(name)) {
    const p = (async () => {
      const parts = { ort: [0, WASM_SIZE], model: [0, sizeHint] };
      const report = () => {
        if (!onProgress) return;
        const got = parts.ort[0] + parts.model[0];
        const total = parts.ort[1] + parts.model[1];
        onProgress(Math.min(1, got / total));
      };
      const ortReady = loadOrt((g, t) => {
        parts.ort = [g, t];
        report();
      }).then((ort) => {
        parts.ort = [parts.ort[1], parts.ort[1]];
        report();
        return ort;
      });
      const [ort, bytes] = await Promise.all([
        ortReady,
        download(url, (g, t) => {
          parts.model = [g, t];
          report();
        }, sizeHint),
      ]);
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3,
      });
      return { ort, session };
    })();
    sessions.set(name, p);
    p.catch(() => sessions.delete(name));
  }
  return sessions.get(name);
}

// Model dosyası önbellekte mi (indirme gerekip gerekmediğini göstermek için)?
export async function isCached(url) {
  try {
    return !!(await caches.match(url));
  } catch {
    return false;
  }
}
