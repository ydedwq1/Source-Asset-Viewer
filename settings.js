// settings.js — окно настроек: моды (GMA), модели/текстуры по играм, ранее загруженные карты,
// и включение/выключение плагинов.
import { Store, LANG, fmtB, gameOf, gameLabel } from './core.js';
import { Plugins, PLUGIN_DEFS } from './plugins.js';
import { getRecordBuffer } from './archives.js';

const ST_TX = {
  ru: {
    title: 'Настройки',
    tab_mods: 'Моды', tab_models: 'Модели', tab_tex: 'Текстуры', tab_maps: 'Карты', tab_bsp: 'BSP', tab_plugins: 'Плагины',
    empty_mods: 'GMA-модов нет. Перетащите .gma во вкладке GMA.',
    empty_models: 'Модели не найдены.',
    empty_tex: 'Текстуры не найдены.',
    empty_maps: 'Карты не найдены. Загрузите .vmf / .vmap.',
    empty_bsp: 'Сохранённых BSP-карт пока нет. Импортируйте .bsp через просмотрщик.',
    bsp_hint: 'Каждая BSP-карта хранится вместе с исходным BSP, извлечёнными ресурсами и VMF. Удаление карты удаляет только её файлы.',
    delete_map: 'Удалить карту',
    open: 'Открыть', open_gma: 'Перейти в GMA', load: 'Загрузить', close: 'Закрыть', search: 'Поиск…',
    plugins_hint: 'Плагины — это модули, которые можно включать или выключать. Выключенный плагин скрывает свои кнопки и не запускается.',
    plugin_dem: 'Плеер демок (.dem)',
    plugin_cutscene: 'Кат-сцены карт (point_viewcontrol)',
    maps_hint: 'Ранее загруженные карты сохранены в браузере — их можно открыть в один клик без повторного перетаскивания.',
    files: 'файлов', size: 'объём', confirm_del: 'Удалить из хранилища?'
  },
  en: {
    title: 'Settings',
    tab_mods: 'Mods', tab_models: 'Models', tab_tex: 'Textures', tab_maps: 'Maps', tab_bsp: 'BSP', tab_plugins: 'Plugins',
    empty_mods: 'No GMA mods. Drop .gma in the GMA tab.',
    empty_models: 'No models found.',
    empty_tex: 'No textures found.',
    empty_maps: 'No maps found. Load .vmf / .vmap.',
    empty_bsp: 'No saved BSP maps yet. Import a .bsp in the viewer.',
    bsp_hint: 'Each BSP map is stored with its source BSP, extracted assets and VMF. Deleting it removes only that map’s files.',
    delete_map: 'Delete map',
    open: 'Open', open_gma: 'Go to GMA', load: 'Load', close: 'Close', search: 'Search…',
    plugins_hint: 'Plugins are optional modules. Disabling one hides its buttons on the map toolbar and prevents it from starting.',
    plugin_dem: 'Demo player (.dem)',
    plugin_cutscene: 'Map cutscenes (point_viewcontrol)',
    maps_hint: 'Previously loaded maps are kept in the browser — reopen them with a single click without dragging again.',
    files: 'files', size: 'size', confirm_del: 'Delete from storage?'
  }
};
const txt = k => (ST_TX[LANG] && ST_TX[LANG][k]) || ST_TX.en[k] || k;

let _dlg = null, _body = null, _curTab = 'mods', _loadMapCb = null;
let _assetFilter = '';

export function initSettings(opts = {}){
  _loadMapCb = opts.loadMapFromStore || null;
  _dlg = document.getElementById('settingsModal');
  if (!_dlg) return;
  _body = _dlg.querySelector('.st-body');

  _dlg.querySelector('.st-close').addEventListener('click', close);
  _dlg.addEventListener('click', e => { if (e.target === _dlg) close(); });
  _dlg.querySelector('.st-tabs').addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (!tb) return;
    _curTab = tb.dataset.tab;
    _assetFilter = '';
    render();
  });

  const btn = document.getElementById('btnSettings');
  if (btn) btn.addEventListener('click', open);

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _dlg.classList.contains('open')) close();
  });
  window.addEventListener('langchange', () => { if (_dlg.classList.contains('open')) render(); });
  window.addEventListener('storagedirty', () => { if (_dlg.classList.contains('open')) render(); });
}

function open(){ _dlg.classList.add('open'); render(); }
function close(){ _dlg.classList.remove('open'); }

function render(){
  if (!_dlg) return;
  _dlg.querySelector('.st-title').textContent = '⚙ ' + txt('title');
  _dlg.querySelectorAll('.st-tabs [data-tab]').forEach(b => {
    b.textContent = txt('tab_' + b.dataset.tab);
    b.classList.toggle('on', b.dataset.tab === _curTab);
  });
  _body.textContent = '';
  if (_curTab === 'mods') renderMods();
  else if (_curTab === 'models') renderAssets('mdl', 'empty_models');
  else if (_curTab === 'tex') renderAssets('vtf', 'empty_tex');
  else if (_curTab === 'maps') renderMaps();
  else if (_curTab === 'bsp') renderBspMaps();
  else if (_curTab === 'plugins') renderPlugins();
}

