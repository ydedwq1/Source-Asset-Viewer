// app.js
import { 
  loadI18N, detectLang, LANG, setLang, t, applyI18n, I18N,
  Store, shouldKeepFile, getExt, fmtB, EntityIcons, 
  addFilesToStore, walkDrop, Games, gameOf, gameLabel, PackOpts, setVtfDrop 
} from './core.js';
import { TexStore } from './vtf.js';
import { splitAndIngestArchives, parseVPKDirectory, optimizeStorage } from './archives.js';
import { initVMF, vmfResize, loadVMFText, loadMapFromStore } from './vmf.js';
import { initModels, modelResize, scanModels, rebuildFileMapFromStore, disposeTextureCache } from './models.js';
import { initTextures, tAddFromStore } from './textures.js';
import { initMusic, mAddFromStore } from './music.js';
import { initGMA, gmaRefresh } from './gma.js';
import { initSettings } from './settings.js';
/* UI SETUP */
const tabEls = document.querySelectorAll('#topbar .tab');
const panes = {
  vmf:    document.getElementById('paneVmf'),
  models: document.getElementById('paneModels'),
  tex:    document.getElementById('paneTex'),
  music:  document.getElementById('paneMusic'),
  gma:    document.getElementById('paneGma'),
  converter: document.getElementById('paneConverter')
};
let activeTab = 'vmf';

function switchTab(name){
  activeTab = name;
  tabEls.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  Object.entries(panes).forEach(([k, p]) => p.classList.toggle('active', k === name));
  if (name === 'vmf') setTimeout(vmfResize, 60);
  if (name === 'models') setTimeout(modelResize, 60);
  if (name === 'gma') gmaRefresh().catch(() => {});
  if (name === 'converter') { const f = document.getElementById('converterFrame'); try { f.contentWindow.postMessage({type:'sav-language', lang: LANG}, '*'); } catch (_) {} }
  if (name === 'music') setTimeout(() => { try { Games.refresh(); mAddFromStore({ resetView: false }); } catch (_) {} }, 60);   // статистика игр могла устареть после импорта
}
tabEls.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// BSP conversion bridge: the embedded converter sends the VMF and pakfile assets here.
let _bspRequest = 0;
const _bspPending = new Map();
window.addEventListener('message', async e => {
  const d = e.data || {};
  if (d.type === 'sav-bsp-error') {
    const pending = _bspPending.get(d.requestId); if (pending) { _bspPending.delete(d.requestId); pending.reject(new Error(d.error || 'BSP conversion failed')); }
    return;
  }
  if (d.type !== 'sav-bsp-converted') return;
  const pending = _bspPending.get(d.requestId); if (!pending) return;
  _bspPending.delete(d.requestId);
  try {
    const safe = String(pending.name || d.name || 'map').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'map';
    const root = `user_maps/${safe}_${Date.now()}_${_bspRequest}/`;
    const rows = [{ path: root + String(pending.name || d.name || 'source.bsp').split(/[\\/]/).pop(), file: pending.file }];
    rows.push(...(d.files || []).map(x => ({ path: root + String(x.name || 'resource').replace(/\\/g, '/').replace(/^\/+/, ''), file: new File([x.data], x.name || 'resource') })));
    if (!rows.some(x => /\.vmf$/i.test(x.path))) throw new Error('Конвертер не вернул VMF-файл.');
    await addFilesToStore(rows, { silent: true });
    rebuildFileMapFromStore();
    await TexStore.rebuild();
    const vmfPath = rows.find(x => /\.vmf$/i.test(x.path)).path;
    pending.resolve(vmfPath);
  } catch (err) { pending.reject(err); }
});
async function convertBspInViewer(file) {
  const frame = document.getElementById('converterFrame');
  if (!frame || !frame.contentWindow) throw new Error('Конвертер не загружен. Откройте вкладку BSP → VMF и повторите.');
  const requestId = ++_bspRequest;
  const result = new Promise((resolve, reject) => _bspPending.set(requestId, { resolve, reject, name: file.name, file }));
  frame.contentWindow.postMessage({ type: 'sav-convert-bsp', requestId, name: file.name, buffer: await file.arrayBuffer() }, '*');
  const path = await result;
  await loadMapFromStore(path);
}

{
  let rsT = 0;
  const onResize = () => { clearTimeout(rsT); rsT = setTimeout(() => {
    try { if (activeTab === 'vmf') vmfResize(); else if (activeTab === 'models') modelResize(); } catch (_) {}
  }, 120); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);                        // поворот телефона / появление адресной строки
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
}

document.getElementById('langSel').addEventListener('change', e => { setLang(e.target.value); try { document.getElementById('converterFrame').contentWindow.postMessage({type:'sav-language', lang:e.target.value}, '*'); } catch (_) {} });

