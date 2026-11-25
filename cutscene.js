// cutscene.js — проигрыватель кат-сцены карты: таймлайн из connections (cutsim.js),
// скелетные NPC/props с анимацией, камера point_viewcontrol, аудиотрекер и экспорт видео.
import * as THREE from 'three';
import { LANG, Store, Plugins } from './core.js';
import { getRecordBuffer } from './archives.js';
import { loadAnimatedModel, buildModelFromPath } from './models.js';
import { samplePose } from './anim.js';
import { hasCutscene, findRoots, simulate, stateAt, collectActors } from './cutsim.js';
import { loadRapier, collectWorldTris, bakePhysics, samplePhys } from './physics.js';
import { canRecord, startCanvasRecording, extFor, downloadBlob } from './recorder.js';

const TX = {
  en: { title: 'Cutscene', btn: '🎞 Cutscene', info: 'Info', follow: 'Camera view', loop: 'Loop', start: 'Start from', len: 'Length', events: 'Events', actors: 'Actors', camera: 'Camera',
    cons: 'Console commands', snd: 'Sounds', none: 'none', missing: 'Model files not found: {m}', loading: 'Building cutscene…', loaded: 'Cutscene ready: {n} events, {a} animated objects',
    noroot: 'No cutscene start found in this map.', fail: 'Failed to build cutscene: {e}', nocam: 'No point_viewcontrol is enabled by this scene: use free camera.',
    hint: 'Click a line to jump to that moment.', tip: 'Cutscene (point_viewcontrol)',
    paths: 'Paths', physics: 'Physics', rec: 'Record', rec_stop: 'Stop & save', recording: 'REC', res_screen: 'Screen size',
    rec_saved: 'Video saved: {n}', rec_fail: 'Recording failed: {e}', rec_nosupport: 'This browser cannot record video (MediaRecorder is missing).',
    phys_baking: 'Simulating physics…', phys_fail: 'Physics engine (Rapier) failed to load — it is fetched from a CDN once, check the connection. Props stay where the map puts them.',
    phys_ok: 'simulated: {n}', phys_row: 'Physics', rec_hint: 'Recording plays the scene from the first camera shot in real time, hides paths, grid and icons, and captures the sound.' },
  ru: { title: 'Кат-сцена', btn: '🎞 Кат-сцена', info: 'Инфо', follow: 'Вид из камеры', loop: 'Цикл', start: 'Старт от', len: 'Длина', events: 'События', actors: 'Актёры', camera: 'Камера',
    cons: 'Консольные команды', snd: 'Звуки', none: 'нет', missing: 'Не найдены файлы моделей: {m}', loading: 'Собираю кат-сцену…', loaded: 'Кат-сцена готова: {n} событий, анимированных объектов: {a}',
    noroot: 'В этой карте не найден запуск кат-сцены.', fail: 'Не удалось собрать кат-сцену: {e}', nocam: 'Эта сцена не включает point_viewcontrol: используйте свободную камеру.',
    hint: 'Нажмите на строку, чтобы перейти к этому моменту.', tip: 'Кат-сцена (point_viewcontrol)',
    paths: 'Пути', physics: 'Физика', rec: 'Запись', rec_stop: 'Стоп и сохранить', recording: 'REC', res_screen: 'Размер экрана',
    rec_saved: 'Видео сохранено: {n}', rec_fail: 'Не удалось записать: {e}', rec_nosupport: 'Этот браузер не умеет записывать видео (нет MediaRecorder).',
    phys_baking: 'Считаю физику…', phys_fail: 'Физический движок (Rapier) не загрузился — он берётся с CDN один раз, проверьте соединение. Предметы остаются там, где их поставила карта.',
    phys_ok: 'просчитано тел: {n}', phys_row: 'Физика', rec_hint: 'Запись проигрывает сцену с первого кадра камеры в реальном времени, скрывает пути, сетку и иконки и пишет звук.' }
};
const tr = (k, p) => { let s = (TX[LANG] && TX[LANG][k]) || TX.en[k] || k; if (p) for (const q in p) s = s.replace('{' + q + '}', p[q]); return s; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0'); };
const D2R = Math.PI / 180, lc = s => String(s == null ? '' : s).toLowerCase();
const setSrcRot = (o, a) => o.rotation.set(a[2] * D2R, a[0] * D2R, a[1] * D2R, 'ZYX');       // Source: roll(X) pitch(Y) yaw(Z)
const SRC_VFOV = 2 * Math.atan(Math.tan(Math.PI / 4) * 3 / 4) / D2R;

let api = null, sim = null, group = null, camObj = null, trail = null, bar = null, info = null, btn = null;
let actors = new Map(), hidden = [], candidates = [], busy = false, origFov = null, token = 0;
let T = 0, dur = 0, playing = false, speed = 1, follow = false, loop = false, last = 0, raf = 0, camSeen = false;
let curRootKey = '', camStart = 0, camAvail = false, physOn = true, physNote = null, curPhys = new Set(), rec = null;
let physSounds = [], physSoundIndex = 0;
let showPaths = true; try { showPaths = localStorage.getItem('sav_cut_paths') !== '0'; } catch (_) {}
const _tmpO = new THREE.Object3D(), quatOf = a => { setSrcRot(_tmpO, a); const q = _tmpO.quaternion; return [q.x, q.y, q.z, q.w]; };

/* ---------- ДЕКОДЕР ЗВУКОВ SOURCE (ADPCM / WAV) ---------- */
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

function prepareAudioBuffer(ab, ext){
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
          return { buf: ab.slice(dataOff, dataOff + dataLen), mime: 'audio/mpeg' };
        }
      }
    } catch (_) {}
    return { buf: ab, mime: 'audio/wav' };
  }
  if (u8.length > 4 && tag4(0) === 'OggS') return { buf: ab, mime: 'audio/ogg' };
  return { buf: ab, mime: ext === 'mp3' ? 'audio/mpeg' : (ext === 'ogg' ? 'audio/ogg' : 'audio/wav') };
}

