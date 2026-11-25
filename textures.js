// textures.js
import { Store, t, LANG, fmtB, walkDrop, addFilesToStore, Games, bindGameSelect } from './core.js';
import { parseVTF, decodeVTFFrame, vtfFmtName, TexStore } from './vtf.js';
import { splitAndIngestArchives, getRecordBuffer } from './archives.js';

let tItems = [], tCur = -1, tSkip = 0, tRoot = null, tPath = '';
let _tAddToken = 0;
const TL_PAGE = 300;          // сколько строк рисуем за раз
let tLimit = TL_PAGE;

function detectCommonRoot(paths){
  if (!paths.length) return null;
  const withSlash = paths.filter(p => p.indexOf('/') > 0);
  if (withSlash.length !== paths.length) return null;
  const top = withSlash[0].split('/')[0];
  for (const p of withSlash) { if (p.split('/')[0] !== top) return null; }
  return top;
}

// Ленивый разбор VTF: читаем и парсим только то, что реально показано/выбрано
function ensureVtf(it){
  if (it.vtf || it.error) return Promise.resolve();
  if (!it._p){
    it._p = (async () => {
      try { it.vtf = parseVTF(await getRecordBuffer(it.fileRec)); }
      catch (e) {
        it.error = e.message || String(e); tSkip++;
        const sk = document.getElementById('tSkip'); if (sk) sk.textContent = tSkip.toLocaleString(LANG);
      }
    })();
  }
  return it._p;
}
let _thumbActive = 0; const _thumbWait = [];
function pumpThumbs(){
  while (_thumbActive < 4 && _thumbWait.length){
    const el = _thumbWait.pop();                 // последние попавшие в вид — первыми
    if (!el.isConnected) continue;
    const it = el._vtfItem; if (!it || it.thumb) continue;
    _thumbActive++;
    (async () => {
      try {
        await ensureVtf(it);
        if (it.vtf && !it.thumb) makeThumb(it);
        if (!el.isConnected) return;
        if (it.thumb){ el.style.backgroundImage = `url(${it.thumb})`; el.textContent = ''; }
        else if (it.error){ el.style.background = 'rgba(255,96,96,.15)'; el.textContent = '⚠'; el.style.color = '#ffb3b3'; }
      } finally { _thumbActive--; pumpThumbs(); }
    })();
  }
}
const thumbObserver = new IntersectionObserver((entries) => {
  for (const e of entries){
    if (!e.isIntersecting) continue;
    thumbObserver.unobserve(e.target); _thumbWait.push(e.target);
  }
  pumpThumbs();
}, { rootMargin: '200px' });

function makeThumb(it){
  try {
    const v = it.vtf; let mip = 0;
    for (let m = v.mipmaps - 1; m >= 0; m--){ const mw = Math.max(1, v.width >> m); if (mw >= 16){ mip = m; break; } mip = m; }
    const res = decodeVTFFrame(v, mip, 0), T = 72;
    const scale = Math.min(T / res.width, T / res.height, 1);
    const tw = Math.max(1, Math.round(res.width  * scale)), th = Math.max(1, Math.round(res.height * scale));
    const full = document.createElement('canvas'); full.width = res.width; full.height = res.height;
    const fc = full.getContext('2d'); const id = fc.createImageData(res.width, res.height); id.data.set(res.pixels); fc.putImageData(id, 0, 0);
    const tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
    const tc = tmp.getContext('2d'); tc.imageSmoothingEnabled = true; tc.drawImage(full, 0, 0, tw, th);
    it.thumb = tmp.toDataURL('image/png');
  } catch (e) { it.thumb = null; }
}

