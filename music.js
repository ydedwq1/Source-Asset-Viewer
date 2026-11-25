// music.js
// Плеер музыки и звуков Source-игр
import { Store, t, LANG, fmtB, walkDrop, addFilesToStore, Games, bindGameSelect, getExt } from './core.js';
import { splitAndIngestArchives, getRecordBuffer } from './archives.js';
import { convertAudio, zipStore, saveBlob, canOgg, canMp4 } from './export.js';

const AUDIO_EXTS = new Set(['mp3', 'ogg', 'wav']);
const MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' };
const ML_PAGE = 300;

let mItems = [];            // { name, relPath, size, fileRec, fmt, duration }
let mCur = -1;
let mRoot = null;
let mPath = '';
let mLimit = ML_PAGE;
let mShuffle = false;
let mRepeat = 0;            // 0=off, 1=all, 2=one
let mVolume = 1;
let _addToken = 0;
let _seekDrag = false;
let _currentUrl = null;

// ============ helpers ============
const mimeFor = ext => MIME[ext] || 'audio/mpeg';
const getAudio = () => document.getElementById('mAudio');

function fmtDur(sec){
  if (!isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60);
  if (m >= 60){ const h = Math.floor(m / 60); return h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
  return m + ':' + String(s).padStart(2, '0');
}

function detectCommonRoot(paths){
  if (!paths.length) return null;
  const withSlash = paths.filter(p => p.indexOf('/') > 0);
  if (withSlash.length !== paths.length) return null;
  const top = withSlash[0].split('/')[0];
  for (const p of withSlash) if (p.split('/')[0] !== top) return null;
  return top;
}

function setPlaying(on){
  const btn = document.getElementById('mPlay');
  if (btn) btn.textContent = on ? '⏸' : '▶';
  const wrap = document.getElementById('mPlayer');
  if (wrap) wrap.classList.toggle('playing', on);
}

function updateSeekUI(){
  const el = getAudio(); if (!el) return;
  const cur = el.currentTime || 0, dur = el.duration || 0;
  const seek = document.getElementById('mSeek');
  if (seek && !_seekDrag){ seek.max = dur || 1; seek.value = cur; }
  const t1 = document.getElementById('mTimeCur'); if (t1) t1.textContent = fmtDur(cur);
  const t2 = document.getElementById('mTimeDur'); if (t2) t2.textContent = fmtDur(dur);
}

function updateVolumeUI(){
  const el = getAudio(); if (!el) return;
  el.volume = mVolume;
  const vs = document.getElementById('mVol'); if (vs) vs.value = mVolume;
}

function bindAudio(){
  const el = getAudio(); if (!el || el._mBound) return;
  el._mBound = true; el.volume = mVolume;
  el.addEventListener('timeupdate', () => { if (!_seekDrag) updateSeekUI(); });
  el.addEventListener('loadedmetadata', () => {
    updateSeekUI();
    if (mCur >= 0 && mItems[mCur]){ mItems[mCur].duration = el.duration; updateCurUI(); }
  });
  el.addEventListener('play', () => setPlaying(true));
  el.addEventListener('pause', () => setPlaying(false));
  el.addEventListener('ended', () => {
    if (mRepeat === 2){ el.currentTime = 0; el.play().catch(() => {}); return; }
    if (mRepeat === 1 || mShuffle) nextTrack(); else setPlaying(false);
  });
  el.addEventListener('error', () => {
    const err = document.getElementById('mError');
    if (err && mCur >= 0) err.textContent = t('m_play_fail') + ': ' + (mItems[mCur]?.name || '');
    setPlaying(false);
  });
}


// ============ audio decoding (Source WAV: MS-ADPCM / IMA-ADPCM / MP3-in-WAV) ============
const MS_ADAPT = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];
const IMA_STEP = [7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767];
const IMA_IDX = [-1, -1, -1, -1, 2, 4, 6, 8];
const clamp16 = v => v < -32768 ? -32768 : v > 32767 ? 32767 : v;