/* ---------- АУДИО-МЕНЕДЖЕР ---------- */
const SND = { enabled: true, volume: 1, playing: new Map(), cache: new Map(), generation: 0, versions: new Map() };
const AUD = { ctx: null, master: null, dest: null };

function audioGraph(){
  try {
    if (!AUD.ctx){
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      AUD.ctx = new C(); AUD.master = AUD.ctx.createGain(); AUD.master.connect(AUD.ctx.destination);
      AUD.dest = AUD.ctx.createMediaStreamDestination(); AUD.master.connect(AUD.dest);
    }
    if (AUD.ctx.state === 'suspended') AUD.ctx.resume().catch(() => {});
    return AUD;
  } catch (e) { console.warn('[audio] graph', e); return null; }
}

function playPhysicsImpact(ev) {
  if (!SND.enabled || !ev || !AUD.ctx || !AUD.master) return;
  try {
    const ctx = AUD.ctx, now = ctx.currentTime, strength = Math.max(0.06, Math.min(1, ev.intensity || 0.1));
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.015, strength * 0.28), now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (ev.material === 'metal' ? 0.34 : 0.19));
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.value = ev.material === 'metal' ? 4200 : ev.material === 'glass' ? 5600 : ev.material === 'wood' ? 1900 : 1300;
    const osc = ctx.createOscillator(); osc.type = ev.material === 'metal' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(ev.material === 'metal' ? 720 : ev.material === 'glass' ? 1250 : ev.material === 'wood' ? 150 : 95, now);
    osc.frequency.exponentialRampToValueAtTime(ev.material === 'metal' ? 180 : 48, now + 0.16);
    osc.connect(filter); filter.connect(gain); gain.connect(AUD.master); osc.start(now); osc.stop(now + 0.2);
    osc.onended = () => { try { osc.disconnect(); filter.disconnect(); gain.disconnect(); } catch (_) {} };
  } catch (_) {}
}

function triggerPhysicsSounds(fromT, toT) {
  if (!SND.enabled || toT <= fromT || !physSounds.length) return;
  while (physSoundIndex < physSounds.length && physSounds[physSoundIndex].t <= fromT) physSoundIndex++;
  while (physSoundIndex < physSounds.length && physSounds[physSoundIndex].t <= toT) playPhysicsImpact(physSounds[physSoundIndex++]);
}

function resetPhysicsSoundIndex(t) {
  let lo = 0, hi = physSounds.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (physSounds[mid].t <= t) lo = mid + 1; else hi = mid; }
  physSoundIndex = lo;
}

