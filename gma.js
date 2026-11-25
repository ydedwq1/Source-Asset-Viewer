// gma.js — распаковщик аддонов Garry's Mod (.gma) + просмотр Lua + отдельный каталог на каждый аддон
// Формат: https://developer.valvesoftware.com/wiki/GMA
//   "GMAD" | ver u8 | steamid u64 | time u64 | [ver>1: required content cstr...,""] | title cstr | desc cstr | author cstr | addonver i32
//   список: { num u32 (0 = конец) | path cstr | size i64 | crc u32 }...   затем данные файлов подряд, затем CRC u32
import { Store, Packer, getExt, fmtB, pmap, emitProgress, Games, LANG } from './core.js';
import { getRecordBuffer } from './archives.js';
import { zipStore, saveBlob } from './export.js';
import { lzmaDecode, looksLikeLzma } from './lzma.js';

const te = new TextEncoder(), td = new TextDecoder('utf-8');
const gerr = c => Object.assign(new Error('gma:' + c), { gma: c });
const NEED = new Error('need more');

/* ================= PARSER ================= */
function parseHeader(u8, total){
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 0;
  const need = n => { if (p + n > u8.length) throw NEED; };
  const u32 = () => { need(4); const v = dv.getUint32(p, true); p += 4; return v; };
  const u64 = () => { need(8); const v = Number(dv.getBigUint64(p, true)); p += 8; return v; };
  const cstr = () => {
    let e = p; while (e < u8.length && u8[e] !== 0) e++;
    if (e >= u8.length) throw NEED;
    const s = td.decode(u8.subarray(p, e)); p = e + 1; return s;
  };
  need(5);
  if (u8[0] !== 0x47 || u8[1] !== 0x4D || u8[2] !== 0x41 || u8[3] !== 0x44){
    throw gerr(u8[0] === 0x5D && u8[1] === 0 && u8[2] === 0 ? 'lzma' : 'magic');
  }
  const version = u8[4]; p = 5;
  if (version < 1 || version > 3) throw gerr('ver');
  u64(); const time = u64();
  if (version > 1){ let guard = 0; while (cstr() !== '') if (++guard > 1000) throw gerr('big'); }
  const title = cstr(), descRaw = cstr(), author = cstr(); need(4); p += 4;
  const files = []; let off = 0;
  for (;;){
    const n = u32(); if (!n) break;
    const path = cstr(), size = u64(), crc = u32();
    files.push({ path, size, crc, offset: off }); off += size;
    if (files.length > 200000) throw gerr('big');
  }
  const dataStart = p;
  for (const f of files) if (dataStart + f.offset + f.size > total) f.bad = true;   // обрезанный файл
  let description = descRaw, type = '', tags = [];
  try { const j = JSON.parse(descRaw); if (j && typeof j === 'object'){ description = j.description || ''; type = j.type || ''; tags = Array.isArray(j.tags) ? j.tags : []; } } catch (_) {}
  return { version, time, title, author, description, type, tags, files, dataStart };
}
export async function parseGMA(blob){
  let size = Math.min(blob.size, 1 << 20);
  for (;;){
    const u8 = new Uint8Array(await blob.slice(0, size).arrayBuffer());
    try { return parseHeader(u8, blob.size); }
    catch (e){
      if (e !== NEED) throw e;
      if (size >= blob.size) throw gerr('trunc');
      size = Math.min(blob.size, size * 4);
    }
  }
}