function pcm16Wav(samples, ch, rate){
  const n = samples.length, out = new ArrayBuffer(44 + n * 2), dv = new DataView(out);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  wr(36, 'data'); dv.setUint32(40, n * 2, true);
  new Int16Array(out, 44, n).set(samples);
  return out;
}

function decodeMsAdpcm(u8, dataOff, dataLen, ch, rate, blockAlign, coefs){
  const out = [];
  const end = Math.min(u8.length, dataOff + dataLen);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  for (let b = dataOff; b + ch * 7 <= end; b += blockAlign){
    const bEnd = Math.min(b + blockAlign, end);
    let p = b;
    const pred = [], delta = [], s1 = [], s2 = [];
    for (let c = 0; c < ch; c++){ pred[c] = Math.min(u8[p++], coefs.length - 1); }
    for (let c = 0; c < ch; c++){ delta[c] = dv.getInt16(p, true); p += 2; }
    for (let c = 0; c < ch; c++){ s1[c] = dv.getInt16(p, true); p += 2; }
    for (let c = 0; c < ch; c++){ s2[c] = dv.getInt16(p, true); p += 2; }
    for (let c = 0; c < ch; c++) out.push(s2[c]);
    for (let c = 0; c < ch; c++) out.push(s1[c]);
    let ni = 0;
    const step = (c, nib) => {
      const [c1, c2] = coefs[pred[c]];
      let v = ((s1[c] * c1 + s2[c] * c2) >> 8) + ((nib & 8 ? nib - 16 : nib) * delta[c]);
      v = clamp16(v); s2[c] = s1[c]; s1[c] = v;
      delta[c] = Math.max(16, (MS_ADAPT[nib] * delta[c]) >> 8);
      out.push(v);
    };
    for (; p < bEnd; p++){ step(ni++ % ch, u8[p] >> 4); step(ni++ % ch, u8[p] & 15); }
  }
  return pcm16Wav(Int16Array.from(out), ch, rate);
}

function decodeImaAdpcm(u8, dataOff, dataLen, ch, rate, blockAlign){
  const end = Math.min(u8.length, dataOff + dataLen);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const chans = Array.from({ length: ch }, () => []);
  for (let b = dataOff; b + 4 * ch <= end; b += blockAlign){
    const bEnd = Math.min(b + blockAlign, end);
    const st = [];
    let p = b;
    for (let c = 0; c < ch; c++){ st[c] = { pred: dv.getInt16(p, true), idx: Math.min(88, u8[p + 2]) }; chans[c].push(st[c].pred); p += 4; }
    const dec = (s, nib) => {
      const stp = IMA_STEP[s.idx]; let d = stp >> 3;
      if (nib & 1) d += stp >> 2; if (nib & 2) d += stp >> 1; if (nib & 4) d += stp; if (nib & 8) d = -d;
      s.pred = clamp16(s.pred + d); s.idx = Math.max(0, Math.min(88, s.idx + IMA_IDX[nib & 7]));
      return s.pred;
    };
    while (p + 4 * ch <= bEnd){
      for (let c = 0; c < ch; c++){
        for (let k = 0; k < 4; k++){ const by = u8[p++]; chans[c].push(dec(st[c], by & 15)); chans[c].push(dec(st[c], by >> 4)); }
      }
    }
  }
  const n = Math.min(...chans.map(c => c.length)), out = new Int16Array(n * ch);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) out[i * ch + c] = chans[c][i];
  return pcm16Wav(out, ch, rate);
}

