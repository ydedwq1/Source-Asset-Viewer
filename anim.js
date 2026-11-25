// anim.js — чтение анимаций Source Engine из .mdl (+ .ani и include-моделей). Без зависимостей от three.
// Поддержано: sequences, animdesc, RAWPOS/RAWROT/RAWROT2/ANIMPOS/ANIMROT, секции (sectionframes), .ani блоки.
// Не поддержано: STUDIO_FRAMEANIM (v49 «frame anim»), IK, pose-параметры (берётся первый blend).

const IDST = 0x54534449;
const SEQDESC_SIZE = 212, ANIMDESC_SIZE = 100, BONE_SIZE = 216;
export const AF = { LOOPING: 0x1, DELTA: 0x4, ALLZEROS: 0x20, FRAMEANIM: 0x40 };

const i32 = (dv, o) => (o >= 0 && o + 4 <= dv.byteLength) ? dv.getInt32(o, true) : 0;
const i16 = (dv, o) => (o >= 0 && o + 2 <= dv.byteLength) ? dv.getInt16(o, true) : 0;
const u16 = (dv, o) => (o >= 0 && o + 2 <= dv.byteLength) ? dv.getUint16(o, true) : 0;
const u8  = (dv, o) => (o >= 0 && o < dv.byteLength) ? dv.getUint8(o) : 0;
const f32 = (dv, o) => (o >= 0 && o + 4 <= dv.byteLength) ? dv.getFloat32(o, true) : 0;
const _td = new TextDecoder('utf-8');
function cstr(dv, off){
  if (off < 0 || off >= dv.byteLength) return '';
  const a = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength); let e = off;
  while (e < a.length && a[e] !== 0) e++;
  return _td.decode(a.subarray(off, e));
}

/* ---------- разбор одного .mdl: кости, animdesc, sequences, includes ---------- */
export function parseAnimSet(buffer){
  const dv = new DataView(buffer);
  if (i32(dv, 0) !== IDST) throw new Error('not IDST');
  const set = { dv, version: i32(dv, 4), bones: [], anims: [], seqs: [], blocks: [], includes: [], aniName: '', ani: null };

  const nb = i32(dv, 156), bi = i32(dv, 160);
  if (nb > 0 && nb <= 512 && bi > 0 && bi + nb * BONE_SIZE <= dv.byteLength){
    for (let i = 0; i < nb; i++){
      const b = bi + i * BONE_SIZE;
      set.bones.push({
        name: cstr(dv, b + i32(dv, b)), parent: i32(dv, b + 4),
        pos: [f32(dv, b + 32), f32(dv, b + 36), f32(dv, b + 40)],
        quat: [f32(dv, b + 44), f32(dv, b + 48), f32(dv, b + 52), f32(dv, b + 56)],     // x y z w
        rot: [f32(dv, b + 60), f32(dv, b + 64), f32(dv, b + 68)],
        posscale: [f32(dv, b + 72), f32(dv, b + 76), f32(dv, b + 80)],
        rotscale: [f32(dv, b + 84), f32(dv, b + 88), f32(dv, b + 92)]
      });
    }
  }

  const nAnim = i32(dv, 180), aIdx = i32(dv, 184);
  if (nAnim > 0 && nAnim < 20000 && aIdx > 0){
    for (let i = 0; i < nAnim; i++){
      const a = aIdx + i * ANIMDESC_SIZE; if (a + ANIMDESC_SIZE > dv.byteLength) break;
      set.anims.push({
        base: a, name: cstr(dv, a + i32(dv, a + 4)), fps: f32(dv, a + 8) || 30, flags: i32(dv, a + 12),
        numframes: Math.max(1, i32(dv, a + 16)),
        animblock: i32(dv, a + 52), animindex: i32(dv, a + 56),
        sectionindex: i32(dv, a + 80), sectionframes: i32(dv, a + 84)
      });
    }
  }

  const nSeq = i32(dv, 188), sIdx = i32(dv, 192);
  if (nSeq > 0 && nSeq < 20000 && sIdx > 0){
    for (let i = 0; i < nSeq; i++){
      const s = sIdx + i * SEQDESC_SIZE; if (s + SEQDESC_SIZE > dv.byteLength) break;
      const gs0 = Math.max(1, i32(dv, s + 68)), gs1 = Math.max(1, i32(dv, s + 72));
      const animIdxIdx = i32(dv, s + 60), blends = [];
      const nBl = Math.min(gs0 * gs1, 64);
      if (animIdxIdx > 0) for (let k = 0; k < nBl; k++) blends.push(i16(dv, s + animIdxIdx + k * 2));
      set.seqs.push({
        name: cstr(dv, s + i32(dv, s + 4)), activity: cstr(dv, s + i32(dv, s + 8)), flags: i32(dv, s + 12),
        blends, fadein: f32(dv, s + 104), fadeout: f32(dv, s + 108)
      });
    }
  }

  const nInc = i32(dv, 336), incIdx = i32(dv, 340);
  if (nInc > 0 && nInc < 64 && incIdx > 0){
    for (let i = 0; i < nInc; i++){
      const g = incIdx + i * 8; if (g + 8 > dv.byteLength) break;
      const nm = cstr(dv, g + i32(dv, g + 4)); if (nm) set.includes.push(nm);
    }
  }

  const nBlk = i32(dv, 352), blkIdx = i32(dv, 356);
  if (nBlk > 0 && nBlk < 4096 && blkIdx > 0){
    for (let i = 0; i < nBlk; i++){ const o = blkIdx + i * 8; set.blocks.push({ start: i32(dv, o), end: i32(dv, o + 4) }); }
    const nmOff = i32(dv, 348); if (nmOff > 0) set.aniName = cstr(dv, nmOff);
  }
  return set;
}