function cleanSoundPath(rawPath) {
  if (!rawPath) return '';
  return rawPath.toLowerCase()
    .replace(/\\/g, '/')
    .replace(/^[*#)(@~$!?^>]+/, '')
    .replace(/^sound\//, '')
    .trim();
}

function findSoundFile(soundPath) {
  const p = cleanSoundPath(soundPath);
  if (!p) return null;
  let rec = Store.files.get('sound/' + p) || Store.files.get(p);
  if (!rec) {
    for (const f of Store.files.values()) {
      const fp = f.path.toLowerCase().replace(/\\/g, '/');
      if ((fp === 'sound/' + p || fp.endsWith('/' + p) || fp.endsWith(p)) && /\.(wav|mp3|ogg)$/i.test(fp)) {
        rec = f; break;
      }
    }
  }
  return rec;
}

async function playSound(key, msg, loop, pitch, seekTime = 0) {
  if (!SND.enabled) return;
  const generation = SND.generation;
  const version = (SND.versions.get(key) || 0) + 1;
  SND.versions.set(key, version);
  const timelineStart = T - seekTime;
  const rec = findSoundFile(msg);
  if (!rec) return;

  try {
    let url = SND.cache.get(rec.path);
    if (!url) {
      const rawBuf = await getRecordBuffer(rec);
      const prep = prepareAudioBuffer(rawBuf, rec.ext);
      url = URL.createObjectURL(new Blob([prep.buf], { type: prep.mime }));
      SND.cache.set(rec.path, url);
    }
    // Если пользователь успел перемотать/остановить сцену во время загрузки файла,
    // не запускаем устаревший звук из предыдущей позиции таймлайна.
    if (generation !== SND.generation || SND.versions.get(key) !== version || !SND.enabled) return;

    const old = SND.playing.get(key);
    if (old){
      try { old.audio.pause(); old.audio.src = ''; } catch(_){}
      SND.playing.delete(key);
    }

    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = SND.volume;
    audio.loop = loop;
    const basePitch = (pitch || 100) / 100;
    audio.playbackRate = Math.max(0.1, basePitch * speed);

    const g = audioGraph();
    if (g){
      try {
        const srcNode = g.ctx.createMediaElementSource(audio);
        srcNode.connect(g.master);
      } catch (_) {}
    }

    const audioOffset = Math.max(0, seekTime * basePitch);
    if (audioOffset > 0) {
      try { audio.currentTime = audioOffset; } catch (_){}
      audio.addEventListener('loadedmetadata', () => {
        if (generation !== SND.generation ||
            SND.versions.get(key) !== version ||
            SND.playing.get(key)?.audio !== audio) return;
        // Не запускаем одноразовый звук, если перемотка уже ушла за его конец.
        if (!loop && isFinite(audio.duration) && audioOffset >= audio.duration) {
          try { audio.pause(); audio.src = ''; } catch (_) {}
          SND.playing.delete(key);
          return;
        }
        try { audio.currentTime = audioOffset; } catch (_){}
        if (playing) audio.play().catch(() => {});
      }, { once: true });
    }

    const entry = {
      audio,
      basePitch,
      startT: timelineStart,
      loop
    };
    SND.playing.set(key, entry);
    // При перемотке на паузе позиционируем звук, но не запускаем его.
    if (playing && generation === SND.generation) audio.play().catch(() => {});
  } catch(e) { console.warn('[audio play]', e); }
}

function stopAllSounds() {
  SND.generation++;
  SND.versions.clear();
  for (const item of SND.playing.values()) {
    try { item.audio.pause(); item.audio.src = ''; } catch(_){}
  }
  SND.playing.clear();
}

function updateAudioSpeed() {
  for (const item of SND.playing.values()) {
    try {
      item.audio.playbackRate = Math.max(0.1, item.basePitch * speed);
    } catch (_) {}
  }
}

function syncActiveAudio(curT) {
  for (const [key, item] of SND.playing.entries()) {
    const a = item.audio;
    if (a.ended) {
      try { a.pause(); a.src = ''; } catch (_) {}
      SND.playing.delete(key);
      continue;
    }
    if (a.paused && playing) {
      a.play().catch(() => {});
    }
    const expectedTime = Math.max(0, (curT - item.startT) * item.basePitch);
    if (isFinite(a.duration) && a.duration > 0) {
      if (!item.loop && expectedTime >= a.duration) {
        try { a.pause(); a.src = ''; } catch (_) {}
        SND.playing.delete(key);
        continue;
      }
      const targetA = item.loop ? (expectedTime % a.duration) : expectedTime;
      if (Math.abs(a.currentTime - targetA) > 0.15) {
        try { a.currentTime = targetA; } catch (_) {}
      }
    }
  }
}

function syncSounds(targetT) {
  if (!sim || !SND.enabled) return;
  stopAllSounds();

  const active = new Map();
  for (const ev of sim.sounds) {
    if (ev.t > targetT) break;
    const key = sim.kOf(ev.ent) + ':' + ev.msg;
    if (ev.stop) {
      active.delete(key);
    } else {
      active.set(key, { msg: ev.msg, loop: ev.loop, pitch: ev.pitch, startT: ev.t });
    }
  }

  for (const [key, snd] of active) {
    const elapsed = targetT - snd.startT;
    playSound(key, snd.msg, snd.loop, snd.pitch, elapsed > 0 ? elapsed : 0);
  }
}

function triggerSounds(fromT, toT) {
  if (!sim || !SND.enabled) return;
  if (toT < fromT) { syncSounds(toT); return; }

  for (const ev of sim.sounds) {
    if (ev.t <= fromT) continue;
    if (ev.t > toT) break;
    const key = sim.kOf(ev.ent) + ':' + ev.msg;
    if (ev.stop) {
      // Инвалидируем и ещё не завершившуюся загрузку этого конкретного звука.
      SND.versions.set(key, (SND.versions.get(key) || 0) + 1);
      const item = SND.playing.get(key);
      if (item) {
        try { item.audio.pause(); item.audio.src = ''; } catch(_){}
        SND.playing.delete(key);
      }
    } else {
      const offset = Math.max(0, toT - ev.t);
      playSound(key, ev.msg, ev.loop, ev.pitch, offset);
    }
  }
}

/* ---------- сборка ---------- */
function disposeAll(){
  if (!group) return;
  api.scene.remove(group);
  for (const A of actors.values()) if (A.rig){ try { A.rig.skeleton.dispose(); } catch (_) {} }
  group.traverse(o => { if (o.userData && o.userData.own){ if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); } });
  for (const w of hidden) w.visible = true;
  hidden = []; actors = new Map(); group = camObj = trail = null;
}

function applyBones(A, pos, quat){
  const b = A.bones;
  for (let i = 0; i < b.length; i++){
    b[i].position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    b[i].quaternion.set(quat[i * 4], quat[i * 4 + 1], quat[i * 4 + 2], quat[i * 4 + 3]);
  }
}

function hullOf(wrapper){
  wrapper.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(wrapper.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3(), sc = wrapper.scale.x || 1, pts = [];
  wrapper.traverse(o => {
    const p = o.isMesh && o.geometry && o.geometry.attributes.position; if (!p || p.isInterleavedBufferAttribute) return;
    m.multiplyMatrices(inv, o.matrixWorld); const step = Math.max(1, Math.floor(p.count / 2500));
    for (let i = 0; i < p.count && pts.length < 18000; i += step){ v.fromBufferAttribute(p, i).applyMatrix4(m); pts.push(v.x * sc, v.y * sc, v.z * sc); }
  });
  return pts.length >= 12 ? Float32Array.from(pts) : null;
}

async function buildActor(k, e, camParents, animKeys, missing){
  const path = e.model || (e.props && e.props.model); if (!path) return null;
  const A = { key: k, ent: e, wrapper: new THREE.Group(), helper: camParents.has(k), bones: [], seqs: new Map(), att: new Map(), data: null, rig: null, nb: 0, restPos: null, restQuat: null };
  A.wrapper.name = 'cut:' + (e.targetname || k);
  const sc = parseFloat(e.modelscale) || parseFloat(e.scale) || 1; if (isFinite(sc) && sc > 0 && sc !== 1) A.wrapper.scale.setScalar(sc);
  if (animKeys.has(k) || A.helper){
    const m = await loadAnimatedModel(path, { noGeometry: A.helper });
    if (!m){ missing.push(path); return null; }
    const D = A.data = m.data, nb = A.nb = D.bones.length;
    for (const s of D.seqs) A.seqs.set(lc(s.name), s);
    if (!A.helper && m.group && m.rig){
      m.group.rotation.x = 0; A.wrapper.add(m.group);
      A.bones = m.rig.bones; A.rig = m.rig; A.restPos = m.rig.bindPos; A.restQuat = m.rig.bindQuat;
    } else {
      const bs = D.bones.map(b => { const o = new THREE.Object3D(); o.position.set(...b.pos); o.quaternion.set(...b.quat); return o; });
      D.bones.forEach((b, i) => (b.parent >= 0 && b.parent < i ? bs[b.parent] : A.wrapper).add(bs[i]));
      A.bones = bs; A.restPos = new Float32Array(nb * 3); A.restQuat = new Float32Array(nb * 4);
      D.bones.forEach((b, i) => { A.restPos.set(b.pos, i * 3); A.restQuat.set(b.quat, i * 4); });
      if (!A.helper) missing.push(path + ' (.vvd/.vtx)');
    }
    for (const at of m.mdl.attachments){
      if (!at.name || at.bone < 0 || at.bone >= nb) continue;
      const o = new THREE.Object3D(), l = at.local; o.matrixAutoUpdate = false; o.matrix.set(l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7], l[8], l[9], l[10], l[11], 0, 0, 0, 1);
      (A.bones[at.bone] || A.wrapper).add(o); A.att.set(lc(at.name), o);
    }
  } else {
    const tpl = await buildModelFromPath(path, { texSize: 512 });
    if (!tpl || !tpl.group){ missing.push(path); return null; }
    const inst = tpl.group.clone(true); inst.rotation.x = 0; A.wrapper.add(inst);
    if (curPhys.has(k)) A.hull = hullOf(A.wrapper);
  }
  return A;
}

async function bakeScenePhysics(my){
  const list = [...actors.values()].filter(A => A.hull && curPhys.has(A.key));
  if (!list.length) return null;
  api.status(tr('phys_baking'));
  const R = await loadRapier(); if (my !== token) return null;
  if (!R) return 'fail';
  group.updateMatrixWorld(true);
  const st0 = stateAt(sim, -1), bodies = [], regions = [], reg = (o, h = 2500) => regions.push({ min: [o[0] - h, o[1] - h, o[2] - 3000], max: [o[0] + h, o[1] + h, o[2] + 2500] });
  for (const A of list){
    const s = st0.get(A.ent), sf = parseInt((A.ent.props || {}).spawnflags, 10) || 0;
    bodies.push({ key: A.key, ent: A.ent, hull: A.hull, origin: s.origin.slice(), quat: quatOf(s.angles), motionDisabled: !!(sf & 8) }); reg(s.origin);
  }
  for (const ev of sim.stateEvents) if (lc(ev.input) === 'teleport') reg(((ev.ent.origin || (ev.ent.props || {}).origin || '0 0 0') + '').split(/\s+/).map(Number));
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), items = [];
  for (const mesh of (api.getWorldMeshes ? api.getWorldMeshes() : [])){
    const g = mesh.geometry, p = g && g.attributes && g.attributes.position; if (!p || p.isInterleavedBufferAttribute) continue;
    mesh.updateWorldMatrix(true, false);
    items.push({ position: p.array, index: g.index ? g.index.array : null, m: Float32Array.from(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld).elements) });
  }
  const worldTris = collectWorldTris(items, regions);
  const res = await bakePhysics(R, bodies, { sim, dur, quatOf, worldTris, onProgress: f => api.status(tr('phys_baking') + ' ' + Math.round(f * 100) + '%') });
  if (my !== token) return null;
  physSounds = (res && res.sounds ? res.sounds : []).slice().sort((a, b) => a.t - b.t); resetPhysicsSoundIndex(T);
  for (const [k, P] of res){ const A = actors.get(k); if (A) A.phys = P; }
  return res.size;
}

