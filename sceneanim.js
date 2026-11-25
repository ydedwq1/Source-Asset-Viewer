// sceneanim.js — управление анимациями объектов на карте (1 / несколько / все) и камера «взгляд объекта» (POV / уровень глаз).
import * as THREE from 'three';
import { LANG } from './core.js';
import { hasModelForPath, loadAnimatedModel, inspectModelAnims } from './models.js';
import { samplePose } from './anim.js';

const TX = {
  ru: {
    btn: 'Анимации', title: 'Анимации сцены', tab_anims: '🎬 Объекты', tab_pov: '👁 Взгляд',
    play_all: '▶ Все', pause_all: '⏸ Все', stop_all: '⏹ Сброс',
    play_sel: '▶ Выбранные', pause_sel: '⏸ Выбранные',
    sel_all: '☑ Все', sel_none: '☐ Снять',
    only_anim: 'Только с анимацией', search: 'Поиск объекта или модели…',
    speed: 'Скорость', loop: 'Цикл', empty: 'На этой карте не найдено объектов с подходящими моделями.',
    no_anim: 'Нет анимаций (только камера)', frame: 'кадр',
    pov_enable: '👁 Смотреть глазами объекта', pov_exit: '✕ Выйти (Esc)',
    pov_target: 'Объект', pov_anchor: 'Точка привязки',
    anchor_auto: 'Авто (eyes / голова / уровень глаз)', anchor_origin: 'Origin (центр объекта)',
    eye_up: 'Уровень глаз (вверх/вниз)', eye_fwd: 'Вперёд / Назад', eye_right: 'Вправо / Влево',
    rot_yaw: 'Поворот (Yaw)', rot_pitch: 'Наклон (Pitch)', rot_roll: 'Крен (Roll)',
    follow_rot: 'Повторять поворот объекта/анимации', hide_self: 'Скрывать модель объекта',
    fov: 'Угол обзора (FOV)', reset_pov: 'Сбросить настройки взгляда',
    loading_rig: 'Загрузка скелета…', hint_free: 'Тяните по экрану, чтобы оглядываться'
  },
  en: {
    btn: 'Animations', title: 'Scene Animations', tab_anims: '🎬 Objects', tab_pov: '👁 Eye View',
    play_all: '▶ All', pause_all: '⏸ All', stop_all: '⏹ Reset',
    play_sel: '▶ Selected', pause_sel: '⏸ Selected',
    sel_all: '☑ All', sel_none: '☐ None',
    only_anim: 'Animated only', search: 'Search object or model…',
    speed: 'Speed', loop: 'Loop', empty: 'No entities with models found on this map.',
    no_anim: 'No animations (camera only)', frame: 'frame',
    pov_enable: '👁 Look through object eyes', pov_exit: '✕ Exit (Esc)',
    pov_target: 'Object', pov_anchor: 'Attach to',
    anchor_auto: 'Auto (eyes / head / eye level)', anchor_origin: 'Origin (entity center)',
    eye_up: 'Eye level (Up/Down)', eye_fwd: 'Forward / Back', eye_right: 'Right / Left',
    rot_yaw: 'Yaw', rot_pitch: 'Pitch', rot_roll: 'Roll',
    follow_rot: 'Follow object/bone rotation', hide_self: 'Hide object mesh in POV',
    fov: 'Field of view (FOV)', reset_pov: 'Reset eye settings',
    loading_rig: 'Loading skeleton…', hint_free: 'Drag viewport to look around'
  }
};
const tr = k => (TX[LANG] || TX.en)[k] || TX.en[k] || k;
const lc = s => String(s == null ? '' : s).toLowerCase();
const D2R = Math.PI / 180;

// Перевод осей Source (+X вперёд, +Y влево, +Z вверх) в оси камеры Three.js (-Z вперёд, +X вправо, +Y вверх)
const Q_SRC_TO_CAM = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(-1, 0, 0)
  )
);

let api = null;
let mapToken = 0;
let items = [];        // { id, ent, wrapper, label, modelName, seqs, bones, attachments, selSeq, time, speed, loop, playing, checked, rig, data, instGroup, attMap, rigPromise }
let globalSpeed = 1;
let lastNow = 0;
let activeTab = 'anims';
let onlyAnimated = true;
let searchText = '';

// DOM
let btnToggle = null, badgeEl = null, panel = null, povHud = null;

// Состояние камеры «глазами объекта»
const pov = {
  enabled: false,
  itemId: null,
  anchorKey: 'auto',   // 'auto' | 'origin' | 'att:<idx>' | 'bone:<idx>'
  offUp: 0,
  offFwd: 0,
  offRight: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  followRot: true,
  hideSelf: true,
  fov: 75,
  freeYaw: 0,
  freePitch: 0,
  savedCam: null,
  hiddenGroup: null
};

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _off = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _adjQ = new THREE.Quaternion();
const _camQ = new THREE.Quaternion();
const _box = new THREE.Box3();
const _boxSz = new THREE.Vector3();

function itemById(id){ return items.find(x => x.id === id) || null; }

function estimateEyeHeight(item){
  try {
    item.wrapper.updateMatrixWorld(true);
    _box.setFromObject(item.wrapper);
    if (!_box.isEmpty()){
      _box.getSize(_boxSz);
      if (isFinite(_boxSz.y) && _boxSz.y > 4) return Math.round(_boxSz.y * 0.85);
    }
  } catch (_) {}
  return 64;
}