/* ---------- кодеки ---------- */
const _h = new Float32Array(1);
function half(h){
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * 5.960464477539063e-8;                // субнормальные
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * Math.pow(2, e - 15);
}
function q48(dv, o){
  const x = (dv.getUint16(o, true) - 32768) / 32768, y = (dv.getUint16(o + 2, true) - 32768) / 32768;
  const zw = dv.getUint16(o + 4, true), z = ((zw & 0x7fff) - 16384) / 16384;
  let w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z)); if (zw & 0x8000) w = -w;
  return [x, y, z, w];
}
function q64(dv, o){
  const lo = dv.getUint32(o, true), hi = dv.getUint32(o + 4, true);
  const xi = lo & 0x1FFFFF, yi = ((lo >>> 21) | ((hi & 0x3FF) << 11)) & 0x1FFFFF, zi = (hi >>> 10) & 0x1FFFFF;
  const x = (xi - 1048576) / 1048576.5, y = (yi - 1048576) / 1048576.5, z = (zi - 1048576) / 1048576.5;
  let w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z)); if (hi >>> 31) w = -w;
  return [x, y, z, w];
}
function angQuat(ax, ay, az){                                      // RadianEuler (roll, pitch, yaw) -> quaternion
  const sy = Math.sin(az * 0.5), cy = Math.cos(az * 0.5), sp = Math.sin(ay * 0.5), cp = Math.cos(ay * 0.5), sr = Math.sin(ax * 0.5), cr = Math.cos(ax * 0.5);
  const srcp = sr * cp, crsp = cr * sp, crcp = cr * cp, srsp = sr * sp;
  return [srcp * cy - crsp * sy, crsp * cy + srcp * sy, crcp * sy - srsp * cy, crcp * cy + srsp * sy];
}
// значение RLE-потока animvalue для кадра. off — смещение заголовка потока.
function animValue(dv, off, frame, scale){
  if (off <= 0 || off >= dv.byteLength) return 0;
  let p = off, k = frame, guard = 0;
  while (u8(dv, p + 1) <= k){                                      // total <= k
    const total = u8(dv, p + 1), valid = u8(dv, p);
    if (!total || ++guard > 4096) return 0;
    k -= total; p += (valid + 1) * 2;
    if (u8(dv, p + 1) === 0) return 0;
  }
  const valid = u8(dv, p);
  if (valid > k) return i16(dv, p + (k + 1) * 2) * scale;
  return i16(dv, p + valid * 2) * scale;                           // дублированные данные
}

/* ---------- расчёт позы анимации ---------- */
// Находит, где лежат данные кадра (mdl или .ani) и возвращает { dv, off, frame }.
function locateFrame(set, anim, frame){
  let block = anim.animblock, index = anim.animindex, f = frame;
  const nf = anim.numframes, sf = anim.sectionframes;
  if (anim.sectionindex > 0 && sf > 0){
    let sec;
    if (nf > sf && f === nf - 1){ f = 0; sec = Math.floor(nf / sf) + 1; }
    else { sec = Math.floor(f / sf); f -= sec * sf; }
    const so = anim.base + anim.sectionindex + sec * 8;
    block = i32(set.dv, so); index = i32(set.dv, so + 4);
  }
  if (block === 0) return { dv: set.dv, off: anim.base + index, frame: f };
  if (!set.ani || !set.blocks[block]) return null;
  return { dv: set.ani, off: set.blocks[block].start + index, frame: f };
}

