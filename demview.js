// demview.js — просмотр .dem поверх 3D-вида карты: путь и положение камеры игрока, плеер (play/scrub/скорость),
// режим «смотреть глазами игрока», окно со сведениями о демо и консольными командами.
import * as THREE from 'three';
import { LANG } from './core.js';
import { parseDem, sampleDem } from './dem.js';

const TX = {
  en: { title: 'Demo', info: 'Info', follow: 'Follow camera', loop: 'Loop', close: 'Close', map: 'Map', server: 'Server', client: 'Player', game: 'Game', proto: 'Protocol (demo / network)',
    time: 'Length', ticks: 'Ticks', rate: 'Tickrate', frames: 'Frames', packets: 'Packets', cmds: 'Console commands', none: 'none', mismatch: 'The demo was recorded on map “{m}”, but the loaded map is different.',
    nomap: 'No map loaded: showing the camera path only. Load “{m}.vmf” to see it in context.', partial: 'The file is incomplete or damaged: parsed up to the break.', loaded: 'Demo loaded: {n} camera samples',
    bz2: 'This looks like a .bz2 archive. Unpack it first (7-Zip).', bad: 'Not a Source demo (HL2DEMO).', fail: 'Failed to read demo: {e}', nopath: 'The demo has no camera data.', size: 'File size', open: 'Open .dem' },
  ru: { title: 'Демо', info: 'Инфо', follow: 'Вид из камеры', loop: 'Цикл', close: 'Закрыть', map: 'Карта', server: 'Сервер', client: 'Игрок', game: 'Игра', proto: 'Протокол (demo / сеть)',
    time: 'Длина', ticks: 'Тиков', rate: 'Тикрейт', frames: 'Кадров', packets: 'Пакетов', cmds: 'Консольные команды', none: 'нет', mismatch: 'Демо записано на карте «{m}», а загруженная карта другая.',
    nomap: 'Карта не загружена: показан только путь камеры. Загрузите «{m}.vmf», чтобы увидеть его на карте.', partial: 'Файл неполный или повреждён: разобрано до обрыва.', loaded: 'Демо загружено: {n} точек камеры',
    bz2: 'Похоже на архив .bz2. Сначала распакуйте его (7-Zip).', bad: 'Это не демо Source (HL2DEMO).', fail: 'Не удалось прочитать демо: {e}', nopath: 'В демо нет данных камеры.', size: 'Размер файла', open: 'Открыть .dem' }
};
const tr = (k, p) => { let s = (TX[LANG] && TX[LANG][k]) || TX.en[k] || k; if (p) for (const q in p) s = s.replace('{' + q + '}', p[q]); return s; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0'); };

let api = null, dem = null, group = null, marker = null, line = null, bar = null, info = null;
let tick = 0, playing = false, speed = 1, follow = false, loop = false, last = 0, raf = 0;
const ctlState = { enabled: true };

/* ---------- 3D ---------- */
function disposeGroup(){
  if (!group) return;
  api.scene.remove(group);
  group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  group = marker = line = null;
}
function eulerQ(a){ return new THREE.Quaternion().setFromEuler(new THREE.Euler(a[2] * Math.PI / 180, a[0] * Math.PI / 180, a[1] * Math.PI / 180, 'ZYX')); }   // Source: pitch(Y) yaw(Z) roll(X)

function buildScene(){
  disposeGroup();
  group = new THREE.Group(); group.name = 'demo'; group.rotation.x = -Math.PI / 2;           // как у карты: Source Z — вверх
  const pts = dem.path.map(s => new THREE.Vector3(...s.origin));
  if (pts.length > 1){
    line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true }));
    line.renderOrder = 998; group.add(line);
  }
  const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: 0xffd23f, size: 5, sizeAttenuation: false, depthTest: false, transparent: true }));
  dots.renderOrder = 998; group.add(dots);
  marker = new THREE.Group();
  const cg = new THREE.ConeGeometry(10, 36, 4); cg.rotateZ(-Math.PI / 2);                    // конус смотрит вдоль +X (вперёд в Source)
  const cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xff5a3c, depthTest: false, transparent: true })); cone.renderOrder = 999;
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(18, 0, 0), new THREE.Vector3(260, 0, 0)]), new THREE.LineBasicMaterial({ color: 0xff5a3c, depthTest: false, transparent: true, opacity: 0.8 }));
  ray.renderOrder = 999; marker.add(cone, ray); group.add(marker);
  api.scene.add(group);
}
function fitToPath(){
  const box = new THREE.Box3(); for (const s of dem.path) box.expandByPoint(new THREE.Vector3(s.origin[0], s.origin[2], -s.origin[1]));
  box.expandByScalar(300); api.fit(box, box.getCenter(new THREE.Vector3()), box.getSize(new THREE.Vector3()));
}