function findAutoAnchor(item){
  const atts = item.attachments || [];
  const attMatch = [/^eyes?$/i, /eye/i, /^anim_attachment_head$/i, /^head$/i, /^forward$/i];
  for (const re of attMatch){
    const idx = atts.findIndex(a => re.test(a.name));
    if (idx >= 0) return { kind: 'att', idx, eyeUp: 0 };
  }
  const bones = item.bones || [];
  const boneMatch = [/head/i, /eye/i, /neck/i];
  for (const re of boneMatch){
    const idx = bones.findIndex(b => re.test(b.name));
    if (idx >= 0) return { kind: 'bone', idx, eyeUp: 0 };
  }
  return { kind: 'origin', idx: -1, eyeUp: estimateEyeHeight(item) };
}

function resolveAnchorNode(item){
  if (!item || !item.wrapper) return null;
  let key = pov.anchorKey;
  if (key === 'auto'){
    const a = findAutoAnchor(item);
    if (a.kind === 'att') key = 'att:' + a.idx;
    else if (a.kind === 'bone') key = 'bone:' + a.idx;
    else key = 'origin';
  }
  if (key.startsWith('att:') && item.attNodes){
    const idx = parseInt(key.slice(4), 10);
    if (item.attNodes[idx]) return { node: item.attNodes[idx], kind: 'att' };
  }
  if (key.startsWith('bone:') && item.rig && item.rig.bones){
    const idx = parseInt(key.slice(5), 10);
    if (item.rig.bones[idx]) return { node: item.rig.bones[idx], kind: 'bone' };
  }
  return { node: item.wrapper, kind: 'origin' };
}

function applyBones(bones, pos, quat){
  for (let i = 0; i < bones.length; i++){
    bones[i].position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    bones[i].quaternion.set(quat[i * 4], quat[i * 4 + 1], quat[i * 4 + 2], quat[i * 4 + 3]);
  }
}

function applyItemPose(item){
  if (!item.rig || !item.data) return;
  const seq = item.seqs[item.selSeq];
  if (seq){
    try {
      const p = samplePose(seq, item.rig.nb, item.data.bones, item.time, item.loop);
      applyBones(item.rig.bones, p.pos, p.quat);
    } catch (e) {
      console.warn('[sceneanim] invalid sequence; using bind pose:', seq.name, e);
      applyBones(item.rig.bones, item.rig.bindPos, item.rig.bindQuat);
    }
  } else {
    applyBones(item.rig.bones, item.rig.bindPos, item.rig.bindQuat);
  }
  item.wrapper.updateMatrixWorld(true);
}

function disposeRiggedItem(item){
  if (item.instGroup){
    item.instGroup.traverse(o => {
      if (o.skeleton) try { o.skeleton.dispose(); } catch (_) {}
      if (o.geometry) o.geometry.dispose();
      if (o.material){
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => m.dispose());
      }
    });
    if (item.instGroup.parent) item.instGroup.parent.remove(item.instGroup);
    item.instGroup = null;
  }
  item.rig = null;
  item.data = null;
  item.attNodes = null;
}

async function ensureRigged(item){
  if (!item) return false;
  if (item.rig) return true;
  if (item.rigPromise) return item.rigPromise;

  const myTok = mapToken;
  item.loading = true;
  renderPanelBody();

  item.rigPromise = (async () => {
    try {
      const m = await loadAnimatedModel(item.modelPath, { texSize: 512, skinFamily: item.skinFamily });
      if (myTok !== mapToken || !item.wrapper.parent){
        if (m && m.group){
          m.group.traverse(o => {
            if (o.skeleton) try { o.skeleton.dispose(); } catch (_) {}
            if (o.geometry) o.geometry.dispose();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(x => x.dispose());
          });
        }
        return false;
      }
      if (!m || !m.group || !m.rig) return false;

      // Убираем старую статичную копию модели из wrapper (не диспозим её геометрию, т.к. она из общего кэша vmf.js)
      while (item.wrapper.children.length) item.wrapper.remove(item.wrapper.children[0]);

      m.group.rotation.x = 0;
      item.wrapper.add(m.group);
      item.instGroup = m.group;
      item.rig = m.rig;
      item.data = m.data;

      // Синхронизируем список sequences с тем, что реально загрузил loadAnimatedModel
      const loadedSeqs = (m.data && m.data.seqs ? m.data.seqs : []).filter(s => !s.delta);
      if (loadedSeqs.length){
        const curName = item.seqs[item.selSeq] ? lc(item.seqs[item.selSeq].name) : '';
        item.seqs = loadedSeqs;
        const hit = curName ? loadedSeqs.findIndex(s => lc(s.name) === curName) : -1;
        if (hit >= 0) item.selSeq = hit;
      }

      // Точки крепления (attachments) привязываем к костям скелета
      item.attNodes = [];
      const markersOn = api.optAttach ? api.optAttach() : false;
      const markers = new THREE.Group();
      markers.userData.isAttachmentMarkerGroup = true;
      markers.name = 'attachments';

      for (let i = 0; i < m.mdl.attachments.length; i++){
        const at = m.mdl.attachments[i];
        if (!at.name || at.bone < 0 || at.bone >= m.rig.nb){ item.attNodes[i] = null; continue; }
        const o = new THREE.Object3D(), l = at.local;
        o.matrixAutoUpdate = false;
        o.matrix.set(l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7], l[8], l[9], l[10], l[11], 0, 0, 0, 1);
        (m.rig.bones[at.bone] || item.wrapper).add(o);
        item.attNodes[i] = o;

        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(3.5, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xff66ff, depthTest: false, transparent: true, opacity: 0.9 })
        );
        marker.renderOrder = 998;
        marker.userData.isAttachmentMarker = true;
        marker.userData.attachName = at.name;
        marker.visible = markersOn;
        o.add(marker);
      }

      applyItemPose(item);
      if (api.applyVrad) api.applyVrad();
      return true;
    } catch (e){
      console.warn('[sceneanim] ensureRigged:', item.modelPath, e);
      return false;
    } finally {
      item.loading = false;
      item.rigPromise = null;
      if (myTok === mapToken){ updateSelfVisibility(); renderPanelBody(); }
    }
  })();

  return item.rigPromise;
}