// Возвращает { pos: Float32Array(nb*3), quat: Float32Array(nb*4) } — локальные трансформы костей (в порядке set.bones).
export function evalFrame(set, anim, frame){
  const nb = set.bones.length, pos = new Float32Array(nb * 3), quat = new Float32Array(nb * 4);
  for (let i = 0; i < nb; i++){
    const b = set.bones[i];
    pos.set(b.pos, i * 3); quat.set(b.quat, i * 4);
  }
  if (anim.flags & (AF.ALLZEROS | AF.FRAMEANIM)) return { pos, quat };
  const loc = locateFrame(set, anim, frame); if (!loc) return { pos, quat };
  const dv = loc.dv; let p = loc.off, guard = 0;
  const delta = !!(anim.flags & AF.DELTA);
  while (p > 0 && p + 4 <= dv.byteLength && guard++ < 1024){
    const bone = dv.getUint8(p), fl = dv.getUint8(p + 1), next = dv.getInt16(p + 2, true);
    if (bone < nb){
      const bn = set.bones[bone]; let q = p + 4, rotV = -1, posV = -1;
      let rq = null, pp = null;
      if (fl & 0x02){ rq = q48(dv, q); q += 6; }
      else if (fl & 0x20){ rq = q64(dv, q); q += 8; }
      else if (fl & 0x08){ rotV = q; q += 6; }
      if (fl & 0x01){ pp = [half(dv.getUint16(q, true)), half(dv.getUint16(q + 2, true)), half(dv.getUint16(q + 4, true))]; }
      else if (fl & 0x04){ posV = q; }

      if (rq) quat.set(rq, bone * 4);
      else if (rotV >= 0){
        const r = [0, 0, 0];
        for (let c = 0; c < 3; c++){
          const o = i16(dv, rotV + c * 2);
          r[c] = (o > 0 ? animValue(dv, rotV + o, loc.frame, bn.rotscale[c]) : 0) + (delta ? 0 : bn.rot[c]);
        }
        quat.set(angQuat(r[0], r[1], r[2]), bone * 4);
      } else if (delta) quat.set([0, 0, 0, 1], bone * 4);

      if (pp) pos.set(pp, bone * 3);
      else if (posV >= 0){
        for (let c = 0; c < 3; c++){
          const o = i16(dv, posV + c * 2);
          pos[bone * 3 + c] = (o > 0 ? animValue(dv, posV + o, loc.frame, bn.posscale[c]) : 0) + (delta ? 0 : bn.pos[c]);
        }
      } else if (delta) pos.set([0, 0, 0], bone * 3);
    }
    if (!next) break; p += next;
  }
  return { pos, quat };
}

/* ---------- сборка списка анимаций модели (с include-моделями и .ani) ---------- */
// resolve(path) -> Promise<ArrayBuffer|null>  (ищет файл по пути models/xxx.mdl / .ani)
// Возвращает { bones, seqs:[{name, set, anim, boneMap, fps, numframes, loop, delta}] }
export async function loadAnimations(mainBuffer, mainPath, resolve){
  const main = parseAnimSet(mainBuffer);
  const out = { bones: main.bones, seqs: [], unsupported: 0 };
  const seen = new Set(), visited = new Set();

  async function addSet(set, path, depth){
    if (set.blocks.length){                                         // .ani рядом с mdl
      const aniPath = (set.aniName || path.replace(/\.mdl$/i, '.ani')).replace(/\\/g, '/');
      let buf = null; try { buf = await resolve(aniPath); } catch (_) {}
      if (!buf && path) { try { buf = await resolve(path.replace(/\.mdl$/i, '.ani')); } catch (_) {} }
      if (buf) set.ani = new DataView(buf);
    }
    const nameToIdx = new Map(main.bones.map((b, i) => [b.name.toLowerCase(), i]));
    const boneMap = set.bones.map(b => nameToIdx.has(b.name.toLowerCase()) ? nameToIdx.get(b.name.toLowerCase()) : -1);
    for (const sq of set.seqs){
      const key = sq.name.toLowerCase(); if (seen.has(key)) continue;
      const ai = sq.blends.length ? sq.blends[0] : -1;
      const anim = set.anims[ai]; if (!anim) continue;
      if (anim.flags & AF.FRAMEANIM){ out.unsupported++; continue; }
      if (!set.ani && anim.animblock > 0 && !(anim.sectionindex > 0 && anim.sectionframes > 0)) { out.unsupported++; continue; }
      seen.add(key);
      out.seqs.push({
        name: sq.name, activity: sq.activity, set, anim, boneMap, fps: anim.fps, numframes: anim.numframes,
        loop: !!((sq.flags | anim.flags) & AF.LOOPING), delta: !!(anim.flags & AF.DELTA), blends: sq.blends.length
      });
    }
    if (depth < 3) for (const inc of set.includes){
      const p = inc.replace(/\\/g, '/'), pl = p.toLowerCase(); if (visited.has(pl)) continue; visited.add(pl);
      let buf = null; try { buf = await resolve(p.endsWith('.mdl') ? p : p + '.mdl'); } catch (_) {}
      if (!buf) continue;
      try { await addSet(parseAnimSet(buf), p.endsWith('.mdl') ? p : p + '.mdl', depth + 1); } catch (e) { console.warn('[anim] include', p, e); }
    }
  }
  await addSet(main, mainPath || '', 0);
  return out;
}