function chooseRoots(ents){
  const out = [];
  for (const r of findRoots(ents).slice(0, 16)){
    const s = simulate(ents, r); let score = 0;
    for (const ev of s.stateEvents){ const i = lc(ev.input); score += i === 'setanimation' ? 10 : (ev.ent.classname === 'point_viewcontrol' && i === 'enable') ? 20 : 1; }
    if (score > 0) out.push({ root: r, sim: s, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

export async function loadCutscene(rootKey){
  if (busy) return false; busy = true;
  ensureDom();
  try {
    window.dispatchEvent(new CustomEvent('cutscene-start'));
    const ents = api.getEntities();
    api.status(tr('loading'));
    candidates = chooseRoots(ents);
    if (!candidates.length){ api.status(tr('noroot')); return false; }
    const pick = (rootKey && candidates.find(c => sim0(c) === rootKey)) || candidates[0];
    unloadCutscene(true);
    const my = ++token;
    window.dispatchEvent(new CustomEvent('camtakeover', { detail: 'cut' }));
    sim = pick.sim; curRootKey = sim0(pick);
    const { actors: aset, camParents, phys: physSet } = collectActors(sim);
    curPhys = Plugins.isEnabled('physics') ? physSet : new Set(); physNote = null;
    const animKeys = new Set(sim.stateEvents.filter(e => lc(e.input) === 'setanimation').map(e => sim.kOf(e.ent)));
    group = new THREE.Group(); group.name = 'cutscene'; group.rotation.x = -Math.PI / 2;
    const missing = [];
    for (const k of aset){
      const e = sim.tracked.get(k); if (!e) continue;
      let A = null; try { A = await buildActor(k, e, camParents, animKeys, missing); } catch (err) { console.warn('[cutscene] actor', k, err); }
      if (my !== token){ disposeAll(); return false; }
      if (A){ group.add(A.wrapper); actors.set(k, A); }
    }
    
    camObj = new THREE.Object3D(); camObj.name = 'cutcam';
    const cg = new THREE.ConeGeometry(10, 36, 4); cg.rotateZ(-Math.PI / 2);
    const cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xff5a3c, depthTest: false, transparent: true })); cone.renderOrder = 999; cone.userData.own = true;
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(18, 0, 0), new THREE.Vector3(260, 0, 0)]), new THREE.LineBasicMaterial({ color: 0xff5a3c, depthTest: false, transparent: true, opacity: 0.8 })); ray.renderOrder = 999; ray.userData.own = true;
    camObj.add(cone, ray); camObj.userData.marker = [cone, ray]; group.add(camObj);
    api.scene.add(group);

    let end = sim.lastT;
    for (const ev of sim.stateEvents) if (lc(ev.input) === 'setanimation'){
      const A = actors.get(sim.kOf(ev.ent)), sq = A && A.seqs.get(lc(ev.param));
      if (sq) end = Math.max(end, ev.t + (sq.numframes > 1 ? (sq.numframes - 1) / sq.fps : 0));
    }
    dur = Math.max(0.01, sim.quit != null ? Math.min(end, sim.quit) : end);
    if (curPhys.size){ physNote = await bakeScenePhysics(my); if (my !== token){ disposeAll(); return false; } }
    
    for (const w of api.getWrappers()) if (actors.has(String(w.userData.entId || ''))){ if (w.visible){ w.visible = false; hidden.push(w); } }
    buildTrail();
    
    const firstCam = sim.stateEvents.find(e => e.ent.classname === 'point_viewcontrol' && lc(e.input) === 'enable');
    camStart = firstCam ? Math.min(firstCam.t, dur) : 0; T = camStart; speed = 1; camSeen = false; bar.querySelector('.dm-sp').value = '1';
    const sl = bar.querySelector('.dm-sl'); sl.max = dur; sl.step = 0.01;
    bar.hidden = false; info.hidden = false; api.hideDrop && api.hideDrop();
    origFov = origFov == null ? api.camera.fov : origFov;
    const hasCam = sim.stateEvents.some(e => e.ent.classname === 'point_viewcontrol' && lc(e.input) === 'enable');
    camAvail = hasCam; const ck = bar.querySelector('.dm-fol'); ck.disabled = !hasCam; ck.checked = hasCam; setFollow(hasCam);
    const pk = bar.querySelector('.dm-phy'), anyPhys = [...actors.values()].some(a => a.phys); pk.disabled = !anyPhys; pk.checked = anyPhys && physOn;
    bar.querySelector('.dm-path').checked = showPaths;
    const rb = bar.querySelector('.dm-rec'); rb.disabled = !canRecord(); rb.title = canRecord() ? tr('rec_hint') : tr('rec_nosupport');
    renderInfo(pick, missing, hasCam);
    if (!api.hasMap()) fitToTrail();
    apply(); setPlaying(false);
    api.status(tr('loaded', { n: sim.events.length, a: [...actors.values()].filter(a => a.seqs.size).length }));
    return true;
  } catch (e){ console.error('[cutscene]', e); api.status(tr('fail', { e: e.message || e })); unloadCutscene(true); return false; }
  finally { busy = false; }
}
const sim0 = c => c.sim.kOf(c.root);