/* ---------- POV / КАМЕРА В ОБЪЕКТ (УРОВЕНЬ ГЛАЗ) ---------- */
function updateSelfVisibility(){
  if (pov.hiddenGroup){
    pov.hiddenGroup.visible = true;
    pov.hiddenGroup = null;
  }
  if (!pov.enabled || !pov.hideSelf) return;
  const item = itemById(pov.itemId);
  if (!item) return;
  const grp = item.instGroup || item.wrapper.children[0];
  if (grp){
    grp.visible = false;
    pov.hiddenGroup = grp;
  }
}

function initFreeLookFromCurrent(item){
  const res = resolveAnchorNode(item);
  if (!res) return;
  item.wrapper.updateMatrixWorld(true);
  res.node.matrixWorld.decompose(_pos, _quat, _scl);
  _euler.set(pov.pitch * D2R, pov.yaw * D2R, pov.roll * D2R, 'YXZ');
  _adjQ.setFromEuler(_euler);
  _camQ.copy(_quat).multiply(Q_SRC_TO_CAM).multiply(_adjQ);
  _euler.setFromQuaternion(_camQ, 'YXZ');
  pov.freePitch = THREE.MathUtils.clamp(_euler.x / D2R, -89, 89);
  pov.freeYaw = _euler.y / D2R;
}

export async function setPovEnabled(on, targetId){
  if (!api) return;
  if (on){
    const item = itemById(targetId != null ? targetId : pov.itemId) || items.find(x => x.seqs.length) || items[0];
    if (!item) return;

    const switched = pov.itemId !== item.id;
    pov.itemId = item.id;
    if (switched || !pov.enabled){
      const auto = findAutoAnchor(item);
      pov.anchorKey = 'auto';
      pov.offUp = auto.eyeUp;
      pov.offFwd = 0;
      pov.offRight = 0;
    }

    if (!pov.enabled){
      window.dispatchEvent(new CustomEvent('camtakeover', { detail: 'sceneanim' }));
      pov.savedCam = {
        pos: api.camera.position.clone(),
        target: api.controls.target.clone(),
        up: api.camera.up.clone(),
        fov: api.camera.fov,
        near: api.camera.near,
        far: api.camera.far
      };
    }

    pov.enabled = true;
    api.controls.enabled = false;
    api.camera.fov = pov.fov;
    api.camera.near = Math.min(pov.savedCam ? pov.savedCam.near : 1, 0.5);
    api.camera.updateProjectionMatrix();

    if (item.bones.length && !item.rig) await ensureRigged(item);
    initFreeLookFromCurrent(item);
    updateSelfVisibility();
    updatePovHud();
    renderPanelBody();
  } else {
    if (!pov.enabled) return;
    pov.enabled = false;
    updateSelfVisibility();
    if (pov.savedCam){
      api.camera.position.copy(pov.savedCam.pos);
      api.camera.up.copy(pov.savedCam.up);
      api.camera.fov = pov.savedCam.fov;
      api.camera.near = pov.savedCam.near;
      api.camera.far = pov.savedCam.far;
      api.camera.updateProjectionMatrix();
      api.controls.target.copy(pov.savedCam.target);
      pov.savedCam = null;
    } else {
      api.camera.up.set(0, 1, 0);
    }
    api.controls.enabled = true;
    api.controls.update();
    updatePovHud();
    renderPanelBody();
  }
}

export const isScenePovActive = () => !!(pov.enabled && api);

export function applyScenePovCamera(){
  if (!pov.enabled || !api) return;
  const item = itemById(pov.itemId);
  if (!item || !item.wrapper) return;

  const res = resolveAnchorNode(item);
  if (!res) return;

  item.wrapper.updateMatrixWorld(true);
  res.node.matrixWorld.decompose(_pos, _quat, _scl);

  _euler.set(pov.pitch * D2R, pov.yaw * D2R, pov.roll * D2R, 'YXZ');
  _adjQ.setFromEuler(_euler);
  _camQ.copy(_quat).multiply(Q_SRC_TO_CAM).multiply(_adjQ);

  // Смещение уровня глаз (в камеро-ориентированных координатах объекта)
  _off.set(pov.offRight, pov.offUp, -pov.offFwd).applyQuaternion(_camQ);
  api.camera.position.copy(_pos).add(_off);

  if (pov.followRot){
    api.camera.quaternion.copy(_camQ);
  } else {
    _euler.set(pov.freePitch * D2R, pov.freeYaw * D2R, 0, 'YXZ');
    api.camera.quaternion.setFromEuler(_euler);
  }
}