/* ================= INGEST ================= */
const KEEP = new Set(['vtf', 'vmt', 'mdl', 'vvd', 'vtx', 'phy', 'ani', 'wav', 'mp3', 'ogg', 'lua']);
const cleanPath = p => String(p).replace(/\\/g, '/').split('/').filter(s => s && s !== '.' && s !== '..').join('/').toLowerCase();
const slugOf = (title, fname) => {
  const s = String(title || '').toLowerCase().replace(/[^a-z0-9а-яё]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return s || String(fname || 'addon').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').slice(0, 48) || 'addon';
};
const sessions = new Map();     // slug -> { file, info }   (оригинал доступен, пока не закрыли страницу)

// Steam Workshop хранит аддоны как LZMA (*_legacy.bin) — распаковываем в память и дальше работаем как с обычным .gma
async function unwrapLzma(file){
  const head = new Uint8Array(await file.slice(0, 13).arrayBuffer());
  if (head[0] === 0x47 && head[1] === 0x4D && head[2] === 0x41 && head[3] === 0x44) return file;   // уже GMAD
  if (!looksLikeLzma(head)) return file;                                                         // parseGMA сам скажет 'magic'
  let u8;
  try {
    u8 = await lzmaDecode(new Uint8Array(await file.arrayBuffer()), (d, t) => emitProgress('LZMA', d, t));
  } catch (e){
    if (e && e.message === 'lzma:big') throw gerr('lzmabig');
    throw gerr('lzma');
  }
  if (u8[0] !== 0x47 || u8[1] !== 0x4D || u8[2] !== 0x41 || u8[3] !== 0x44) throw gerr('magic');  // LZMA, но не аддон
  emitProgress('LZMA', 1, 1);
  return new Blob([u8]);
}

export async function ingestGMA(orig){
  const fname = orig.name || 'addon';
  const file = await unwrapLzma(orig);
  const info = await parseGMA(file);
  const title = info.title.trim() || fname.replace(/\.[a-z0-9]+$/i, '');
  const slug = slugOf(title, fname), g = 'GMA · ' + title, root = 'gma/' + slug + '/';
  const old = [...Store.files.keys()].filter(k => k.startsWith(root));
  if (old.length) await Store.deleteMany(old);                  // повторный импорт заменяет прошлую версию

  const list = info.files.filter(f => !f.bad && KEEP.has(getExt(f.path)) && cleanPath(f.path));
  const counts = { mdl: 0, vtf: 0, audio: 0, lua: 0 };
  let failed = 0, done = 0;
  const packer = new Packer();
  try {
    await pmap(list, 4, async f => {
      try {
        const a = info.dataStart + f.offset;
        const u8 = new Uint8Array(await file.slice(a, a + f.size).arrayBuffer());
        const ext = getExt(f.path);
        await packer.add(root + cleanPath(f.path), u8, { g });
        if (ext === 'mdl') counts.mdl++; else if (ext === 'vtf') counts.vtf++; else if (ext === 'lua') counts.lua++;
        else if (ext === 'wav' || ext === 'mp3' || ext === 'ogg') counts.audio++;
      } catch (e){ if (packer.failed) throw e; failed++; }
      emitProgress('GMA', ++done, list.length);
    });
    const all = info.files.map(f => [cleanPath(f.path), f.size]).filter(x => x[0]).sort((a, b) => a[0] < b[0] ? -1 : 1);
    const meta = { slug, g, title, author: info.author, description: info.description, type: info.type, tags: info.tags,
      version: info.version, time: info.time, size: file.size, kept: list.length - failed, counts, all };
    await packer.add(root + '__addon.json', te.encode(JSON.stringify(meta)), { g });
  } finally { try { await packer.flush(); } catch (e){ if (!packer.failed) throw e; } }
  if (packer.failed) throw packer.failed;
  sessions.set(slug, { file, info });
  return { slug, title, counts, failed, total: info.files.length };
}

/* ================= LUA HIGHLIGHT ================= */
const LUA_KW = new Set('and break continue do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' '));
const TOK = /(--\[(=*)\[[\s\S]*?\]\2\]|--[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|\[(=*)\[[\s\S]*?\]\4\])|\b([A-Za-z_]\w*)\b|\b(0[xX][\da-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wrap = (cls, s) => s.split('\n').map(p => p ? '<span class="' + cls + '">' + esc(p) + '</span>' : '').join('\n');
function highlightLua(text){
  let out = '', last = 0, m; TOK.lastIndex = 0;
  while ((m = TOK.exec(text))){
    out += esc(text.slice(last, m.index)); last = TOK.lastIndex;
    if (m[1] !== undefined) out += wrap('tk-c', m[0]);
    else if (m[3] !== undefined) out += wrap('tk-s', m[0]);
    else if (m[6] !== undefined) out += wrap('tk-n', m[0]);
    else out += LUA_KW.has(m[5]) ? wrap('tk-k', m[0]) : esc(m[0]);
    if (m[0].length === 0) TOK.lastIndex++;
  }
  return out + esc(text.slice(last));
}

/* ================= UI ================= */
const TX = {
  ru: { drop: 'Перетащи .gma или .bin — аддоны Garry\'s Mod', dropSub: 'Распаковка, просмотр Lua; модели, текстуры и звуки аддона попадают в его отдельный каталог', pick: 'Выбрать файлы',
        search: 'Поиск по файлам…', inCode: 'в коде Lua', files: 'файлов', kept: 'сохранено', models: '📦 Модели', tex: '🖼 Текстуры', music: '🎵 Музыка',
        zip: '⬇ ZIP (всё)', zipPart: '⬇ ZIP (сохранённое)', del: '🗑 Удалить аддон', delConfirm: 'Удалить аддон из хранилища?', pickFile: '← выбери файл',
        notKept: 'Этот тип файла не сохраняется в хранилище.', dl: '⬇ Скачать', cut: '… показано только начало файла', author: 'Автор', tags: 'Теги',
        import: 'Импорт', imported: 'Импортировано', err: 'Ошибки', nothing: 'Ничего не найдено', binary: 'Бинарный файл — используйте вкладки Модели / Текстуры / Музыка или скачайте.',
        e_magic: 'Это не GMA (нет сигнатуры GMAD).', e_lzma: 'Не удалось распаковать LZMA (.bin из Steam Workshop): файл повреждён или это не аддон.', e_lzmabig: 'Распакованный аддон слишком большой для браузера (больше 2 ГБ).',
        e_ver: 'Неподдерживаемая версия GMA.', e_trunc: 'Файл повреждён или обрезан.', e_big: 'Слишком много файлов в аддоне.' },
  en: { drop: 'Drop .gma or .bin — Garry\'s Mod addons', dropSub: 'Unpack, browse Lua; models, textures and sounds go into a separate per-addon catalog', pick: 'Choose files',
        search: 'Search files…', inCode: 'in Lua code', files: 'files', kept: 'stored', models: '📦 Models', tex: '🖼 Textures', music: '🎵 Music',
        zip: '⬇ ZIP (all)', zipPart: '⬇ ZIP (stored only)', del: '🗑 Delete addon', delConfirm: 'Delete this addon from storage?', pickFile: '← pick a file',
        notKept: 'This file type is not kept in storage.', dl: '⬇ Download', cut: '… only the beginning is shown', author: 'Author', tags: 'Tags',
        import: 'Importing', imported: 'Imported', err: 'Errors', nothing: 'Nothing found', binary: 'Binary file — use the Models / Textures / Music tabs or download it.',
        e_magic: 'Not a GMA file (no GMAD signature).', e_lzma: 'Could not unpack the LZMA (.bin from Steam Workshop): the file is corrupted or not an addon.', e_lzmabig: 'The unpacked addon is too big for the browser (over 2 GB).',
        e_ver: 'Unsupported GMA version.', e_trunc: 'File is corrupted or truncated.', e_big: 'Too many files in the addon.' }
};
const tx = k => (TX[LANG] || TX.en)[k];
const ICON = { lua: '📜', mdl: '📦', vvd: '📦', vtx: '📦', phy: '📦', ani: '📦', vtf: '🖼', vmt: '🎨', wav: '🎵', mp3: '🎵', ogg: '🎵' };
const TEXT_EXT = new Set(['lua', 'vmt']);
const MAX_VIEW = 1.5 * 1024 * 1024, MAX_HL = 300 * 1024, ROW_CAP = 600;

let root, onChange = null, cur = null, dir = '', sel = null, hits = null, scanTok = 0, audioUrl = null;
const metaCache = new Map(), textCache = new Map();
const $ = id => document.getElementById(id);
const rootOf = slug => 'gma/' + slug + '/';

function getMeta(slug){
  return metaCache.get(slug) || null;
}
async function loadMetas(){
  const recs = [];
  for (const [p, f] of Store.files) if (p.startsWith('gma/') && p.endsWith('/__addon.json')) recs.push(f);
  const seen = new Set();
  for (const r of recs){
    const slug = r.path.split('/')[1]; seen.add(slug);
    if (metaCache.has(slug)) continue;
    try { metaCache.set(slug, JSON.parse(td.decode(await getRecordBuffer(r)))); } catch (e){ console.warn('[gma] meta', e); }
  }
  for (const k of [...metaCache.keys()]) if (!seen.has(k)) metaCache.delete(k);
}
async function getBytes(slug, path){
  const rec = Store.files.get(rootOf(slug) + path);
  if (rec) return new Uint8Array(await getRecordBuffer(rec));
  const s = sessions.get(slug);
  if (s){
    const f = s.info.files.find(x => cleanPath(x.path) === path && !x.bad);
    if (f){ const a = s.info.dataStart + f.offset; return new Uint8Array(await s.file.slice(a, a + f.size).arrayBuffer()); }
  }
  throw new Error('not available');
}
async function getText(slug, path){
  const key = rootOf(slug) + path;
  if (textCache.has(key)) return textCache.get(key);
  const text = td.decode(await getBytes(slug, path)).replace(/\r\n?/g, '\n');
  if (textCache.size > 400) textCache.delete(textCache.keys().next().value);
  textCache.set(key, text); return text;
}
function status(msg, bad){ const el = $('gmaStatus'); el.textContent = msg || ''; el.className = 'gma-status' + (bad ? ' bad' : ''); el.style.display = msg ? '' : 'none'; }
const errText = e => e && e.gma ? tx('e_' + e.gma) : (e && e.message || String(e));

function build(){
  root.innerHTML =
    '<div class="t-drop" id="gmaDrop"><div class="big">🔧</div><div class="t" id="gmaDropT"></div><div class="s" id="gmaDropS"></div>' +
    '<div class="t-btns"><button class="t-btn primary" id="gmaPick"></button></div></div>' +
    '<input type="file" id="gmaInput" multiple accept=".gma,.bin" style="position:absolute;left:-9999px;opacity:0;width:0;height:0">' +
    '<div id="gmaStatus" class="gma-status" style="display:none"></div>' +
    '<section class="m-card" id="gmaView" hidden>' +
      '<div class="m-bhead"><select id="gmaSel" class="t-sel"></select><input class="t-search" id="gmaQ" type="search">' +
      '<label class="gma-chk"><input type="checkbox" id="gmaInCode"><span id="gmaInCodeL"></span></label><span class="t-count" id="gmaCount"></span></div>' +
      '<div class="gma-info" id="gmaInfo"></div><div class="gma-acts" id="gmaActs"></div>' +
      '<div class="gma-bc" id="gmaBc"></div>' +
      '<div class="gma-cols" id="gmaCols"><div class="m-list gma-files" id="gmaFiles"></div><div class="gma-file" id="gmaFile"></div></div>' +
    '</section>';
  const drop = $('gmaDrop'), inp = $('gmaInput');
  $('gmaPick').addEventListener('click', e => { e.stopPropagation(); inp.click(); });
  drop.addEventListener('click', e => { if (!e.target.closest('button')) inp.click(); });
  inp.addEventListener('change', () => { const f = [...inp.files]; inp.value = ''; if (f.length) handleFiles(f); });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); if (ev === 'dragleave' && drop.contains(e.relatedTarget)) return; drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = [...(e.dataTransfer.files || [])]; if (f.length) handleFiles(f); });
  $('gmaSel').addEventListener('change', e => { cur = e.target.value; dir = ''; sel = null; hits = null; $('gmaQ').value = ''; renderView(); });
  let qT = 0; const rq = () => { clearTimeout(qT); qT = setTimeout(runSearch, 200); };
  $('gmaQ').addEventListener('input', rq); $('gmaInCode').addEventListener('change', runSearch);
  $('gmaFiles').addEventListener('click', e => {
    const z = e.target.closest('.gma-dl'); if (z){ downloadZip(z.dataset.d); return; }
    const r = e.target.closest('.t-item'); if (!r) return;
    if (r.dataset.d !== undefined){ dir = r.dataset.d; $('gmaFiles').scrollTop = 0; renderList(); return; }
    openFile(r.dataset.p);
  });
  applyTexts();
}
function applyTexts(){
  if (!root || !$('gmaDropT')) return;
  $('gmaDropT').textContent = tx('drop'); $('gmaDropS').textContent = tx('dropSub'); $('gmaPick').textContent = tx('pick');
  $('gmaQ').placeholder = tx('search'); $('gmaInCodeL').textContent = ' ' + tx('inCode');
  if (cur) renderView();
}

async function handleFiles(list){
  const errs = []; let last = null, ok = 0;
  for (const f of list){
    status(tx('import') + ': ' + f.name + '…');
    try { const r = await ingestGMA(f); last = r.slug; ok++; textCache.clear(); metaCache.delete(r.slug); }
    catch (e){ console.error('[gma]', e); errs.push(f.name + ': ' + errText(e)); }
  }
  try { if (onChange) await onChange(); } catch (e){ console.warn(e); }
  if (last){ cur = last; dir = ''; } sel = null; hits = null;
  await refreshAddons();
  if (errs.length) status(tx('err') + ':\n' + errs.join('\n'), true);
  else status(tx('imported') + ': ' + ok);
}

export async function gmaRefresh(){ if (root) await refreshAddons(); }
async function refreshAddons(){
  await loadMetas();
  const metas = [...metaCache.values()].sort((a, b) => a.title.localeCompare(b.title));
  const selEl = $('gmaSel'); selEl.textContent = '';
  for (const m of metas){ const o = document.createElement('option'); o.value = m.slug; o.textContent = m.title + ' (' + m.all.length.toLocaleString(LANG) + ')'; selEl.appendChild(o); }
  if (!metas.length){ cur = null; $('gmaView').hidden = true; return; }
  if (!cur || !metaCache.has(cur)) cur = metas[0].slug;
  selEl.value = cur; $('gmaView').hidden = false;
  renderView();
}

function btn(label, fn, disabled){
  const b = document.createElement('button'); b.className = 't-btn'; b.textContent = label; b.disabled = !!disabled;
  b.addEventListener('click', fn); return b;
}
function goTab(tab){
  const m = getMeta(cur); if (!m) return;
  Games.set(m.g);
  const el = document.querySelector('#topbar .tab[data-tab="' + tab + '"]'); if (el) el.click();
}
function renderView(){
  const m = getMeta(cur); if (!m) return;
  const info = $('gmaInfo'); info.textContent = '';
  const h = document.createElement('div'); h.className = 'gma-title'; h.textContent = m.title; info.appendChild(h);
  const sub = [];
  if (m.author) sub.push(tx('author') + ': ' + m.author);
  if (m.time) sub.push(new Date(m.time * 1000).toLocaleDateString(LANG));
  if (m.type) sub.push(m.type);
  sub.push(fmtB(m.size)); sub.push(m.all.length.toLocaleString(LANG) + ' ' + tx('files') + ' · ' + m.kept.toLocaleString(LANG) + ' ' + tx('kept'));
  sub.push('📜 ' + m.counts.lua + ' · 📦 ' + m.counts.mdl + ' · 🖼 ' + m.counts.vtf + ' · 🎵 ' + m.counts.audio);
  const s = document.createElement('div'); s.className = 'gma-sub'; s.textContent = sub.join('  ·  '); info.appendChild(s);
  if (m.tags && m.tags.length){ const t = document.createElement('div'); t.className = 'gma-sub'; t.textContent = tx('tags') + ': ' + m.tags.join(', '); info.appendChild(t); }
  if (m.description){ const d = document.createElement('div'); d.className = 'gma-desc'; d.textContent = m.description.slice(0, 600); info.appendChild(d); }

  const acts = $('gmaActs'); acts.textContent = '';
  acts.append(
    btn(tx('models'), () => goTab('models'), !m.counts.mdl), btn(tx('tex'), () => goTab('tex'), !m.counts.vtf), btn(tx('music'), () => goTab('music'), !m.counts.audio),
    btn(sessions.has(cur) ? tx('zip') : tx('zipPart'), () => downloadZip('')),
    btn(tx('del'), deleteAddon));
  renderList();
  if (!sel) $('gmaCols').classList.remove('show-file');
  if (sel) openFile(sel); else { $('gmaFile').textContent = ''; const p = document.createElement('div'); p.className = 'gma-hint'; p.textContent = tx('pickFile'); $('gmaFile').appendChild(p); }
}
function currentQuery(){ return $('gmaQ').value.trim().toLowerCase(); }
function listDir(m, d){
  const pre = d ? d + '/' : '', folders = new Map(), files = [];
  for (const [p, size] of m.all){
    if (!p.startsWith(pre)) continue;
    const rest = p.slice(pre.length), i = rest.indexOf('/');
    if (i < 0) files.push([p, size, rest]);
    else { const n = rest.slice(0, i); let f = folders.get(n); if (!f){ f = { n, count: 0, size: 0 }; folders.set(n, f); } f.count++; f.size += size; }
  }
  return { folders: [...folders.values()].sort((a, b) => a.n < b.n ? -1 : 1), files };
}
function renderCrumbs(){
  const bc = $('gmaBc'); bc.textContent = '';
  const add = (label, d) => {
    const b = document.createElement('button'); b.textContent = label;
    b.addEventListener('click', () => { dir = d; $('gmaCols').classList.remove('show-file'); renderList(); });
    bc.appendChild(b);
  };
  add('🏠', '');
  let acc = ''; for (const part of dir ? dir.split('/') : []){ acc = acc ? acc + '/' + part : part; const sep = document.createElement('span'); sep.textContent = '›'; bc.appendChild(sep); add(part, acc); }
}
function renderList(){
  const m = getMeta(cur); if (!m) return;
  const q = currentQuery(), box = $('gmaFiles'); box.textContent = '';
  const searching = !!q;
  $('gmaBc').style.display = searching ? 'none' : '';
  const r0 = rootOf(cur), frag = document.createDocumentFragment();
  const mkFile = ([p, size, label]) => {
    const stored = Store.files.has(r0 + p), ext = getExt(p);
    const row = document.createElement('div'); row.className = 't-item gma-row' + (stored ? '' : ' dim') + (p === sel ? ' active' : ''); row.dataset.p = p;
    const ic = document.createElement('span'); ic.textContent = ICON[ext] || '📄';
    const nm = document.createElement('span'); nm.className = 't-name gma-nm' + (searching ? ' wrap' : ''); nm.textContent = label;
    const sz = document.createElement('span'); sz.className = 't-count'; sz.textContent = (hits && hits.get(p) ? '×' + hits.get(p) + '  ' : '') + fmtB(size);
    row.append(ic, nm, sz); return row;
  };
  let total;
  if (searching){
    const rows = (hits ? m.all.filter(r => hits.has(r[0])) : m.all.filter(r => r[0].includes(q))).map(r => [r[0], r[1], r[0]]);
    total = rows.length;
    for (const r of rows.slice(0, ROW_CAP)) frag.appendChild(mkFile(r));
    if (rows.length > ROW_CAP){ const more = document.createElement('div'); more.className = 'gma-hint'; more.textContent = '… +' + (rows.length - ROW_CAP).toLocaleString(LANG); frag.appendChild(more); }
  } else {
    renderCrumbs();
    const { folders, files } = listDir(m, dir);
    total = folders.length + files.length;
    for (const f of folders){
      const full = dir ? dir + '/' + f.n : f.n;
      const row = document.createElement('div'); row.className = 't-item gma-row gma-dir'; row.dataset.d = full;
      const ic = document.createElement('span'); ic.textContent = '📁';
      const nm = document.createElement('span'); nm.className = 't-name gma-nm'; nm.textContent = f.n;
      const sz = document.createElement('span'); sz.className = 't-count'; sz.textContent = f.count.toLocaleString(LANG) + ' · ' + fmtB(f.size);
      const dl = document.createElement('button'); dl.className = 'gma-dl'; dl.textContent = '⬇'; dl.dataset.d = full; dl.title = 'ZIP';
      row.append(ic, nm, sz, dl); frag.appendChild(row);
    }
    for (const r of files.slice(0, ROW_CAP)) frag.appendChild(mkFile(r));
    if (files.length > ROW_CAP){ const more = document.createElement('div'); more.className = 'gma-hint'; more.textContent = '… +' + (files.length - ROW_CAP).toLocaleString(LANG); frag.appendChild(more); }
  }
  $('gmaCount').textContent = total.toLocaleString(LANG);
  if (!total){ const n = document.createElement('div'); n.className = 'gma-hint'; n.textContent = tx('nothing'); frag.appendChild(n); }
  box.appendChild(frag);
}
async function runSearch(){
  const m = getMeta(cur); if (!m) return;
  const q = currentQuery(), tok = ++scanTok;
  if (!q){ hits = null; renderList(); return; }
  hits = new Map(m.all.filter(r => r[0].includes(q)).map(r => [r[0], 0]));
  renderList();
  if (!$('gmaInCode').checked || q.length < 2) return;
  const r0 = rootOf(cur);
  for (const [p] of m.all){
    if (tok !== scanTok) return;
    if (getExt(p) !== 'lua' || !Store.files.has(r0 + p)) continue;
    try {
      const text = (await getText(cur, p)).toLowerCase();
      let n = 0, i = -1; while ((i = text.indexOf(q, i + 1)) >= 0 && n < 999) n++;
      if (n) hits.set(p, (hits.get(p) || 0) + n);
    } catch (_) {}
  }
  if (tok === scanTok) renderList();
}

async function openFile(p){
  sel = p; $('gmaCols').classList.add('show-file');
  for (const r of $('gmaFiles').children) r.classList.toggle('active', r.dataset && r.dataset.p === p);
  const box = $('gmaFile'); box.textContent = '';
  if (audioUrl){ URL.revokeObjectURL(audioUrl); audioUrl = null; }
  const slug = cur, ext = getExt(p), rec = Store.files.get(rootOf(slug) + p);
  const head = document.createElement('div'); head.className = 'gma-fhead';
  const nm = document.createElement('span'); nm.className = 'gma-fname'; nm.textContent = p;
  const back = btn('←', () => { $('gmaCols').classList.remove('show-file'); }); back.classList.add('gma-back');
  head.append(back, nm, btn(tx('dl'), async () => {
    try { saveBlob(new Blob([await getBytes(slug, p)]), p.split('/').pop()); } catch (e){ status(errText(e), true); }
  }, !rec && !sessions.has(slug)));
  box.appendChild(head);
  const body = document.createElement('div'); box.appendChild(body);
  const note = msg => { const d = document.createElement('div'); d.className = 'gma-hint'; d.textContent = msg; body.appendChild(d); };
  if (!rec && !sessions.has(slug)) return note(tx('notKept'));
  try {
    if (TEXT_EXT.has(ext) && rec){
      let text = await getText(slug, p), cut = false;
      if (text.length > MAX_VIEW){ text = text.slice(0, MAX_VIEW); cut = true; }
      if (slug !== cur || p !== sel) return;
      const q = $('gmaInCode').checked ? currentQuery() : '';
      const html = (ext === 'lua' && text.length <= MAX_HL) ? highlightLua(text) : esc(text);
      const lines = html.split('\n'), pre = document.createElement('div'); pre.className = 'gma-code';
      let first = -1;
      const raw = text.split('\n'), out = [];
      for (let i = 0; i < lines.length; i++){
        const isHit = q && raw[i] && raw[i].toLowerCase().includes(q);
        if (isHit && first < 0) first = i;
        out.push('<div class="l' + (isHit ? ' hit' : '') + '" data-n="' + (i + 1) + '">' + (lines[i] || ' ') + '</div>');
      }
      pre.innerHTML = out.join(''); body.appendChild(pre);
      if (cut) note(tx('cut'));
      if (first >= 0) pre.children[first].scrollIntoView({ block: 'center' });
    } else if (rec && (ext === 'wav' || ext === 'mp3' || ext === 'ogg')){
      const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : 'audio/wav';
      audioUrl = URL.createObjectURL(new Blob([await getBytes(slug, p)], { type: mime }));
      const a = document.createElement('audio'); a.controls = true; a.src = audioUrl; a.style.width = '100%'; body.appendChild(a);
    } else note(rec ? tx('binary') : tx('notKept'));
  } catch (e){ note(errText(e)); }
}

async function downloadZip(prefix = ''){
  const m = getMeta(cur); if (!m) return;
  const slug = cur, files = []; let done = 0;
  try {
    let paths = sessions.has(slug) ? m.all.map(r => r[0]) : m.all.map(r => r[0]).filter(p => Store.files.has(rootOf(slug) + p));
    if (prefix) paths = paths.filter(p => p.startsWith(prefix + '/'));
    for (const p of paths){
      try { files.push({ name: p, data: await getBytes(slug, p) }); } catch (_) {}
      emitProgress('ZIP', ++done, paths.length);
    }
    saveBlob(zipStore(files), slug + (prefix ? '_' + prefix.split('/').pop() : '') + '.zip');
  } catch (e){ status(errText(e), true); }
}
async function deleteAddon(){
  if (!cur || !confirm(tx('delConfirm') + '\n' + (getMeta(cur) || {}).title)) return;
  const r0 = rootOf(cur), slug = cur;
  await Store.deleteMany([...Store.files.keys()].filter(k => k.startsWith(r0)));
  sessions.delete(slug); metaCache.delete(slug); cur = null; dir = ''; sel = null; hits = null;
  try { if (onChange) await onChange(); } catch (_) {}
  await refreshAddons(); status('');
}

export function initGMA(opts = {}){
  root = document.getElementById('gmaRoot'); if (!root) return;
  onChange = opts.onChange || null;
  build();
  window.addEventListener('langchange', applyTexts);
  refreshAddons();
}