// Только метаданные: ни одного чтения файла при старте/смене игры.
export async function tAddFromStore(opts = {}){
  const token = ++_tAddToken;
  const { resetView = false, keepSelection = false } = opts;
  if (resetView) { tRoot = null; tPath = ''; tLimit = TL_PAGE; }
  const prevSelected = (keepSelection && tCur >= 0 && tItems[tCur]) ? tItems[tCur].fileRec?.path : null;
  if (!keepSelection) tCur = -1;

  Games.refresh();
  const vtfFiles = Store.listByExt('vtf').filter(f => Games.matches(f));
  const localRoot = detectCommonRoot(vtfFiles.map(f => f.path));
  const localItems = [];
  for (let i = 0; i < vtfFiles.length; i++){
    if (i && i % 5000 === 0){ await new Promise(r => setTimeout(r, 0)); if (token !== _tAddToken) return; }
    const f = vtfFiles[i];
    let rel = f.path;
    if (localRoot && rel.startsWith(localRoot + '/')) rel = rel.slice(localRoot.length + 1);
    localItems.push({ name: f.path.slice(f.path.lastIndexOf('/') + 1), relPath: rel, size: f.size, fileRec: f, vtf: null, error: null });
  }
  if (token !== _tAddToken) return;
  tItems = localItems; tSkip = 0; tRoot = localRoot;
  tItems.sort((a, b) => a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0);
  document.getElementById('tViewerSec').hidden = tItems.length === 0;
  if (prevSelected){
    const idx = tItems.findIndex(it => it.fileRec && it.fileRec.path === prevSelected);
    if (idx >= 0) tCur = idx;
  }
  tRender(); tPreview();
  if (tCur === -1 || tCur >= tItems.length){
    const fi = tItems.findIndex(it => it.relPath.indexOf('/') < 0);
    if (fi >= 0) tSelect(fi); else if (tItems.length) tSelect(0);
  }
}

function tContents(path){
  const pre = path ? path + '/' : ''; const fm = new Map(); const files = [];
  for (const it of tItems){
    if (pre && it.relPath.indexOf(pre) !== 0) continue;
    const rest = it.relPath.slice(pre.length); if (!rest) continue;
    const sl = rest.indexOf('/');
    if (sl >= 0) { const name = rest.slice(0, sl); fm.set(name, (fm.get(name) || 0) + 1); }
    else files.push(it);
  }
  return { folders: [...fm.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)), files: files.sort((a, b) => a.name.localeCompare(b.name)) };
}
function tNav(p){ tLimit = TL_PAGE; tPath = p; document.getElementById('tSearch').value = ''; tRender(); }

function tBc(){
  const el = document.getElementById('tBc'); el.textContent = '';
  if (!tRoot){
    const c = document.createElement('span');
    c.className = 't-crumb' + (tPath ? '' : ' cur');
    c.innerHTML = '<span style="opacity:.85;margin-right:5px">📁</span>' + t('contents_emoji').replace('📂 ', '');
    if (tPath) c.addEventListener('click', () => tNav(''));
    el.appendChild(c);
    if (tPath){
      const parts = tPath.split('/');
      parts.forEach((p, idx) => {
        const sep = document.createElement('span'); sep.className = 't-sep'; sep.textContent = '›'; el.appendChild(sep);
        const pu = parts.slice(0, idx + 1).join('/'), isLast = idx === parts.length - 1;
        const c2 = document.createElement('span'); c2.className = 't-crumb' + (isLast ? ' cur' : ''); c2.textContent = p;
        if (!isLast) c2.addEventListener('click', () => tNav(pu));
        el.appendChild(c2);
      });
    }
    return;
  }
  const r = document.createElement('span'); r.className = 't-crumb' + (tPath ? '' : ' cur'); r.innerHTML = '<span style="opacity:.85;margin-right:5px">📁</span>' + tRoot;
  if (tPath) r.addEventListener('click', () => tNav('')); el.appendChild(r);
  if (tPath){
    const parts = tPath.split('/');
    parts.forEach((p, idx) => {
      const sep = document.createElement('span'); sep.className = 't-sep'; sep.textContent = '›'; el.appendChild(sep);
      const pu = parts.slice(0, idx + 1).join('/'), isLast = idx === parts.length - 1;
      const c = document.createElement('span'); c.className = 't-crumb' + (isLast ? ' cur' : ''); c.textContent = p;
      if (!isLast) c.addEventListener('click', () => tNav(pu)); el.appendChild(c);
    });
  }
}