/* ---------- УПРАВЛЕНИЕ АНИМАЦИЯМИ ---------- */
async function togglePlayOne(item){
  if (!item.seqs.length) return;
  if (!item.playing){
    const ok = await ensureRigged(item);
    if (!ok) return;
    const seq = item.seqs[item.selSeq];
    const dur = seq && seq.numframes > 1 ? (seq.numframes - 1) / (seq.fps || 30) : 0;
    if (dur > 0 && item.time >= dur) item.time = 0;
    item.playing = true;
    applyItemPose(item);
  } else {
    item.playing = false;
  }
  renderPanelBody();
}

async function playList(targetItems){
  const list = targetItems.filter(it => it.seqs.length > 0);
  if (!list.length) return;
  await Promise.all(list.map(it => ensureRigged(it)));
  for (const it of list){
    if (!it.rig) continue;
    const seq = it.seqs[it.selSeq];
    const dur = seq && seq.numframes > 1 ? (seq.numframes - 1) / (seq.fps || 30) : 0;
    if (dur > 0 && it.time >= dur) it.time = 0;
    it.playing = true;
    applyItemPose(it);
  }
  renderPanelBody();
}

function pauseList(targetItems){
  for (const it of targetItems) it.playing = false;
  renderPanelBody();
}

function stopAndResetAll(){
  for (const it of items){
    it.playing = false;
    it.time = 0;
    if (it.rig) applyItemPose(it);
  }
  renderPanelBody();
}

function focusItem(item){
  if (!api || !item || !item.wrapper) return;
  if (pov.enabled) setPovEnabled(false);
  item.wrapper.updateMatrixWorld(true);
  _box.setFromObject(item.wrapper);
  if (_box.isEmpty()) return;
  const c = _box.getCenter(new THREE.Vector3()), sz = _box.getSize(new THREE.Vector3());
  const r = Math.max(sz.length() * 0.5, 48);
  api.controls.target.copy(c);
  api.camera.position.copy(c).add(new THREE.Vector3(r * 1.4, r * 0.9, r * 1.4));
  api.controls.update();
}

window.addEventListener('cutscene-start', () => {
  // Не даём независимому плееру сцены менять те же объекты во время проигрывания кат-сцены.
  for (const it of items) it.playing = false;
  if (panel && !panel.hidden) renderPanelBody();
});

export function stepSceneAnims(now){
  const tNow = now || performance.now();
  const dt = lastNow ? Math.min(0.1, (tNow - lastNow) / 1000) : 0;
  lastNow = tNow;
  if (!items.length || dt <= 0) return;

  let anyStopped = false;
  for (const it of items){
    if (!it.playing || !it.rig) continue;
    const seq = it.seqs[it.selSeq];
    if (!seq) continue;
    const fps = seq.fps || 30;
    const dur = seq.numframes > 1 ? (seq.numframes - 1) / fps : 0;
    if (dur > 0){
      it.time += dt * it.speed * globalSpeed;
      if (it.time >= dur){
        if (it.loop) it.time %= dur;
        else { it.time = dur; it.playing = false; anyStopped = true; }
      }
    }
    applyItemPose(it);
    updateItemProgressDom(it);
  }
  if (anyStopped && panel && !panel.hidden) renderPanelBody();
}

function updateItemProgressDom(it){
  if (!panel || panel.hidden) return;
  const row = panel.querySelector(`.sa-item[data-id="${it.id}"]`);
  if (!row) return;
  const seq = it.seqs[it.selSeq];
  const dur = seq && seq.numframes > 1 ? (seq.numframes - 1) / (seq.fps || 30) : 0;
  const sl = row.querySelector('.sa-scrub');
  if (sl && !sl._scrubbing) sl.value = dur > 0 ? String(Math.round((it.time / dur) * 1000)) : '0';
  const fr = row.querySelector('.sa-fr');
  if (fr && seq){
    const curF = Math.min(seq.numframes, Math.floor(it.time * (seq.fps || 30) + 1e-5) + 1);
    fr.textContent = `${curF}/${seq.numframes}`;
  }
}

/* ---------- СКАНИРОВАНИЕ КАРТЫ ---------- */
export function sceneAnimReset(){
  mapToken++;
  lastNow = 0;
  if (pov.enabled) setPovEnabled(false);
  for (const it of items) disposeRiggedItem(it);
  items = [];
  if (badgeEl) badgeEl.textContent = '0';
  if (btnToggle) btnToggle.disabled = true;
  if (panel) panel.hidden = true;
  updatePovHud();
}