/* ============ MODS (GMA) ============ */
function renderMods(){
  const mods = new Map();
  for (const [path, f] of Store.files){
    if (!path.startsWith('gma/')) continue;
    const slug = path.split('/')[1]; if (!slug) continue;
    let m = mods.get(slug);
    if (!m){ m = { slug, metaRec: null, files: 0, size: 0 }; mods.set(slug, m); }
    if (path.endsWith('/__addon.json')){ m.metaRec = f; continue; }
    m.files++; m.size += f.size || 0;
  }
  if (!mods.size){ showEmpty(txt('empty_mods')); return; }

  const pendingTitles = [];
  for (const [, m] of mods){
    const row = document.createElement('div'); row.className = 'st-item';
    const ic = document.createElement('span'); ic.className = 'st-icon'; ic.textContent = '🔧';
    const info = document.createElement('div'); info.className = 'st-info';
    const title = document.createElement('div'); title.className = 'st-name'; title.textContent = m.slug;
    pendingTitles.push({ el: title, rec: m.metaRec });
    const sub = document.createElement('div'); sub.className = 'st-sub';
    sub.textContent = `${m.files.toLocaleString(LANG)} ${txt('files')} · ${fmtB(m.size)}`;
    info.append(title, sub);
    const open = document.createElement('button'); open.className = 'btn sm'; open.textContent = txt('open_gma');
    open.addEventListener('click', () => {
      close();
      const tb = document.querySelector('#topbar .tab[data-tab="gma"]');
      if (tb) tb.click();
    });
    row.append(ic, info, open);
    _body.appendChild(row);
  }
  for (const { el, rec } of pendingTitles){
    if (!rec) continue;
    getRecordBuffer(rec).then(buf => {
      try {
        const j = JSON.parse(new TextDecoder().decode(buf));
        if (j && j.title && el.isConnected) el.textContent = j.title;
      } catch(_){}
    }).catch(()=>{});
  }
}

/* ============ MODELS / TEXTURES ============ */
function renderAssets(ext, emptyKey){
  const byGame = new Map();
  const q = _assetFilter.toLowerCase();

  for (const f of Store.files.values()){
    if (f.ext !== ext) continue;
    if (q && !f.path.toLowerCase().includes(q)) continue;
    const g = gameOf(f);
    let list = byGame.get(g); if (!list){ list = []; byGame.set(g, list); }
    list.push(f);
  }

  // Поле быстрого поиска по файлам в проводнике
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 't-search';
  searchInput.style.cssText = 'width:100%;margin-bottom:12px;box-sizing:border-box';
  searchInput.placeholder = txt('search');
  searchInput.value = _assetFilter;
  let sT = 0;
  searchInput.addEventListener('input', e => {
    clearTimeout(sT);
    sT = setTimeout(() => {
      _assetFilter = e.target.value.trim();
      render();
    }, 150);
  });
  _body.appendChild(searchInput);

  if (!byGame.size){ showEmpty(txt(emptyKey)); return; }

  const groups = [...byGame.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [g, list] of groups){
    const det = document.createElement('details');
    det.className = 'st-group';
    det.open = groups.length <= 4 || !!q;
    const sum = document.createElement('summary'); sum.className = 'st-group-h';
    const name = document.createElement('span'); name.textContent = '🎮 ' + gameLabel(g);
    const cnt = document.createElement('span'); cnt.className = 'st-count'; cnt.textContent = list.length.toLocaleString(LANG);
    sum.append(name, cnt); det.appendChild(sum);
    const scroll = document.createElement('div'); scroll.className = 'st-scroll';
    list.sort((a, b) => a.path.toLowerCase() < b.path.toLowerCase() ? -1 : 1);
    for (const f of list.slice(0, 500)) scroll.appendChild(assetRow(f, ext));
    if (list.length > 500){
      const more = document.createElement('div'); more.className = 'st-more';
      more.textContent = `… +${(list.length - 500).toLocaleString(LANG)}`;
      scroll.appendChild(more);
    }
    det.appendChild(scroll); _body.appendChild(det);
  }
}

function assetRow(f, ext){
  const row = document.createElement('div'); row.className = 'st-item st-item-row';
  const path = document.createElement('span'); path.className = 'st-path'; path.textContent = f.path; path.title = f.path;
  const open = document.createElement('button'); open.className = 'btn sm'; open.textContent = txt('open');
  open.addEventListener('click', () => {
    close();
    window.dispatchEvent(new CustomEvent('openasset', { detail: { path: f.path, ext } }));
  });
  row.append(path, open);
  return row;
}