let tST = null;
function moreRow(rest){
  const b = document.createElement('button'); b.className = 't-btn'; b.style.cssText = 'width:calc(100% - 16px);margin:8px';
  b.textContent = (LANG === 'ru' ? 'Показать ещё' : 'Show more') + ' (' + rest.toLocaleString(LANG) + ')';
  b.addEventListener('click', () => { const l = document.getElementById('tList'), sc = l.scrollTop; tLimit += TL_PAGE; tRender(); l.scrollTop = sc; });
  return b;
}
function tRender(){
  tBc(); const q = document.getElementById('tSearch').value.trim().toLowerCase(); const el = document.getElementById('tList'); el.textContent = '';
  if (q){
    const ms = tItems.filter(it => it.relPath.toLowerCase().indexOf(q) >= 0); document.getElementById('tCount').textContent = t('found_of', { n: ms.length, m: tItems.length });
    if (!ms.length){ const d = document.createElement('div'); d.className = 't-empty'; d.textContent = t('nothing_found'); el.appendChild(d); return; }
    const frag = document.createDocumentFragment(); for (const it of ms.slice(0, tLimit)) frag.appendChild(tRow(it, it.relPath)); if (ms.length > tLimit) frag.appendChild(moreRow(ms.length - tLimit)); el.appendChild(frag); return;
  }
  const { folders, files } = tContents(tPath); document.getElementById('tCount').textContent = t('folders_files', { n: folders.length, m: files.length });
  if (!folders.length && !files.length){ const d = document.createElement('div'); d.className = 't-empty'; d.textContent = t('empty'); el.appendChild(d); return; }
  const frag = document.createDocumentFragment();
  for (const fo of folders){
    const np = tPath ? tPath + '/' + fo.name : fo.name; const row = document.createElement('div'); row.className = 't-item folder';
    const th = document.createElement('div'); th.className = 't-thumb'; th.textContent = '📁';
    const info = document.createElement('div'); info.className = 't-info'; const nm = document.createElement('div'); nm.className = 't-name'; nm.textContent = fo.name;
    const sb = document.createElement('div'); sb.className = 't-sub'; sb.textContent = fo.count + ' VTF'; info.append(nm, sb);
    const arr = document.createElement('div'); arr.className = 't-arrow'; arr.textContent = '›'; row.append(th, info, arr);
    row.addEventListener('click', () => tNav(np)); frag.appendChild(row);
  }
  for (const it of files.slice(0, tLimit)) frag.appendChild(tRow(it, it.name)); if (files.length > tLimit) frag.appendChild(moreRow(files.length - tLimit)); el.appendChild(frag);
}
function tRow(it, disp){
  const row = document.createElement('div'); row.className = 't-item' + (tItems[tCur] === it ? ' active' : '') + (it.error ? ' err' : '');
  const th = document.createElement('div'); th.className = 't-thumb';
  if (it.thumb){ th.style.backgroundImage = `url(${it.thumb})`; }
  else if (it.error){ th.style.background = 'rgba(255,96,96,.15)'; th.textContent = '⚠'; th.style.color = '#ffb3b3'; }
  else { if (it.vtf && !it.thumb) {} th.textContent = '🖼'; th.style.color = '#5f6a80'; th._vtfItem = it; thumbObserver.observe(th); }
  const info = document.createElement('div'); info.className = 't-info'; const nm = document.createElement('div'); nm.className = 't-name'; nm.textContent = it.name;
  const sb = document.createElement('div'); sb.className = 't-sub';
  if (it.error) sb.textContent = '✕ ' + it.error; else sb.textContent = it.vtf ? (it.vtf.width + '×' + it.vtf.height + ' · ' + it.vtf.formatName) : '';
  info.append(nm, sb); if (disp.indexOf('/') >= 0) sb.textContent = '📂 ' + disp.slice(0, disp.lastIndexOf('/'));
  const mt = document.createElement('div'); mt.className = 't-meta'; mt.textContent = fmtB(it.size); row.append(th, info, mt);
  if (!it.error) row.addEventListener('click', () => tSelect(tItems.indexOf(it))); return row;
}
async function tSelect(i){
  if (i < 0 || i >= tItems.length) return; const it = tItems[i];
  await ensureVtf(it); if (tItems[i] !== it) return;
  if (it.error){ tRender(); return; }
  tCur = i; tRender(); tPreview();
}
function tPreview(){
  const chipsEl = document.getElementById('tChips'), mipSel = document.getElementById('tMip'), frameSel = document.getElementById('tFrame');
  document.getElementById('tWarn').innerHTML = ''; chipsEl.textContent = ''; mipSel.textContent = ''; frameSel.textContent = ''; mipSel.disabled = true; frameSel.disabled = true;
  if (tCur < 0 || tCur >= tItems.length || tItems[tCur].error){ document.getElementById('tView').innerHTML = '<div class="t-ph"><span class="big">🖼️</span>' + t('pick_vtf') + '</div>'; return; }
  const it = tItems[tCur], v = it.vtf;
  const chips = [ ['Size', v.width + '×' + v.height], ['Format', v.formatName], ['Mips', String(v.mipmaps)], ['Frames', String(v.frames)], ['Version', 'v' + v.version] ];
  if (v.depth > 1) chips.push(['Depth', String(v.depth)]); if (v.flags) chips.push(['Flags', '0x' + v.flags.toString(16).padStart(8, '0')]);
  for (const [k, val] of chips){ const c = document.createElement('span'); c.className = 't-chip'; c.innerHTML = k + ': <b>' + val + '</b>'; chipsEl.appendChild(c); }
  const pc = document.createElement('span'); pc.className = 't-chip'; pc.innerHTML = 'Path: <b>' + (tRoot ? tRoot + '/' : '') + it.relPath + '</b>'; chipsEl.appendChild(pc);
  for (let i = 0; i < v.mipmaps; i++){ const mw = Math.max(1, v.width >> i), mh = Math.max(1, v.height >> i); const o = document.createElement('option'); o.value = i; o.textContent = i + ' — ' + mw + '×' + mh; mipSel.appendChild(o); }
  for (let i = 0; i < v.frames; i++){ const o = document.createElement('option'); o.value = i; o.textContent = t('frame').replace(':', '') + ' ' + (i + 1) + '/' + v.frames; frameSel.appendChild(o); }
  mipSel.disabled = false; frameSel.disabled = v.frames <= 1; mipSel.onchange = tDraw; frameSel.onchange = tDraw; tDraw();
}
function tDraw(){
  const it = tItems[tCur]; if (!it || it.error) return;
  const v = it.vtf; const mip = parseInt(document.getElementById('tMip').value || '0', 10); const f = parseInt(document.getElementById('tFrame').value || '0', 10); let res;
  try { res = decodeVTFFrame(v, mip, f); } catch (e) { document.getElementById('tView').innerHTML = '<div class="t-ph" style="color:#ffb3b3">⚠️ ' + e.message + '</div>'; return; }
  const el = document.getElementById('tView'); el.textContent = '';
  const cv = document.createElement('canvas'); cv.width = res.width; cv.height = res.height; const ctx = cv.getContext('2d');
  const id = ctx.createImageData(res.width, res.height); id.data.set(res.pixels); ctx.putImageData(id, 0, 0);
  if (res.width <= 256 && res.height <= 256) cv.style.imageRendering = 'pixelated'; el.appendChild(cv);
  const n = document.createElement('div'); n.style.cssText = 'color:#8a93a8;font-size:11.5px;font-family:var(--mono);text-align:center'; n.textContent = res.width + '×' + res.height + ' · ' + t('mip_frame', { mip: mip, frame: f + 1, total: v.frames }); el.appendChild(n);
  const fm = v.format; if (fm === 24 || fm === 25 || fm === 23 || fm === 26 || fm === 7 || fm === 22){ document.getElementById('tWarn').innerHTML = '<div class="t-warn">' + t('approx_fmt', { fmt: vtfFmtName(fm) }) + '</div>'; }
}

