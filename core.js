// core.js
import * as THREE from 'three';
import { sha256, deflate, inflate, trimVTF } from './pack.js';

/* ================================================================
   I18N
   ================================================================ */
export let I18N = { en: { lang_name: 'English' } };
export const LANG_KEY = 'sav_lang';
export let LANG = 'en';

export async function loadI18N(){
  try {
    const res = await fetch('i18n.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data && typeof data === 'object') I18N = data;
  } catch (e) { console.warn('[i18n] не удалось загрузить i18n.json:', e.message); }
}
export function detectLang(){
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && I18N[saved]) return saved;
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return I18N[nav] ? nav : 'en';
  } catch (_) { return 'en'; }
}
export function setLang(code){
  if (!I18N[code]) code = 'en';
  LANG = code;
  try { localStorage.setItem(LANG_KEY, code); } catch (_) {}
  document.documentElement.lang = code;
  const langSel = document.getElementById('langSel');
  if (langSel) langSel.value = code;
  applyI18n();
  try { window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: code } })); } catch (_) {}
}
export function t(key, params){
  const dict = I18N[LANG] || I18N.en || {};
  let s = dict[key];
  if (s == null) s = (I18N.en && I18N.en[key] != null) ? I18N.en[key] : key;
  if (params) for (const k in params) s = s.split('{' + k + '}').join(params[k]);
  return s;
}
export function applyI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    const s = t(k);
    if (s != null) el.textContent = s;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const k = el.dataset.i18nHtml;
    const s = t(k);
    if (s != null) el.innerHTML = s;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}

/* ================================================================
   UTILS & FILE FILTERING
   ================================================================ */
export const KEEP_EXT = new Set([
  'vtf', 'vmt', 'mdl', 'vvd', 'vtx', 'phy', 'ani', 'vmf', 'vmap', 'vmx', 'map', 'vpk', 'wad', 'pak',
  'wav', 'mp3', 'ogg'
]);
export const ICON_PATH_RE = /(?:^|\/)(?:features|icons?|editoricons?|entity_?icons?|source-?assets|hammer)\//i;
// Иконка, если лежит в папке features/icons/... ИЛИ выбрана одиночным файлом (на телефоне выбор папки часто отдаёт файлы без пути)
export function isIconPath(path){
  const p = String(path || '').replace(/\\/g, '/');
  return ICON_PATH_RE.test(p) || p.indexOf('/') < 0;
}
const AUDIO_EXT = new Set(['wav', 'mp3', 'ogg']);

export function getExt(path) {
  const m = /\.([a-z0-9]+)$/i.exec(String(path || ''));
  return m ? m[1].toLowerCase() : '';
}
export function shouldKeepFile(path) {
  const p = String(path || '').replace(/\\/g, '/').toLowerCase();
  const ext = getExt(p);
  if (KEEP_EXT.has(ext)) {
    if (p.includes('/scripts/') || p.includes('/resource/') || p.includes('/cfg/')) {
      if (ext !== 'vmf' && ext !== 'vmap' && ext !== 'vmx') return false;
    }
    if (p.includes('/sound/')) {
      if (!AUDIO_EXT.has(ext)) return false;
    }
    return true;
  }
  if (ext === 'txt') return p.includes('/maps/') || p.endsWith('.vmf.txt') || /vmap[^/]*\.txt$/.test(p);
  if (/^(png|jpe?g|bmp)$/.test(ext) && isIconPath(p)) return true;
  return false;
}
export function fmtB(n){
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i === 0 ? Math.round(v) : v.toFixed(v < 10 ? 2 : 1)) + ' ' + u[i];
}