// Возвращает { buf, mime } — то, что браузер реально сможет проиграть
export function prepareAudio(ab, ext){
  const u8 = new Uint8Array(ab);
  const tag4 = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (u8.length > 12 && tag4(0) === 'RIFF' && tag4(8) === 'WAVE'){
    try {
      const dv = new DataView(ab);
      let p = 12, fmt = null, dataOff = -1, dataLen = 0;
      while (p + 8 <= u8.length){
        const id = tag4(p); let sz = dv.getUint32(p + 4, true);
        if (id === 'fmt ') fmt = { off: p + 8, sz };
        else if (id === 'data'){ dataOff = p + 8; if (sz === 0 || dataOff + sz > u8.length) sz = u8.length - dataOff; dataLen = sz; break; }
        p += 8 + sz + (sz & 1);
      }
      if (fmt && dataOff >= 0){
        let tag = dv.getUint16(fmt.off, true);
        const ch = dv.getUint16(fmt.off + 2, true), rate = dv.getUint32(fmt.off + 4, true), blockAlign = dv.getUint16(fmt.off + 12, true);
        if (tag === 0xFFFE && fmt.sz >= 26) tag = dv.getUint16(fmt.off + 24, true);
        if (tag === 2 && blockAlign > 0){
          const nc = dv.getUint16(fmt.off + 20, true), coefs = [];
          for (let i = 0; i < nc; i++) coefs.push([dv.getInt16(fmt.off + 22 + i * 4, true), dv.getInt16(fmt.off + 24 + i * 4, true)]);
          if (coefs.length) return { buf: decodeMsAdpcm(u8, dataOff, dataLen, ch, rate, blockAlign, coefs), mime: 'audio/wav' };
        } else if (tag === 0x11 && blockAlign > 0){
          return { buf: decodeImaAdpcm(u8, dataOff, dataLen, ch, rate, blockAlign), mime: 'audio/wav' };
        } else if (tag === 0x55){
          return { buf: ab.slice(dataOff, dataOff + dataLen), mime: 'audio/mpeg' };   // MP3 внутри WAV
        }
      }
    } catch (_) {}
    return { buf: ab, mime: 'audio/wav' };
  }
  if (u8.length > 4 && tag4(0) === 'OggS') return { buf: ab, mime: 'audio/ogg' };
  if (u8.length > 3 && ((u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) || (u8[0] === 0xFF && (u8[1] & 0xE0) === 0xE0))) return { buf: ab, mime: 'audio/mpeg' };
  return { buf: ab, mime: mimeFor(ext) };
}

// ============ ingest (файлы / папки / VPK) ============
const onlyAudio = p => AUDIO_EXTS.has(getExt(p));
function setStatus(msg, isErr){
  let el = document.getElementById('mStatus');
  if (!el){
    const drop = document.getElementById('mDrop'); if (!drop) return;
    el = document.createElement('div'); el.id = 'mStatus';
    el.style.cssText = 'margin:8px 2px;font-size:12.5px;white-space:pre-wrap;word-break:break-word';
    drop.insertAdjacentElement('afterend', el);
  }
  el.style.color = isErr ? '#ff9b9b' : '#8fd19e';
  el.textContent = msg || '';
}
async function ingestAudioList(list, resetView){
  if (!list.length) return;
  setStatus(LANG === 'ru' ? 'Загрузка…' : 'Loading…');
  let msg = '', isErr = false;
  try {
    const { result } = await splitAndIngestArchives(list, onlyAudio);   // из VPK берём только звуки
    const before = [...Store.files.values()].filter(f => AUDIO_EXTS.has(f.ext)).length;
    let res = null;
    try { res = await addFilesToStore(list, { silent: true }); } catch (e) { msg += e.message + '\n'; isErr = true; }
    const vpkCount = list.filter(x => /\.vpk$/i.test(x.path || x.file.name)).length;
    if (result){
      if (result.audioCount) msg += (LANG === 'ru' ? 'Из VPK извлечено звуков: ' : 'Sounds extracted from VPK: ') + result.audioCount.toLocaleString(LANG) + '\n';
      else if (vpkCount && !result.errors.length) msg += (LANG === 'ru' ? 'В этих VPK нет звуков (sound/*.wav|mp3|ogg). Звуки обычно лежат в *_sound_*_dir.vpk или pak01_dir.vpk.' : 'No sounds in these VPKs (sound/*.wav|mp3|ogg). Look in *_sound_*_dir.vpk or pak01_dir.vpk.') + '\n';
      if (result.errors.length){ isErr = true; msg += result.errors.slice(0, 6).join('\n') + (result.errors.length > 6 ? '\n…' : '') + '\n'; }
    }
    void before; void res;
  } catch (e) { isErr = true; msg += (e && e.message) || String(e); }
  setStatus(msg.trim(), isErr);
  await mAddFromStore({ resetView });
}