export async function sceneAnimMapReady(){
  if (!api) return;
  const myTok = ++mapToken;
  const wrappers = api.getWrappers ? api.getWrappers() : [];
  if (!wrappers.length){
    if (badgeEl) badgeEl.textContent = '0';
    if (btnToggle) btnToggle.disabled = true;
    return;
  }

  const uniquePaths = new Set();
  for (const w of wrappers){
    const mp = w.userData && w.userData.modelPath;
    if (mp && hasModelForPath(mp)) uniquePaths.add(mp);
  }

  const metaMap = new Map();
  await Promise.all([...uniquePaths].map(async mp => {
    const info = await inspectModelAnims(mp);
    if (info) metaMap.set(lc(mp), info);
  }));
  if (myTok !== mapToken) return;

  const built = [];
  let nextId = 1;
  for (const w of wrappers){
    const e = w.userData && w.userData.ent;
    const mp = w.userData && w.userData.modelPath;
    if (!e || !mp) continue;
    const info = metaMap.get(lc(mp));
    if (!info) continue;

    const seqs = info.seqs || [];
    const defAnim = lc((e.props && (e.props.defaultanim || e.props.sequence)) || '');
    let selSeq = defAnim ? seqs.findIndex(s => lc(s.name) === defAnim) : -1;
    if (selSeq < 0) selSeq = 0;

    const shortMdl = mp.split('/').pop();
    const baseName = e.targetname || e.classname || shortMdl;

    built.push({
      id: nextId++,
      ent: e,
      wrapper: w,
      modelPath: mp,
      skinFamily: w.userData.skinFamily || 0,
      label: `${baseName}`,
      modelName: shortMdl,
      seqs,
      bones: info.bones || [],
      attachments: info.attachments || [],
      selSeq,
      time: 0,
      speed: 1,
      loop: true,
      playing: false,
      checked: seqs.length > 0,
      rig: null,
      data: null,
      instGroup: null,
      attNodes: null,
      rigPromise: null,
      loading: false
    });
  }

  // Сначала объекты с анимациями, потом остальные модели
  built.sort((a, b) => (b.seqs.length > 0) - (a.seqs.length > 0) || a.label.localeCompare(b.label));
  items = built;

  const animCount = items.filter(x => x.seqs.length > 0).length;
  if (badgeEl) badgeEl.textContent = String(animCount || items.length);
  if (btnToggle) btnToggle.disabled = items.length === 0;
  if (panel && !panel.hidden) renderPanelBody();
}

/* ---------- UI И СОБЫТИЯ ---------- */
function ensureDom(){
  const pane = document.getElementById('paneVmf');
  if (!pane || panel) return;

  btnToggle = document.getElementById('vmfBtnAnims');
  badgeEl = document.getElementById('vmfAnimBadge');
  if (btnToggle){
    btnToggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      btnToggle.classList.toggle('active', !panel.hidden);
      if (!panel.hidden) renderPanelBody();
    });
  }

  panel = document.createElement('div');
  panel.id = 'saPanel';
  panel.hidden = true;
  pane.appendChild(panel);

  povHud = document.createElement('div');
  povHud.id = 'saPovHud';
  povHud.hidden = true;
  pane.appendChild(povHud);

  // Свободный огляд мышкой / пальцем в POV (когда followRot выкл)
  let drag = null;
  const cvs = api.canvas;
  if (cvs){
    cvs.addEventListener('pointerdown', e => {
      if (!pov.enabled || pov.followRot) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cvs.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId || !pov.enabled || pov.followRot) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      pov.freeYaw -= dx * 0.22;
      pov.freePitch = THREE.MathUtils.clamp(pov.freePitch - dy * 0.22, -89, 89);
    });
    const endDrag = e => { if (drag && drag.id === e.pointerId) drag = null; };
    cvs.addEventListener('pointerup', endDrag);
    cvs.addEventListener('pointercancel', endDrag);
    cvs.addEventListener('wheel', e => {
      if (!pov.enabled) return;
      e.preventDefault();
      pov.fov = THREE.MathUtils.clamp(pov.fov + (e.deltaY > 0 ? 3 : -3), 30, 115);
      api.camera.fov = pov.fov;
      api.camera.updateProjectionMatrix();
      if (!panel.hidden && activeTab === 'pov'){
        const s = panel.querySelector('#saFov'); if (s) s.value = String(pov.fov);
        const l = panel.querySelector('#saFovVal'); if (l) l.textContent = pov.fov + '°';
      }
    }, { passive: false });
  }

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pov.enabled){
      e.preventDefault();
      setPovEnabled(false);
    }
  });
  window.addEventListener('camtakeover', e => {
    if (e.detail !== 'sceneanim' && pov.enabled) setPovEnabled(false);
  });
  window.addEventListener('langchange', () => {
    const lbl = document.getElementById('vmfBtnAnimsLbl');
    if (lbl) lbl.textContent = tr('btn');
    if (panel && !panel.hidden) renderPanelBody();
    updatePovHud();
  });

  const lbl = document.getElementById('vmfBtnAnimsLbl');
  if (lbl) lbl.textContent = tr('btn');
}