function buildTrail(){
  const pts = [], step = Math.max(0.25, dur / 600);
  for (let t = 0; t <= dur + 1e-6; t += step){
    const st = poseAll(t, true), co = camPose(st);
    if (co && st.cam.active) pts.push(new THREE.Vector3().setFromMatrixPosition(co.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(group.matrixWorld).invert()));
  }
  if (pts.length > 1){
    trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true }));
    trail.renderOrder = 998; trail.userData.own = true; group.add(trail);
  }
}
function fitToTrail(){
  if (!trail) return;
  const box = new THREE.Box3().setFromObject(trail); box.expandByScalar(400);
  api.fit(box, box.getCenter(new THREE.Vector3()), box.getSize(new THREE.Vector3()));
}

/* ---------- состояние / поза ---------- */
function poseAll(t, onlyCam){
  const state = stateAt(sim, t);
  for (const A of actors.values()){
    const s = state.get(A.ent);
    if (onlyCam && !A.helper) continue;
    A.wrapper.position.set(s.origin[0], s.origin[1], s.origin[2]); setSrcRot(A.wrapper, s.angles);
    if (A.phys && physOn){ const q = samplePhys(A.phys, t); if (q){ A.wrapper.position.set(q[0], q[1], q[2]); A.wrapper.quaternion.set(q[3], q[4], q[5], q[6]); } }
    A.wrapper.visible = s.visible && !A.helper;
    if (A.bones.length && (A.helper || A.wrapper.visible)){
      const seq = s.anim && A.seqs.get(lc(s.anim.name));
      if (seq){
        try { const p = samplePose(seq, A.nb, A.data.bones, Math.max(0, t - s.anim.t0), false); applyBones(A, p.pos, p.quat); }
        catch (err) { console.warn('[cutscene] invalid animation sequence:', seq.name, err); applyBones(A, A.restPos, A.restQuat); }
      } else applyBones(A, A.restPos, A.restQuat);
    }
  }
  group.updateMatrixWorld(true);
  return state;
}