// ============ download / convert ============
const DL_TXT = {
  ru: { orig: 'Оригинал', wav: 'WAV (PCM)', ogg: 'OGG (Opus)', mp4: 'MP4 (AAC)', dl: '⬇ Скачать', zip: '📦 ZIP папки', pick: 'Сначала выбери трек', busy: 'Конвертация', done: 'Готово', big: 'Слишком много данных для ZIP (лимит ~1 ГБ или 2000 файлов)' },
  en: { orig: 'Original', wav: 'WAV (PCM)', ogg: 'OGG (Opus)', mp4: 'MP4 (AAC)', dl: '⬇ Download', zip: '📦 ZIP folder', pick: 'Select a track first', busy: 'Converting', done: 'Done', big: 'Too much data for ZIP (limit ~1 GB or 2000 files)' }
};
const dlt = k => (DL_TXT[LANG] || DL_TXT.en)[k];
let _dlBusy = false;
function dlStatus(msg, isErr){
  const el = document.getElementById('mError'); if (!el) return;
  el.style.color = isErr ? '' : '#8fd19e'; el.textContent = msg || '';
}
function refreshDlUI(){
  const sel = document.getElementById('mDlFmt'); if (!sel) return;
  const cur = sel.value || 'orig'; sel.textContent = '';
  const opts = [['orig', true], ['wav', true], ['ogg', canOgg()], ['mp4', canMp4()]];
  for (const [v, ok] of opts){ if (!ok) continue; const o = document.createElement('option'); o.value = v; o.textContent = dlt(v); sel.appendChild(o); }
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'orig';
  const b = document.getElementById('mDl'); if (b) b.textContent = dlt('dl');
  const z = document.getElementById('mDlZip'); if (z) z.textContent = dlt('zip');
}
async function exportItem(it, fmt, onProg){
  const raw = await getRecordBuffer(it.fileRec);
  const prep = prepareAudio(raw, it.fmt);
  const r = await convertAudio(fmt, { raw, prep, origExt: it.fmt, onProgress: onProg });
  return { blob: r.blob, ext: r.ext, base: it.name.replace(/\.[^.]+$/, '') };
}
async function downloadCurrent(){
  if (_dlBusy) return;
  const it = mCur >= 0 ? mItems[mCur] : null;
  if (!it){ dlStatus(dlt('pick'), true); return; }
  const fmt = document.getElementById('mDlFmt').value;
  _dlBusy = true;
  try {
    dlStatus(dlt('busy') + '…');
    const r = await exportItem(it, fmt, p => dlStatus(dlt('busy') + ' ' + Math.round(p * 100) + '%'));
    saveBlob(r.blob, r.base + '.' + r.ext);
    dlStatus(dlt('done') + ': ' + r.base + '.' + r.ext + ' · ' + fmtB(r.blob.size));
  } catch (e){ dlStatus(e.message || String(e), true); }
  _dlBusy = false;
}
async function downloadZip(){
  if (_dlBusy) return;
  const q = (document.getElementById('mSearch')?.value || '').trim().toLowerCase();
  const list = q ? mItems.filter(it => it.relPath.toLowerCase().indexOf(q) >= 0)
                 : mItems.filter(it => !mPath || it.relPath.indexOf(mPath + '/') === 0);
  if (!list.length){ dlStatus(t('empty'), true); return; }
  let est = 0; for (const it of list) est += it.size || 0;
  if (list.length > 2000 || est > 1024 * 1024 * 1024){ dlStatus(dlt('big'), true); return; }
  const fmt = document.getElementById('mDlFmt').value;
  _dlBusy = true;
  const files = [], used = new Set(); let total = 0, failed = 0;
  try {
    for (let i = 0; i < list.length; i++){
      dlStatus(dlt('busy') + ' ' + (i + 1) + ' / ' + list.length);
      try {
        const r = await exportItem(list[i], fmt);
        let name = (mPath ? list[i].relPath.slice(mPath.length + 1) : list[i].relPath).replace(/\.[^.\/]+$/, '') + '.' + r.ext, n = 1;
        while (used.has(name.toLowerCase())) name = name.replace(/(_\d+)?(\.[^.]+)$/, '_' + (n++) + '$2');
        used.add(name.toLowerCase());
        const data = new Uint8Array(await r.blob.arrayBuffer()); total += data.length;
        if (total > 1.5 * 1024 * 1024 * 1024) throw new Error(dlt('big'));
        files.push({ name, data });
      } catch (e){ if (/ZIP|limit/i.test(e.message)) throw e; failed++; }
    }
    if (!files.length) throw new Error('0 files');
    const folder = (mPath ? mPath.split('/').pop() : (mRoot || 'sounds')) + '_' + fmt + '.zip';
    saveBlob(zipStore(files), folder);
    dlStatus(dlt('done') + ': ' + folder + ' · ' + files.length + (failed ? ' (✗ ' + failed + ')' : ''));
  } catch (e){ dlStatus(e.message || String(e), true); }
  _dlBusy = false;
}

