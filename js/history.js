// Geri al / ileri al geçmişi.
//
// Bellekte yalnızca güncel görüntü tutulur; her adım kodlanıp IndexedDB'ye
// yazılır (12 MP RGBA bir kanvas ~50 MB, JPEG kopyası ~5 MB). Kodlama arka
// planda sırayla yapılır; geri alma sıranın bitmesini bekler. Uygulama
// kapanıp açılınca aynı geçmiş geri yüklenir.
//
// IndexedDB kullanılamazsa (ör. gizli sekme) adımlar bellekte tutulur;
// düzenleme çalışmaya devam eder, yalnızca yeniden açılışta geri gelmez.
import * as store from './store.js';
import { canvasToBlob } from './image-io.js';

export const MAX_STEPS = 25;

export class History {
  constructor(meta) {
    this.meta = meta; // { id, entries: [{ key, label, w, h }], index, hasAlpha, seq, createdAt, photoDate }
    this.queue = Promise.resolve();
    this.mem = null; // IndexedDB yoksa: anahtar → Blob
  }

  static async start(canvas, { hasAlpha = false, original = null, photoDate = Date.now() } = {}) {
    const h = new History({ id: store.newId(), entries: [], index: -1, hasAlpha, seq: 0, createdAt: Date.now(), photoDate });
    try {
      await store.clearAll();
    } catch (err) {
      console.error(err);
      h.mem = new Map();
    }
    h.push(canvas, 'Özgün', original);
    return h;
  }

  static async restore() {
    try {
      const meta = await store.getMeta('session');
      if (!meta || !meta.entries?.length) return null;
      return new History(meta);
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  get canUndo() {
    return this.meta.index > 0;
  }

  get canRedo() {
    return this.meta.index < this.meta.entries.length - 1;
  }

  get current() {
    return this.meta.entries[this.meta.index];
  }

  get edited() {
    return this.meta.entries.length > 1;
  }

  _enqueue(fn) {
    const p = this.queue.then(fn);
    // Bir adım başarısız olsa da sıra kilitlenmesin.
    this.queue = p.catch((err) => console.error(err));
    return p;
  }

  async _put(key, blob, meta, dropped) {
    if (!this.mem) {
      try {
        await store.putSnap(key, blob);
        await store.setMeta('session', meta);
        await store.deleteSnaps(dropped);
        return;
      } catch (err) {
        // Depolama dolu ya da kapalı: bundan sonrası bellekte.
        console.error(err);
        this.mem = new Map();
      }
    }
    this.mem.set(key, blob);
    for (const k of dropped) this.mem.delete(k);
  }

  async _get(key) {
    if (this.mem?.has(key)) return this.mem.get(key);
    return store.getSnap(key);
  }

  // Yeni adım. Görüntü hemen güncel sayılır; kodlama sırayla arka planda
  // yapılır. Dönen söz, görüntü saklanınca çözülür; o zamana kadar kanvas
  // serbest bırakılmamalıdır.
  push(canvas, label, blob = null) {
    const m = this.meta;
    const dropped = m.entries.splice(m.index + 1);
    const entry = { key: `${m.id}:${m.seq++}`, label, w: canvas.width, h: canvas.height };
    m.entries.push(entry);
    while (m.entries.length > MAX_STEPS) dropped.push(m.entries.splice(1, 1)[0]);
    m.index = m.entries.length - 1;
    const snapshot = { ...m, entries: m.entries.slice() };
    return this._enqueue(async () => {
      const b = blob || (await canvasToBlob(canvas, m.hasAlpha ? 'image/png' : 'image/jpeg', 0.95));
      await this._put(entry.key, b, snapshot, dropped.map((e) => e.key));
    });
  }

  async _load(index) {
    await this.queue;
    this.meta.index = index;
    if (!this.mem) await store.setMeta('session', this.meta).catch((err) => console.error(err));
    const e = this.current;
    const blob = await this._get(e.key);
    if (!blob) throw new Error('Geçmiş adımı bulunamadı');
    return { blob, entry: e };
  }

  undo() {
    return this.canUndo ? this._load(this.meta.index - 1) : Promise.resolve(null);
  }

  redo() {
    return this.canRedo ? this._load(this.meta.index + 1) : Promise.resolve(null);
  }

  loadCurrent() {
    return this._load(this.meta.index);
  }

  async originalBlob() {
    await this.queue;
    return this._get(this.meta.entries[0].key);
  }

  // Bekleyen kayıtların bitmesini bekler (kanvası bırakmadan önce).
  settled() {
    return this.queue;
  }

  async discard() {
    await this.queue;
    this.mem = null;
    await store.clearAll().catch((err) => console.error(err));
  }
}