function camPose(state){
  const c = state.cam; if (!c.ent) return null;
  const ce = sim.tracked.get(c.ent), s = state.get(ce), P = s.parent && actors.get(s.parent);
  let host = group, lo = s.origin, la = s.angles;
  if (P){ host = (s.parentAtt && P.att.get(lc(s.parentAtt))) || P.wrapper; lo = s.lo; la = s.la; }
  if (camObj.parent !== host) host.add(camObj);
  camObj.position.set(lo[0], lo[1], lo[2]); setSrcRot(camObj, la); camObj.updateMatrixWorld(true);
  return camObj;
}

/* ---------- плеер ---------- */
const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();
function apply(){
  if (!sim || !group) return;
  const state = poseAll(T), co = camPose(state), live = !!(co && state.cam.active);
  if (co) camSeen = true;
  const pathsOn = showPaths && !rec;
  if (trail) trail.visible = pathsOn;
  for (const m of camObj.userData.marker) m.visible = !!co && !follow && pathsOn;
  if (follow && live){
    const mw = co.matrixWorld; _p.setFromMatrixPosition(mw); _f.set(1, 0, 0).transformDirection(mw); _u.set(0, 0, 1).transformDirection(mw);
    api.camera.position.copy(_p); api.camera.up.copy(_u); api.camera.lookAt(_p.clone().add(_f));
    api.controls.target.copy(_p).addScaledVector(_f, 100);
  }
  bar.querySelector('.dm-sl').value = T;
  bar.querySelector('.dm-t').textContent = `${fmtT(T)} / ${fmtT(dur)}`;
}

function frame(now){
  raf = 0; if (!playing) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  let prevT = T, ended = false;
  if (!(rec && rec.endAt)) T += dt * speed;
  if (T >= dur){
    if (loop && !rec){ stopAllSounds(); T = 0; prevT = 0; syncSounds(0); resetPhysicsSoundIndex(0); }
    else { T = dur; ended = true; }
  }
  triggerSounds(prevT, T);
  triggerPhysicsSounds(prevT, T);
  syncActiveAudio(T);
  apply();
  if (ended){
    if (rec){ if (!rec.endAt) rec.endAt = now + 400; else if (now >= rec.endAt){ finishRec(true); return; } }
    else { setPlaying(false); return; }
  }
  if (playing) raf = requestAnimationFrame(frame);
}

function setPlaying(v){
  playing = v; bar.querySelector('.dm-play').textContent = v ? '⏸' : '▶';
  if (v){ 
    audioGraph();
    if (T >= dur) T = 0; 
    last = performance.now(); 
    syncSounds(T); resetPhysicsSoundIndex(T);
    if (!raf) raf = requestAnimationFrame(frame); 
  } else {
    for (const item of SND.playing.values()) {
      try { item.audio.pause(); } catch (_) {}
    }
  }
}

function setFollow(v){
  follow = v; api.controls.enabled = !v;
  api.camera.fov = v ? SRC_VFOV : (origFov == null ? api.camera.fov : origFov); api.camera.updateProjectionMatrix();
  if (!v){ api.camera.up.set(0, 1, 0); api.controls.update(); }
  if (sim) apply();
}

function seek(t){ 
  T = Math.min(dur, Math.max(0, t)); 
  syncSounds(T); resetPhysicsSoundIndex(T);
  apply(); 
}

/* ---------- запись видео ---------- */
const RES = { '480': [854, 480, 4e6], '720': [1280, 720, 8e6], '1080': [1920, 1080, 14e6] };
function setRecUi(on){
  if (!bar) return;
  bar.classList.toggle('rec', on);
  const rb = bar.querySelector('.dm-rec'); rb.textContent = on ? '⏹ ' + tr('rec_stop') : '⏺ ' + tr('rec'); rb.classList.toggle('on', on);
  for (const sel of ['.dm-play', '.dm-sl', '.dm-sp', '.dm-fol', '.dm-lp', '.dm-res', '.dm-fps', '.dm-path']) bar.querySelector(sel).disabled = on || (sel === '.dm-fol' && !camAvail);
}