// ============ playback ============
async function loadTrack(idx, autoplay = true){
  if (idx < 0 || idx >= mItems.length) return;
  const el = getAudio(); if (!el) return;
  const it = mItems[idx];
  mCur = idx; mRender();
  try {
    if (_currentUrl){ URL.revokeObjectURL(_currentUrl); _currentUrl = null; }
    const raw = await getRecordBuffer(it.fileRec);
    const prep = prepareAudio(raw, it.fmt);
    const blob = new Blob([prep.buf], { type: prep.mime });
    _currentUrl = URL.createObjectURL(blob);
    el.src = _currentUrl; el.load();
    if (autoplay){ try { await el.play(); } catch (_) { setPlaying(false); } }
    updateCurUI();
    const err = document.getElementById('mError'); if (err) err.textContent = '';
  } catch (e){
    const err = document.getElementById('mError'); if (err) err.textContent = t('m_play_fail') + ': ' + it.name;
    setPlaying(false);
  }
}

function nextTrack(){
  if (!mItems.length) return;
  let idx;
  if (mShuffle && mItems.length > 1){ do { idx = Math.floor(Math.random() * mItems.length); } while (idx === mCur); }
  else idx = (mCur + 1) % mItems.length;
  loadTrack(idx);
}

function prevTrack(){
  const el = getAudio();
  if (el && el.currentTime > 3){ el.currentTime = 0; return; }
  if (!mItems.length) return;
  let idx;
  if (mShuffle && mItems.length > 1){ do { idx = Math.floor(Math.random() * mItems.length); } while (idx === mCur); }
  else idx = mCur <= 0 ? mItems.length - 1 : mCur - 1;
  loadTrack(idx);
}

function togglePlay(){
  const el = getAudio(); if (!el) return;
  if (!el.src){ if (mItems.length) loadTrack(mCur >= 0 ? mCur : 0); return; }
  if (el.paused) el.play().catch(() => {}); else el.pause();
}

// ============ UI ============
function updateCurUI(){
  const it = mCur >= 0 ? mItems[mCur] : null;
  const title = document.getElementById('mTitle'); if (title) title.textContent = it ? it.name : '—';
  const sub = document.getElementById('mSub'); if (sub) sub.textContent = it ? (it.relPath + ' · ' + fmtB(it.size) + ' · ' + it.fmt.toUpperCase()) : '';
  const chips = document.getElementById('mChips');
  if (chips){
    chips.innerHTML = '';
    if (it){
      const rows = [['Format', it.fmt.toUpperCase()], ['Size', fmtB(it.size)], ['Duration', it.duration ? fmtDur(it.duration) : '—']];
      for (const [k, v] of rows){ const c = document.createElement('span'); c.className = 'm-chip'; c.innerHTML = k + ': <b>' + v + '</b>'; chips.appendChild(c); }
      const p = document.createElement('span'); p.className = 'm-chip'; p.innerHTML = 'Path: <b>' + it.relPath + '</b>'; chips.appendChild(p);
    }
  }
}