export function normMat(s){
  let p = String(s || '').toLowerCase().replace(/\\/g, '/');
  p = p.replace(/\.v(tf|mt)$/, '');
  const idx = p.lastIndexOf('materials/');
  if (idx >= 0) {
    p = p.slice(idx + 'materials/'.length);
  } else {
    // Поддержка нестандартных аддонов, в которых забыли папку materials/, но есть models/
    const mIdx = p.lastIndexOf('models/');
    if (mIdx >= 0) p = p.slice(mIdx);
  }
  return p.replace(/^\/+/, '').trim();
}

/* ================================================================
   CANCELLABLE TOKEN
   ================================================================ */
export function makeCancellable(){
  let token = 0;
  return {
    next(){ return ++token; },
    isCurrent(t){ return t === token; },
    cancel(){ token++; }
  };
}

/* ================================================================
   INDEXEDDB
   ================================================================ */
const DB_NAME = 'source_asset_viewer_db';
const DB_VER = 2;
const STORE = 'files';
const BLOBS = 'blobs';
export let db = null;

export function openDB(){
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('IndexedDB unsupported'));
    const rq = indexedDB.open(DB_NAME, DB_VER);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: 'path' });
        s.createIndex('ext', 'ext');
        s.createIndex('time', 'time');
      }
      if (!d.objectStoreNames.contains(BLOBS)) d.createObjectStore(BLOBS, { keyPath: 'h' });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