async function startRec(){
  if (!sim || rec) return;
  if (!canRecord()){ api.status(tr('rec_nosupport')); return; }
  const canvas = api.canvas; if (!canvas) return;
  const hasCam = sim.stateEvents.some(e => e.ent.classname === 'point_viewcontrol' && lc(e.input) === 'enable');
  const resKey = bar.querySelector('.dm-res').value, fps = +bar.querySelector('.dm-fps').value || 60;
  let w, h, br;
  if (RES[resKey]) [w, h, br] = RES[resKey];
  else { w = Math.max(2, Math.round((canvas.clientWidth || 1280) / 2) * 2); h = Math.max(2, Math.round((canvas.clientHeight || 720) / 2) * 2); br = 8e6; }
  rec = { prev: { follow, loop, speed, T }, handle: null, endAt: 0, started: performance.now() };
  setPlaying(false);
  api.setRenderSize(w, h); api.setClean(true);
  loop = false; speed = 1; bar.querySelector('.dm-sp').value = '1'; updateAudioSpeed();
  T = hasCam ? camStart : 0;
  if (hasCam){ bar.querySelector('.dm-fol').checked = true; setFollow(true); } else apply();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const g = SND.enabled ? audioGraph() : null;
    rec.handle = startCanvasRecording(canvas, { fps, bitrate: br, audioStream: g ? g.dest.stream : null });
  } catch (e){ console.error('[rec]', e); const r = rec; rec = null; restoreAfterRec(r); api.status(tr('rec_fail', { e: e.message || e })); return; }
  setRecUi(true);
  setPlaying(true);
}

function restoreAfterRec(r){
  api.setClean(false); api.setRenderSize(0, 0);
  if (bar){ loop = r.prev.loop; bar.querySelector('.dm-lp').checked = loop; speed = r.prev.speed; bar.querySelector('.dm-sp').value = String(speed); updateAudioSpeed();
    const f = !!sim && r.prev.follow;
    bar.querySelector('.dm-fol').checked = f; setFollow(f); setRecUi(false); }
}

async function finishRec(save){
  if (!rec) return;
  const r = rec; rec = null;
  setPlaying(false);
  let blob = null;
  try { if (r.handle) blob = await r.handle.stop(); } catch (e){ console.error('[rec]', e); api.status(tr('rec_fail', { e: e.message || e })); save = false; }
  restoreAfterRec(r);
  if (save && blob && blob.size){
    const name = `${(api.getMapName && api.getMapName()) || 'map'}_cutscene.${extFor(r.handle.mime)}`;
    downloadBlob(blob, name); api.status(tr('rec_saved', { n: name }));
  }
}

/* ---------- DOM ---------- */
function ensureDom(){
  const pane = document.getElementById('paneVmf'); if (!pane || bar) return;
  bar = document.createElement('div'); bar.id = 'cutBar'; bar.hidden = true;
  bar.innerHTML = `<button class="dm-play" title="Space">▶</button><input class="dm-sl" type="range" min="0" max="1" step="0.01" value="0"><span class="dm-t"></span>
    <select class="dm-sp"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option></select>
    <label class="dm-ck"><input type="checkbox" class="dm-fol"> <span data-l="follow"></span></label><label class="dm-ck"><input type="checkbox" class="dm-lp"> <span data-l="loop"></span></label>
    <label class="dm-ck"><input type="checkbox" class="dm-snd" checked> <span data-l="snd"></span></label>
    <label class="dm-ck"><input type="checkbox" class="dm-path" checked> <span data-l="paths"></span></label>
    <label class="dm-ck"><input type="checkbox" class="dm-phy" checked> <span data-l="physics"></span></label>
    <span class="dm-recbox"><select class="dm-res"><option value="screen"></option><option value="480">480p</option><option value="720" selected>720p</option><option value="1080">1080p</option></select>
    <select class="dm-fps"><option value="30">30 fps</option><option value="60" selected>60 fps</option></select><button class="dm-rec"></button></span>
    <button class="dm-i" data-l="info"></button><button class="dm-x" title="✕">✕</button>`;
  info = document.createElement('div'); info.id = 'cutInfo'; info.hidden = true;
  pane.appendChild(bar); pane.appendChild(info);
  bar.querySelector('.dm-play').onclick = () => setPlaying(!playing);
  bar.querySelector('.dm-sl').oninput = e => seek(+e.target.value);
  bar.querySelector('.dm-sp').onchange = e => { speed = +e.target.value || 1; updateAudioSpeed(); };
  bar.querySelector('.dm-fol').onchange = e => setFollow(e.target.checked);
  bar.querySelector('.dm-lp').onchange = e => { loop = e.target.checked; };
  bar.querySelector('.dm-snd').onchange = e => { SND.enabled = e.target.checked; if (!SND.enabled) stopAllSounds(); else if (playing) syncSounds(T); };
  bar.querySelector('.dm-path').onchange = e => { showPaths = e.target.checked; try { localStorage.setItem('sav_cut_paths', showPaths ? '1' : '0'); } catch (_) {} if (sim) apply(); };
  bar.querySelector('.dm-phy').onchange = e => { physOn = e.target.checked; if (sim) apply(); };
  bar.querySelector('.dm-rec').onclick = () => { if (rec) finishRec(true); else startRec(); };
  bar.querySelector('.dm-i').onclick = () => { info.hidden = !info.hidden; };
  bar.querySelector('.dm-x').onclick = () => unloadCutscene();
  addEventListener('keydown', ev => { if (ev.code === 'Space' && sim && !rec && !bar.hidden && document.getElementById('paneVmf').classList.contains('active') && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((ev.target.tagName || ''))){ ev.preventDefault(); setPlaying(!playing); } });
  addEventListener('camtakeover', ev => { if (ev.detail !== 'cut' && sim) unloadCutscene(); });
  addEventListener('langchange', () => { fillTexts(); if (btn) btn.textContent = tr('btn'); });
  fillTexts();
}