/* ============ MAPS ============ */
function renderMaps(){
  const maps = [];
  for (const f of Store.files.values()){
    if (f.ext !== 'vmf' && f.ext !== 'vmap') continue;
    maps.push(f);
  }
  if (!maps.length){ showEmpty(txt('empty_maps')); return; }

  const hint = document.createElement('div'); hint.className = 'st-hint'; hint.textContent = txt('maps_hint');
  _body.appendChild(hint);

  maps.sort((a, b) => (b.time || 0) - (a.time || 0));
  for (const f of maps){
    const row = document.createElement('div'); row.className = 'st-item st-item-row';
    const path = document.createElement('span'); path.className = 'st-path'; path.textContent = f.path; path.title = f.path;
    const meta = document.createElement('span'); meta.className = 'st-meta';
    meta.textContent = fmtB(f.size || 0) + (f.time ? ' · ' + new Date(f.time).toLocaleDateString(LANG) : '');
    const load = document.createElement('button'); load.className = 'btn primary sm'; load.textContent = txt('load');
    load.addEventListener('click', async () => {
      if (!_loadMapCb) return;
      close();
      try { await _loadMapCb(f.path); }
      catch (e){ console.error('[settings] load map', e); alert((e && e.message) || String(e)); }
    });
    const del = document.createElement('button'); del.className = 'btn sm'; del.textContent = '×';
    del.title = txt('confirm_del');
    del.addEventListener('click', async () => {
      if (!confirm(txt('confirm_del') + '\n' + f.path)) return;
      await Store.delete(f.path);
      render();
      window.dispatchEvent(new CustomEvent('storagedirty'));
    });
    row.append(path, meta, load, del);
    _body.appendChild(row);
  }
}


/* ============ BSP MAP PACKAGES ============ */
function renderBspMaps(){
  const packages = new Map();
  for (const f of Store.files.values()){
    const m = /^user_maps\/([^/]+)\/(.+)$/i.exec(f.path);
    if (!m) continue;
    let pkg = packages.get(m[1]);
    if (!pkg){ pkg = { id: m[1], files: [], bsp: null, vmf: null, size: 0, time: 0 }; packages.set(m[1], pkg); }
    pkg.files.push(f); pkg.size += f.size || 0; pkg.time = Math.max(pkg.time, f.time || 0);
    if (f.ext === 'bsp') pkg.bsp = f;
    if (f.ext === 'vmf' && !pkg.vmf) pkg.vmf = f;
  }
  if (!packages.size){ showEmpty(txt('empty_bsp')); return; }
  const hint = document.createElement('div'); hint.className = 'st-hint'; hint.textContent = txt('bsp_hint'); _body.appendChild(hint);
  for (const pkg of [...packages.values()].sort((a,b)=>b.time-a.time)){
    const row = document.createElement('div'); row.className = 'st-item st-item-row';
    const info = document.createElement('div'); info.className = 'st-info';
    const name = document.createElement('div'); name.className = 'st-name'; name.textContent = pkg.bsp ? pkg.bsp.path.split('/').pop() : pkg.id;
    const meta = document.createElement('div'); meta.className = 'st-sub'; meta.textContent = `${pkg.files.length} ${txt('files')} · ${fmtB(pkg.size)}${pkg.time ? ' · ' + new Date(pkg.time).toLocaleDateString(LANG) : ''}`;
    info.append(name, meta);
    const load = document.createElement('button'); load.className = 'btn primary sm'; load.textContent = txt('load'); load.disabled = !pkg.vmf;
    load.addEventListener('click', async () => { if (!_loadMapCb || !pkg.vmf) return; close(); try { await _loadMapCb(pkg.vmf.path); } catch(e){ console.error('[settings] load BSP map',e); alert((e && e.message)||String(e)); } });
    const del = document.createElement('button'); del.className = 'btn sm'; del.textContent = '×'; del.title = txt('delete_map');
    del.addEventListener('click', async () => { if (!confirm(txt('delete_map') + '?\n' + name.textContent + `\n${pkg.files.length} ${txt('files')}`)) return; await Store.deleteMany(pkg.files.map(f=>f.path)); render(); window.dispatchEvent(new CustomEvent('storagedirty')); });
    row.append(info, load, del); _body.appendChild(row);
  }
}

/* ============ PLUGINS ============ */
function renderPlugins(){
  const hint = document.createElement('div'); hint.className = 'st-hint'; hint.textContent = txt('plugins_hint');
  _body.appendChild(hint);

  const list = document.createElement('div'); list.className = 'st-plugins';
  for (const def of PLUGIN_DEFS){
    const row = document.createElement('label'); row.className = 'st-item st-plugin';
    const cb = document.createElement('input'); cb.type = 'checkbox';
    cb.checked = Plugins.isEnabled(def.key);
    cb.addEventListener('change', () => {
      Plugins.set(def.key, cb.checked);
      window.dispatchEvent(new CustomEvent('storagedirty'));
    });
    const ic = document.createElement('span'); ic.className = 'st-icon'; ic.textContent = def.icon;
    const nm = document.createElement('span'); nm.className = 'st-plugin-name'; nm.textContent = txt(def.i18n);
    row.append(cb, ic, nm);
    list.appendChild(row);
  }
  _body.appendChild(list);
}

function showEmpty(msg){
  const d = document.createElement('div'); d.className = 'st-empty';
  d.textContent = msg;
  _body.appendChild(d);
}