function contentsOf(path){
  const pre = path ? path + '/' : '', fm = new Map(), files = [];
  for (const it of mItems){
    if (pre && it.relPath.indexOf(pre) !== 0) continue;
    const rest = it.relPath.slice(pre.length); if (!rest) continue;
    const sl = rest.indexOf('/');
    if (sl >= 0){ const name = rest.slice(0, sl); fm.set(name, (fm.get(name) || 0) + 1); }
    else files.push(it);
  }
  return { folders: [...fm.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
           files: files.sort((a, b) => a.name.localeCompare(b.name)) };
}

function navTo(p){
  mLimit = ML_PAGE; mPath = p;
  const s = document.getElementById('mSearch'); if (s) s.value = '';
  mRender();
}

function renderBreadcrumbs(){
  const el = document.getElementById('mBc'); if (!el) return;
  el.textContent = '';
  const crumb = (label, path, isLast) => {
    const c = document.createElement('span'); c.className = 't-crumb' + (isLast ? ' cur' : '');
    c.innerHTML = '<span style="opacity:.85;margin-right:5px">📁</span>' + label;
    if (!isLast) c.addEventListener('click', () => navTo(path));
    el.appendChild(c);
  };
  const rootName = mRoot || (t('m_playlist') || 'Music');
  crumb(rootName, '', !mPath);
  if (mPath){
    const parts = mPath.split('/');
    parts.forEach((p, i) => {
      const sep = document.createElement('span'); sep.className = 't-sep'; sep.textContent = '›'; el.appendChild(sep);
      crumb(p, parts.slice(0, i + 1).join('/'), i === parts.length - 1);
    });
  }
}

function moreRow(rest){
  const b = document.createElement('button'); b.className = 't-btn';
  b.style.cssText = 'width:calc(100% - 16px);margin:8px';
  b.textContent = (LANG === 'ru' ? 'Показать ещё' : 'Show more') + ' (' + rest.toLocaleString(LANG) + ')';
  b.addEventListener('click', () => { const l = document.getElementById('mList'), sc = l.scrollTop; mLimit += ML_PAGE; mRender(); l.scrollTop = sc; });
  return b;
}

function mRender(){
  renderBreadcrumbs();
  const q = (document.getElementById('mSearch')?.value || '').trim().toLowerCase();
  const el = document.getElementById('mList'); if (!el) return;
  el.textContent = '';
  const countEl = document.getElementById('mCount');
  const curAudio = getAudio();

  if (q){
    const ms = mItems.filter(it => it.relPath.toLowerCase().indexOf(q) >= 0);
    if (countEl) countEl.textContent = t('found_of', { n: ms.length, m: mItems.length });
    if (!ms.length){ const d = document.createElement('div'); d.className = 't-empty'; d.textContent = t('nothing_found'); el.appendChild(d); return; }
    const frag = document.createDocumentFragment();
    for (const it of ms.slice(0, mLimit)) frag.appendChild(mRow(it, it.relPath));
    if (ms.length > mLimit) frag.appendChild(moreRow(ms.length - mLimit));
    el.appendChild(frag); return;
  }

  const { folders, files } = contentsOf(mPath);
  if (countEl) countEl.textContent = t('folders_files', { n: folders.length, m: files.length });
  if (!folders.length && !files.length){ const d = document.createElement('div'); d.className = 't-empty'; d.textContent = t('empty'); el.appendChild(d); return; }

  const frag = document.createDocumentFragment();
  for (const fo of folders){
    const np = mPath ? mPath + '/' + fo.name : fo.name;
    const row = document.createElement('div'); row.className = 't-item folder';
    const th = document.createElement('div'); th.className = 't-thumb'; th.textContent = '📁';
    const info = document.createElement('div'); info.className = 't-info';
    const nm = document.createElement('div'); nm.className = 't-name'; nm.textContent = fo.name;
    const sb = document.createElement('div'); sb.className = 't-sub'; sb.textContent = fo.count + ' ' + (t('m_tracks') || 'tracks');
    info.append(nm, sb);
    const arr = document.createElement('div'); arr.className = 't-arrow'; arr.textContent = '›';
    row.append(th, info, arr);
    row.addEventListener('click', () => navTo(np));
    frag.appendChild(row);
  }
  for (const it of files.slice(0, mLimit)) frag.appendChild(mRow(it, it.name, curAudio));
  if (files.length > mLimit) frag.appendChild(moreRow(files.length - mLimit));
  el.appendChild(frag);
}

function mRow(it, disp, curAudio){
  const active = mItems[mCur] === it;
  const playing = active && curAudio && !curAudio.paused && curAudio.src;
  const row = document.createElement('div'); row.className = 't-item' + (active ? ' active' : '');
  const th = document.createElement('div'); th.className = 't-thumb';
  th.textContent = playing ? '▶' : '🎵';
  th.style.color = active ? '#58a6ff' : '#5f6a80';
  const info = document.createElement('div'); info.className = 't-info';
  const nm = document.createElement('div'); nm.className = 't-name'; nm.textContent = it.name;
  const sb = document.createElement('div'); sb.className = 't-sub';
  sb.textContent = (it.duration ? fmtDur(it.duration) + ' · ' : '') + it.fmt.toUpperCase();
  info.append(nm, sb);
  const mt = document.createElement('div'); mt.className = 't-meta'; mt.textContent = fmtB(it.size);
  row.append(th, info, mt);
  const idx = mItems.indexOf(it);
  row.addEventListener('click', () => {
    if (mCur === idx && curAudio && curAudio.src) togglePlay();
    else loadTrack(idx);
  });
  return row;
}

// ============ store loading ============
export async function mAddFromStore(opts = {}){
  const token = ++_addToken;
  const { resetView = false } = opts;
  if (resetView){ mRoot = null; mPath = ''; mLimit = ML_PAGE; }
  Games.refresh();
  const audioFiles = [...Store.files.values()].filter(f => AUDIO_EXTS.has(f.ext) && Games.matches(f));
  const localRoot = detectCommonRoot(audioFiles.map(f => f.path));
  const items = [];
  const prevDur = new Map(); for (const x of mItems) prevDur.set(x.fileRec.path, x.duration);
  for (let i = 0; i < audioFiles.length; i++){
    if (i && i % 5000 === 0){ await new Promise(r => setTimeout(r, 0)); if (token !== _addToken) return; }
    const f = audioFiles[i];
    let rel = f.path;
    if (localRoot && rel.startsWith(localRoot + '/')) rel = rel.slice(localRoot.length + 1);
    items.push({ name: f.path.slice(f.path.lastIndexOf('/') + 1), relPath: rel, size: f.size, fileRec: f, fmt: f.ext, duration: prevDur.get(f.path) ?? null });
  }
  if (token !== _addToken) return;
  mItems = items;
  mItems.sort((a, b) => a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0);
  mRoot = localRoot;
  const sec = document.getElementById('mViewerSec'); if (sec) sec.hidden = mItems.length === 0;
  if (mCur >= mItems.length) mCur = -1;
  mRender();
  if (mCur >= 0) updateCurUI();
}

// ============ init ============
export function initMusic(){
  bindAudio(); updateVolumeUI();
  const $ = id => document.getElementById(id);

  $('mPickFolder')?.addEventListener('click', e => { e.stopPropagation(); $('mFolderInput').click(); });
  $('mPickFiles')?.addEventListener('click', e => { e.stopPropagation(); $('mFileInput').click(); });
  $('mClear')?.addEventListener('click', e => {
    e.stopPropagation();
    mItems = []; mCur = -1; mRoot = null; mPath = '';
    const el = getAudio();
    if (el){ el.pause(); el.removeAttribute('src'); el.load(); }
    if (_currentUrl){ URL.revokeObjectURL(_currentUrl); _currentUrl = null; }
    ['mFileInput', 'mFolderInput', 'mSearch'].forEach(id => { const x = $(id); if (x) x.value = ''; });
    const sec = $('mViewerSec'); if (sec) sec.hidden = true;
    setPlaying(false);
    mRender();
  });

  $('mFileInput')?.addEventListener('change', async () => {
    const inp = $('mFileInput');
    if (inp.files.length){
      const list = [...inp.files].map(f => ({ path: f.name, file: f }));
      await ingestAudioList(list, false);
    }
    inp.value = '';
  });

  $('mFolderInput')?.addEventListener('change', async () => {
    const inp = $('mFolderInput');
    if (inp.files.length){
      const list = [...inp.files].map(f => ({ path: f.webkitRelativePath || f.name, file: f }));
      await ingestAudioList(list, true);
    }
    inp.value = '';
  });

  const drop = $('mDrop');
  if (drop){
    drop.addEventListener('click', e => { if (!e.target.closest('button')) $('mFolderInput').click(); });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault();
      if (ev === 'dragleave' && drop.contains(e.relatedTarget)) return;
      drop.classList.remove('over');
    }));
    drop.addEventListener('drop', async e => {
      e.preventDefault();
      const list = await walkDrop(e.dataTransfer); if (!list.length) return;
      const hasFolder = list.some(x => x.path && x.path.indexOf('/') >= 0);
      await ingestAudioList(list, hasFolder);
    });
  }

  $('mPlay')?.addEventListener('click', togglePlay);
  $('mPrev')?.addEventListener('click', prevTrack);
  $('mNext')?.addEventListener('click', nextTrack);
  $('mShuffle')?.addEventListener('click', () => {
    mShuffle = !mShuffle;
    $('mShuffle').classList.toggle('on', mShuffle);
  });
  $('mRepeat')?.addEventListener('click', () => {
    mRepeat = (mRepeat + 1) % 3;
    const b = $('mRepeat');
    b.textContent = mRepeat === 2 ? '🔂' : '🔁';
    b.classList.toggle('on', mRepeat > 0);
    b.title = mRepeat === 0 ? t('m_repeat_off') : mRepeat === 1 ? t('m_repeat_all') : t('m_repeat_one');
  });
  $('mVol')?.addEventListener('input', e => { mVolume = parseFloat(e.target.value); updateVolumeUI(); });

  const seek = $('mSeek');
  if (seek){
    seek.addEventListener('mousedown', () => { _seekDrag = true; });
    seek.addEventListener('touchstart', () => { _seekDrag = true; }, { passive: true });
    seek.addEventListener('input', () => {
      const el = getAudio();
      if (el && el.duration){ const t1 = $('mTimeCur'); if (t1) t1.textContent = fmtDur(parseFloat(seek.value)); }
    });
    const commit = () => {
      _seekDrag = false;
      const el = getAudio();
      if (el && el.duration) el.currentTime = parseFloat(seek.value);
    };
    seek.addEventListener('change', commit);
    seek.addEventListener('mouseup', commit);
    seek.addEventListener('touchend', commit);
  }

  const gs = $('mGameSel');
  if (gs){ bindGameSelect(gs, 'audio'); Games.onChange(() => { mLimit = ML_PAGE; mAddFromStore({ resetView: true }); }); }

  let sT = null;
  $('mSearch')?.addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(() => { mLimit = ML_PAGE; mRender(); }, 150); });

  // hotkeys when Music tab active
  window.addEventListener('keydown', e => {
    const pane = document.getElementById('paneMusic');
    if (!pane || !pane.classList.contains('active')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (e.code === 'Space'){ e.preventDefault(); togglePlay(); }
    else if (e.shiftKey && e.key === 'ArrowRight'){ e.preventDefault(); nextTrack(); }
    else if (e.shiftKey && e.key === 'ArrowLeft'){ e.preventDefault(); prevTrack(); }
  });

  refreshDlUI();
  $('mDl')?.addEventListener('click', downloadCurrent);
  $('mDlZip')?.addEventListener('click', downloadZip);
  window.addEventListener('langchange', () => { mRender(); updateCurUI(); refreshDlUI(); });
}