/* ---------- позиция / плеер ---------- */
function apply(){
  if (!dem || !group) return;
  const p = sampleDem(dem, tick); if (!p) return;
  marker.position.set(...p.origin); marker.quaternion.copy(eulerQ(p.angles)); marker.visible = !follow;
  if (follow){
    group.updateMatrixWorld(true);
    const q = eulerQ(p.angles), wp = new THREE.Vector3(...p.origin).applyMatrix4(group.matrixWorld);
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q).transformDirection(group.matrixWorld);
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(q).transformDirection(group.matrixWorld);
    api.camera.position.copy(wp); api.camera.up.copy(up); api.camera.lookAt(wp.clone().add(fwd));
    api.controls.target.copy(wp).add(fwd.multiplyScalar(100));
  }
  const sl = bar.querySelector('.dm-sl'); sl.value = tick;
  bar.querySelector('.dm-t').textContent = `${fmtT(tick / dem.tickRate)} / ${fmtT(dem.duration)}  ·  ${Math.round(tick)}/${dem.ticks}`;
}
function frame(now){
  raf = 0; if (!playing) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  tick += dt * dem.tickRate * speed;
  if (tick >= dem.ticks){ if (loop) tick = 0; else { tick = dem.ticks; setPlaying(false); } }
  apply(); if (playing) raf = requestAnimationFrame(frame);
}
function setPlaying(v){
  playing = v; bar.querySelector('.dm-play').textContent = v ? '⏸' : '▶';
  if (v){ if (tick >= dem.ticks) tick = 0; last = performance.now(); if (!raf) raf = requestAnimationFrame(frame); }
}
function setFollow(v){
  follow = v; api.controls.enabled = !v;
  if (!v){ api.camera.up.set(0, 1, 0); api.controls.update(); }
  apply();
}