function fillTexts(){
  if (!bar) return;
  bar.querySelectorAll('[data-l]').forEach(n => { n.textContent = tr(n.dataset.l); });
  const ro = bar.querySelector('.dm-res option[value=screen]'); if (ro) ro.textContent = tr('res_screen');
  const rb = bar.querySelector('.dm-rec'); if (rb) rb.textContent = rec ? '⏹ ' + tr('rec_stop') : '⏺ ' + tr('rec');
  if (sim && info) renderInfo();
}

let _last = null;
function renderInfo(pick, missing, hasCam){
  if (pick){ _last = { pick, missing, hasCam }; } else if (_last){ ({ pick, missing, hasCam } = _last); } else return;
  const row = (k, v) => `<tr><td>${esc(tr(k))}</td><td>${esc(v)}</td></tr>`;
  const nm = e => e.targetname || e.classname;
  const notes = [];
  if (missing && missing.length) notes.push(tr('missing', { m: [...new Set(missing)].join(', ') }));
  if (!hasCam) notes.push(tr('nocam'));
  if (physNote === 'fail') notes.push(tr('phys_fail'));
  const evs = sim.events.slice(0, 400).map(ev => `<div class="cs-ev" data-t="${ev.t}"><i>${ev.t.toFixed(2)}</i> ${esc(nm(ev.ent))}.${esc(ev.input)}${ev.param ? ' ' + esc(String(ev.param).slice(0, 60)) : ''}</div>`).join('') + (sim.events.length > 400 ? `<div>… +${sim.events.length - 400}</div>` : '');
  const cons = sim.console.length ? sim.console.map(c => `<div class="cs-ev" data-t="${c.t}"><i>${c.t.toFixed(2)}</i> ${esc(c.text)}</div>`).join('') : `<div class="dm-none">${esc(tr('none'))}</div>`;
  const snd = sim.sounds.filter(s => !s.stop).map(s => `<div class="cs-ev" data-t="${s.t}"><i>${s.t.toFixed(2)}</i> ${esc(nm(s.ent))} — ${esc(s.msg)}</div>`).join('');
  const actorList = [...actors.values()].map(a => nm(a.ent) + (a.seqs.size ? ' ▸' : '') + (a.phys ? ' ⚙' : '')).join(', ');
  const sel = candidates.length > 1 ? `<select class="cs-root">${candidates.map(c => `<option value="${esc(sim0(c))}"${c.sim === sim ? ' selected' : ''}>${esc(nm(c.root))}</option>`).join('')}</select>` : esc(nm(pick.root));
  info.innerHTML = `<div class="dm-h"><b>${esc(tr('title'))}</b><button class="dm-ix">✕</button></div>${notes.map(n => `<p class="dm-note">${esc(n)}</p>`).join('')}
    <table><tr><td>${esc(tr('start'))}</td><td>${sel}</td></tr>${row('len', fmtT(dur))}${row('events', sim.events.length)}${typeof physNote === 'number' && physNote > 0 ? row('phys_row', tr('phys_ok', { n: physNote })) : ''}${row('actors', actorList || tr('none'))}</table>
    <b class="dm-ch">${esc(tr('events'))}</b><div class="dm-con">${evs}</div><p class="cs-hint">${esc(tr('hint'))}</p>
    <b class="dm-ch">${esc(tr('cons'))} (${sim.console.length})</b><div class="dm-con">${cons}</div>
    ${snd ? `<b class="dm-ch">${esc(tr('snd'))}</b><div class="dm-con">${snd}</div>` : ''}`;
  info.querySelector('.dm-ix').onclick = () => { info.hidden = true; };
  info.querySelectorAll('.cs-ev').forEach(n => { n.onclick = () => seek(+n.dataset.t); });
  const rs = info.querySelector('.cs-root'); if (rs) rs.onchange = () => loadCutscene(rs.value);
}

/* ---------- публичный API ---------- */
export function unloadCutscene(keepUi){
  if (rec) finishRec(false);
  stopAllSounds();
  token++;
  if (bar){ setPlaying(false); if (follow){ bar.querySelector('.dm-fol').checked = false; setFollow(false); } }
  disposeAll(); physSounds = []; physSoundIndex = 0; sim = null; _last = null;
  if (bar && !keepUi){ bar.hidden = true; info.hidden = true; }
}

export function cutsceneMapChanged(){
  if (!api) return;
  unloadCutscene();
  let hasEntities = false;
  try { hasEntities = Array.isArray(api.getEntities()) && api.getEntities().length > 0; }
  catch (e) { console.warn('[cutscene] detect', e); }
  // Keep the entry point visible for every loaded map when the plugin is enabled.
  // Some scenes are animation-driven or use nonstandard roots, so detection must not hide the UI.
  const show = Plugins.isEnabled('cutscene') && hasEntities;
  if (btn){ btn.style.display = show ? '' : 'none'; btn.textContent = tr('btn'); btn.title = tr('tip'); }
}

export function initCutscene(a){
  api = a; ensureDom();
  btn = document.getElementById('vmfBtnCut');
  if (btn){ btn.style.display = 'none'; btn.onclick = () => { if (sim){ bar.hidden = !bar.hidden; if (!bar.hidden) info.hidden = false; } else loadCutscene(); }; }
}

export const cutsceneIsLoaded = () => !!sim;
export function cutsceneReload(){ if (sim && !busy) return loadCutscene(curRootKey); return false; }