/* STORAGE TOOLS / PROGRESS */
const SX = {
  ru: { packed: 'Оригинал → на диске', quality: 'Разрешение VTF при импорте', q0: 'Полное', q1: '½ (меньше места)', q2: '¼ (минимум)',
        optimize: '🗜 Упаковать старое хранилище', optConfirm: 'Старые архивы VPK и файлы будут распакованы и сохранены в сжатом виде (без дублей). Это может занять время. Продолжить?',
        done: 'Готово. Ошибок: ' },
  en: { packed: 'Original → on disk', quality: 'VTF resolution on import', q0: 'Full', q1: '½ (smaller)', q2: '¼ (smallest)',
        optimize: '🗜 Pack legacy storage', optConfirm: 'Old VPK archives and files will be extracted and stored compressed (deduplicated). This may take a while. Continue?',
        done: 'Done. Errors: ' }
};
const sx = k => (SX[LANG] || SX.en)[k];
async function reloadAll(){
  disposeTextureCache(); await TexStore.rebuild(); rebuildFileMapFromStore(); scanModels();
  try { await EntityIcons.restoreFromStore(); } catch (_) {}
  EntityIcons.loadBundled().catch(() => {});
  Games.refresh(); refreshGlobalStats(); try { await tAddFromStore({ resetView: true }); } catch (_) {}
  try { await mAddFromStore({ resetView: true }); } catch (_) {}
  try { window.dispatchEvent(new CustomEvent('storagedirty')); } catch (_) {}
}
function ensureStorageTools(){
  const body = document.querySelector('#storageModal .m-b'); if (!body) return;
  let box = document.getElementById('stTools');
  if (!box){
    box = document.createElement('div'); box.id = 'stTools'; box.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0;font-size:12.5px';
    box.innerHTML = '<div id="stPack" style="flex:1 1 100%;font-weight:600"></div>' +
      '<label id="stQLabel"></label><select id="stQ" class="t-sel"></select>' +
      '<button class="btn" id="stOptimize" style="display:none"></button>';
    const list = document.getElementById('stList'); body.insertBefore(box, list);
    const q = box.querySelector('#stQ');
    q.addEventListener('change', () => setVtfDrop(parseInt(q.value, 10) || 0));
    box.querySelector('#stOptimize').addEventListener('click', async () => {
      if (!confirm(sx('optConfirm'))) return;
      const btn = box.querySelector('#stOptimize'); btn.disabled = true;
      try { const r = await optimizeStorage(); await reloadAll(); alert(sx('done') + r.errors.length + (r.errors.length ? '\n' + r.errors.slice(0, 5).join('\n') : '')); }
      catch (e) { alert(e.message); }
      btn.disabled = false; await refreshStorageModal();
    });
  }
  box.querySelector('#stQLabel').textContent = sx('quality') + ':';
  const q = box.querySelector('#stQ'); q.textContent = '';
  [['0', sx('q0')], ['1', sx('q1')], ['2', sx('q2')]].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; q.appendChild(o); });
  q.value = String(PackOpts.vtfDrop);
  box.querySelector('#stOptimize').textContent = sx('optimize');
}
{
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));max-width:92vw;transform:translateX(-50%);z-index:10000;background:#16202e;border:1px solid #2b3a52;color:#dbe6f5;padding:8px 14px;border-radius:10px;font-size:12.5px;display:none;min-width:240px;text-align:center';
  document.body.appendChild(bar); let hideT = null;
  window.addEventListener('ingestprogress', e => {
    const { label, done, total } = e.detail;
    bar.style.display = 'block'; bar.textContent = label + ': ' + done.toLocaleString(LANG) + ' / ' + total.toLocaleString(LANG);
    clearTimeout(hideT); hideT = setTimeout(() => { bar.style.display = 'none'; }, done >= total ? 900 : 8000);   // не залипает при ошибке импорта
  });
}

/* STORAGE MODAL */
const storageModal = document.getElementById('storageModal');
document.getElementById('gStore').addEventListener('click', () => { refreshStorageModal(); storageModal.classList.add('open'); });
document.getElementById('stClose').addEventListener('click', () => storageModal.classList.remove('open'));
storageModal.addEventListener('click', e => { if (e.target === storageModal) storageModal.classList.remove('open'); });
document.querySelectorAll('[data-storage-filter]').forEach(b => b.addEventListener('click', () => {
  _storageFilter = b.dataset.storageFilter === 'maps' ? 'maps' : 'all';
  refreshStorageModal();
}));