function updatePovHud(){
  if (!povHud) return;
  if (!pov.enabled){ povHud.hidden = true; return; }
  const it = itemById(pov.itemId);
  povHud.hidden = false;
  povHud.innerHTML = `
    <span class="sa-pov-nm">👁 <b>${esc(it ? it.label : '—')}</b></span>
    ${!pov.followRot ? `<span class="sa-pov-hint">${esc(tr('hint_free'))}</span>` : ''}
    <button type="button" class="btn sm" id="saHudEdit">⚙</button>
    <button type="button" class="btn sm primary" id="saHudExit">${esc(tr('pov_exit'))}</button>`;
  povHud.querySelector('#saHudEdit').onclick = () => {
    activeTab = 'pov';
    panel.hidden = false;
    btnToggle && btnToggle.classList.add('active');
    renderPanelBody();
  };
  povHud.querySelector('#saHudExit').onclick = () => setPovEnabled(false);
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderPanelBody(){
  if (!panel) return;
  const animItems = items.filter(it => it.seqs.length > 0);
  panel.innerHTML = `
    <div class="sa-head">
      <b>🎬 ${esc(tr('title'))}</b>
      <div class="sa-tabs">
        <button type="button" class="${activeTab === 'anims' ? 'on' : ''}" data-t="anims">${esc(tr('tab_anims'))}</button>
        <button type="button" class="${activeTab === 'pov' ? 'on' : ''}" data-t="pov">${esc(tr('tab_pov'))}</button>
      </div>
      <button type="button" class="sa-x" id="saClose">✕</button>
    </div>
    <div class="sa-body"></div>`;

  panel.querySelector('#saClose').onclick = () => {
    panel.hidden = true;
    btnToggle && btnToggle.classList.remove('active');
  };
  panel.querySelectorAll('.sa-tabs button').forEach(b => {
    b.onclick = () => { activeTab = b.dataset.t; renderPanelBody(); };
  });

  const body = panel.querySelector('.sa-body');
  if (!items.length){
    body.innerHTML = `<div class="sa-empty">${esc(tr('empty'))}</div>`;
    return;
  }

  if (activeTab === 'anims') renderAnimsTab(body, animItems);
  else renderPovTab(body);
}

function renderAnimsTab(body, animItems){
  const q = lc(searchText);
  const filtered = items.filter(it => {
    if (onlyAnimated && !it.seqs.length) return false;
    if (q && !lc(it.label).includes(q) && !lc(it.modelName).includes(q)) return false;
    return true;
  });

  body.innerHTML = `
    <div class="sa-gctrl">
      <button type="button" class="btn sm primary" id="saPlayAll">${esc(tr('play_all'))}</button>
      <button type="button" class="btn sm" id="saPauseAll">${esc(tr('pause_all'))}</button>
      <button type="button" class="btn sm" id="saStopAll">${esc(tr('stop_all'))}</button>
      <button type="button" class="btn sm" id="saPlaySel">${esc(tr('play_sel'))}</button>
      <button type="button" class="btn sm" id="saPauseSel">${esc(tr('pause_sel'))}</button>
    </div>
    <div class="sa-filter">
      <input type="search" id="saSearch" placeholder="${esc(tr('search'))}" value="${esc(searchText)}">
      <label class="sa-chk"><input type="checkbox" id="saOnlyAnim" ${onlyAnimated ? 'checked' : ''}> ${esc(tr('only_anim'))}</label>
      <div class="sa-mini-row">
        <button type="button" class="btn sm" id="saSelAll">${esc(tr('sel_all'))}</button>
        <button type="button" class="btn sm" id="saSelNone">${esc(tr('sel_none'))}</button>
        <label class="sa-sp">${esc(tr('speed'))}
          <select id="saGlobSpeed">
            ${[0.25, 0.5, 1, 2, 4].map(v => `<option value="${v}"${globalSpeed === v ? ' selected' : ''}>${v}×</option>`).join('')}
          </select>
        </label>
      </div>
    </div>
    <div class="sa-list" id="saList"></div>`;

  body.querySelector('#saPlayAll').onclick = () => playList(animItems);
  body.querySelector('#saPauseAll').onclick = () => pauseList(items);
  body.querySelector('#saStopAll').onclick = () => stopAndResetAll();
  body.querySelector('#saPlaySel').onclick = () => playList(items.filter(x => x.checked));
  body.querySelector('#saPauseSel').onclick = () => pauseList(items.filter(x => x.checked));
  body.querySelector('#saSelAll').onclick = () => { items.forEach(x => { if (x.seqs.length) x.checked = true; }); renderPanelBody(); };
  body.querySelector('#saSelNone').onclick = () => { items.forEach(x => { x.checked = false; }); renderPanelBody(); };
  body.querySelector('#saGlobSpeed').onchange = e => { globalSpeed = parseFloat(e.target.value) || 1; };
  body.querySelector('#saOnlyAnim').onchange = e => { onlyAnimated = e.target.checked; renderPanelBody(); };
  body.querySelector('#saSearch').oninput = e => {
    searchText = e.target.value;
    const listEl = body.querySelector('#saList');
    if (listEl) fillAnimList(listEl);
  };

  fillAnimList(body.querySelector('#saList'));
}

function fillAnimList(listEl){
  const q = lc(searchText);
  const filtered = items.filter(it => {
    if (onlyAnimated && !it.seqs.length) return false;
    if (q && !lc(it.label).includes(q) && !lc(it.modelName).includes(q)) return false;
    return true;
  });
  listEl.textContent = '';
  if (!filtered.length){
    listEl.innerHTML = `<div class="sa-empty">${esc(tr('empty'))}</div>`;
    return;
  }

  for (const it of filtered){
    const hasSeq = it.seqs.length > 0;
    const seq = hasSeq ? it.seqs[it.selSeq] : null;
    const dur = seq && seq.numframes > 1 ? (seq.numframes - 1) / (seq.fps || 30) : 0;
    const curF = seq ? Math.min(seq.numframes, Math.floor(it.time * (seq.fps || 30) + 1e-5) + 1) : 0;
    const isPov = pov.enabled && pov.itemId === it.id;

    const row = document.createElement('div');
    row.className = 'sa-item' + (it.playing ? ' playing' : '') + (isPov ? ' pov' : '');
    row.dataset.id = String(it.id);

    const seqOpts = hasSeq
      ? it.seqs.map((s, idx) => `<option value="${idx}"${idx === it.selSeq ? ' selected' : ''}>${esc(s.name)} (${s.numframes}f)</option>`).join('')
      : `<option value="-1">${esc(tr('no_anim'))}</option>`;

    row.innerHTML = `
      <div class="sa-row1">
        <input type="checkbox" class="sa-chk-item" ${it.checked ? 'checked' : ''} ${hasSeq ? '' : 'disabled'}>
        <div class="sa-nm" title="${esc(it.modelPath)}"><b>${esc(it.label)}</b><small>${esc(it.modelName)}</small></div>
        <button type="button" class="btn sm sa-play" ${hasSeq ? '' : 'disabled'} title="Play/Pause">${it.loading ? '⏳' : (it.playing ? '⏸' : '▶')}</button>
        <button type="button" class="btn sm sa-pov ${isPov ? 'primary' : ''}" title="${esc(tr('pov_enable'))}">👁</button>
        <button type="button" class="btn sm sa-fit" title="Focus">🎯</button>
      </div>
      ${hasSeq ? `
      <div class="sa-row2">
        <select class="sa-seq">${seqOpts}</select>
        <label class="sa-lp"><input type="checkbox" class="sa-loop" ${it.loop ? 'checked' : ''}> ${esc(tr('loop'))}</label>
      </div>
      <div class="sa-row3">
        <input type="range" class="sa-scrub" min="0" max="1000" value="${dur > 0 ? Math.round((it.time / dur) * 1000) : 0}" ${dur <= 0 ? 'disabled' : ''}>
        <span class="sa-fr">${curF}/${seq.numframes}</span>
      </div>` : ''}`;

    row.querySelector('.sa-chk-item').onchange = e => { it.checked = e.target.checked; };
    const playBtn = row.querySelector('.sa-play');
    if (playBtn) playBtn.onclick = () => togglePlayOne(it);
    row.querySelector('.sa-pov').onclick = () => {
      if (isPov) setPovEnabled(false);
      else setPovEnabled(true, it.id);
    };
    row.querySelector('.sa-fit').onclick = () => focusItem(it);

    if (hasSeq){
      row.querySelector('.sa-seq').onchange = async e => {
        it.selSeq = parseInt(e.target.value, 10) || 0;
        it.time = 0;
        if (!it.rig) await ensureRigged(it);
        if (it.rig) applyItemPose(it);
        renderPanelBody();
      };
      row.querySelector('.sa-loop').onchange = e => { it.loop = e.target.checked; };
      const scrub = row.querySelector('.sa-scrub');
      scrub.onpointerdown = () => { scrub._scrubbing = true; };
      const endS = () => { scrub._scrubbing = false; };
      scrub.onpointerup = endS; scrub.onpointercancel = endS; scrub.onchange = endS;
      scrub.oninput = async () => {
        it.playing = false;
        if (!it.rig) await ensureRigged(it);
        const s = it.seqs[it.selSeq];
        const d = s && s.numframes > 1 ? (s.numframes - 1) / (s.fps || 30) : 0;
        it.time = (scrub.value / 1000) * d;
        if (it.rig) applyItemPose(it);
        updateItemProgressDom(it);
      };
    }

    listEl.appendChild(row);
  }
}

function renderPovTab(body){
  const curItem = itemById(pov.itemId) || items.find(x => x.seqs.length) || items[0];
  if (!curItem) return;
  if (pov.itemId == null) pov.itemId = curItem.id;

  const objOpts = items.map(it =>
    `<option value="${it.id}"${it.id === curItem.id ? ' selected' : ''}>${esc(it.label)} (${esc(it.modelName)})${it.seqs.length ? ' 🎬' : ''}</option>`
  ).join('');

  const attOpts = (curItem.attachments || []).map((a, i) =>
    `<option value="att:${i}"${pov.anchorKey === 'att:' + i ? ' selected' : ''}>Attachment: ${esc(a.name)}</option>`
  ).join('');
  const boneOpts = (curItem.bones || []).map((b, i) =>
    `<option value="bone:${i}"${pov.anchorKey === 'bone:' + i ? ' selected' : ''}>Bone: ${esc(b.name || ('#' + i))}</option>`
  ).join('');

  const sliderRow = (id, label, val, min, max, step = 1, unit = '') => `
    <div class="sa-sl-row">
      <div class="sa-sl-h"><span>${esc(label)}</span><input type="number" class="sa-num" data-for="${id}" value="${val}" step="${step}"></div>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
    </div>`;

  body.innerHTML = `
    <div class="sa-pov-box">
      <button type="button" class="btn ${pov.enabled ? 'primary' : ''}" id="saPovToggle" style="width:100%;justify-content:center">
        ${pov.enabled ? esc(tr('pov_exit')) : esc(tr('pov_enable'))}
      </button>

      <label class="sa-lbl">${esc(tr('pov_target'))}
        <select id="saPovObj">${objOpts}</select>
      </label>

      <label class="sa-lbl">${esc(tr('pov_anchor'))}
        <select id="saPovAnchor">
          <option value="auto"${pov.anchorKey === 'auto' ? ' selected' : ''}>${esc(tr('anchor_auto'))}</option>
          <option value="origin"${pov.anchorKey === 'origin' ? ' selected' : ''}>${esc(tr('anchor_origin'))}</option>
          ${attOpts}
          ${boneOpts}
        </select>
      </label>

      ${sliderRow('saOffUp', tr('eye_up'), pov.offUp, -128, 256, 1)}
      ${sliderRow('saOffFwd', tr('eye_fwd'), pov.offFwd, -64, 64, 0.5)}
      ${sliderRow('saOffRight', tr('eye_right'), pov.offRight, -64, 64, 0.5)}

      <div class="sa-sep"></div>

      ${sliderRow('saYaw', tr('rot_yaw'), pov.yaw, -180, 180, 1)}
      <div class="sa-qbtns">
        <button type="button" class="btn sm" data-rot="yaw" data-v="-90">Yaw -90°</button>
        <button type="button" class="btn sm" data-rot="yaw" data-v="90">Yaw +90°</button>
        <button type="button" class="btn sm" data-rot="yaw" data-v="180">180°</button>
      </div>
      ${sliderRow('saPitch', tr('rot_pitch'), pov.pitch, -90, 90, 1)}
      ${sliderRow('saRoll', tr('rot_roll'), pov.roll, -180, 180, 1)}
      <div class="sa-qbtns">
        <button type="button" class="btn sm" data-rot="roll" data-v="-90">Roll -90°</button>
        <button type="button" class="btn sm" data-rot="roll" data-v="90">Roll +90°</button>
        <button type="button" class="btn sm" data-rot="pitch" data-v="90">Pitch +90°</button>
      </div>

      <div class="sa-sep"></div>

      <label class="sa-chk"><input type="checkbox" id="saFollowRot" ${pov.followRot ? 'checked' : ''}> ${esc(tr('follow_rot'))}</label>
      <label class="sa-chk"><input type="checkbox" id="saHideSelf" ${pov.hideSelf ? 'checked' : ''}> ${esc(tr('hide_self'))}</label>

      <div class="sa-sl-row">
        <div class="sa-sl-h"><span>${esc(tr('fov'))}</span><b id="saFovVal">${pov.fov}°</b></div>
        <input type="range" id="saFov" min="30" max="115" step="1" value="${pov.fov}">
      </div>

      <button type="button" class="btn sm" id="saResetPov" style="width:100%;justify-content:center;margin-top:6px">${esc(tr('reset_pov'))}</button>
    </div>`;

  body.querySelector('#saPovToggle').onclick = () => setPovEnabled(!pov.enabled, curItem.id);

  body.querySelector('#saPovObj').onchange = async e => {
    const nid = parseInt(e.target.value, 10);
    if (pov.enabled) await setPovEnabled(true, nid);
    else {
      pov.itemId = nid;
      const it = itemById(nid);
      if (it){
        const auto = findAutoAnchor(it);
        pov.anchorKey = 'auto';
        pov.offUp = auto.eyeUp;
        pov.offFwd = 0; pov.offRight = 0;
      }
      renderPanelBody();
    }
  };

  body.querySelector('#saPovAnchor').onchange = async e => {
    pov.anchorKey = e.target.value;
    if (pov.anchorKey === 'origin') pov.offUp = estimateEyeHeight(curItem);
    else if (pov.anchorKey === 'auto') pov.offUp = findAutoAnchor(curItem).eyeUp;
    else pov.offUp = 0;
    if (pov.enabled && curItem.bones.length && !curItem.rig) await ensureRigged(curItem);
    initFreeLookFromCurrent(curItem);
    renderPanelBody();
  };

  const bindNumSlider = (id, prop) => {
    const sl = body.querySelector('#' + id);
    const nm = body.querySelector(`.sa-num[data-for="${id}"]`);
    sl.oninput = () => { pov[prop] = parseFloat(sl.value) || 0; nm.value = String(pov[prop]); };
    nm.oninput = () => {
      const v = parseFloat(nm.value);
      if (isFinite(v)){ pov[prop] = v; sl.value = String(v); }
    };
  };
  bindNumSlider('saOffUp', 'offUp');
  bindNumSlider('saOffFwd', 'offFwd');
  bindNumSlider('saOffRight', 'offRight');
  bindNumSlider('saYaw', 'yaw');
  bindNumSlider('saPitch', 'pitch');
  bindNumSlider('saRoll', 'roll');

  body.querySelectorAll('[data-rot]').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.rot, dv = parseFloat(b.dataset.v) || 0;
      let v = (pov[k] + dv);
      if (k === 'pitch') v = THREE.MathUtils.clamp(v, -90, 90);
      else v = ((v + 540) % 360) - 180;
      pov[k] = v;
      renderPanelBody();
    };
  });

  body.querySelector('#saFollowRot').onchange = e => {
    pov.followRot = e.target.checked;
    if (!pov.followRot) initFreeLookFromCurrent(curItem);
    updatePovHud();
  };
  body.querySelector('#saHideSelf').onchange = e => {
    pov.hideSelf = e.target.checked;
    updateSelfVisibility();
  };
  body.querySelector('#saFov').oninput = e => {
    pov.fov = parseInt(e.target.value, 10) || 75;
    body.querySelector('#saFovVal').textContent = pov.fov + '°';
    if (pov.enabled){ api.camera.fov = pov.fov; api.camera.updateProjectionMatrix(); }
  };
  body.querySelector('#saResetPov').onclick = () => {
    const auto = findAutoAnchor(curItem);
    pov.anchorKey = 'auto';
    pov.offUp = auto.eyeUp; pov.offFwd = 0; pov.offRight = 0;
    pov.yaw = 0; pov.pitch = 0; pov.roll = 0;
    pov.fov = 75;
    if (pov.enabled){
      api.camera.fov = 75; api.camera.updateProjectionMatrix();
      initFreeLookFromCurrent(curItem);
    }
    renderPanelBody();
  };
}

export function initSceneAnim(a){
  api = a;
  ensureDom();
}