// Süren düzenleme oturumunun cihazda saklanması (IndexedDB).
//
// Uygulama bir arşiv tutmaz; yalnızca son açılan fotoğrafın geri alma
// geçmişi saklanır. iOS ana ekran uygulamasını arka planda kapatabilir; bu
// sayede açılınca "Kaldığın yerden devam et" sunulur.
//
// meta  : anahtar → nesne ("session")
// snaps : anahtar "<oturum>:<sıra>" → { buf: ArrayBuffer, type }
//
// Görüntüler Blob yerine ArrayBuffer olarak saklanır: Safari'nin bazı
// sürümlerinde IndexedDB'den okunan Blob'lar sonradan okunamaz hale gelebiliyor.

const DB_NAME = 'zeko-foto';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('snaps')) db.createObjectStore('snaps');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Veritabanı başka bir sekmede açık'));
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('İşlem iptal edildi'));
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function getMeta(key) {
  const db = await open();
  return request(db.transaction('meta').objectStore('meta').get(key));
}

export async function setMeta(key, value) {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(value, key);
  return done(tx);
}

export async function deleteMeta(key) {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').delete(key);
  return done(tx);
}

export async function putSnap(key, blob) {
  const value = { buf: await blob.arrayBuffer(), type: blob.type || 'image/jpeg' };
  const db = await open();
  const tx = db.transaction('snaps', 'readwrite');
  tx.objectStore('snaps').put(value, key);
  return done(tx);
}

export async function getSnap(key) {
  const db = await open();
  const v = await request(db.transaction('snaps').objectStore('snaps').get(key));
  return v ? new Blob([v.buf], { type: v.type }) : null;
}

export async function deleteSnaps(keys) {
  if (!keys.length) return;
  const db = await open();
  const tx = db.transaction('snaps', 'readwrite');
  const st = tx.objectStore('snaps');
  for (const k of keys) st.delete(k);
  return done(tx);
}

// Kayıtlı bütün oturum verisini siler (meta dahil).
export async function clearAll() {
  const db = await open();
  const tx = db.transaction(['meta', 'snaps'], 'readwrite');
  tx.objectStore('meta').clear();
  tx.objectStore('snaps').clear();
  return done(tx);
}

// Tarayıcıdan verileri silmemesini ister (iOS 17+ destekler).
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* desteklenmiyor */
  }
}