// Поза последовательности в момент кадра (дробного): lerp позиций, slerp кватернионов. Результат — в пространстве костей ГЛАВНОЙ модели.
const _cache = new WeakMap();
function frameCached(seq, f){
  let m = _cache.get(seq); if (!m){ m = new Map(); _cache.set(seq, m); }
  let r = m.get(f);
  if (!r){ r = evalFrame(seq.set, seq.anim, f); if (m.size > 600) m.clear(); m.set(f, r); }
  return r;
}
export function samplePose(seq, nbMain, mainBones, time, loop){
  const n = seq.numframes, last = Math.max(0, n - 1);
  let fr = time * seq.fps;
  if (last === 0) fr = 0;
  else if (loop) fr = ((fr % n) + n) % n;                           // зацикливание по n кадрам (последний -> первый)
  else fr = Math.min(Math.max(fr, 0), last);
  const f0 = Math.floor(fr), s = fr - f0;
  const f1 = (f0 + 1 >= n) ? (loop ? 0 : last) : f0 + 1;
  const A = frameCached(seq, Math.min(f0, last)), B = (s > 1e-4 && f1 !== f0) ? frameCached(seq, f1) : null;
  const pos = new Float32Array(nbMain * 3), quat = new Float32Array(nbMain * 4);
  for (let i = 0; i < nbMain; i++){ pos.set(mainBones[i].pos, i * 3); quat.set(mainBones[i].quat, i * 4); }
  const map = seq.boneMap;
  for (let k = 0; k < map.length; k++){
    const i = map[k]; if (i < 0) continue;
    let px = A.pos[k * 3], py = A.pos[k * 3 + 1], pz = A.pos[k * 3 + 2];
    let ax = A.quat[k * 4], ay = A.quat[k * 4 + 1], az = A.quat[k * 4 + 2], aw = A.quat[k * 4 + 3];
    if (B){
      px += (B.pos[k * 3] - px) * s; py += (B.pos[k * 3 + 1] - py) * s; pz += (B.pos[k * 3 + 2] - pz) * s;
      let bx = B.quat[k * 4], by = B.quat[k * 4 + 1], bz = B.quat[k * 4 + 2], bw = B.quat[k * 4 + 3];
      let d = ax * bx + ay * by + az * bz + aw * bw;
      if (d < 0){ bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
      let wa = 1 - s, wb = s;
      if (d < 0.9995){ const th = Math.acos(d), sn = Math.sin(th); wa = Math.sin((1 - s) * th) / sn; wb = Math.sin(s * th) / sn; }
      ax = ax * wa + bx * wb; ay = ay * wa + by * wb; az = az * wa + bz * wb; aw = aw * wa + bw * wb;
    }
    const l = Math.hypot(ax, ay, az, aw) || 1;
    pos[i * 3] = px; pos[i * 3 + 1] = py; pos[i * 3 + 2] = pz;
    quat[i * 4] = ax / l; quat[i * 4 + 1] = ay / l; quat[i * 4 + 2] = az / l; quat[i * 4 + 3] = aw / l;
  }
  return { pos, quat };
}