export function initTextures() {
  document.getElementById('tSearch').addEventListener('input', () => { clearTimeout(tST); tST = setTimeout(() => { tLimit = TL_PAGE; tRender(); }, 150); });
  const gs = document.createElement('select'); gs.id = 'tGameSel'; gs.className = 't-sel'; gs.style.maxWidth = '230px';
  document.getElementById('tSearch').insertAdjacentElement('beforebegin', gs);
  bindGameSelect(gs, 'vtf');
  Games.onChange(() => { tLimit = TL_PAGE; tAddFromStore({ resetView: true }); });
  document.getElementById('tPng').addEventListener('click', () => {
    const it = tItems[tCur]; if (!it || it.error) return;
    const cv = document.getElementById('tView').querySelector('canvas'); if (!cv) return;
    cv.toBlob(blob => {
      if (!blob) return; const base = it.name.replace(/\.vtf$/i, ''); const m = document.getElementById('tMip').value || '0'; const f = document.getElementById('tFrame').value || '0';
      const s = (document.getElementById('tMip').options.length > 1 ? '_mip' + m : '') + (it.vtf.frames > 1 ? '_f' + (parseInt(f, 10) + 1) : '');
      const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = base + s + '.png';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
    }, 'image/png');
  });
  document.getElementById('tPickFolder').addEventListener('click', e => { e.stopPropagation(); document.getElementById('tFolderInput').click(); });
  document.getElementById('tPickFiles').addEventListener('click', e => { e.stopPropagation(); document.getElementById('tFileInput').click(); });
  document.getElementById('tClear').addEventListener('click', e => {
    e.stopPropagation(); tItems = []; tCur = -1; tSkip = 0; tRoot = null; tPath = '';
    document.getElementById('tFileInput').value = ''; document.getElementById('tFolderInput').value = ''; document.getElementById('tSearch').value = '';
    document.getElementById('tViewerSec').hidden = true; document.getElementById('tTotal').textContent = '0'; document.getElementById('tSkip').textContent = '0';
  });
  document.getElementById('tDrop').addEventListener('click', e => { if (!e.target.closest('button')) document.getElementById('tFolderInput').click(); });

  document.getElementById('tFileInput').addEventListener('change', async () => {
    const inp = document.getElementById('tFileInput');
    if (inp.files.length){
      const list = [...inp.files].map(f => ({ path: f.name, file: f }));
      await splitAndIngestArchives(list);
      await addFilesToStore(list);
      await TexStore.rebuild();
      await tAddFromStore({ resetView: false, keepSelection: false });
    }
    inp.value = '';
  });

  document.getElementById('tFolderInput').addEventListener('change', async () => {
    const inp = document.getElementById('tFolderInput');
    if (inp.files.length){
      const list = [...inp.files].map(f => ({ path: f.webkitRelativePath || f.name, file: f }));
      await splitAndIngestArchives(list);
      await addFilesToStore(list);
      await TexStore.rebuild();
      await tAddFromStore({ resetView: true, keepSelection: false });
    }
    inp.value = '';
  });

  ['dragenter', 'dragover'].forEach(ev => { document.getElementById('tDrop').addEventListener(ev, e => { e.preventDefault(); document.getElementById('tDrop').classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(ev => { document.getElementById('tDrop').addEventListener(ev, e => { e.preventDefault(); if (ev === 'dragleave' && document.getElementById('tDrop').contains(e.relatedTarget)) return; document.getElementById('tDrop').classList.remove('over'); }); });

  document.getElementById('tDrop').addEventListener('drop', async e => {
    e.preventDefault();
    const list = await walkDrop(e.dataTransfer);
    if (list.length){
      const hasFolder = list.some(x => x.path && x.path.indexOf('/') >= 0);
      await splitAndIngestArchives(list);
      await addFilesToStore(list);
      await TexStore.rebuild();
      await tAddFromStore({ resetView: hasFolder, keepSelection: false });
    }
  });

  const _tRender = tRender;
  tRender = function(){ document.getElementById('tTotal').textContent = tItems.filter(it => !it.error).length.toLocaleString(LANG); document.getElementById('tSkip').textContent = tSkip.toLocaleString(LANG); _tRender(); };

  window.addEventListener('langchange', () => {
    if (tItems.length){
      document.getElementById('tViewerSec').hidden = false;
      tRender();
      tPreview();
    }
  });

  window.addEventListener('openasset', async e => {
    if (!e.detail || e.detail.ext !== 'vtf') return;
    const tb = document.querySelector('#topbar .tab[data-tab="tex"]');
    if (tb) tb.click();
    await new Promise(r => setTimeout(r, 60));
    try { Games.set('all'); } catch(_){}
    await tAddFromStore({ resetView: true, keepSelection: false });
    const want = e.detail.path;
    let idx = tItems.findIndex(it => it.fileRec && it.fileRec.path === want);
    if (idx < 0){
      const base = want.split('/').pop();
      idx = tItems.findIndex(it => it.name === base);
    }
    if (idx >= 0) tSelect(idx);
  });
}