let _storageRefreshToken = 0;
let _storageFilter = 'all';
async function refreshStorageModal(){
  const token = ++_storageRefreshToken;
  const info = document.getElementById('stList'); info.textContent = '';
  const allFiles = [...Store.files.values()].filter(f => !f._vpk);
  const mapFile = f => /\.(vmf|vmap|vmx|map)$/i.test(f.path || '');
  const files = allFiles.filter(f => _storageFilter === 'maps' ? mapFile(f) : true)
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);   // localeCompare на 100k+ файлов — медленно
  document.querySelectorAll('[data-storage-filter]').forEach(b => {
    const active = b.dataset.storageFilter === _storageFilter;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (token !== _storageRefreshToken) return;

  let total = 0; for (const f of files) total += f.size || 0;
  document.getElementById('stCount').textContent = files.length.toLocaleString(LANG);
  document.getElementById('stSize').textContent = fmtB(total);
  try {
    if (navigator.storage && navigator.storage.estimate){
      const q = await navigator.storage.estimate();
      if (token !== _storageRefreshToken) return;
      document.getElementById('stQuota').textContent = fmtB(q.usage || 0) + ' / ' + fmtB(q.quota || 0);
    } else document.getElementById('stQuota').textContent = '—';
  } catch (e) { document.getElementById('stQuota').textContent = '—'; }

  ensureStorageTools();
  {
    let raw = 0, stored = 0, legacy = false; const seen = new Set();
    for (const f of files){                       // files уже без _vpk — второй полный проход по Store не нужен
      raw += f.osize || f.size || 0;
      if (f.h){ if (!seen.has(f.h)){ seen.add(f.h); stored += f.cz || 0; } } else stored += f.size || 0;
      if (f.blob && !f.h) legacy = true;
    }
    const pct = raw > 0 ? Math.round((1 - stored / raw) * 100) : 0;
    const el = document.getElementById('stPack');
    if (el) el.textContent = sx('packed') + ': ' + fmtB(raw) + ' → ' + fmtB(stored) + ' (−' + Math.max(0, pct) + '%)';
    const ob = document.getElementById('stOptimize'); if (ob) ob.style.display = legacy ? '' : 'none';
  }
  const ST_CAP = 300;
  const frag = document.createDocumentFragment();
  const reload = async () => { await reloadAll(); await refreshStorageModal(); };
  const groups = new Map();
  for (const f of files){
    const g = gameOf(f); let o = groups.get(g);
    if (!o){ o = { paths: [], size: 0 }; groups.set(g, o); }
    o.paths.push(f.path); o.size += f.size || 0;
  }
  for (const [g, o] of [...groups.entries()].sort((a, b) => b[1].size - a[1].size)){
    const row = document.createElement('div'); row.className = 'st-row'; row.style.fontWeight = '600';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = '🎮 ' + gameLabel(g) + ' · ' + o.paths.length.toLocaleString(LANG);
    const sz = document.createElement('span'); sz.className = 'sz'; sz.textContent = fmtB(o.size);
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '×'; del.title = gameLabel(g);
    del.addEventListener('click', async () => {
      if (!confirm(t('confirm_del_all') + '\n' + gameLabel(g))) return;
      await Store.deleteMany(o.paths); await reload();
    });
    row.append(nm, sz, del); frag.appendChild(row);
  }
  for (const f of files.slice(0, ST_CAP)){
    if (token !== _storageRefreshToken) return;
    const row = document.createElement('div'); row.className = 'st-row';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = f.path;
    const sz = document.createElement('span'); sz.className = 'sz'; sz.textContent = fmtB(f.size || 0);
    if (mapFile(f)) {
      row.title = 'Нажмите, чтобы открыть карту';
      row.style.cursor = 'pointer';
      row.addEventListener('click', async e => {
        if (e.target && e.target.closest('.del')) return;
        storageModal.classList.remove('open');
        try { await loadMapFromStore(f.path); }
        catch (err) { alert('Не удалось открыть карту: ' + (err && err.message || err)); }
      });
    }
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '×';
    del.addEventListener('click', async () => {
      if (/^user_maps\/[^/]+\//i.test(f.path) && /\.vmf$/i.test(f.path)) {
        const prefix = f.path.split('/').slice(0, 2).join('/') + '/';
        const owned = files.filter(x => x.path.startsWith(prefix)).map(x => x.path);
        if (!confirm('Удалить карту и все её сохранённые ресурсы?\n' + prefix)) return;
        await Store.deleteMany(owned);
      } else await Store.delete(f.path);
      await reload();
    });
    row.append(nm, sz, del); frag.appendChild(row);
  }
  if (files.length > ST_CAP){
    const more = document.createElement('div'); more.className = 'st-row'; more.style.opacity = '.7';
    more.textContent = '… +' + (files.length - ST_CAP).toLocaleString(LANG);
    frag.appendChild(more);
  }
  info.appendChild(frag);
}

document.getElementById('stClearVtf').addEventListener('click', async () => {
  if (!confirm(t('confirm_del_vtf'))) return;
  const keys = Store.listByExt('vtf').filter(f => !f._vpk).map(f => f.path);
  await Store.deleteMany(keys);
  await reloadAll();
  await refreshStorageModal();
});

document.getElementById('stClearAll').addEventListener('click', async () => {
  if (!confirm(t('confirm_del_all'))) return;
  await Store.clearAll(); EntityIcons.clear();
  await reloadAll();
  await refreshStorageModal();
});
document.getElementById('stApply').addEventListener('click', () => storageModal.classList.remove('open'));

export function refreshGlobalStats(){
  let total = 0, vtf = 0, mdl = 0;
  for (const f of Store.files.values()){ total++; if (f.ext === 'vtf') vtf++; else if (f.ext === 'mdl') mdl++; }   // один проход вместо пяти
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const L = n => n.toLocaleString(LANG), ic = EntityIcons.count;
  set('gFiles', L(total)); set('gT', L(vtf)); set('gM', L(mdl)); set('gI', L(ic));
  set('vmfTexBadge', vtf); set('s-tex', L(vtf)); set('s-icons', L(ic));
  const dot = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('on', on); };
  dot('gDotI', ic > 0); dot('gDotT', vtf > 0); dot('gDotM', mdl > 0); dot('gDotStore', total > 0);
}
let _gsRaf = 0;
const refreshGlobalStatsSoon = () => { if (_gsRaf) return; _gsRaf = requestAnimationFrame(() => { _gsRaf = 0; refreshGlobalStats(); }); };
window.refreshGlobalStats = refreshGlobalStats;