/* ---------- DOM ---------- */
function ensureDom(){
  const pane = document.getElementById('paneVmf'); if (!pane || bar) return;
  bar = document.createElement('div'); bar.id = 'demBar'; bar.hidden = true;
  bar.innerHTML = `<button class="dm-play" title="Space">▶</button><input class="dm-sl" type="range" min="0" max="1" step="0.1" value="0"><span class="dm-t"></span>
    <select class="dm-sp"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select>
    <label class="dm-ck"><input type="checkbox" class="dm-fol"> <span data-l="follow"></span></label><label class="dm-ck"><input type="checkbox" class="dm-lp"> <span data-l="loop"></span></label>
    <button class="dm-i" data-l="info"></button><button class="dm-x" title="✕">✕</button>`;
  info = document.createElement('div'); info.id = 'demInfo'; info.hidden = true;
  pane.appendChild(bar); pane.appendChild(info);
  const sl = bar.querySelector('.dm-sl');
  bar.querySelector('.dm-play').onclick = () => setPlaying(!playing);
  sl.oninput = () => { tick = +sl.value; apply(); };
  bar.querySelector('.dm-sp').onchange = e => { speed = +e.target.value || 1; };
  bar.querySelector('.dm-fol').onchange = e => setFollow(e.target.checked);
  bar.querySelector('.dm-lp').onchange = e => { loop = e.target.checked; };
  bar.querySelector('.dm-i').onclick = () => { info.hidden = !info.hidden; };
  bar.querySelector('.dm-x').onclick = unload;
  addEventListener('keydown', ev => { if (ev.code === 'Space' && dem && !bar.hidden && document.getElementById('paneVmf').classList.contains('active') && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((ev.target.tagName || ''))){ ev.preventDefault(); setPlaying(!playing); } });
  addEventListener('langchange', fillTexts);
  addEventListener('camtakeover', ev => { if (ev.detail !== 'dem' && dem) unload(); });     // включили кат-сцену — снимаем демо
  fillTexts();
}
function fillTexts(){
  if (!bar) return;
  bar.querySelectorAll('[data-l]').forEach(n => { n.textContent = tr(n.dataset.l); });
  if (dem) renderInfo();
}
function renderInfo(){
  const h = dem.header, mapName = api.getMapName ? api.getMapName() : '', row = (k, v) => `<tr><td>${esc(tr(k))}</td><td>${esc(v)}</td></tr>`;
  const cons = dem.console.length ? dem.console.slice(0, 300).map(c => `<div><i>${c.tick}</i> ${esc(c.text)}</div>`).join('') + (dem.console.length > 300 ? `<div>… +${dem.console.length - 300}</div>` : '') : `<div class="dm-none">${esc(tr('none'))}</div>`;
  const notes = [];
  if (!dem.complete) notes.push(tr('partial'));
  if (api.hasMap && !api.hasMap()) notes.push(tr('nomap', { m: h.map })); else if (mapName && h.map && mapName.toLowerCase() !== h.map.toLowerCase()) notes.push(tr('mismatch', { m: h.map }));
  info.innerHTML = `<div class="dm-h"><b>${esc(tr('title'))}</b><button class="dm-ix">✕</button></div>${notes.map(n => `<p class="dm-note">${esc(n)}</p>`).join('')}
    <table>${row('map', h.map)}${row('server', h.server)}${row('client', h.client)}${row('game', h.gameDir)}${row('proto', h.demoProtocol + ' / ' + h.networkProtocol)}
    ${row('time', fmtT(dem.duration))}${row('ticks', dem.ticks)}${row('rate', dem.tickRate.toFixed(2))}${row('frames', h.frames)}${row('packets', dem.counts.packet || 0)}${row('size', (dem.size / 1024).toFixed(1) + ' KB')}</table>
    <b class="dm-ch">${esc(tr('cmds'))} (${dem.console.length})</b><div class="dm-con">${cons}</div>`;
  info.querySelector('.dm-ix').onclick = () => { info.hidden = true; };
}
function unload(){
  setPlaying(false); if (follow){ bar.querySelector('.dm-fol').checked = false; setFollow(false); }
  disposeGroup(); dem = null; bar.hidden = true; info.hidden = true;
}

/* ---------- публичный API ---------- */
export async function loadDemoFile(file){
  ensureDom();
  try {
    const buf = await file.arrayBuffer(), u8 = new Uint8Array(buf);
    if (u8[0] === 0x42 && u8[1] === 0x5a && u8[2] === 0x68){ api.status(tr('bz2')); return false; }       // "BZh"
    if (String.fromCharCode(...u8.subarray(0, 7)) !== 'HL2DEMO'){ api.status(tr('bad')); return false; }
    const d = parseDem(u8);
    if (!d.path.length){ api.status(tr('nopath')); return false; }
    if (dem) unload();
    window.dispatchEvent(new CustomEvent('camtakeover', { detail: 'dem' }));
    dem = d; tick = 0; speed = 1; bar.querySelector('.dm-sp').value = '1';
    buildScene();
    const sl = bar.querySelector('.dm-sl'); sl.max = dem.ticks; sl.step = 0.1;
    bar.hidden = false; info.hidden = false; api.hideDrop(); fillTexts();
    if (!api.hasMap()) fitToPath();
    apply(); api.status(tr('loaded', { n: dem.path.length }));
    return true;
  } catch (e){ console.error('[dem]', e); api.status(tr('fail', { e: e.message || e })); return false; }
}
export function initDemo(a){
  api = a; ensureDom();
  const btn = document.getElementById('vmfBtnDem'), inp = document.getElementById('vmfDemInput');
  if (btn && inp){
    btn.title = tr('open'); btn.onclick = () => inp.click();
    inp.addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) await loadDemoFile(f); });
  }
}
export const demIsLoaded = () => !!dem;