export async function dbPut(path, blob){
  if (!db) return;
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const m = /\.([^.]+)$/.exec(path) || [, ''];
    tx.objectStore(STORE).put({ path, blob, ext: m[1].toLowerCase(), size: blob.size || 0, time: Date.now() });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
export async function dbPutMany(records){
  if (!db || !records.length) return;
  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      for (const r of chunk) st.put(r);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
}
export async function dbGetAll(){
  if (!db) return [];
  return new Promise((res, rej) => {
    const rq = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    rq.onsuccess = () => res(rq.result || []);
    rq.onerror = () => rej(rq.error);
  });
}
export async function dbDelete(path){
  if (!db) return;
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(path);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
export async function dbClearKeys(keys){
  if (!db || !keys.length) return;
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    for (const k of keys) st.delete(k);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
export async function dbClearAll(){
  if (!db) return;
  return new Promise((res, rej) => {
    const tx = db.transaction([STORE, BLOBS], 'readwrite');
    tx.objectStore(STORE).clear(); tx.objectStore(BLOBS).clear();
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
export async function dbWriteBatch(files, blobs){
  if (!db || (!files.length && !blobs.length)) return;
  return new Promise((res, rej) => {
    const tx = db.transaction([STORE, BLOBS], 'readwrite');
    const fs = tx.objectStore(STORE), bs = tx.objectStore(BLOBS);
    for (const b of blobs) bs.put(b);
    for (const f of files) fs.put(f);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('IDB transaction aborted'));
  });
}
export async function dbGetBlobRow(h){
  return new Promise((res, rej) => {
    const rq = db.transaction(BLOBS, 'readonly').objectStore(BLOBS).get(h);
    rq.onsuccess = () => res(rq.result || null);
    rq.onerror = () => rej(rq.error);
  });
}
export async function dbGetAllBlobKeys(){
  if (!db) return [];
  return new Promise((res, rej) => {
    const rq = db.transaction(BLOBS, 'readonly').objectStore(BLOBS).getAllKeys();
    rq.onsuccess = () => res(rq.result || []);
    rq.onerror = () => rej(rq.error);
  });
}
export async function dbDeleteBlobs(hs){
  if (!db || !hs.length) return;
  return new Promise((res, rej) => {
    const tx = db.transaction(BLOBS, 'readwrite'); const st = tx.objectStore(BLOBS);
    for (const h of hs) st.delete(h);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/* ================================================================
   GLOBAL STORE
   ================================================================ */
export const Store = {
  files: new Map(),
  hashes: new Set(),
  _refs: new Map(),
  _cz: new Map(),
  _ref(h, d){ const n = (this._refs.get(h) || 0) + d; if (n <= 0) this._refs.delete(h); else this._refs.set(h, n); return n; },
  async init() {
    try { db = await openDB(); } catch (e) { console.warn('IDB:', e); return; }
    const all = await dbGetAll();
    for (const f of all) { this.files.set(f.path, f); if (f.h) { this._ref(f.h, 1); if (f.cz) this._cz.set(f.h, f.cz); } }
    const keys = await dbGetAllBlobKeys();
    this.hashes = new Set(keys);
    const orphans = keys.filter(h => !this._refs.has(h));
    if (orphans.length) { try { await dbDeleteBlobs(orphans); for (const h of orphans) this.hashes.delete(h); } catch (_) {} }
  },
  _set(rec) {
    const old = this.files.get(rec.path);
    if (old && old.h) this._ref(old.h, -1);
    this.files.set(rec.path, rec); this._ref(rec.h, 1);
    return old;
  },
  async _gc(hs) {
    const dead = [...hs].filter(h => !this._refs.has(h));
    if (!dead.length) return;
    await dbDeleteBlobs(dead);
    for (const h of dead) { this.hashes.delete(h); this._cz.delete(h); }
  },
  async put(path, blob) {
    path = path.replace(/\\/g, '/');
    const m = /\.([^.]+)$/.exec(path) || [, ''];
    const rec = { path, blob, ext: m[1].toLowerCase(), size: blob.size || 0, time: Date.now() };
    const old = this.files.get(path);
    if (old && old.h) this._ref(old.h, -1);
    this.files.set(path, rec);
    await dbPut(path, blob);
    if (old && old.h) await this._gc([old.h]);
  },
  _dropVirtuals(vpkPath) {
    for (const [k, f] of this.files) {
      if (f._vpk && f._vpk.vpkPath === vpkPath) this.files.delete(k);
    }
  },
  async delete(path) { await this.deleteMany([path]); },
  async deleteMany(paths) {
    const hs = new Set();
    for (const p of paths) {
      const r = this.files.get(p);
      if (r && r.h) { this._ref(r.h, -1); hs.add(r.h); }
      this.files.delete(p); this._dropVirtuals(p);
    }
    await dbClearKeys(paths);
    await this._gc(hs);
  },
  async clearAll() {
    this.files.clear(); this._refs.clear(); this.hashes.clear(); this._cz.clear();
    await dbClearAll();
  },
  get(path) { return this.files.get(path.replace(/\\/g, '/')) || null; },
  listByExt(ext) {
    const out = [];
    for (const f of this.files.values()) if (f.ext === ext) out.push(f);
    return out;
  }
};

/* ================================================================
   PACKER
   ================================================================ */
export const PackOpts = {
  vtfDrop: (() => { try { return Math.min(2, Math.max(0, parseInt(localStorage.getItem('sav_vtf_drop') || '0', 10) || 0)); } catch (_) { return 0; } })()
};
export function setVtfDrop(n){ PackOpts.vtfDrop = n; try { localStorage.setItem('sav_vtf_drop', String(n)); } catch (_) {} }

export function emitProgress(label, done, total){
  if (done % 25 && done !== total) return;
  try { window.dispatchEvent(new CustomEvent('ingestprogress', { detail: { label, done, total } })); } catch (_) {}
}
export async function pmap(items, n, fn){
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true){ const k = i++; if (k >= items.length) return; await fn(items[k], k); }
  });
  await Promise.all(workers);
}
export async function readStored(rec){
  const row = await dbGetBlobRow(rec.h);
  if (!row) throw new Error('blob missing: ' + rec.path);
  return row.z ? await inflate(new Uint8Array(row.b)) : row.b;
}

export class Packer {
  constructor(){ this.files = []; this.blobs = []; this.bytes = 0; this.pending = new Map(); this.failed = null;
    this.stats = { files: 0, raw: 0, stored: 0, dedup: 0 }; this.limit = 48 * 1024 * 1024; }
  async add(path, input, extra = {}){
    if (this.failed) throw this.failed;
    path = String(path).replace(/\\/g, '/');
    const ext = getExt(path);
    let data = input;
    if (ext === 'vtf' && PackOpts.vtfDrop > 0){ try { const tr = trimVTF(data, PackOpts.vtfDrop); if (tr) data = tr; } catch (_) {} }
    const h = await sha256(data);
    let czP = this.pending.get(h), isNew = false;
    if (!czP && !Store.hashes.has(h)){
      isNew = true;
      czP = (async () => {
        let payload = data, z = false;
        if (data.byteLength >= 256){
          const c = await deflate(data);
          if (c.byteLength < data.byteLength * 0.92){ payload = c; z = true; }
        }
        const buf = (payload.byteOffset === 0 && payload.buffer.byteLength === payload.byteLength) ? payload.buffer : payload.slice().buffer;
        this.blobs.push({ h, z, n: data.byteLength, b: buf });
        this.bytes += buf.byteLength; this.stats.stored += buf.byteLength;
        Store._cz.set(h, buf.byteLength);
        return buf.byteLength;
      })();
      this.pending.set(h, czP);
    }
    const cz = czP ? await czP : (Store._cz.get(h) || 0);
    if (!isNew) this.stats.dedup++;
    this.files.push({ path, ext, size: data.byteLength, osize: input.byteLength, cz, time: Date.now(), h, ...extra });
    this.stats.files++; this.stats.raw += input.byteLength;
    if (this.files.length >= 500 || this.bytes >= this.limit) await this.flush();
  }
  async flush(){
    if (!this.files.length && !this.blobs.length) return;
    const files = this.files, blobs = this.blobs; this.files = []; this.blobs = []; this.bytes = 0;
    try { await dbWriteBatch(files, blobs); } catch (e) { this.failed = e; throw e; }
    for (const b of blobs) Store.hashes.add(b.h);
    const olds = new Set();
    for (const r of files){ const old = Store._set(r); if (old && old.h && old.h !== r.h) olds.add(old.h); }
    if (olds.size) await Store._gc(olds);
  }
}

/* ================================================================
   ENTITY ICONS
   ================================================================ */
export const EntityIcons = {
  map: new Map(),
  _urls: new Set(),
  listeners: new Set(),
  addFromFile(file, name){
    return new Promise((resolve) => {
      const stem = String(name || file.name || '').replace(/\.(png|jpg|jpeg|bmp)$/i, '').toLowerCase().trim();
      if (!stem) return resolve(false);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const tex = new THREE.Texture(img);
          tex.needsUpdate = true;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.magFilter = THREE.LinearFilter;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.generateMipmaps = true;
          tex.userData = { _url: url };
          const old = this.map.get(stem);
          if (old) {
            old.dispose();
            const oldUrl = old.userData && old.userData._url;
            if (oldUrl) { URL.revokeObjectURL(oldUrl); this._urls.delete(oldUrl); }
          }
          this.map.set(stem, tex);
          this._urls.add(url);
          this._notify();
          resolve(true);
        } catch (e) { URL.revokeObjectURL(url); resolve(false); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
      img.src = url;
    });
  },
  // Встроенные иконки сайта: папка icons/ рядом с index.html + icons/index.json (список имён). Свои иконки пользователя не затирает.
  async loadBundled(base = 'icons/'){
    let list = [];
    try { const r = await fetch(base + 'index.json', { cache: 'no-cache' }); if (!r.ok) return 0; list = await r.json(); } catch (_) { return 0; }
    if (!Array.isArray(list)) return 0;
    let n = 0;
    await pmap(list, 6, async name => {
      name = String(name);
      const stem = name.replace(/\.(png|jpe?g|bmp)$/i, '').toLowerCase();
      if (this.map.has(stem)) return;
      try {
        const r = await fetch(base + encodeURIComponent(name)); if (!r.ok) return;
        if (await this.addFromFile(new File([await r.blob()], name), name)) n++;
      } catch (_) {}
    });
    return n;
  },
  // Поднять иконки из хранилища (после перезагрузки страницы / очистки)
  async restoreFromStore(){
    const recs = [...Store.files.values()].filter(f => /^(png|jpe?g|bmp)$/.test(f.ext) && !f._vpk);
    let n = 0;
    await pmap(recs, 4, async rec => {
      const name = rec.path.split('/').pop();
      const stem = name.replace(/\.(png|jpe?g|bmp)$/i, '').toLowerCase();
      if (this.map.has(stem)) return;
      try {
        const blob = rec.blob ? rec.blob : new Blob([await readStored(rec)]);
        if (await this.addFromFile(new File([blob], name), name)) n++;
      } catch (_) {}
    });
    return n;
  },
  get(classname){
    const c = String(classname || '').toLowerCase();
    if (!c) return null;
    if (this.map.has(c)) return this.map.get(c);
    let p = c;
    while (p.includes('_')) {
      p = p.slice(0, p.lastIndexOf('_'));
      if (this.map.has(p)) return this.map.get(p);
    }
    return null;
  },
  get count(){ return this.map.size; },
  clear(){
    for (const t of this.map.values()) {
      t.dispose();
      const u = t.userData && t.userData._url;
      if (u) URL.revokeObjectURL(u);
    }
    this.map.clear();
    for (const u of this._urls) URL.revokeObjectURL(u);
    this._urls.clear();
    this._notify();
  },
  onChange(fn){ this.listeners.add(fn); },
  _notify(){ for (const fn of this.listeners){ try { fn(this.count); } catch (_) {} } }
};

/* ================================================================
   GAMES CATALOG
   ================================================================ */
const GAME_ALIAS = {
  tf2:'tf', tf:'tf', hl2:'hl2', hl2mp:'hl2mp', episodic:'ep1', ep1:'ep1', ep2:'ep2',
  css:'cstrike', cstrike:'cstrike', csgo:'csgo', dods:'dod', dod:'dod',
  l4d:'left4dead', left4dead:'left4dead', l4d2:'left4dead2', left4dead2:'left4dead2',
  portal:'portal', portal2:'portal2', gmod:'garrysmod', garrysmod:'garrysmod',
  hl1:'valve', valve:'valve', lostcoast:'lostcoast', platform:'platform'
};
const GAME_NAMES = {
  tf:'Team Fortress 2', hl2:'Half-Life 2', hl2mp:'HL2: Deathmatch', ep1:'HL2: Episode One',
  ep2:'HL2: Episode Two', lostcoast:'HL2: Lost Coast', cstrike:'Counter-Strike: Source',
  csgo:'CS:GO', dod:'Day of Defeat: Source', left4dead:'Left 4 Dead', left4dead2:'Left 4 Dead 2',
  portal:'Portal', portal2:'Portal 2', garrysmod:"Garry's Mod", valve:'Half-Life (GoldSrc)',
  platform:'Platform', misc:'Other / loose'
};
const normGame = k => { k = String(k || '').toLowerCase().trim(); return GAME_ALIAS[k] || k || 'misc'; };
export const gameLabel = k => GAME_NAMES[k] || k;

export function gameFromVpk(p){ return gameFromVpkPath(p); }
function gameFromVpkPath(p){
  const parts = String(p).replace(/\\/g, '/').split('/');
  const file = parts.pop().replace(/\.vpk$/i, '').replace(/_dir$/i, '').replace(/_\d{3}$/, '');
  const key = /^pak\d*$/i.test(file) ? (parts.pop() || 'misc') : file.split('_')[0];
  return normGame(key);
}
function gameFromLoosePath(p){
  p = String(p).replace(/\\/g, '/').toLowerCase();
  const m = /(?:^|\/)([^/]+)\/(?:models|materials)\//.exec(p);
  if (m && m[1] !== 'models' && m[1] !== 'materials') return normGame(m[1]);
  const i = p.indexOf('/');
  if (i > 0) { const first = p.slice(0, i); if (first !== 'models' && first !== 'materials') return normGame(first); }
  return 'misc';
}
export function gameOf(rec){
  if (!rec) return 'misc';
  if (rec.g) return rec.g;
  let g;
  if (rec._vpk) g = gameFromVpkPath(rec._vpk.vpkPath);
  else if (rec.ext === 'vpk') g = gameFromVpkPath(rec.path);
  else g = gameFromLoosePath(rec.path);
  rec.g = g;
  return g;
}

const GAMES_TXT = {
  ru: { all: 'Все игры' }, en: { all: 'All games' }
};
export const Games = {
  current: 'all',
  stats: new Map(),
  _cl: new Set(), _sl: new Set(),
  refresh(){
    const m = new Map();
    for (const f of Store.files.values()){
      const e = f.ext;
      if (e !== 'mdl' && e !== 'vtf' && e !== 'mp3' && e !== 'ogg' && e !== 'wav') continue;
      const g = gameOf(f); let s = m.get(g);
      if (!s){ s = { mdl: 0, vtf: 0, audio: 0 }; m.set(g, s); }
      if (e === 'mdl') s.mdl++;
      else if (e === 'vtf') s.vtf++;
      else s.audio++;
    }
    this.stats = m;
    if (this.current !== 'all' && !m.has(this.current)) this.current = 'all';
    for (const fn of this._sl) { try { fn(); } catch (_) {} }
  },
  set(k){
    if (k === this.current) return;
    this.current = k;
    for (const fn of this._cl) { try { fn(k); } catch (_) {} }
  },
  onChange(fn){ this._cl.add(fn); },
  onStats(fn){ this._sl.add(fn); },
  matches(rec){ return this.current === 'all' || gameOf(rec) === this.current; }
};
export function bindGameSelect(sel, kind){
  if (!sel || sel._gBound) return; sel._gBound = true;
  const fill = () => {
    const rows = [...Games.stats.entries()].filter(([, s]) => s[kind] > 0).sort((a, b) => b[1][kind] - a[1][kind]);
    let tot = 0; for (const [, s] of rows) tot += s[kind];
    sel.textContent = '';
    const o0 = document.createElement('option'); o0.value = 'all';
    o0.textContent = (GAMES_TXT[LANG] || GAMES_TXT.en).all + ' (' + tot.toLocaleString(LANG) + ')'; sel.appendChild(o0);
    for (const [g, s] of rows){
      const o = document.createElement('option'); o.value = g;
      o.textContent = gameLabel(g) + ' (' + s[kind].toLocaleString(LANG) + ')'; sel.appendChild(o);
    }
    sel.value = Games.current;
  };
  Games.onStats(fill);
  Games.onChange(k => { sel.value = k; });
  sel.addEventListener('change', () => Games.set(sel.value));
  window.addEventListener('langchange', fill);
  fill();
}

/* ================================================================
   FILE INGESTION & DROP HELPERS
   ================================================================ */
const MAX_SINGLE_FILE_SIZE = 256 * 1024 * 1024;
const ARCHIVE_EXT = new Set(['vpk', 'wad', 'pak']);
const VPK_SKIP = new Set(['vtf', 'vmt', 'mdl', 'vvd', 'vtx', 'phy', 'ani', 'mp3', 'ogg', 'wav']);

export async function addFilesToStore(list, { silent = false } = {}){
  const hasVPK = list.some(x => /\.vpk$/i.test(x.path || x.file.name));
  const skipped = [], items = [];
  for (const { path, file } of list){
    const ext = getExt(path);
    if (ARCHIVE_EXT.has(ext)) continue;
    if (!shouldKeepFile(path)) { skipped.push({ path, reason: 'filtered' }); continue; }
    if (file.size > MAX_SINGLE_FILE_SIZE) {
      console.warn('[store] файл слишком большой:', path, fmtB(file.size));
      skipped.push({ path, reason: 'too_large' });
      continue;
    }
    if (hasVPK && VPK_SKIP.has(ext)) continue;
    items.push({ p: path.replace(/\\/g, '/'), file });
  }
  const packer = new Packer(); let done = 0;
  try {
    await pmap(items, 6, async ({ p, file }) => {
      if (/^(png|jpe?g|bmp)$/.test(getExt(p))){ try { await EntityIcons.addFromFile(file, p.split('/').pop()); } catch (_) {} }   // иконки сущностей → сразу в память
      const u8 = new Uint8Array(await file.arrayBuffer());
      await packer.add(p, u8, { g: gameOf({ path: p, ext: getExt(p) }) });
      emitProgress('import', ++done, items.length);
    });
    await packer.flush();
  } catch (err){
    console.error('[store] import failed:', err);
    try { await packer.flush(); } catch (_) {}
    if (!silent) throw err;
  }
  return { saved: packer.stats.files, skipped, stats: packer.stats };
}

const WALK_MAX_DEPTH = 32;
const WALK_MAX_FILES = 100_000;

async function walkEntryLimited(en, prefix, out, state){
  if (state.visited > WALK_MAX_FILES) return;
  if (state.depth > WALK_MAX_DEPTH) { console.warn('[walkDrop] max depth'); return; }

  if (en.isFile){
    if (state.visited >= WALK_MAX_FILES) return;
    state.visited++;
    const fullPath = prefix + en.name;
    const ext = getExt(en.name);
    const lowerPath = fullPath.toLowerCase();
    const isIcon = /^(png|jpe?g|bmp)$/.test(ext);
    if (isIcon && !isIconPath(lowerPath)) return;

    if (!isIcon) {
      if (!KEEP_EXT.has(ext) && ext !== 'txt') return;
      if (ext === 'txt' && !lowerPath.includes('/maps/') && !lowerPath.endsWith('.vmf.txt') && !/vmap[^/]*\.txt$/.test(lowerPath)) return;
      if (lowerPath.includes('/scripts/') || lowerPath.includes('/resource/')) {
        if (ext !== 'vmf' && ext !== 'vmap' && ext !== 'vmx') return;
      }
      if (lowerPath.includes('/sound/') && !AUDIO_EXT.has(ext)) return;
    }

    await new Promise((resolve) => {
      en.file(f => { out.push({ path: fullPath, file: f }); resolve(); },
              () => resolve());
    });
    return;
  }

  if (!en.isDirectory) return;
  const reader = en.createReader();
  const all = [];
  while (true){
    const batch = await new Promise(res => reader.readEntries(res, () => res([])));
    if (!batch.length) break;
    all.push(...batch);
    if (all.length > WALK_MAX_FILES) { console.warn('[walkDrop] max files per dir'); break; }
  }
  state.depth++;
  for (const e of all){
    if (state.visited >= WALK_MAX_FILES) break;
    await walkEntryLimited(e, prefix + en.name + '/', out, state);
  }
  state.depth--;
}

export async function walkDrop(dt){
  const out = [];
  const state = { depth: 0, visited: 0 };
  const items = dt.items;
  if (items && items.length && items[0].webkitGetAsEntry){
    const entries = [];
    for (const it of items){ if (it.kind !== 'file') continue; const e = it.webkitGetAsEntry(); if (e) entries.push(e); }
    for (const en of entries) await walkEntryLimited(en, '', out, state);
  } else {
    for (const f of dt.files || []) out.push({ path: f.name, file: f });
  }
  if (state.visited >= WALK_MAX_FILES) console.warn('[walkDrop] достигнут лимит файлов:', WALK_MAX_FILES);
  return out;
}

export { Plugins, PLUGIN_DEFS } from './plugins.js';