window.addEventListener('keydown', e => {
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || (e.target && e.target.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;                 // Ctrl+P (печать) больше не перехватывается, автоповтор не плодит скриншоты
  if (storageModal.classList.contains('open')) return;
  if (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З' || e.code === 'Space'){
    if (document.getElementById('paneVmf').classList.contains('active') && !document.getElementById('vmfBtnShot').disabled){ e.preventDefault(); document.getElementById('vmfBtnShot').click(); }
  }
});

/* INIT */
(async function init(){
  try {
    console.log("[App] Загрузка i18n...");
    await loadI18N();

    const initLang = detectLang(); document.documentElement.lang = initLang;
    const langSel = document.getElementById('langSel');
    if (langSel){
      langSel.innerHTML = '';
      for (const code in I18N){ const o = document.createElement('option'); o.value = code; o.textContent = I18N[code].lang_name || code; langSel.appendChild(o); }
      langSel.value = initLang;
    }
    setLang(initLang);
    EntityIcons.onChange(refreshGlobalStatsSoon);

    console.log("[App] Инициализация БД...");
    await Store.init();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}

    console.log("[App] Восстановление VPK...");
    const vpkRecs = [...Store.files.values()].filter(f => f.ext === 'vpk' && f.blob);
    for (const vpkRec of vpkRecs) {
      try {
        const dir = await parseVPKDirectory(vpkRec.blob);
        for (const info of dir.files.values()) {
          if (!shouldKeepFile(info.path)) continue;
          Store.files.set(info.path, { path: info.path, ext: getExt(info.path), size: (info.preloadBytes || 0) + info.length, time: vpkRec.time, _vpk: { vpkPath: vpkRec.path, info } });
        }
      } catch(e) { console.warn("[VPK] Ошибка:", e); }
    }

    console.log("[App] Перестройка кэша текстур...");
    await TexStore.rebuild();
    rebuildFileMapFromStore();
    try { await EntityIcons.restoreFromStore(); } catch (e) { console.warn('[icons] restore:', e); }
    EntityIcons.loadBundled().then(n => { if (n) refreshGlobalStats(); }).catch(() => {});   // иконки, лежащие в репозитории (icons/)

    console.log("[App] Запуск модулей...");
    for (const [name, fn] of [['VMF', initVMF], ['Models', initModels], ['Textures', initTextures], ['Music', initMusic], ['GMA', () => initGMA({ onChange: reloadAll })]]){
      try { fn(); } catch (e) { console.error('[App] init ' + name + ' failed:', e); }   // сбой одного модуля не должен ронять остальные
    }

    console.log("[App] Сканирование моделей...");
    Games.refresh();
    scanModels();

    console.log("[App] Загрузка текстур в UI...");
    await tAddFromStore();
    try { await mAddFromStore(); } catch (_) {}
      refreshGlobalStats();
  try { initSettings({ loadMapFromStore }); } catch (e) { console.warn('[settings]', e); }
  console.log("[App] Инициализация завершена успешно!");
} catch (err) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА ИНИЦИАЛИЗАЦИИ:", err);
    alert("Ошибка запуска: " + err.message + "\nПроверьте консоль (F12).");
  }
})();