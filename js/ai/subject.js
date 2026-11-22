// Fotoğrafın öznesi (Arka plan ve Portre modu ortak): yüzler bulunur; kişi
// varsa kişi modeli, yoksa genel model çalışır; yüze bağlı olmayan kopuk
// parçalar atılır ve kişinin çok gerisinde kalanlar (ör. arkadaki insanlar)
// derinlikle çıkarılır. Görüntü başına bir kez hesaplanır.
import { subjectMatte } from './matte.js';

// prog(etiket) → onProgress(0..1). Dönen: { matte: { w, h, data }, person, face }.
export function subject(host, prog) {
  return host.ai.memo('subject', async () => {
    const W = host.W;
    const H = host.H;
    const faces = await host.ai.faces(prog('Özne aranıyor…')).catch(() => []);
    const people = faces.filter((f) => f.h / H > 0.04);
    const person = people.length > 0;
    const m = await subjectMatte(host.image, { person, faces: people, onProgress: prog('Özne ayrılıyor…') });
    if (person) {
      await host.ai.depth(prog('Derinlik hesaplanıyor…'));
      const face = people[0];
      const fd = host.ai.depthAt((face.x + face.w / 2) / W, (face.y + face.h / 2) / H, 4);
      const dm = host.ai.depthMap;
      if (fd !== null && dm) {
        for (let y = 0; y < m.h; y++) {
          const dy = Math.min(dm.h - 1, Math.floor(((y + 0.5) * dm.h) / m.h)) * dm.w;
          for (let x = 0; x < m.w; x++) {
            const i = y * m.w + x;
            if (!m.data[i]) continue;
            const d = dm.data[dy + Math.min(dm.w - 1, Math.floor(((x + 0.5) * dm.w) / m.w))] / 255;
            const t = Math.min(1, Math.max(0, (d - (fd - 0.32)) / 0.14));
            m.data[i] = Math.round(m.data[i] * t * t * (3 - 2 * t));
          }
        }
      }
    }
    return { matte: m, person, face: people[0] || null };
  });
}
