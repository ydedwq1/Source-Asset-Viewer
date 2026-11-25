// models.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Store, t, LANG, addFilesToStore, walkDrop, normMat, Games, gameOf, bindGameSelect } from './core.js';
import { TexStore } from './vtf.js';
import { splitAndIngestArchives, getRecordBuffer } from './archives.js';
import { loadAnimations, samplePose } from './anim.js';

/* === ПАРСЕРЫ (MDL, VVD, VTX, PHY) === */
const sI32 = (dv, o) => (o >= 0 && o + 4 <= dv.byteLength) ? dv.getInt32(o, true) : 0;
const sI16 = (dv, o) => (o >= 0 && o + 2 <= dv.byteLength) ? dv.getInt16(o, true) : 0;
const sU16 = (dv, o) => (o >= 0 && o + 2 <= dv.byteLength) ? dv.getUint16(o, true) : 0;
const sU8  = (dv, o) => (o >= 0 && o < dv.byteLength) ? dv.getUint8(o) : 0;
const sR32 = (dv, o) => (o >= 0 && o + 4 <= dv.byteLength) ? dv.getFloat32(o, true) : 0;

const _utf8 = new TextDecoder('utf-8');
const _cstrCache = new WeakMap();
function cstr(dv, off){
  if (off < 0 || off >= dv.byteLength) return '';
  let per = _cstrCache.get(dv);
  if (!per){ per = new Map(); _cstrCache.set(dv, per); }
  const hit = per.get(off);
  if (hit !== undefined) return hit;
  const u8 = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  let end = off;
  while (end < u8.length && u8[end] !== 0) end++;
  const s = _utf8.decode(u8.subarray(off, end));
  per.set(off, s);
  return s;
}

const IDST = 0x54534449;
const TEXTURE_SIZE = 64, BODYPART_SIZE = 16, BONE_SIZE = 216;
const VVD_VERTEX_SIZE = 48;
const ATTACHMENT_SIZE = 64;
const HITBOX_SET_SIZE = 12;
const HITBOX_SIZE     = 68;

function parseMDL(buffer){
  const dv = new DataView(buffer); if (sI32(dv, 0) !== IDST) throw new Error('not IDST');
  
  const version = sI32(dv, 4);
  const numBones  = sI32(dv, 0x9C);
  const boneIndex = sI32(dv, 0xA0);
  const MESH_SIZE  = 116;
  const MODEL_SIZE = 148;

  const mdl = {
    version: version, checksum: sI32(dv, 8), name: cstr(dv, 12),
    flags: sI32(dv, 0x98),
    textures: [], cdtextures: [], skin: [], skinFamilies: [], bodyparts: [], bones: [],
    attachments: [], hitboxSets: []
  };

  mdl.isStaticProp = (mdl.flags & 0x00000010) !== 0;

  const numTex    = sI32(dv, 0xCC), texIdx    = sI32(dv, 0xD0);
  const numCdTex  = sI32(dv, 0xD4), cdTexIdx  = sI32(dv, 0xD8);
  const numSkinZones    = sI32(dv, 0xDC);
  const numSkinFamilies = sI32(dv, 0xE0);
  const skinIdx         = sI32(dv, 0xE4);
  const numBP     = sI32(dv, 0xE8), bpIdx     = sI32(dv, 0xEC);
  const numAtt    = sI32(dv, 0xF0), attIdx    = sI32(dv, 0xF4);
  const numHBS    = sI32(dv, 0xAC), hbsIdx    = sI32(dv, 0xB0);
  if (numBP < 0 || numBP > 512) throw new Error('numBodyParts=' + numBP);

  for (let i = 0; i < numTex; i++) { const t = texIdx + i * TEXTURE_SIZE; mdl.textures.push(cstr(dv, t + sI32(dv, t))); }
  for (let i = 0; i < numCdTex; i++) {
    const off = sI32(dv, cdTexIdx + i * 4);
    if (off !== 0) mdl.cdtextures.push(cstr(dv, cdTexIdx + off));
  }

  if (numSkinZones > 0 && numSkinFamilies > 0 && skinIdx > 0){
    const famLimit = Math.min(numSkinFamilies, 256);
    const zoneLimit = Math.min(numSkinZones, 256);
    for (let f = 0; f < famLimit; f++){
      const fam = [];
      for (let z = 0; z < zoneLimit; z++){
        const off = skinIdx + (f * numSkinZones + z) * 2;
        if (off + 2 > dv.byteLength) { fam.push(-1); continue; }
        fam.push(sI16(dv, off));
      }
      mdl.skinFamilies.push(fam);
    }
    mdl.skin = mdl.skinFamilies[0] || [];
  } else if (numSkinZones > 0 && skinIdx > 0){
    for (let i = 0; i < numSkinZones; i++) mdl.skin.push(sI16(dv, skinIdx + i * 2));
    if (mdl.skin.length) mdl.skinFamilies.push(mdl.skin);
  }

  for (let bp = 0; bp < numBP; bp++){
    const b = bpIdx + bp * BODYPART_SIZE;
    const szname = sI32(dv, b), numModels = sI32(dv, b + 4), modelIdx = sI32(dv, b + 12);
    if (numModels < 0 || numModels > 512) continue;
    const bodypart = { name: cstr(dv, b + szname), models: [] };
    for (let m = 0; m < numModels; m++){
      const mB = b + modelIdx + m * MODEL_SIZE;
      const numMesh = sI32(dv, mB + 72), meshIdx = sI32(dv, mB + 76);
      const modelVertexIndex = sI32(dv, mB + 84);
      if (numMesh < 0 || numMesh > 4096) continue;
      const model = { name: cstr(dv, mB), meshes: [] };
      
      for (let me = 0; me < numMesh; me++){
        const meB = mB + meshIdx + me * MESH_SIZE;
        const meshVtxOffset = sI32(dv, meB + 12);
        const vertexOffset = Math.floor(modelVertexIndex / VVD_VERTEX_SIZE) + meshVtxOffset;

        model.meshes.push({
          material: sI32(dv, meB + 0),
          numVertices: sI32(dv, meB + 8),
          vertexOffset: vertexOffset
        });
      }
      bodypart.models.push(model);
    }
    mdl.bodyparts.push(bodypart);
  }

  if (numBones > 0 && numBones <= 512 && boneIndex > 0 && boneIndex + numBones * BONE_SIZE <= dv.byteLength){
    for (let i = 0; i < numBones; i++){
      const b = boneIndex + i * BONE_SIZE;
      const poseToBone = [];
      for (let k = 0; k < 12; k++) poseToBone.push(sR32(dv, b + 96 + k * 4));
      mdl.bones.push({ name: cstr(dv, b + sI32(dv, b + 0)), parent: sI32(dv, b + 4), poseToBone });
    }
  }

  if (numAtt > 0 && numAtt < 256 && attIdx > 0){
    for (let i = 0; i < numAtt; i++){
      const a = attIdx + i * ATTACHMENT_SIZE;
      if (a + ATTACHMENT_SIZE > dv.byteLength) break;
      const nameOff = sI32(dv, a);
      const bone    = sI32(dv, a + 8);
      const local = new Array(12);
      for (let k = 0; k < 12; k++) local[k] = sR32(dv, a + 12 + k * 4);
      mdl.attachments.push({
        name: cstr(dv, a + nameOff),
        flags: sI32(dv, a + 4),
        bone,
        local
      });
    }
  }

  if (numHBS > 0 && numHBS < 32 && hbsIdx > 0){
    for (let s = 0; s < numHBS; s++){
      const setBase = hbsIdx + s * HITBOX_SET_SIZE;
      if (setBase + HITBOX_SET_SIZE > dv.byteLength) break;
      const set = { name: cstr(dv, setBase + sI32(dv, setBase)), boxes: [] };
      const numBoxes = sI32(dv, setBase + 4), boxIdx = sI32(dv, setBase + 8);
      if (numBoxes > 0 && numBoxes < 512 && boxIdx > 0){
        for (let b = 0; b < numBoxes; b++){
          const bo = setBase + boxIdx + b * HITBOX_SIZE;
          if (bo + HITBOX_SIZE > dv.byteLength) break;
          const szname = sI32(dv, bo + 56);
          set.boxes.push({
            bone:  sI32(dv, bo + 48),
            group: sI32(dv, bo + 52),
            bmin:  [sR32(dv, bo + 0),  sR32(dv, bo + 4),  sR32(dv, bo + 8)],
            bmax:  [sR32(dv, bo + 12), sR32(dv, bo + 16), sR32(dv, bo + 20)],
            smin:  [sR32(dv, bo + 24), sR32(dv, bo + 28), sR32(dv, bo + 32)],
            smax:  [sR32(dv, bo + 36), sR32(dv, bo + 40), sR32(dv, bo + 44)],
            name: szname !== -1 ? cstr(dv, bo + szname) : ''
          });
        }
      }
      mdl.hitboxSets.push(set);
    }
  }

  mdl.isEntityModel = !mdl.isStaticProp && mdl.bones.length > 0;
  return mdl;
}

const IDSV = 0x56534449;
function parseVVD(buffer){
  const dv = new DataView(buffer); if (sI32(dv, 0) !== IDSV) throw new Error('not IDSV');
  const vertexDataStart = sI32(dv, 56);
  const rawCount = Math.max(0, Math.floor((dv.byteLength - vertexDataStart) / VVD_VERTEX_SIZE));
  const numFixups = sI32(dv, 48), fixupStart = sI32(dv, 52);
  let remap = null;
  if (numFixups > 0 && numFixups < 100000 && fixupStart > 0){
    const list = [];
    for (let i = 0; i < numFixups; i++){
      const fo = fixupStart + i * 12;
      if (fo + 12 > dv.byteLength) break;
      const lod = sI32(dv, fo), src = sI32(dv, fo + 4), n = sI32(dv, fo + 8);
      if (lod < 0) continue;
      for (let k = 0; k < n; k++){ if (src + k >= 0 && src + k < rawCount) list.push(src + k); }
    }
    if (list.length) remap = Int32Array.from(list);
  }
  return { version: sI32(dv, 4), checksum: sI32(dv, 8), numLODs: sI32(dv, 12), numLODVertexes: Array.from({ length: 8 }, (_, i) => sI32(dv, 16 + i * 4)), vertexDataStart, remap, numVerts: remap ? remap.length : rawCount, dv };
}

function vvdVertex(vvd, index){
  if (index < 0) return null;
  if (vvd.remap){ if (index >= vvd.remap.length) return null; index = vvd.remap[index]; }
  const p = vvd.vertexDataStart + index * VVD_VERTEX_SIZE, dv = vvd.dv;
  if (p + VVD_VERTEX_SIZE > dv.byteLength) return null;
  return { 
    pos: [sR32(dv, p + 16), sR32(dv, p + 20), sR32(dv, p + 24)], 
    nrm: [sR32(dv, p + 28), sR32(dv, p + 32), sR32(dv, p + 36)], 
    uv: [sR32(dv, p + 40), sR32(dv, p + 44)],
    weights: [sR32(dv, p), sR32(dv, p + 4), sR32(dv, p + 8)],
    boneIds: [sU8(dv, p + 12), sU8(dv, p + 13), sU8(dv, p + 14)],
    nBones: sU8(dv, p + 15)
  };
}

function invertRigid3x4(m){
  const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8], j = m[9], k = m[10], l = m[11];
  return [a, e, i, -(a * d + e * h + i * l), b, f, j, -(b * d + f * h + j * l), c, g, k, -(c * d + g * h + k * l)];
}

function computeBindPose(mdl) {
  const boneToWorld = new Array(mdl.bones.length);
  for (let i = 0; i < mdl.bones.length; i++) {
    const b = mdl.bones[i];
    const localInv = invertRigid3x4(b.poseToBone); 
    const global = new Array(12);
    
    if (b.parent === -1 || b.parent >= i || !boneToWorld[b.parent]) {
      for (let j = 0; j < 12; j++) global[j] = localInv[j];
    } else {
      const p = boneToWorld[b.parent];
      global[0] = p[0]*localInv[0] + p[1]*localInv[4] + p[2]*localInv[8];
      global[1] = p[0]*localInv[1] + p[1]*localInv[5] + p[2]*localInv[9];
      global[2] = p[0]*localInv[2] + p[1]*localInv[6] + p[2]*localInv[10];
      global[3] = p[0]*localInv[3] + p[1]*localInv[7] + p[2]*localInv[11] + p[3];
      
      global[4] = p[4]*localInv[0] + p[5]*localInv[4] + p[6]*localInv[8];
      global[5] = p[4]*localInv[1] + p[5]*localInv[5] + p[6]*localInv[9];
      global[6] = p[4]*localInv[2] + p[5]*localInv[6] + p[6]*localInv[10];
      global[7] = p[4]*localInv[3] + p[5]*localInv[7] + p[6]*localInv[11] + p[7];
      
      global[8] = p[8]*localInv[0] + p[9]*localInv[4] + p[10]*localInv[8];
      global[9] = p[8]*localInv[1] + p[9]*localInv[5] + p[10]*localInv[9];
      global[10] = p[8]*localInv[2] + p[9]*localInv[6] + p[10]*localInv[10];
      global[11] = p[8]*localInv[3] + p[9]*localInv[7] + p[10]*localInv[11] + p[11];
    }
    boneToWorld[i] = global;
  }
  
  const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0];
  return new Array(mdl.bones.length).fill(identity);
}

const VPHY = 0x59485056;
function parsePHY(buffer){
  const dv = new DataView(buffer); if (sI32(dv, 4) !== VPHY) throw new Error('not VPHY');
  const solidCount = sI32(dv, 8), solids = []; let off = 16;
  for (let s = 0; s < solidCount && off + 32 <= dv.byteLength; s++){
    const bs = sI32(dv, off); if (bs <= 32 || off + bs > dv.byteLength) break;
    const be = off + bs, ss = off + 32; let hulls = [];
    for (const no of [28, 40, 24, 36]){
      const n = sI32(dv, ss + no);
      if (n <= 0 || n > 4096) continue;
      const r = readLL(dv, ss, ss + no + 4, n, be);
      if (r && r.length) { hulls = r; break; }
    }
    solids.push(hulls); off = be;
  }
  return { solidCount, solids };
}
function readLL(dv, ss, lo, n, be){
  const h = [];
  for (let i = 0; i < n; i++){ const o = lo + i * 4; if (o + 4 > dv.byteLength) return null; const lp = ss + sI32(dv, o); if (lp < 0 || lp + 16 > be) return null; const pts = readLP(dv, lp, be); if (pts) h.push(pts); }
  return h.length ? h : null;
}
function readLP(dv, lp, be){
  const c = sI32(dv, lp + 4), po = sI32(dv, lp + 8); if (c < 3 || c > 4096) return null;
  const pp = lp + po; if (pp < 0 || pp + c * 12 > be) return null; const pts = [];
  for (let i = 0; i < c; i++){ const x = sR32(dv, pp + i * 12), y = sR32(dv, pp + i * 12 + 4), z = sR32(dv, pp + i * 12 + 8); if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null; if (Math.abs(x) > 1e6 || Math.abs(y) > 1e6 || Math.abs(z) > 1e6) return null; pts.push(new THREE.Vector3(x, y, z)); }
  return pts;
}

const FALLBACK_COLORS = [0x8fa6bf, 0xb08a6a, 0x7f9f7f, 0x9a8fb5, 0xb5a08f, 0x6f8fa6, 0xa6908a, 0x8aa6a0].map(c => new THREE.Color(c));
let SKIN_APPLY = false, SKIN_MATRICES = [], SKIN_BONE_COUNT = 0;
function resetSkinState(){ SKIN_APPLY = false; SKIN_MATRICES = []; SKIN_BONE_COUNT = 0; }

function getVTXStructSizes(v){
  const h = v >= 49;
  return { mdlVersion: v, hasTopology: h, stripGroupHdrSize: h ? 33 : 25, stripHdrSize: h ? 35 : 27, meshHdrSize: 9, lodHdrSize: 12, modelHdrSize: 8, bodyPartHdrSize: 8, vertexSize: 9 };
}

function skinVertex(pos, v) {
  if (!SKIN_APPLY || !SKIN_MATRICES.length || !v || v.nBones <= 0) return pos;
  let x = 0, y = 0, z = 0;
  let totalWeight = 0;
  for (let i = 0; i < Math.min(v.nBones, 3); i++) {
    const bi = v.boneIds[i];
    const w = v.weights[i];
    if (bi >= 0 && bi < SKIN_MATRICES.length && w > 0) {
      const m = SKIN_MATRICES[bi];
      x += (m[0] * pos[0] + m[1] * pos[1] + m[2] * pos[2] + m[3]) * w;
      y += (m[4] * pos[0] + m[5] * pos[1] + m[6] * pos[2] + m[7]) * w;
      z += (m[8] * pos[0] + m[9] * pos[1] + m[10] * pos[2] + m[11]) * w;
      totalWeight += w;
    }
  }
  if (totalWeight > 0) {
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      x /= totalWeight; y /= totalWeight; z /= totalWeight;
    }
    return [x, y, z];
  }
  return pos;
}

function readVTXVert(dv, p, mvo, maxVVD){
  if (p + 9 > dv.byteLength) return null;
  const nBones = dv.getUint8(p + 3), origId = dv.getUint16(p + 4, true), vvdId = mvo + origId;
  if (vvdId < 0 || vvdId >= maxVVD || nBones > 3) return null;
  return { vvdId, boneIds: [dv.getUint8(p + 6), dv.getUint8(p + 7), dv.getUint8(p + 8)], nBones };
}

function buildLmap(dv, sgBase, vsz, mvo, maxVVD){
  const nV = sI32(dv, sgBase + 0), vOff = sI32(dv, sgBase + 4);
  if (nV <= 0 || nV > 200000 || vOff <= 0) return null;
  const vb = sgBase + vOff; if (vb >= dv.byteLength || vb + nV * vsz > dv.byteLength) return null;
  const vvdMap = new Int32Array(nV), boneMap = new Int32Array(nV * 3), nBoneArr = new Uint8Array(nV);
  for (let i = 0; i < nV; i++){
    const v = readVTXVert(dv, vb + i * vsz, mvo, maxVVD); if (!v) { vvdMap[i] = -1; continue; }
    vvdMap[i] = v.vvdId;
    boneMap[i * 3]     = v.boneIds[0];
    boneMap[i * 3 + 1] = v.boneIds[1];
    boneMap[i * 3 + 2] = v.boneIds[2];
    nBoneArr[i] = v.nBones;
  }
  return { vvdMap, boneMap, nBoneArr, numVerts: nV };
}

const MAX_TOTAL_TRIS = 2_000_000;

function parseStrips(dv, sgBase, lmap, nV, nStrips, stOff, stSz, vvd, sgIdxOff){
  if (nStrips <= 0 || nStrips > 200000 || stOff <= 0) return null;
  const P = [], N = [], U = [], I = [], V = []; const vm = new Map(); let ni = 0, rej = 0;
  const push = (li) => {
    const vvdId = lmap.vvdMap[li]; if (vvdId < 0) return -1; if (vm.has(vvdId)) return vm.get(vvdId);
    const v = vvdVertex(vvd, vvdId);
    if (!v) return -1;
    const p = SKIN_APPLY ? skinVertex(v.pos, v) : v.pos;
    const [x, y, z] = p;
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return -1;
    if (Math.abs(x) > 1e5 || Math.abs(y) > 1e5 || Math.abs(z) > 1e5) return -1;
    P.push(x, y, z); V.push(vvdId);
    N.push(v.nrm[0], v.nrm[1], v.nrm[2]);
    U.push(v.uv[0], v.uv[1]);
    const id = ni++; vm.set(vvdId, id); return id;
  };
  for (let st = 0; st < nStrips; st++){
    if (I.length / 3 > MAX_TOTAL_TRIS) { console.warn('[strips] total tris limit'); break; }
    const sb = sgBase + stOff + st * stSz; if (sb + stSz > dv.byteLength) continue;
    const sn = sI32(dv, sb + 0), so = sI32(dv, sb + 4), sf = sU8(dv, sb + 18);
    if (sn <= 0 || sn > 2000000 || so < 0) continue; const ib = sgBase + sgIdxOff + so * 2; if (ib + sn * 2 > dv.byteLength) continue;
    
    if (sf & 0x01){
      for (let i = 0; i + 2 < sn; i += 3){
        const la = sU16(dv, ib + i * 2), lb = sU16(dv, ib + (i + 1) * 2), lc = sU16(dv, ib + (i + 2) * 2);
        if (la >= nV || lb >= nV || lc >= nV) { rej++; continue; }
        const a = push(la), b = push(lb), c = push(lc); if (a < 0 || b < 0 || c < 0) { rej++; continue; }
        if (a === b || b === c || a === c) continue; I.push(a, b, c);
      }
    } 
    else if (sf & 0x02){
      if (sn < 3) continue;
      let la = sU16(dv, ib + 0 * 2);
      let lb = sU16(dv, ib + 1 * 2);
      if (la >= nV || lb >= nV) { rej += sn; continue; }
      let a = push(la);
      let b = push(lb);
      for (let i = 2; i < sn; i++){
        const lc = sU16(dv, ib + i * 2);
        if (lc >= nV) { 
          if (i + 1 < sn) {
            la = sU16(dv, ib + i * 2);
            lb = sU16(dv, ib + (i + 1) * 2);
            a = (la < nV) ? push(la) : -1;
            b = (lb < nV) ? push(lb) : -1;
            i++;
          }
          continue; 
        }
        const c = push(lc);
        if (a >= 0 && b >= 0 && c >= 0) {
          if (a !== b && b !== c && a !== c) { 
            if (i & 1) I.push(b, a, c); 
            else I.push(a, b, c); 
          }
        } else {
          rej++;
        }
        a = b;
        b = c;
      }
    }
  }
  if (I.length < 3) return null;
  return { positions: P, normals: N, uvs: U, indices: I, rejected: rej, deep: false, vvdIds: V };
}

function parseDeep(dv, sgBase, lmap, nV, nI, iOff, vvd, hs){
  let ib = sgBase + iOff, ic = nI;
  if (iOff <= 0 || ib >= dv.byteLength || ib < sgBase + hs) { ib = sgBase + hs; ic = Math.floor((dv.byteLength - ib) / 2); }
  const mp = Math.floor((dv.byteLength - ib) / 2); if (ic <= 0 || ic > mp) ic = mp; if (ic > 2000000) ic = 2000000;
  const P = [], N = [], U = [], I = [], V = []; const vm = new Map(); let ni = 0, rej = 0, vt = 0;
  const push = (li) => {
    const vvdId = lmap.vvdMap[li]; if (vvdId < 0) return -1; if (vm.has(vvdId)) return vm.get(vvdId);
    const v = vvdVertex(vvd, vvdId);
    if (!v) return -1;
    const p = SKIN_APPLY ? skinVertex(v.pos, v) : v.pos;
    const [x, y, z] = p;
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return -1;
    if (Math.abs(x) > 1e5 || Math.abs(y) > 1e5 || Math.abs(z) > 1e5) return -1;
    P.push(x, y, z); V.push(vvdId);
    N.push(v.nrm[0], v.nrm[1], v.nrm[2]);
    U.push(v.uv[0], v.uv[1]);
    const id = ni++; vm.set(vvdId, id); return id;
  };
  for (let i = 0; i + 2 < ic; i += 3){
    if (vt > MAX_TOTAL_TRIS) { console.warn('[deep] total tris limit'); break; }
    const p = ib + i * 2; if (p + 6 > dv.byteLength) break;
    const la = dv.getUint16(p, true), lb = dv.getUint16(p + 2, true), lc = dv.getUint16(p + 4, true);
    if (la >= nV || lb >= nV || lc >= nV) { rej++; continue; }
    const a = push(la), b = push(lb), c = push(lc); if (a < 0 || b < 0 || c < 0) { rej++; continue; }
    if (a === b || b === c || a === c) continue; I.push(a, b, c); vt++;
  }
  if (vt < 3) return null;
  return { positions: P, normals: N, uvs: U, indices: I, rejected: rej, deep: true, vvdIds: V };
}

function parseSG(dv, sgBase, sizes, mvo, maxVVD, vvd, forceDeep){
  if (sgBase + sizes.stripGroupHdrSize > dv.byteLength) return null; 
  const lmap = buildLmap(dv, sgBase, sizes.vertexSize, mvo, maxVVD); if (!lmap) return null;
  const nI = sI32(dv, sgBase + 8), iOff = sI32(dv, sgBase + 12), nS = sI32(dv, sgBase + 16), sOff = sI32(dv, sgBase + 20);
  if (!forceDeep && nS > 0 && sOff > 0 && nI > 0){ const std = parseStrips(dv, sgBase, lmap, lmap.numVerts, nS, sOff, sizes.stripHdrSize, vvd, iOff); if (std && std.indices.length >= 3) return std; }
  return parseDeep(dv, sgBase, lmap, lmap.numVerts, nI, iOff, vvd, sizes.stripGroupHdrSize);
}

function parseHierarchy(dv, mdl, vvd, maxVVD, sizes, forceDeep, texSize = 1024, skinFamily = 0, modelEntry = null){
  const group = new THREE.Group(); group.rotation.x = -Math.PI / 2; const stats = { verts: 0, tris: 0, meshes: 0, rejected: 0 };
  const nBP = sI32(dv, 28), bpOff = sI32(dv, 32); if (nBP <= 0 || nBP > 64 || bpOff <= 0 || bpOff >= dv.byteLength) return null;
  for (let bp = 0; bp < nBP; bp++){
    const bpB = bpOff + bp * sizes.bodyPartHdrSize; if (bpB + 8 > dv.byteLength) break;
    const nMod = sI32(dv, bpB + 0), moOff = sI32(dv, bpB + 4); if (nMod <= 0 || nMod > 64 || moOff <= 0) continue;
    for (let m = 0; m < nMod; m++){
      const mB = bpB + moOff + m * sizes.modelHdrSize; if (mB + 8 > dv.byteLength) continue;
      const nLod = sI32(dv, mB + 0), lOff = sI32(dv, mB + 4); if (nLod <= 0 || nLod > 8 || lOff <= 0) continue;
      const lodB = mB + lOff; if (lodB + sizes.lodHdrSize > dv.byteLength) continue;
      const nMe = sI32(dv, lodB + 0), meOff = sI32(dv, lodB + 4); if (nMe <= 0 || nMe > 1024 || meOff <= 0) continue;
      const mdlBp = mdl.bodyparts[bp], mdlMod = (mdlBp && mdlBp.models[m]) ? mdlBp.models[m] : null;
      for (let me = 0; me < nMe; me++){
        const meB = lodB + meOff + me * sizes.meshHdrSize; if (meB + 8 > dv.byteLength) continue;
        const nSG = sI32(dv, meB + 0), sgOff = sI32(dv, meB + 4); if (nSG <= 0 || nSG > 64 || sgOff <= 0) continue;
        let mat = 0, mvo = 0; 
        if (mdlMod && mdlMod.meshes[me]) { mat = mdlMod.meshes[me].material; mvo = mdlMod.meshes[me].vertexOffset; }
        const P = [], N = [], U = [], I = [], V = []; let ni = 0;
        for (let sg = 0; sg < nSG; sg++){
          const sgB = meB + sgOff + sg * sizes.stripGroupHdrSize; const r = parseSG(dv, sgB, sizes, mvo, maxVVD, vvd, forceDeep); if (!r) continue;
          stats.rejected += (r.rejected || 0); const sh = ni;
          for (let i = 0; i < r.positions.length; i++) P.push(r.positions[i]);
          for (let i = 0; i < r.normals.length; i++) N.push(r.normals[i]);
          for (let i = 0; i < r.uvs.length; i++) U.push(r.uvs[i]);
          if (r.vvdIds) for (let i = 0; i < r.vvdIds.length; i++) V.push(r.vvdIds[i]);
          for (let i = 0; i < r.indices.length; i++) I.push(r.indices[i] + sh); ni += r.positions.length / 3;
        }
        if (I.length < 3) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        geo.setIndex(I); geo.computeBoundingSphere();
        geo.userData.vvdIds = V;

        const famTable = (mdl.skinFamilies && mdl.skinFamilies[skinFamily]) || mdl.skin;
        const lookup = (famTable && famTable[mat] !== undefined && famTable[mat] >= 0) ? famTable[mat] : mat;
        const texName = mdl.textures[lookup] || mdl.textures[mat] || '';

        const material = new THREE.MeshStandardMaterial({
          color: FALLBACK_COLORS[mat % FALLBACK_COLORS.length],
          roughness: 0.65,
          metalness: 0.05,
          side: THREE.DoubleSide
        });
        material.userData.texName = texName;
        material.name = String(texName || ('mat' + mat)).replace(/[^\w.-]+/g, '_');

        if (TexStore.enabled && texName){
          const pGame = (modelEntry && modelEntry.game) || TexStore.preferGame || null;
          const pPrefix = (modelEntry && modelEntry.path) ? modelEntry.path.slice(0, modelEntry.path.lastIndexOf('/') + 1) : null;
          const mPath = (modelEntry && modelEntry.path) || null;

          TexStore.resolveModelTexture(mdl, texName, pGame, pPrefix, mPath).then(res => {
            if (!res || !res.vtfRec) return;
            material.userData.texPath = res.vtfRec.path;
            if (res.info){
              if (res.info.alphatest){
                material.alphaTest = 0.5;
                material.transparent = false;
                material.depthWrite = true;
              } else if (res.info.translucent){
                material.transparent = true;
                material.depthWrite = false;
              }
            }
            return TexStore.makeTexture(res.vtfRec, texSize, getRecordBuffer);
          }).then(td => {
            if (!td) return;
            material.map = td.texture;
            material.color.set(0xffffff);
            material.needsUpdate = true;
          }).catch(() => {});
        }

        group.add(new THREE.Mesh(geo, material)); stats.verts += P.length / 3; stats.tris += I.length / 3; stats.meshes++;
      }
    }
  }
  return stats.meshes > 0 ? { group, stats } : null;
}

function disposeGroup(g){
  if (!g) return;
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material){
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => m.dispose());
    }
  });
}

function buildModel(mdl, vvd, vtxBuf, applySkin, texSize = 1024, skinFamily = 0, modelEntry = null){
  const dv = new DataView(vtxBuf);
  const maxVVD = vvd.numVerts;
  
  if (!maxVVD) return { group: new THREE.Group(), stats: { verts: 0, tris: 0, meshes: 0 }, layout: '—' };

  resetSkinState(); 
  SKIN_BONE_COUNT = mdl.bones.length;

  if (mdl.bones.length > 0) {
    SKIN_APPLY = true;
    SKIN_MATRICES = computeBindPose(mdl);
  } else {
    SKIN_APPLY = false;
    SKIN_MATRICES = [];
  }

  let best = null, bestName = '';
  const primary = getVTXStructSizes(mdl.version);

  const tryMode = (sizes, fd, label) => {
    let r;
    try { r = parseHierarchy(dv, mdl, vvd, maxVVD, sizes, fd, texSize, skinFamily, modelEntry); } catch (e) { return; }
    if (!r || r.stats.tris <= 0) { disposeGroup(r && r.group); return; }
    if (!best || r.stats.tris > best.stats.tris){
      disposeGroup(best && best.group);
      best = r; bestName = label;
    } else {
      disposeGroup(r.group);
    }
  };

  tryMode(primary, false, `std v${mdl.version}`);
  if (!best || best.stats.tris < 500) tryMode(primary, true, `deep v${mdl.version}`);

  if (!best){
    const fb = [ { sg: 28, st: 27, mh: 9, lod: 12, vtx: 9 }, { sg: 28, st: 28, mh: 12, lod: 12, vtx: 9 }, { sg: 25, st: 27, mh: 9, lod: 12, vtx: 10 }, { sg: 36, st: 35, mh: 12, lod: 12, vtx: 9 }, { sg: 33, st: 35, mh: 9, lod: 12, vtx: 9 } ];
    for (const f of fb){
      const sizes = Object.assign({}, primary, { stripGroupHdrSize: f.sg, stripHdrSize: f.st, meshHdrSize: f.mh, lodHdrSize: f.lod, vertexSize: f.vtx });
      tryMode(sizes, false, 'std-alt');
      if (!best || best.stats.tris < 500) tryMode(sizes, true, 'deep-alt');
      if (best && best.stats.tris > 500) break;
    }
  }
  if (!best) return { group: new THREE.Group(), stats: { verts: 0, tris: 0, meshes: 0 }, layout: '—' };
  best.layout = bestName; best.skinning = { enabled: SKIN_APPLY, bones: SKIN_BONE_COUNT }; return best;
}

/* === СЦЕНА === */
const modelCanvas = document.getElementById('modelCanvas');
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 900;
const modelRenderer = new THREE.WebGLRenderer({ canvas: modelCanvas, antialias: !isMobile, powerPreference: 'high-performance' });
modelRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
modelRenderer.outputColorSpace = THREE.SRGBColorSpace;
modelRenderer.toneMapping = THREE.ACESFilmicToneMapping;
modelRenderer.toneMappingExposure = 1.0;

const modelScene = new THREE.Scene();
modelScene.background = new THREE.Color(0x05070a);

const pmremGenerator = new THREE.PMREMGenerator(modelRenderer);
pmremGenerator.compileEquirectangularShader();
modelScene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const modelCamera = new THREE.PerspectiveCamera(45, 1, 0.5, 100000);
modelCamera.position.set(120, 90, 160);
const modelControls = new OrbitControls(modelCamera, modelRenderer.domElement);
modelControls.enableDamping = true; modelControls.dampingFactor = 0.08;
modelControls.rotateSpeed = isMobile ? 0.9 : 1.0; modelControls.zoomSpeed = isMobile ? 1.1 : 1.0;
modelControls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
modelControls.target.set(0, 40, 0);

const lightGroup = new THREE.Group();
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a2f38, 1.0);
const keyL = new THREE.DirectionalLight(0xffffff, 1.8); keyL.position.set(1, 1.6, 1);
const fillL = new THREE.DirectionalLight(0x88aaff, 0.8); fillL.position.set(-1, 0.4, -1);
const rim = new THREE.DirectionalLight(0xff88cc, 0.6); rim.position.set(-0.5, -0.3, 1);
lightGroup.add(hemi, keyL, fillL, rim); modelScene.add(lightGroup);
const ambient = new THREE.AmbientLight(0xffffff, 0.35); ambient.visible = false; modelScene.add(ambient);

const modelGrid = new THREE.GridHelper(2048, 64, 0x3a4553, 0x1f2630);
modelGrid.material.transparent = true; modelGrid.material.opacity = 0.9; modelScene.add(modelGrid);
const axisX = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1024, 0.01, 0), new THREE.Vector3(1024, 0.01, 0)]), new THREE.LineBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.5 }));
const axisZ = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.01, -1024), new THREE.Vector3(0, 0.01, 1024)]), new THREE.LineBasicMaterial({ color: 0x4d8cff, transparent: true, opacity: 0.5 }));
modelScene.add(axisX); modelScene.add(axisZ);

let currentModelRoot = null, phyRoot = null, autoRotate = false, lastEntry = null;
let _modelLoadToken = 0;
let _chkTexToken = 0;

export function modelResize(){
  const w = modelCanvas.clientWidth, h = modelCanvas.clientHeight; if (!w || !h) return;
  modelRenderer.setSize(w, h, false); modelCamera.aspect = w / h; modelCamera.updateProjectionMatrix();
}
let lastT = 0, fr = 0, lastAnimT = 0;
function tick(t){
  requestAnimationFrame(tick); if (!document.getElementById('paneModels').classList.contains('active')) return;
  fr++; if (t - lastT > 500) { document.getElementById('fps').textContent = Math.round(fr * 1000 / (t - lastT)); fr = 0; lastT = t; }
  if (autoRotate && currentModelRoot) currentModelRoot.rotation.z += 0.005;
  stepAnim(lastAnimT ? Math.min(0.1, (t - lastAnimT) / 1000) : 0); lastAnimT = t;
  modelControls.update(); modelRenderer.render(modelScene, modelCamera);
}
function clearModelScene(){
  animReset();
  if (currentModelRoot) { modelScene.remove(currentModelRoot); disposeTree(currentModelRoot); currentModelRoot = null; }
  if (phyRoot) { modelScene.remove(phyRoot); disposeTree(phyRoot); phyRoot = null; }
}

function disposeTree(r){
  r.traverse(o => {
    if (o.skeleton) o.skeleton.dispose();
    if (o.geometry) o.geometry.dispose();
    if (o.material){
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => m.dispose());
    }
  });
}

export function disposeTextureCache(){
  for (const v of TexStore._texCache.values()){
    if (v && v.texture) v.texture.dispose();
  }
  TexStore._texCache.clear();
}

function frameObject(obj){
  const box = new THREE.Box3().setFromObject(obj); if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 50; modelControls.target.copy(center);
  const pad = isMobile ? 1.45 : 1.25; const dist = radius / Math.sin(THREE.MathUtils.degToRad(modelCamera.fov * 0.5)) * pad;
  const dir = new THREE.Vector3(0.65, 0.5, 0.85).normalize(); modelCamera.position.copy(center).addScaledVector(dir, dist);
  modelCamera.near = Math.max(0.1, radius / 500); modelCamera.far = Math.max(2000, radius * 50);
  modelCamera.updateProjectionMatrix(); modelControls.update();
}

function getTexRecordFromMat(mat){
  const texPath = mat.userData && mat.userData.texPath;
  if (texPath){ const rec = Store.get(texPath); if (rec) return rec; }
  const texName = mat.userData && mat.userData.texName;
  if (texName) return TexStore.findByMat(texName);
  return null;
}

let FILE_MAP = new Map(), MODELS = [], curIdx = 0;
let showGrid = true, showWire = false, showPhy = false, _lastModelStats = null;
function findSibling(stem, suf){ return FILE_MAP.get(stem + suf) || null; }
class FileFacade {
  constructor(rec){ this._rec = rec; this.name = rec.path.slice(rec.path.lastIndexOf('/') + 1); this.size = rec.size; }
  arrayBuffer(){ return getRecordBuffer(this._rec); }
  async text(){ return new TextDecoder().decode(await getRecordBuffer(this._rec)); }
}
const FM_EXTS = new Set(['mdl', 'vvd', 'vtx', 'phy', 'ani']);
let VTX_BY_STEM = new Map(), MDL_BY_TAIL = new Map(), ANI_BY_TAIL = new Map();
function findVTX(stem){
  for (const p of ['.dx90.vtx', '.dx80.vtx', '.sw.vtx', '.vtx']) { const f = FILE_MAP.get(stem + p); if (f) return f; }
  return VTX_BY_STEM.get(stem) || null;
}
export function rebuildFileMapFromStore(){
  FILE_MAP = new Map(); VTX_BY_STEM = new Map(); MDL_BY_TAIL = new Map(); ANI_BY_TAIL = new Map();
  _modelExistsCache.clear();
  _animInspectCache.clear();
  for (const f of Store.files.values()){
    if (!FM_EXTS.has(f.ext)) continue;
    const facade = new FileFacade(f);
    const lower = f.path.toLowerCase(), base = facade.name.toLowerCase();
    FILE_MAP.set(lower, facade); FILE_MAP.set(base, facade);
    if (f.ext === 'vtx'){
      for (const key of [lower, base]){
        const dot = key.indexOf('.', key.lastIndexOf('/') + 1); if (dot < 0) continue;
        const stem = key.slice(0, dot);
        if (!VTX_BY_STEM.has(stem) || key.includes('.dx90.')) VTX_BY_STEM.set(stem, facade);
      }
    } else if (f.ext === 'mdl'){
      const i = lower.indexOf('models/');
      MDL_BY_TAIL.set(i >= 0 ? lower.slice(i) : lower, { key: lower, v: facade });
    } else if (f.ext === 'ani'){
      const i = lower.indexOf('models/');
      ANI_BY_TAIL.set(i >= 0 ? lower.slice(i) : lower, facade);
    }
  }
}

const MODEL_OPT_CAP = 400;
let VIEW = [], _mSearch = '', _mSearchT = null;
const MT = { ru: { all_of: 'Показано {a} из {b}', refine: ' — уточни поиск или игру', search: 'Поиск модели…', empty: 'Ничего не найдено' },
             en: { all_of: 'Showing {a} of {b}', refine: ' — refine search or game', search: 'Search model…', empty: 'Nothing found' } };
const mT = (k, p) => { let v = (MT[LANG] || MT.en)[k]; if (p) for (const x in p) v = v.replace('{' + x + '}', p[x]); return v; };

function ensureModelUI(){
  if (document.getElementById('gameSel')) return;
  const sel = document.getElementById('modelSel'); if (!sel) return;
  const gs = document.createElement('select'); gs.id = 'gameSel'; gs.className = 's-select'; gs.style.marginBottom = '6px';
  const q = document.createElement('input'); q.id = 'modelSearch'; q.type = 'search'; q.className = 's-select'; q.style.marginBottom = '6px'; q.placeholder = mT('search');
  const cnt = document.createElement('div'); cnt.id = 'modelCount'; cnt.style.cssText = 'font-size:11.5px;color:#8a93a8;margin-top:5px';
  sel.insertAdjacentElement('beforebegin', gs); gs.insertAdjacentElement('afterend', q); sel.insertAdjacentElement('afterend', cnt);
  bindGameSelect(gs, 'mdl');
  q.addEventListener('input', () => { clearTimeout(_mSearchT); _mSearchT = setTimeout(() => { _mSearch = q.value.trim().toLowerCase(); applyModelFilter(); renderModelOptions(); }, 150); });
  Games.onChange(() => {
    applyModelFilter();
    if (VIEW.length && !VIEW.includes(curIdx)) selectModel(VIEW[0]); else renderModelOptions();
    if (_galEl && _galEl.classList.contains('open')) galRender();
  });
  window.addEventListener('langchange', () => { q.placeholder = mT('search'); renderModelOptions(); });
}
function applyModelFilter(){
  const g = Games.current, q = _mSearch; VIEW = [];
  for (let i = 0; i < MODELS.length; i++){
    const m = MODELS[i];
    if (g !== 'all' && m.game !== g) continue;
    if (q && !m.lc.includes(q)) continue;
    VIEW.push(i);
  }
}
function renderModelOptions(){
  const sel = document.getElementById('modelSel'); if (!sel) return;
  const n = Math.min(VIEW.length, MODEL_OPT_CAP), frag = document.createDocumentFragment();
  for (let k = 0; k < n; k++){
    const m = MODELS[VIEW[k]], o = document.createElement('option');
    o.value = VIEW[k]; o.textContent = m.label + ((m.vvdFile && m.vtxFile) ? '' : ' ⚠'); frag.appendChild(o);
  }
  sel.textContent = ''; sel.appendChild(frag);
  sel.value = String(curIdx); if (sel.value !== String(curIdx)) sel.selectedIndex = -1;
  const cnt = document.getElementById('modelCount');
  if (cnt) cnt.textContent = !VIEW.length ? mT('empty') : mT('all_of', { a: n.toLocaleString(LANG), b: VIEW.length.toLocaleString(LANG) }) + (VIEW.length > n ? mT('refine') : '');
}
function selectModel(i){
  const sel = document.getElementById('modelSel'); if (!sel || !MODELS[i]) return;
  if (!sel.querySelector('option[value="' + i + '"]')){
    const o = document.createElement('option'); o.value = i; o.textContent = MODELS[i].label; sel.insertBefore(o, sel.firstChild);
  }
  sel.value = String(i); curIdx = i; loadCurrentModel();
}

export function scanModels(){
  const prevPath = lastEntry && lastEntry.path;
  MODELS = []; const seen = new Set();
  for (const [key, file] of FILE_MAP){
    if (!key.endsWith('.mdl')) continue;
    const rec = file._rec; const realPath = rec.path; if (seen.has(realPath)) continue; seen.add(realPath);
    const stem = key.replace(/\.mdl$/, ''); const vvd = findSibling(stem, '.vvd'), vtx = findVTX(stem);
    if (!vvd && !vtx) continue;
    const mi = realPath.toLowerCase().indexOf('models/');
    MODELS.push({ name: file.name, path: realPath, label: mi >= 0 ? realPath.slice(mi + 7) : realPath, lc: realPath.toLowerCase(),
      game: gameOf(rec), mdlFile: file, vvdFile: vvd, vtxFile: vtx, phyFile: findSibling(stem, '.phy') });
  }
  MODELS.sort((a, b) => a.lc < b.lc ? -1 : a.lc > b.lc ? 1 : 0);
  if (!MODELS.length){
    document.getElementById('sEmpty').style.display = ''; document.getElementById('secModel').style.display = 'none'; document.getElementById('secOpts').style.display = 'none'; document.getElementById('secStats').style.display = 'none'; return;
  }
  document.getElementById('sEmpty').style.display = 'none'; document.getElementById('secModel').style.display = ''; document.getElementById('secOpts').style.display = ''; document.getElementById('secStats').style.display = '';
  ensureModelUI(); Games.refresh(); ensureGalleryButton(); ensureExportButtons(); _thumbCache.clear();
  applyModelFilter();
  const keep = prevPath ? MODELS.findIndex(m => m.path === prevPath) : -1;
  if (keep >= 0 && VIEW.includes(keep)){ curIdx = keep; renderModelOptions(); return; }
  curIdx = VIEW.length ? VIEW[0] : 0; renderModelOptions();
  if (VIEW.length) loadCurrentModel();
}

function renderModelStats(d){
  _lastModelStats = d; const el = document.getElementById('stats'); if (!d) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div><span>${t('stat_file')}</span><span>${d.name}</span></div>
    <div><span>${t('stat_mdl')}</span><span>v${d.mdlVersion}</span></div>
    <div><span>${t('stat_type')}</span><span>${d.type || '—'}</span></div>
    <div><span>${t('stat_bones')}</span><span>${d.bones}</span></div>
    <div><span>${t('stat_attach')}</span><span>${d.attach ?? 0}</span></div>
    <div><span>${t('stat_hitbox')}</span><span>${d.hitbox ?? 0}</span></div>
    <div><span>${t('stat_meshes')}</span><span>${d.meshes}</span></div>
    <div><span>${t('stat_verts')}</span><span>${d.verts.toLocaleString(LANG)}</span></div>
    <div><span>${t('stat_tris')}</span><span>${d.tris.toLocaleString(LANG)}</span></div>
    <div><span>${t('stat_mats')}</span><span>${d.mats}</span></div>
    <div><span>${t('stat_mode')}</span><span>${d.mode}</span></div>
    <div><span>${t('stat_layout')}</span><span>${d.layout}</span></div>
    <div><span>${t('stat_phy')}</span><span>${d.phy}</span></div>`;
}

function currentSkinFamily(){
  const el = document.getElementById('skinFamilySel');
  return el ? (parseInt(el.value, 10) | 0) : 0;
}

function updateSkinFamilyUI(mdl){
  const el = document.getElementById('skinFamilySel');
  if (!el) return;
  const fams = mdl.skinFamilies || [];
  if (fams.length > 1){
    el.style.display = '';
    el.innerHTML = fams.map((_, i) => `<option value="${i}">Skin ${i}</option>`).join('');
    el.value = String(Math.min(currentSkinFamily(), fams.length - 1));
    if (!el._boundSkin){
      el.addEventListener('change', () => { if (lastEntry) loadCurrentModel(); });
      el._boundSkin = true;
    }
  } else {
    el.style.display = 'none';
  }
}

async function loadCurrentModel(){
  const entry = MODELS[curIdx]; if (!entry) return;
  const token = ++_modelLoadToken;
  lastEntry = entry; TexStore.preferGame = entry.game || null; resetSkinState(); clearModelScene();
  document.getElementById('vLoad').classList.add('show');
  try {
    if (!entry.vvdFile || !entry.vtxFile) throw new Error('need .vvd and .vtx');
    const [mB, vB, xB] = await Promise.all([entry.mdlFile.arrayBuffer(), entry.vvdFile.arrayBuffer(), entry.vtxFile.arrayBuffer()]);
    if (token !== _modelLoadToken) return;

    const mdl = parseMDL(mB), vvd = parseVVD(vB);
    const applySkin = mdl.bones.length > 0;
    const skinFam = currentSkinFamily();
    const res = buildModel(mdl, vvd, xB, applySkin, 1024, skinFam, entry);
    if (token !== _modelLoadToken) return;

    updateSkinFamilyUI(mdl);

    const { group, stats, layout, skinning } = res;
    if (!stats.meshes) throw new Error('cannot build geometry');
    currentModelRoot = group; modelScene.add(group);
    try {
      const rig = attachRig(mdl, vvd, group);
      if (rig) loadAnimations(mB, entry.path, resolveAnimBuf)
        .then(data => { if (token === _modelLoadToken) animSetup(rig, data); })
        .catch(e => console.warn('[anim]', e));
    } catch (e) { console.warn('[rig]', e); }
    let phyInfo = '—';
    if (entry.phyFile){
      try {
        const phyBuf = await entry.phyFile.arrayBuffer();
        if (token !== _modelLoadToken) return;
        const phy = parsePHY(phyBuf);
        let h = 0; const g = new THREE.Group(); g.rotation.x = -Math.PI / 2;
        for (const s of phy.solids) for (const pts of s){ if (pts.length < 4) continue; try { g.add(new THREE.Mesh(new ConvexGeometry(pts), new THREE.MeshBasicMaterial({ color: 0xffb84d, wireframe: true, transparent: true, opacity: 0.85 }))); h++; } catch (_) {} }
        phyRoot = g; g.visible = showPhy; modelScene.add(g); phyInfo = `${phy.solidCount} · ${h} hull`;
      } catch (e) { phyInfo = t('phy_error'); }
    }

    const mtype = mdl.isStaticProp ? 'static prop'
                : mdl.isEntityModel ? 'entity/NPC'
                : 'dynamic';

    const sl = skinning.enabled ? t('mode_skin', { n: skinning.bones }) : t('mode_bind');
    renderModelStats({
      name: mdl.name || entry.name,
      mdlVersion: mdl.version,
      bones: mdl.bones.length,
      meshes: stats.meshes,
      verts: stats.verts,
      tris: stats.tris,
      mats: mdl.textures.length,
      mode: sl,
      layout: layout,
      phy: phyInfo,
      type: mtype,
      attach: mdl.attachments.length,
      hitbox: mdl.hitboxSets.reduce((n, s) => n + s.boxes.length, 0)
    });
    if (document.getElementById('chkFit').checked) frameObject(group); applyModelWireframe();
  } catch (err) {
    if (token !== _modelLoadToken) return;
    renderModelStats(null); document.getElementById('stats').innerHTML = `<div><span style="color:#f85149">${t('error', { msg: '' })}</span><span>${err.message}</span></div>`;
  } finally {
    if (token === _modelLoadToken) document.getElementById('vLoad').classList.remove('show');
  }
}
function applyModelWireframe(){ if (!currentModelRoot) return; currentModelRoot.traverse(o => { if (o.isMesh && o.material) o.material.wireframe = showWire; }); }

/* ================================================================
   ENTITY MODEL LOADER (для VMF-просмотрщика)
   ================================================================ */
const _modelExistsCache = new Map();
const _animInspectCache = new Map();

function normModelPath(p){
  let s = String(p || '').replace(/\\/g, '/').toLowerCase().replace(/\.mdl$/, '');
  s = s.replace(/^\/+/, '');
  const idx = s.lastIndexOf('models/');
  if (idx >= 0) return s.slice(idx);
  return s;
}

function findModelFiles(mdlPath){
  const norm = normModelPath(mdlPath);
  if (!norm) return null;
  const targetWithExt = norm + '.mdl';
  let entry = FILE_MAP.get(targetWithExt);
  let stem = norm;
  if (!entry){
    const hit = MDL_BY_TAIL.get(targetWithExt);
    if (hit){ entry = hit.v; stem = hit.key.replace(/\.mdl$/, ''); }
  }
  if (!entry) return null;
  const vvdEntry = FILE_MAP.get(stem + '.vvd');
  const vtxEntry = findVTX(stem);
  if (!vvdEntry || !vtxEntry) return null;
  return { mdlFile: entry, vvdFile: vvdEntry, vtxFile: vtxEntry, stem };
}

export function hasModelForPath(mdlPath){
  if (!mdlPath) return false;
  const key = mdlPath.toLowerCase();
  if (_modelExistsCache.has(key)) return _modelExistsCache.get(key);
  const v = findModelFiles(mdlPath) !== null;
  _modelExistsCache.set(key, v);
  return v;
}

export async function buildModelFromPath(mdlPath, opts = {}){
  const files = findModelFiles(mdlPath);
  if (!files) return null;
  try {
    const [mB, vB, xB] = await Promise.all([
      files.mdlFile.arrayBuffer(),
      files.vvdFile.arrayBuffer(),
      files.vtxFile.arrayBuffer()
    ]);
    const mdl = parseMDL(mB);
    const vvd = parseVVD(vB);
    const modelEntry = { game: gameOf(files.mdlFile._rec), path: files.mdlFile._rec.path };
    const res = buildModel(mdl, vvd, xB, opts.applySkin || false, opts.texSize || 512, opts.skinFamily || 0, modelEntry);
    if (!res.stats || !res.stats.meshes) return null;
    return {
      group:        res.group,
      stats:        res.stats,
      layout:       res.layout,
      skinning:     res.skinning,
      modelName:    mdl.name,
      mdlVersion:   mdl.version,
      mdlFlags:     mdl.flags,
      isStaticProp: mdl.isStaticProp,
      isEntityModel: mdl.isEntityModel,
      bones:        mdl.bones,
      attachments:  mdl.attachments,
      hitboxSets:   mdl.hitboxSets,
      skinFamilies: mdl.skinFamilies,
      bonesCount:   mdl.bones.length,
      hitboxTotal:  mdl.hitboxSets.reduce((n, s) => n + s.boxes.length, 0)
    };
  } catch (e) {
    console.warn('[models] buildModelFromPath failed:', mdlPath, e);
    return null;
  }
}

// Для кат-сцен (cutscene.js): модель со скелетом + данные анимаций. Нужен только .mdl; геометрия (.vvd/.vtx) — по возможности.
// opts.noGeometry — служебные модели (камера-хелпер): строим только данные анимаций и attachments.
export async function loadAnimatedModel(mdlPath, opts = {}){
  const norm = normModelPath(mdlPath); if (!norm) return null;
  const key = norm + '.mdl', hit = FILE_MAP.get(key) || (MDL_BY_TAIL.get(key) || {}).v;
  if (!hit) return null;
  try {
    const mB = await hit.arrayBuffer(), path = (hit._rec && hit._rec.path) || key;
    const mdl = parseMDL(mB);
    const out = { path, mdl: { name: mdl.name, bones: mdl.bones, attachments: mdl.attachments }, group: null, rig: null, data: null };
    out.data = await loadAnimations(mB, path, resolveAnimBuf);
    if (!opts.noGeometry){
      const files = findModelFiles(mdlPath);
      if (files){
        const [vB, xB] = await Promise.all([files.vvdFile.arrayBuffer(), files.vtxFile.arrayBuffer()]);
        const vvd = parseVVD(vB);
        const res = buildModel(mdl, vvd, xB, mdl.bones.length > 0, opts.texSize || 512, opts.skinFamily || 0, { game: gameOf(files.mdlFile._rec), path: files.mdlFile._rec.path });
        if (res.stats && res.stats.meshes){ out.group = res.group; out.rig = attachRig(mdl, vvd, res.group); }
      }
    }
    return out;
  } catch (e) { console.warn('[models] loadAnimatedModel failed:', mdlPath, e); return null; }
}

// Быстрое чтение списка анимаций/костей/attachments без загрузки геометрии (.vvd/.vtx).
// Результат мемоизируется по нормализованному пути модели.
export async function inspectModelAnims(mdlPath){
  const norm = normModelPath(mdlPath);
  if (!norm) return null;
  if (_animInspectCache.has(norm)) return _animInspectCache.get(norm);
  const key = norm + '.mdl', hit = FILE_MAP.get(key) || (MDL_BY_TAIL.get(key) || {}).v;
  if (!hit) return null;
  const p = (async () => {
    try {
      const mB = await hit.arrayBuffer();
      const path = (hit._rec && hit._rec.path) || key;
      const mdl = parseMDL(mB);
      const data = await loadAnimations(mB, path, resolveAnimBuf);
      const seqs = (data && data.seqs ? data.seqs : [])
        .filter(s => !s.delta)
        .map(s => ({ name: s.name, fps: s.fps || 30, numframes: s.numframes || 1, loop: !!s.loop }));
      return { path, bones: mdl.bones, attachments: mdl.attachments, seqs };
    } catch (e) {
      console.warn('[models] inspectModelAnims:', mdlPath, e);
      return null;
    }
  })();
  _animInspectCache.set(norm, p);
  return p;
}

/* === ГАЛЕРЕЯ МОДЕЛЕЙ === */

/* === ГАЛЕРЕЯ МОДЕЛЕЙ === */


const GAL_TXT = {
  ru: { btn: '🖼 Галерея моделей', title: 'Модели', search: 'Поиск…', close: 'Закрыть', nomodel: 'нет .vvd/.vtx' },
  en: { btn: '🖼 Model gallery', title: 'Models', search: 'Search…', close: 'Close', nomodel: 'no .vvd/.vtx' }
};
const galT = k => (GAL_TXT[LANG] || GAL_TXT.en)[k];
const _sleep = ms => new Promise(r => setTimeout(r, ms));
const _thumbCache = new Map();
let _thumbRenderer = null, _thumbScene = null, _thumbCam = null, _thumbQueue = Promise.resolve();
let _galEl = null, _galObserver = null;

const entryKey = e => (e.mdlFile && e.mdlFile._rec && e.mdlFile._rec.path) || e.name;

function ensureThumbRenderer(){
  if (_thumbRenderer) return;
  _thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  _thumbRenderer.setPixelRatio(1);
  _thumbRenderer.setSize(256, 256, false);
  _thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
  _thumbRenderer.setClearColor(0x000000, 0);
  _thumbScene = new THREE.Scene();
  _thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 2.2));
  const d1 = new THREE.DirectionalLight(0xffffff, 2.4); d1.position.set(3, 5, 4); _thumbScene.add(d1);
  const d2 = new THREE.DirectionalLight(0xaabbff, 1.0); d2.position.set(-4, 2, -3); _thumbScene.add(d2);
  _thumbCam = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
}

async function renderThumb(entry){
  if (!entry.vvdFile || !entry.vtxFile) return '';
  const [mB, vB, xB] = await Promise.all([entry.mdlFile.arrayBuffer(), entry.vvdFile.arrayBuffer(), entry.vtxFile.arrayBuffer()]);
  const mdl = parseMDL(mB), vvd = parseVVD(vB);
  const res = buildModel(mdl, vvd, xB, false, 256, 0, entry);
  if (!res.stats || !res.stats.meshes){ disposeGroup(res.group); return ''; }
  ensureThumbRenderer();
  _thumbScene.add(res.group);
  try {
    const pending = () => { let p = false; res.group.traverse(o => { const m = o.material; if (m && m.userData && m.userData.texPath && !m.map) p = true; }); return p; };
    for (let i = 0; i < 12 && pending(); i++) await _sleep(80);
    await _sleep(40);
    const box = new THREE.Box3().setFromObject(res.group);
    if (box.isEmpty()) return '';
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const r = (Math.max(sz.x, sz.y, sz.z) * 0.5) || 1;
    const dist = (r / Math.tan(THREE.MathUtils.degToRad(35) / 2)) * 1.25;
    _thumbCam.position.copy(c).addScaledVector(new THREE.Vector3(1, 0.55, 1.2).normalize(), dist);
    _thumbCam.near = dist / 100; _thumbCam.far = dist * 20; _thumbCam.updateProjectionMatrix(); _thumbCam.lookAt(c);
    _thumbRenderer.render(_thumbScene, _thumbCam);
    return _thumbRenderer.domElement.toDataURL('image/png');
  } finally {
    _thumbScene.remove(res.group); disposeGroup(res.group);
  }
}

function nearViewport(el){
  const g = document.getElementById('galGrid'); if (!g || !el.isConnected) return false;
  const r = el.getBoundingClientRect(), gr = g.getBoundingClientRect();
  return r.bottom > gr.top - 300 && r.top < gr.bottom + 300;
}
function queueThumb(idx, imgEl){
  const entry = MODELS[idx]; if (!entry) return;
  const key = entryKey(entry);
  if (_thumbCache.has(key)){ applyThumb(imgEl, _thumbCache.get(key)); return; }
  _thumbQueue = _thumbQueue.then(async () => {
    if (!imgEl.isConnected) return;
    if (!_thumbCache.has(key) && !nearViewport(imgEl)){
      if (_galObserver) _galObserver.observe(imgEl);
      return;
    }
    let url = '';
    if (_thumbCache.has(key)) url = _thumbCache.get(key);
    else { try { url = await renderThumb(entry); } catch (e) { console.warn('[gallery] thumb', key, e); } _thumbCache.set(key, url); }
    applyThumb(imgEl, url);
  });
}
function applyThumb(el, url){
  if (url){ el.style.backgroundImage = `url(${url})`; el.classList.add('ready'); }
  else { el.classList.add('fail'); }
}

function injectGalleryStyle(){
  if (document.getElementById('galStyle')) return;
  const st = document.createElement('style'); st.id = 'galStyle';
  st.textContent = `
  #galBtn{width:100%;margin-top:8px;padding:10px 12px;border-radius:10px;border:1px solid #2b3a52;background:#16202e;color:#dbe6f5;font:inherit;cursor:pointer}
  #galOv{position:fixed;inset:0;z-index:9999;background:rgba(5,7,10,.96);display:none;flex-direction:column;padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}
  #galOv.open{display:flex}
  #galHead{display:flex;gap:8px;align-items:center;padding:12px}
  #galHead b{font-size:16px;color:#e6eefb;margin-right:auto}
  #galSearch{flex:1 1 100%;order:3;padding:10px 12px;border-radius:10px;border:1px solid #2b6bd6;background:#0d1117;color:#e6eefb;font:inherit;outline:none}
  #galHead{flex-wrap:wrap}
  #galGame{padding:8px 10px;border-radius:10px;border:1px solid #2b3a52;background:#16202e;color:#dbe6f5;font:inherit;max-width:240px}
  #galClose{padding:8px 14px;border-radius:10px;border:1px solid #2b3a52;background:#16202e;color:#dbe6f5;font:inherit;cursor:pointer}
  #galGrid{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));grid-auto-rows:max-content;gap:10px;padding:0 12px 16px;align-content:start}
  .galCard{background:#121923;border:1px solid #232f42;border-radius:12px;overflow:hidden;cursor:pointer;display:block;min-width:0;content-visibility:auto;contain-intrinsic-size:auto 190px}
  .galCard.active{border-color:#4d8cff;box-shadow:0 0 0 1px #4d8cff inset}
  .galThumb{position:relative;display:block;width:100%;height:0;padding-bottom:100%;background:#0a0e14 center/contain no-repeat;color:#44546b;font-size:22px;text-align:center}
  .galThumb.fail{line-height:0;padding-bottom:100%}
  .galThumb.fail::after{content:'∅';position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
  .galThumb:not(.ready):not(.fail){background-image:linear-gradient(90deg,#0a0e14,#141c28,#0a0e14);background-size:200% 100%;animation:galSh 1.2s linear infinite}
  @keyframes galSh{from{background-position:200% 0}to{background-position:-200% 0}}
  .galName{padding:7px 9px;font-size:12px;color:#c9d6ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
  .galName small{color:#e0a050}`;
  document.head.appendChild(st);
}

let _galList = [], _galShown = 0, _galSearchT = null;
const GAL_PAGE = 120;
function buildGalleryOverlay(){
  if (_galEl) return _galEl;
  injectGalleryStyle();
  _galEl = document.createElement('div'); _galEl.id = 'galOv';
  _galEl.innerHTML = `<div id="galHead"><b id="galTitle"></b><select id="galGame"></select><button id="galClose"></button><input id="galSearch" type="search"></div><div id="galGrid"></div>`;
  document.body.appendChild(_galEl);
  _galEl.querySelector('#galClose').addEventListener('click', closeGallery);
  bindGameSelect(_galEl.querySelector('#galGame'), 'mdl');
  _galEl.querySelector('#galSearch').addEventListener('input', () => { clearTimeout(_galSearchT); _galSearchT = setTimeout(galRender, 150); });
  const grid = _galEl.querySelector('#galGrid');
  grid.addEventListener('scroll', () => { if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 800) galMore(); }, { passive: true });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && _galEl.classList.contains('open')) closeGallery(); });
  return _galEl;
}
function galRender(){
  const ov = _galEl; if (!ov) return;
  const q = ov.querySelector('#galSearch').value.trim().toLowerCase(), g = Games.current;
  _galList = [];
  for (let i = 0; i < MODELS.length; i++){
    const m = MODELS[i];
    if (g !== 'all' && m.game !== g) continue;
    if (q && !m.lc.includes(q)) continue;
    _galList.push(i);
  }
  ov.querySelector('#galTitle').textContent = `${galT('title')} (${_galList.length.toLocaleString(LANG)} / ${MODELS.length.toLocaleString(LANG)})`;
  const grid = ov.querySelector('#galGrid'); grid.textContent = ''; grid.scrollTop = 0; _galShown = 0;
  if (_galObserver) _galObserver.disconnect();
  _galObserver = new IntersectionObserver(entries => {
    for (const en of entries){
      if (!en.isIntersecting) continue;
      const th = en.target; _galObserver.unobserve(th);
      queueThumb(parseInt(th.dataset.idx, 10), th);
    }
  }, { root: grid, rootMargin: '120px' });
  galMore();
}
function galMore(){
  if (!_galEl || _galShown >= _galList.length) return;
  const grid = _galEl.querySelector('#galGrid'), end = Math.min(_galList.length, _galShown + GAL_PAGE);
  const frag = document.createDocumentFragment(), ths = [];
  for (let k = _galShown; k < end; k++){
    const i = _galList[k], m = MODELS[i];
    const card = document.createElement('div'); card.className = 'galCard' + (i === curIdx ? ' active' : ''); card.title = m.label;
    const th = document.createElement('div'); th.className = 'galThumb'; th.dataset.idx = i; ths.push(th);
    const nm = document.createElement('div'); nm.className = 'galName'; nm.textContent = m.name;
    if (!(m.vvdFile && m.vtxFile)){ const w = document.createElement('small'); w.textContent = ' ⚠'; w.title = galT('nomodel'); nm.appendChild(w); }
    card.append(th, nm);
    card.addEventListener('click', () => { selectModel(i); closeGallery(); });
    frag.appendChild(card);
  }
  grid.appendChild(frag); _galShown = end;
  for (const th of ths) _galObserver.observe(th);
  requestAnimationFrame(() => { if (_galShown < _galList.length && grid.scrollHeight < grid.clientHeight + 600) galMore(); });
}
function openGallery(){
  const ov = buildGalleryOverlay();
  ov.querySelector('#galClose').textContent = galT('close');
  ov.querySelector('#galSearch').placeholder = galT('search');
  ov.querySelector('#galSearch').value = '';
  ov.classList.add('open');
  galRender();
}
function closeGallery(){
  if (_galEl) _galEl.classList.remove('open');
  if (_galObserver) _galObserver.disconnect();
}

function ensureGalleryButton(){
  injectGalleryStyle();
  let btn = document.getElementById('galBtn');
  if (!btn){
    const sel = document.getElementById('modelSel'); if (!sel) return;
    btn = document.createElement('button'); btn.id = 'galBtn'; btn.type = 'button';
    sel.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', openGallery);
  }
  btn.textContent = galT('btn');
}
window.addEventListener('langchange', () => { const b = document.getElementById('galBtn'); if (b) b.textContent = galT('btn'); });

/* === АНИМАЦИЯ МОДЕЛИ (sequences из .mdl / .ani / include-моделей) === */
const AT = {
  ru: { title: 'Анимация', none: '— без анимации (bind pose) —', search: 'Поиск анимации…', loop: 'Цикл', speed: 'Скорость',
        count: '{n} анимаций', unsup: ' · не поддержано: {n}', frame: 'кадр', empty: 'Ничего не найдено', play: 'Играть / пауза',
        glb: '💾 GLB + анимация', gif: '🖼 GIF', vid: '🎥 Видео', pick: 'Сначала выберите анимацию', single: 'У этой анимации один кадр — записывать нечего', novideo: 'Браузер не поддерживает запись видео', err: 'Ошибка' },
  en: { title: 'Animation', none: '— none (bind pose) —', search: 'Search animation…', loop: 'Loop', speed: 'Speed',
        count: '{n} animations', unsup: ' · unsupported: {n}', frame: 'frame', empty: 'Nothing found', play: 'Play / pause',
        glb: '💾 GLB + animation', gif: '🖼 GIF', vid: '🎥 Video', pick: 'Select an animation first', single: 'This animation has a single frame — nothing to record', novideo: 'This browser cannot record video', err: 'Error' }
};
const aT = (k, p) => { let v = (AT[LANG] || AT.en)[k]; if (p) for (const x in p) v = v.replace('{' + x + '}', p[x]); return v; };
const ANIM_OPT_CAP = 500;
let ANIM = null, _animFilter = '';

function resolveAnimBuf(path){
  const key = String(path || '').replace(/\\/g, '/').toLowerCase();
  let f = FILE_MAP.get(key);
  if (!f){
    const i = key.indexOf('models/'), tail = i >= 0 ? key.slice(i) : key;
    if (key.endsWith('.ani')) f = ANI_BY_TAIL.get(tail);
    else { const h = MDL_BY_TAIL.get(tail); f = h && h.v; }
  }
  return f ? f.arrayBuffer() : Promise.resolve(null);
}

// Превращает статичные меши в SkinnedMesh + создаёт иерархию Bone (как при экспорте GLB), чтобы можно было анимировать на GPU.
function attachRig(mdl, vvd, group){
  const nb = mdl.bones.length; if (!nb) return null;
  const worldM = mdl.bones.map(bn => { const w = invertRigid3x4(bn.poseToBone); return new THREE.Matrix4().set(w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7], w[8], w[9], w[10], w[11], 0, 0, 0, 1); });
  const bones = [], bindPos = new Float32Array(nb * 3), bindQuat = new Float32Array(nb * 4);
  for (let i = 0; i < nb; i++){
    const bn = mdl.bones[i], bone = new THREE.Bone(); bone.name = String(bn.name || ('bone' + i));
    const hasP = bn.parent >= 0 && bn.parent < i;
    const local = hasP ? worldM[bn.parent].clone().invert().multiply(worldM[i]) : worldM[i].clone();
    local.decompose(bone.position, bone.quaternion, bone.scale);
    bindPos.set([bone.position.x, bone.position.y, bone.position.z], i * 3);
    bindQuat.set([bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w], i * 4);
    if (hasP) bones[bn.parent].add(bone); else group.add(bone);
    bones.push(bone);
  }
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones), made = [];
  for (const m of group.children.filter(o => o.isMesh)){
    const g = m.geometry, ids = g.userData.vvdIds;
    if (!ids || ids.length !== g.attributes.position.count) continue;
    const cnt = ids.length, si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
    for (let k = 0; k < cnt; k++){
      const v = vvdVertex(vvd, ids[k]); let tot = 0, n = 0;
      if (v) for (let j = 0; j < Math.min(3, v.nBones); j++){ const w = v.weights[j]; if (w > 0 && v.boneIds[j] < nb){ si[k * 4 + n] = v.boneIds[j]; sw[k * 4 + n] = w; tot += w; n++; } }
      if (!n){ si[k * 4] = 0; sw[k * 4] = 1; tot = 1; }
      for (let j = 0; j < 4; j++) sw[k * 4 + j] /= tot;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const sm = new THREE.SkinnedMesh(g, m.material); sm.frustumCulled = false; made.push([m, sm]);
  }
  if (!made.length){ bones.forEach(b => b.parent && b.parent.remove(b)); skeleton.dispose(); return null; }
  for (const [m, sm] of made){ group.remove(m); group.add(sm); sm.updateMatrixWorld(true); sm.bind(skeleton); }
  return { bones, skeleton, bindPos, bindQuat, nb };
}

function applyPose(pos, quat){
  const b = ANIM.rig.bones;
  for (let i = 0; i < b.length; i++){
    b[i].position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    b[i].quaternion.set(quat[i * 4], quat[i * 4 + 1], quat[i * 4 + 2], quat[i * 4 + 3]);
  }
}
function animDuration(seq){ return seq.numframes > 1 ? (seq.numframes - 1) / seq.fps : 0; }
function animEl(id){ return document.getElementById(id); }

function animReset(){
  if (ANIM && ANIM.rig){ try { ANIM.rig.skeleton.dispose(); } catch (_) {} }
  ANIM = null;
  const sec = animEl('secAnim'); if (sec) sec.style.display = 'none';
}

function animSetup(rig, data){
  const seqs = data.seqs.filter(s => !s.delta);           // delta = аддитивные слои, сами по себе не показываются
  if (!seqs.length) return;
  const mainBones = data.bones;
  ANIM = { rig, data, seqs, view: [], cur: -1, playing: false, time: 0, speed: 1, loop: true, scrub: false, mainBones, unsupported: data.unsupported };
  ensureAnimUI();
  animEl('animQ').value = ''; _animFilter = '';
  animEl('animLoop').checked = true; animEl('animSpeed').value = '1';
  renderAnimOptions();
  animEl('secAnim').style.display = '';
  updateAnimControls();
}

function renderAnimOptions(){
  if (!ANIM) return;
  const q = _animFilter; ANIM.view = [];
  for (let i = 0; i < ANIM.seqs.length; i++) if (!q || ANIM.seqs[i].name.toLowerCase().includes(q)) ANIM.view.push(i);
  const sel = animEl('animSel'), frag = document.createDocumentFragment();
  const none = document.createElement('option'); none.value = '-1'; none.textContent = aT('none'); frag.appendChild(none);
  const n = Math.min(ANIM.view.length, ANIM_OPT_CAP);
  for (let k = 0; k < n; k++){
    const s = ANIM.seqs[ANIM.view[k]], o = document.createElement('option');
    o.value = String(ANIM.view[k]); o.textContent = s.name + ' · ' + s.numframes + 'f'; frag.appendChild(o);
  }
  sel.textContent = ''; sel.appendChild(frag); sel.value = String(ANIM.cur);
  if (sel.value !== String(ANIM.cur)) sel.value = '-1';
  animEl('animInfo').textContent = (ANIM.view.length ? aT('count', { n: ANIM.view.length.toLocaleString(LANG) }) : aT('empty')) + (ANIM.unsupported ? aT('unsup', { n: ANIM.unsupported }) : '');
}

function selectAnim(i){
  if (!ANIM) return;
  ANIM.cur = i; ANIM.time = 0;
  if (i < 0){ ANIM.playing = false; applyPose(ANIM.rig.bindPos, ANIM.rig.bindQuat); }
  else { ANIM.playing = true; applyPose(...poseAt(ANIM.seqs[i], 0)); }
  updateAnimControls();
}
function poseAt(seq, time){
  const p = samplePose(seq, ANIM.rig.nb, ANIM.mainBones, time, false);
  return [p.pos, p.quat];
}

function updateAnimControls(){
  if (!ANIM) return;
  const on = ANIM.cur >= 0, seq = on ? ANIM.seqs[ANIM.cur] : null;
  const btn = animEl('animPlay'); btn.textContent = ANIM.playing ? '⏸' : '▶'; btn.disabled = !on;
  const sl = animEl('animSlider'); sl.disabled = !on || animDuration(seq) <= 0;
  if (!ANIM.scrub) sl.value = String(on && animDuration(seq) > 0 ? Math.round(ANIM.time / animDuration(seq) * 1000) : 0);
  const fr = animEl('animFrame');
  fr.textContent = on ? (aT('frame') + ' ' + (Math.min(seq.numframes - 1, Math.floor(ANIM.time * seq.fps + 1e-6)) + 1) + ' / ' + seq.numframes + ' · ' + Math.round(seq.fps) + ' fps') : '';
}

function stepAnim(dt){
  if (!ANIM || ANIM.cur < 0 || ANIM.recording) return;
  const seq = ANIM.seqs[ANIM.cur], dur = animDuration(seq);
  if (ANIM.playing && dur > 0){
    ANIM.time += dt * ANIM.speed;
    if (ANIM.time >= dur){
      if (ANIM.loop) ANIM.time %= dur;
      else { ANIM.time = dur; ANIM.playing = false; }
    }
  } else if (!ANIM.scrub && !ANIM.dirty) return;                 // на паузе без изменений — ничего не пересчитываем
  ANIM.dirty = false;
  applyPose(...poseAt(seq, ANIM.time));
  updateAnimControls();
}

function ensureAnimUI(){
  if (animEl('secAnim')) { refreshAnimTexts(); return; }
  const anchor = animEl('secModel'); if (!anchor) return;
  const sec = document.createElement('div'); sec.className = 's-section'; sec.id = 'secAnim'; sec.style.display = 'none';
  sec.innerHTML = '<h3 id="animTitle"></h3>' +
    '<input id="animQ" type="search" class="s-select" style="margin-bottom:6px">' +
    '<select id="animSel" class="s-select"></select>' +
    '<div style="display:flex;gap:8px;align-items:center;margin-top:8px">' +
      '<button type="button" id="animPlay" style="width:42px;padding:8px 0;border-radius:10px;border:1px solid #2b3a52;background:#16202e;color:#dbe6f5;font:inherit;cursor:pointer"></button>' +
      '<input id="animSlider" type="range" min="0" max="1000" value="0" style="flex:1;min-width:0">' +
    '</div>' +
    '<div id="animFrame" style="font-size:11.5px;color:#8a93a8;margin-top:4px"></div>' +
    '<div style="display:flex;gap:12px;align-items:center;margin-top:6px;font-size:12.5px">' +
      '<label class="s-check" style="margin:0"><input type="checkbox" id="animLoop" checked> <span id="animLoopLbl"></span></label>' +
      '<label style="display:flex;gap:6px;align-items:center;margin-left:auto"><span id="animSpeedLbl"></span>' +
      '<select id="animSpeed" class="s-select" style="width:auto;margin:0"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>' +
    '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">' +
      ['animGlb', 'animGif', 'animVid'].map((id, i) => '<button type="button" id="' + id + '" style="' + (i ? 'flex:1;' : 'flex:1 1 100%;') + 'padding:10px 8px;border-radius:10px;border:1px solid #2b3a52;background:#16202e;color:#dbe6f5;font:inherit;cursor:pointer;white-space:nowrap"></button>').join('') +
    '<button type="button" id="animSavePose" style="flex:1 1 100%;padding:10px 8px;border-radius:10px;border:1px solid #2b3a52;background:#16202e;color:#dbe6f5;font:inherit;cursor:pointer;white-space:nowrap">💾 Сохранить позу (JSON)</button>' +
    '</div>' +
    '<div id="animInfo" style="font-size:11.5px;color:#8a93a8;margin-top:6px"></div>';
  anchor.insertAdjacentElement('afterend', sec);
  let qT = null;
  animEl('animQ').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { _animFilter = e.target.value.trim().toLowerCase(); renderAnimOptions(); }, 150); });
  animEl('animSel').addEventListener('change', e => selectAnim(parseInt(e.target.value, 10)));
  animEl('animPlay').addEventListener('click', () => {
    if (!ANIM || ANIM.cur < 0) return;
    const dur = animDuration(ANIM.seqs[ANIM.cur]);
    if (!ANIM.playing && ANIM.time >= dur) ANIM.time = 0;      // после окончания без цикла — проиграть заново
    ANIM.playing = !ANIM.playing; updateAnimControls();
  });
  const sl = animEl('animSlider');
  sl.addEventListener('pointerdown', () => { if (ANIM) ANIM.scrub = true; });
  const endScrub = () => { if (ANIM) ANIM.scrub = false; };
  sl.addEventListener('pointerup', endScrub); sl.addEventListener('pointercancel', endScrub); sl.addEventListener('change', endScrub);
  sl.addEventListener('input', () => {
    if (!ANIM || ANIM.cur < 0) return;
    ANIM.playing = false; ANIM.dirty = true;
    ANIM.time = sl.value / 1000 * animDuration(ANIM.seqs[ANIM.cur]);
    stepAnim(0); updateAnimControls();
  });
  animEl('animLoop').addEventListener('change', e => { if (ANIM) ANIM.loop = e.target.checked; });
  animEl('animSpeed').addEventListener('change', e => { if (ANIM) ANIM.speed = parseFloat(e.target.value) || 1; });
  for (const [id, kind] of [['animGlb', 'glb'], ['animGif', 'gif'], ['animVid', 'vid']]){ const b = animEl(id); b.addEventListener('click', () => runAnimJob(b, kind)); }
  animEl('animSavePose').addEventListener('click', () => {
    if (!ANIM || ANIM.cur < 0) { alert('Сначала выбери анимацию.'); return; }
    try {
      const seq = ANIM.seqs[ANIM.cur];
      const pose = samplePose(seq, ANIM.rig.nb, ANIM.mainBones, ANIM.time, false);
      const data = {
        format: 'source-engine-pose', version: 1, animation: seq.name,
        timeSeconds: ANIM.time, frame: Math.max(0, Math.min(seq.numframes - 1, ANIM.time * seq.fps)),
        fps: seq.fps, bones: ANIM.mainBones.map((bone, i) => ({
          name: bone.name, parent: bone.parent,
          position: [pose.pos[i * 3], pose.pos[i * 3 + 1], pose.pos[i * 3 + 2]],
          quaternion: [pose.quat[i * 4], pose.quat[i * 4 + 1], pose.quat[i * 4 + 2], pose.quat[i * 4 + 3]]
        }))
      };
      const safe = String(seq.name || 'pose').replace(/[^\w.-]+/g, '_');
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), exportBaseName() + '_' + safe + '_frame' + (Math.floor(ANIM.time * seq.fps) + 1) + '.json');
    } catch (err) { console.error(err); alert('Не удалось сохранить позу: ' + (err.message || err)); }
  });
  refreshAnimTexts();
  window.addEventListener('langchange', () => { refreshAnimTexts(); if (ANIM) { renderAnimOptions(); updateAnimControls(); } });
}
function refreshAnimTexts(){
  const set = (id, v) => { const el = animEl(id); if (el) el.textContent = v; };
  set('animTitle', '🎬 ' + aT('title')); set('animLoopLbl', aT('loop')); set('animSpeedLbl', aT('speed'));
  const q = animEl('animQ'); if (q) q.placeholder = aT('search');
  const p = animEl('animPlay'); if (p) p.title = aT('play');
  for (const [id, k] of [['animGlb', 'glb'], ['animGif', 'gif'], ['animVid', 'vid']]){ const b = animEl(id); if (b && !b.dataset.busy) b.textContent = aT(k); }
}

/* === ЭКСПОРТ АНИМАЦИИ: GLB + кости + клип, GIF, видео === */
function buildClip(x, seq, A){
  const nb = x.nb, n = seq.numframes, times = new Float32Array(n);
  const pos = new Float32Array(n * nb * 3), quat = new Float32Array(n * nb * 4);
  for (let f = 0; f < n; f++){
    times[f] = f / seq.fps;
    const p = samplePose(seq, A.rig.nb, A.mainBones, (f + 1e-6) / seq.fps, false);
    for (let b = 0; b < nb; b++){
      for (let c = 0; c < 3; c++) pos[(b * n + f) * 3 + c] = p.pos[b * 3 + c];
      let qx = p.quat[b * 4], qy = p.quat[b * 4 + 1], qz = p.quat[b * 4 + 2], qw = p.quat[b * 4 + 3];
      if (f > 0){                                                       // непрерывность знака кватерниона между кадрами
        const o = (b * n + f - 1) * 4;
        if (qx * quat[o] + qy * quat[o + 1] + qz * quat[o + 2] + qw * quat[o + 3] < 0){ qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
      }
      const o = (b * n + f) * 4; quat[o] = qx; quat[o + 1] = qy; quat[o + 2] = qz; quat[o + 3] = qw;
    }
  }
  const tracks = [];
  for (let b = 0; b < nb; b++){                                         // по uuid, т.к. имена костей Source содержат точки (ValveBiped.Bip01_...)
    const id = x.bones[b].uuid;
    tracks.push(new THREE.VectorKeyframeTrack(id + '.position', times, pos.subarray(b * n * 3, (b + 1) * n * 3)));
    tracks.push(new THREE.QuaternionKeyframeTrack(id + '.quaternion', times, quat.subarray(b * n * 4, (b + 1) * n * 4)));
  }
  return new THREE.AnimationClip(String(seq.name).replace(/[^\w.-]+/g, '_'), -1, tracks);
}

async function exportGLBAnim(A, prog){
  const seq = A.seqs[A.cur];
  prog('…');
  const x = await buildExportModel();
  const clip = buildClip(x, seq, A);
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const res = await new Promise((ok, fail) => new GLTFExporter().parse(x.root, ok, fail, { binary: true, onlyVisible: true, maxTextureSize: 2048, animations: [clip] }));
  downloadBlob(new Blob([res], { type: 'model/gltf-binary' }), exportBaseName() + '_' + clip.name + '.glb');
  disposeGroup(x.root);
}

/* ---- GIF-кодировщик (без зависимостей): общая палитра median-cut + LZW ---- */
function gifPalette(hist){
  const cols = []; for (let i = 0; i < 32768; i++) if (hist[i]) cols.push(i);
  const popOf = c => { let s = 0; for (let i = 0; i < c.length; i++) s += hist[c[i]]; return s; };
  const boxes = [{ c: cols, pop: popOf(cols) }];
  while (boxes.length < 256){
    let bi = -1, best = -1;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].c.length > 1 && boxes[i].pop > best){ best = boxes[i].pop; bi = i; }
    if (bi < 0) break;
    const box = boxes[bi]; let rn = 31, rx = 0, gn = 31, gx = 0, bn = 31, bx = 0;
    for (const k of box.c){ const r = k >> 10, g = (k >> 5) & 31, b = k & 31; if (r < rn) rn = r; if (r > rx) rx = r; if (g < gn) gn = g; if (g > gx) gx = g; if (b < bn) bn = b; if (b > bx) bx = b; }
    const dr = rx - rn, dg = gx - gn, db = bx - bn, sh = (dr >= dg && dr >= db) ? 10 : (dg >= db ? 5 : 0);
    box.c.sort((a, b) => ((a >> sh) & 31) - ((b >> sh) & 31));
    let acc = 0, cut = 1; const half = box.pop / 2;
    for (let i = 0; i < box.c.length - 1; i++){ acc += hist[box.c[i]]; cut = i + 1; if (acc >= half) break; }
    const a = box.c.slice(0, cut), b = box.c.slice(cut);
    boxes[bi] = { c: a, pop: popOf(a) }; boxes.push({ c: b, pop: popOf(b) });
  }
  const pal = new Uint8Array(768);
  boxes.forEach((box, i) => {
    let r = 0, g = 0, b = 0, w = 0;
    for (const k of box.c){ const h = hist[k]; r += (k >> 10) * h; g += ((k >> 5) & 31) * h; b += (k & 31) * h; w += h; }
    w = w || 1; pal[i * 3] = Math.round(r / w * 255 / 31); pal[i * 3 + 1] = Math.round(g / w * 255 / 31); pal[i * 3 + 2] = Math.round(b / w * 255 / 31);
  });
  return pal;
}
class GifWriter {
  constructor(w, h, pal){
    this.w = w; this.h = h; this.pal = pal; this.parts = [];
    this.lut = new Int16Array(32768).fill(-1);
    this.codes = new Int32Array(1 << 20); this.stamp = new Int32Array(1 << 20); this.cur = 0;
    const hd = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8, 0xF7, 0, 0];
    this.parts.push(new Uint8Array(hd), pal);
    this.parts.push(new Uint8Array([0x21, 0xFF, 0x0B, ...'NETSCAPE2.0'.split('').map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0]));
  }
  nearest(key){
    let v = this.lut[key]; if (v >= 0) return v;
    const r = (key >> 10) * 255 / 31, g = ((key >> 5) & 31) * 255 / 31, b = (key & 31) * 255 / 31, p = this.pal; let bd = 1e9; v = 0;
    for (let i = 0; i < 256; i++){ const dr = p[i * 3] - r, dg = p[i * 3 + 1] - g, db = p[i * 3 + 2] - b, d = dr * dr + dg * dg + db * db; if (d < bd){ bd = d; v = i; } }
    return (this.lut[key] = v);
  }
  addFrame(rgba, delayCs){
    const n = this.w * this.h, idx = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) idx[i] = this.nearest(((rgba[p] >> 3) << 10) | ((rgba[p + 1] >> 3) << 5) | (rgba[p + 2] >> 3));
    const out = [0x21, 0xF9, 4, 0x04, delayCs & 255, delayCs >> 8, 0, 0, 0x2C, 0, 0, 0, 0, this.w & 255, this.w >> 8, this.h & 255, this.h >> 8, 0, 8];
    const bytes = this.lzw(idx);
    const head = new Uint8Array(out); const body = new Uint8Array(bytes.length + Math.ceil(bytes.length / 255) + 1);
    let o = 0; for (let i = 0; i < bytes.length; i += 255){ const m = Math.min(255, bytes.length - i); body[o++] = m; body.set(bytes.subarray(i, i + m), o); o += m; }
    body[o++] = 0; this.parts.push(head, body.subarray(0, o));
  }
  lzw(idx){
    const CLEAR = 256, EOI = 257; let next = 258, size = 9, bits = 0, acc = 0, stamp = ++this.cur;
    const buf = []; const emit = c => { acc |= c << bits; bits += size; while (bits >= 8){ buf.push(acc & 255); acc >>>= 8; bits -= 8; } };
    const codes = this.codes, st = this.stamp;
    emit(CLEAR); let prefix = idx[0];
    for (let i = 1; i < idx.length; i++){
      const k = idx[i], key = (prefix << 8) | k;
      if (st[key] === stamp){ prefix = codes[key]; continue; }
      emit(prefix);
      if (next === 4096){ emit(CLEAR); next = 258; size = 9; stamp = ++this.cur; }
      else { if (next >= (1 << size)) size++; codes[key] = next++; st[key] = stamp; }
      prefix = k;
    }
    emit(prefix);
    if (next === 4096){ emit(CLEAR); next = 258; size = 9; } else if (next >= (1 << size)) size++;
    emit(EOI); if (bits > 0) buf.push(acc & 255);
    return Uint8Array.from(buf);
  }
  finish(){ this.parts.push(new Uint8Array([0x3B])); return new Blob(this.parts, { type: 'image/gif' }); }
}

const tickWait = () => new Promise(r => setTimeout(r, 0));
function renderNow(){ modelControls.update(); modelRenderer.render(modelScene, modelCamera); }

async function recordGif(A, prog){
  const seq = A.seqs[A.cur], dur = animDuration(seq);
  if (dur <= 0) throw new Error(aT('single'));
  const FPS = 25, MAX_SEC = 12, speed = A.speed;
  const total = Math.max(2, Math.min(Math.round(dur / speed * FPS), MAX_SEC * FPS));
  const W = Math.min(480, modelCanvas.width), H = Math.max(2, Math.round(W * modelCanvas.height / modelCanvas.width));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d', { willReadFrequently: true });
  const spin = autoRotate && currentModelRoot ? currentModelRoot.rotation.z : null;
  const frameAt = k => {
    A.time = Math.min(dur * 0.9999, k / FPS * speed); applyPose(...poseAt(seq, A.time));
    if (spin !== null) currentModelRoot.rotation.z = spin + 0.012 * k;
    renderNow(); ctx.drawImage(modelCanvas, 0, 0, W, H); return ctx.getImageData(0, 0, W, H).data;
  };
  const hist = new Uint32Array(32768), probe = Math.min(total, 12);
  for (let s = 0; s < probe; s++){                                       // проход 1: палитра по нескольким кадрам
    const d = frameAt(Math.floor(s * total / probe));
    for (let i = 0; i < d.length; i += 4 * 3) hist[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]++;
    if (ANIM !== A) throw new Error('cancelled');
  }
  const gif = new GifWriter(W, H, gifPalette(hist));
  for (let k = 0; k < total; k++){                                       // проход 2: кодирование
    gif.addFrame(frameAt(k), 4);
    if (k % 3 === 0){ prog(Math.round(k / total * 100) + '%'); await tickWait(); if (ANIM !== A) throw new Error('cancelled'); }
  }
  if (spin !== null && currentModelRoot) currentModelRoot.rotation.z = spin;
  downloadBlob(gif.finish(), exportBaseName() + '_' + String(seq.name).replace(/[^\w.-]+/g, '_') + '.gif');
}

async function recordVideo(A, prog){
  if (typeof MediaRecorder === 'undefined' || !modelCanvas.captureStream) throw new Error(aT('novideo'));
  const seq = A.seqs[A.cur], dur = animDuration(seq);
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)); if (!mime) throw new Error(aT('novideo'));
  const cycle = dur > 0 ? dur / A.speed : 2, loops = Math.max(1, Math.min(Math.ceil(3 / cycle), Math.floor(30 / cycle) || 1));
  const ms = Math.round(cycle * loops * 1000);
  const rec = new MediaRecorder(modelCanvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 8e6 }), chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(r => { rec.onstop = r; });
  A.recording = false; A.time = 0; A.loop = true; A.playing = true; updateAnimControls();
  rec.start(250); const t0 = performance.now();
  while (performance.now() - t0 < ms){ prog(Math.round((performance.now() - t0) / ms * 100) + '%'); await new Promise(r => setTimeout(r, 120)); if (ANIM !== A){ rec.stop(); throw new Error('cancelled'); } }
  rec.stop(); await done;
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  downloadBlob(new Blob(chunks, { type: mime.split(';')[0] }), exportBaseName() + '_' + String(seq.name).replace(/[^\w.-]+/g, '_') + '.' + ext);
}

async function runAnimJob(btn, kind){
  const A = ANIM;
  if (!A || A.cur < 0){ alert(aT('pick')); return; }
  if (A.busy) return; A.busy = true;
  const ids = ['animGlb', 'animGif', 'animVid'], setDis = v => ids.forEach(i => { const e = animEl(i); if (e) e.disabled = v; });
  setDis(true); btn.dataset.busy = '1';
  const saved = { time: A.time, playing: A.playing, loop: A.loop };
  const prog = p => { btn.textContent = '⏳ ' + p; };
  A.recording = (kind === 'gif');                                         // на время записи GIF обычный цикл воспроизведения отключён
  try { await ({ glb: exportGLBAnim, gif: recordGif, vid: recordVideo }[kind])(A, prog); }
  catch (e) { if (!(e && e.message === 'cancelled')){ console.error('[anim export]', e); alert(aT('err') + ': ' + (e && e.message || e)); } }
  finally {
    A.recording = false; A.busy = false; A.time = saved.time; A.playing = saved.playing; A.loop = saved.loop; A.dirty = true;
    delete btn.dataset.busy; setDis(false);
    if (ANIM === A){ refreshAnimTexts(); updateAnimControls(); }
  }
}


/* === ЭКСПОРТ МОДЕЛИ (GLB со скелетом / OBJ / SMD) === */
const EXP_TXT = {
  ru: { glb: '💾 GLB + кости', obj: '💾 OBJ', smd: '💾 SMD', none: 'Сначала откройте модель', err: 'Ошибка экспорта', busy: '⏳' },
  en: { glb: '💾 GLB + rig', obj: '💾 OBJ', smd: '💾 SMD', none: 'Open a model first', err: 'Export failed', busy: '⏳' }
};
const expT = k => (EXP_TXT[LANG] || EXP_TXT.en)[k];
function downloadBlob(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function exportBaseName(){ return ((lastEntry && lastEntry.name) || 'model').replace(/\.mdl$/i, '').replace(/[^\w.-]+/g, '_'); }

function fixWinding(g){
  const idx = g.index, pos = g.attributes.position, nrm = g.attributes.normal; if (!idx || !nrm) return;
  const n = Math.floor(idx.count / 3), step = Math.max(1, Math.floor(n / 300));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), gn = new THREE.Vector3(), vn = new THREE.Vector3();
  let vote = 0;
  for (let t = 0; t < n; t += step){
    const ia = idx.getX(t * 3), ib = idx.getX(t * 3 + 1), ic = idx.getX(t * 3 + 2);
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    gn.subVectors(b, a).cross(c.sub(a));
    vn.set(nrm.getX(ia) + nrm.getX(ib) + nrm.getX(ic), nrm.getY(ia) + nrm.getY(ib) + nrm.getY(ic), nrm.getZ(ia) + nrm.getZ(ib) + nrm.getZ(ic));
    vote += Math.sign(gn.dot(vn));
  }
  if (vote < 0){ const arr = idx.array; for (let i = 0; i + 2 < arr.length; i += 3){ const tmp = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = tmp; } idx.needsUpdate = true; }
}

async function buildExportModel(){
  const entry = lastEntry;
  if (!entry || !entry.vvdFile || !entry.vtxFile) throw new Error('need .mdl + .vvd + .vtx');
  const [mB, vB, xB] = await Promise.all([entry.mdlFile.arrayBuffer(), entry.vvdFile.arrayBuffer(), entry.vtxFile.arrayBuffer()]);
  const mdl = parseMDL(mB), vvd = parseVVD(vB);
  const res = buildModel(mdl, vvd, xB, false, 2048, currentSkinFamily(), entry);
  if (!res.stats || !res.stats.meshes) throw new Error('no geometry');
  const root = new THREE.Group(); root.name = exportBaseName(); root.rotation.x = -Math.PI / 2;
  const nb = mdl.bones.length;
  const worldM = mdl.bones.map(bn => { const w = invertRigid3x4(bn.poseToBone); return new THREE.Matrix4().set(w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7], w[8], w[9], w[10], w[11], 0, 0, 0, 1); });
  const locals = [], bones = [], used = new Set();
  for (let i = 0; i < nb; i++){
    const bn = mdl.bones[i], bone = new THREE.Bone();
    let nm = String(bn.name || ('bone' + i)).replace(/\s+/g, '_'); if (used.has(nm)) nm += '_' + i; used.add(nm); bone.name = nm;
    const hasP = bn.parent >= 0 && bn.parent < i;
    const local = hasP ? worldM[bn.parent].clone().invert().multiply(worldM[i]) : worldM[i].clone();
    locals.push(local); local.decompose(bone.position, bone.quaternion, bone.scale);
    if (hasP) bones[bn.parent].add(bone); else root.add(bone);
    bones.push(bone);
  }
  root.updateMatrixWorld(true);
  const skeleton = nb ? new THREE.Skeleton(bones) : null;
  const out = [];
  [...res.group.children].filter(o => o.isMesh).forEach((m, mi) => {
    const g = m.geometry; fixWinding(g);
    const ids = g.userData.vvdIds; delete g.userData.vvdIds;
    const name = (m.material.name || 'mesh') + '_' + mi;
    if (nb && ids && ids.length === g.attributes.position.count){
      const cnt = ids.length, si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
      for (let k = 0; k < cnt; k++){
        const v = vvdVertex(vvd, ids[k]); let tot = 0, n = 0;
        if (v) for (let j = 0; j < Math.min(3, v.nBones); j++){ const w = v.weights[j]; if (w > 0 && v.boneIds[j] < nb){ si[k * 4 + n] = v.boneIds[j]; sw[k * 4 + n] = w; tot += w; n++; } }
        if (!n){ si[k * 4] = 0; sw[k * 4] = 1; tot = 1; }
        for (let j = 0; j < 4; j++) sw[k * 4 + j] /= tot;
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      const sm = new THREE.SkinnedMesh(g, m.material); sm.name = name; sm.frustumCulled = false;
      root.add(sm); sm.updateMatrixWorld(true); sm.bind(skeleton); out.push(sm);
    } else { const mm = new THREE.Mesh(g, m.material); mm.name = name; root.add(mm); out.push(mm); }
  });

  for (let i = 0; i < 30; i++){
    if (!out.some(o => o.material.userData && o.material.userData.texPath && !o.material.map)) break;
    await new Promise(r => setTimeout(r, 100));
  }
  return { mdl, root, meshes: out, bones, locals, nb };
}

async function exportModelGLB(){
  const x = await buildExportModel();
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const res = await new Promise((ok, fail) => new GLTFExporter().parse(x.root, ok, fail, { binary: true, onlyVisible: true, maxTextureSize: 2048 }));
  downloadBlob(new Blob([res], { type: 'model/gltf-binary' }), exportBaseName() + '.glb');
  disposeGroup(x.root);
}

async function exportModelOBJ(){
  const x = await buildExportModel(), root = x.root, base = exportBaseName(); root.updateMatrixWorld(true);
  const out = ['# Source Asset Viewer export', 'mtllib ' + base + '.mtl'];
  const mtls = new Map(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
  let vo = 1, to = 1, no = 1, mi = 0;
  const f = q => (Math.abs(q) < 1e-9 ? 0 : +q.toFixed(5));
  for (const o of x.meshes){
    const g = o.geometry, pos = g.attributes.position, uv = g.attributes.uv, nrm = g.attributes.normal;
    const mat = o.material; const mname = (mat.name || ('mat' + mi)); mi++;
    if (!mtls.has(mname)) mtls.set(mname, mat.color || new THREE.Color(0.8, 0.8, 0.8));
    out.push('o ' + o.name, 'usemtl ' + mname);
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < pos.count; i++){ v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); out.push('v ' + f(v.x) + ' ' + f(v.y) + ' ' + f(v.z)); }
    if (uv) for (let i = 0; i < uv.count; i++) out.push('vt ' + f(uv.getX(i)) + ' ' + f(1 - uv.getY(i)));
    if (nrm) for (let i = 0; i < nrm.count; i++){ n.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize(); out.push('vn ' + f(n.x) + ' ' + f(n.y) + ' ' + f(n.z)); }
    const idx = g.index, cnt = idx ? idx.count : pos.count;
    const ref = k => { const a = vo + k; return (uv && nrm) ? `${a}/${to + k}/${no + k}` : uv ? `${a}/${to + k}` : nrm ? `${a}//${no + k}` : `${a}`; };
    for (let i = 0; i + 2 < cnt; i += 3){
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      out.push('f ' + ref(a) + ' ' + ref(b) + ' ' + ref(c));
    }
    vo += pos.count; if (uv) to += uv.count; if (nrm) no += nrm.count;
  }
  const mtl = ['# Source Asset Viewer export'];
  for (const [name, c] of mtls) mtl.push('newmtl ' + name, `Kd ${f(c.r)} ${f(c.g)} ${f(c.b)}`, 'd 1', '');
  downloadBlob(new Blob([out.join('\n')], { type: 'text/plain' }), base + '.obj');
  setTimeout(() => downloadBlob(new Blob([mtl.join('\n')], { type: 'text/plain' }), base + '.mtl'), 400);
  disposeGroup(x.root);
}

async function exportModelSMD(){
  const x = await buildExportModel(), mdl = x.mdl, base = exportBaseName();
  const f6 = q => (Math.abs(q) < 1e-9 ? '0' : q.toFixed(6));
  const L = ['version 1', 'nodes'];
  if (x.nb) mdl.bones.forEach((b, i) => L.push(`${i} "${x.bones[i].name}" ${(b.parent >= 0 && b.parent < i) ? b.parent : -1}`));
  else L.push('0 "root" -1');
  L.push('end', 'skeleton', 'time 0');
  if (x.nb){
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler();
    x.locals.forEach((m, i) => { m.decompose(p, q, sc); e.setFromQuaternion(q, 'ZYX'); L.push(`${i} ${f6(p.x)} ${f6(p.y)} ${f6(p.z)} ${f6(e.x)} ${f6(e.y)} ${f6(e.z)}`); });
  } else L.push('0 0 0 0 0 0 0');
  L.push('end', 'triangles');
  for (const o of x.meshes){
    const g = o.geometry, pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv, idx = g.index;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const mname = String(o.material.userData.texName || o.material.name || 'material').split('/').pop().replace(/\.vtf$/i, '');
    const vline = k => {
      let links = [], best = 0, bw = -1;
      if (si && sw) for (let j = 0; j < 4; j++){ const w = sw.getComponent(k, j); if (w > 1e-4){ const b = si.getComponent(k, j); links.push(b + ' ' + f6(w)); if (w > bw){ bw = w; best = b; } } }
      if (!links.length){ links = ['0 1.000000']; best = 0; }
      return `${best} ${f6(pos.getX(k))} ${f6(pos.getY(k))} ${f6(pos.getZ(k))} ${f6(nrm.getX(k))} ${f6(nrm.getY(k))} ${f6(nrm.getZ(k))} ${f6(uv ? uv.getX(k) : 0)} ${f6(uv ? 1 - uv.getY(k) : 0)} ${links.length} ${links.join(' ')}`;
    };
    const cnt = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < cnt; i += 3){
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      L.push(mname, vline(a), vline(b), vline(c));
    }
  }
  L.push('end');
  downloadBlob(new Blob([L.join('\n')], { type: 'text/plain' }), base + '.smd');
  disposeGroup(x.root);
}

async function runExport(btn, fn){
  if (!lastEntry){ alert(expT('none')); return; }
  const old = btn.textContent; btn.disabled = true; btn.textContent = expT('busy');
  try { await fn(); } catch (e) { console.error('[export]', e); alert(expT('err') + ': ' + (e && e.message || e)); }
  finally { btn.disabled = false; btn.textContent = old; }
}

function ensureExportButtons(){
  let box = document.getElementById('expBox');
  if (!box){
    const anchor = document.getElementById('galBtn') || document.getElementById('modelSel'); if (!anchor) return;
    box = document.createElement('div'); box.id = 'expBox'; box.style.cssText = 'display:flex;gap:8px;margin-top:8px';
    const fns = { glb: exportModelGLB, obj: exportModelOBJ, smd: exportModelSMD };
    for (const kind of ['glb', 'obj', 'smd']){
      const b = document.createElement('button'); b.type = 'button'; b.id = 'exp_' + kind; b.dataset.kind = kind;
      b.style.cssText = 'flex:1;padding:10px 8px;border-radius:10px;border:1px solid #2b3a52;background:#16202e;color:#dbe6f5;font:inherit;cursor:pointer;white-space:nowrap';
      b.addEventListener('click', () => runExport(b, fns[kind]));
      box.appendChild(b);
    }
    anchor.insertAdjacentElement('afterend', box);
  }
  for (const b of box.querySelectorAll('button')) if (!b.disabled) b.textContent = expT(b.dataset.kind);
}
window.addEventListener('langchange', () => { if (document.getElementById('expBox')) ensureExportButtons(); });

export function initModels() {
  new ResizeObserver(modelResize).observe(document.getElementById('paneModels')); requestAnimationFrame(tick);
  document.getElementById('btnModels').addEventListener('click', () => document.getElementById('pickModels').click());
  document.getElementById('btnMats').addEventListener('click', () => document.getElementById('pickMats').click());
  document.getElementById('modelSel').addEventListener('change', e => { curIdx = parseInt(e.target.value, 10) | 0; loadCurrentModel(); });
  
  const chkSkin = document.getElementById('chkSkin');
  if (chkSkin) {
    chkSkin.addEventListener('change', () => { if (lastEntry) loadCurrentModel(); });
  }

  document.getElementById('chkTex').addEventListener('change', () => {
    const token = ++_chkTexToken;
    TexStore.enabled = document.getElementById('chkTex').checked;
    TexStore._texCache.clear();
    if (!currentModelRoot) return;
    currentModelRoot.traverse(o => {
      if (!o.isMesh || !o.material) return;
      if (!TexStore.enabled){
        o.material.map = null;
        o.material.transparent = false;
        o.material.alphaTest = 0;
        o.material.depthWrite = true;
        o.material.needsUpdate = true;
        return;
      }
      const rec = getTexRecordFromMat(o.material);
      if (!rec) return;
      TexStore.makeTexture(rec, 1024, getRecordBuffer).then(td => {
        if (token !== _chkTexToken) return;
        if (!td) return;
        o.material.map = td.texture;
        o.material.color.set(0xffffff);
        o.material.needsUpdate = true;
      });
    });
  });

  document.getElementById('chkPhy').addEventListener('change', () => { showPhy = document.getElementById('chkPhy').checked; if (phyRoot) phyRoot.visible = showPhy; document.getElementById('btnPhy').classList.toggle('on', showPhy); });
  document.getElementById('btnGrid').addEventListener('click', () => { showGrid = !showGrid; modelGrid.visible = showGrid; axisX.visible = showGrid; axisZ.visible = showGrid; document.getElementById('btnGrid').classList.toggle('on', showGrid); });
  document.getElementById('btnWire').addEventListener('click', () => { showWire = !showWire; applyModelWireframe(); document.getElementById('btnWire').classList.toggle('on', showWire); });
  document.getElementById('btnPhy').addEventListener('click', () => { showPhy = !showPhy; if (phyRoot) phyRoot.visible = showPhy; document.getElementById('chkPhy').checked = showPhy; document.getElementById('btnPhy').classList.toggle('on', showPhy); });
  document.getElementById('btnSpin').addEventListener('click', () => { autoRotate = !autoRotate; document.getElementById('btnSpin').classList.toggle('on', autoRotate); });
  document.getElementById('btnFit').addEventListener('click', () => { if (currentModelRoot) frameObject(currentModelRoot); });

  let lightsOn = true;
  document.getElementById('btnSun').addEventListener('click', () => { lightsOn = !lightsOn; lightGroup.visible = lightsOn; ambient.visible = !lightsOn; document.getElementById('btnSun').classList.toggle('on', lightsOn); });

  const sideEl = document.getElementById('side'), burgerFloat = document.getElementById('burgerFloat');
  function toggleSide(force){ const collapse = (typeof force === 'boolean') ? force : !sideEl.classList.contains('collapsed'); sideEl.classList.toggle('collapsed', collapse); burgerFloat.classList.toggle('show', collapse); setTimeout(modelResize, 260); }
  document.getElementById('burgerBtn').addEventListener('click', () => toggleSide(true)); burgerFloat.addEventListener('click', () => toggleSide(false));

  document.getElementById('pickModels').addEventListener('change', async e => {
    const list = [...e.target.files].map(f => ({ path: f.webkitRelativePath || f.name, file: f }));
    if (list.length) {
      const { normal } = await splitAndIngestArchives(list);
      if (normal.length) await addFilesToStore(normal);
      await TexStore.rebuild();
      rebuildFileMapFromStore();
      scanModels();
    }
    e.target.value = '';
  });

  document.getElementById('pickMats').addEventListener('change', async e => {
    const list = [...e.target.files].map(f => ({ path: f.webkitRelativePath || f.name, file: f }));
    if (list.length) {
      const { normal } = await splitAndIngestArchives(list);
      if (normal.length) await addFilesToStore(normal);
      await TexStore.rebuild();
      rebuildFileMapFromStore();
      scanModels();
      if (lastEntry) loadCurrentModel();
    }
    e.target.value = '';
  });

  ['dragenter', 'dragover'].forEach(ev => document.getElementById('paneModels').addEventListener(ev, e => e.preventDefault()));
  document.getElementById('paneModels').addEventListener('drop', async e => {
    e.preventDefault();
    const list = await walkDrop(e.dataTransfer);
    if (!list.length) return;
    const { normal } = await splitAndIngestArchives(list);
    if (normal.length) await addFilesToStore(normal);
    await TexStore.rebuild();
    rebuildFileMapFromStore();
    scanModels();
    if (lastEntry) loadCurrentModel();
  });

  window.addEventListener('langchange', () => {
    if (_lastModelStats) renderModelStats(_lastModelStats);
  });

  window.addEventListener('openasset', e => {
    if (!e.detail || e.detail.ext !== 'mdl') return;
    const tb = document.querySelector('#topbar .tab[data-tab="models"]');
    if (tb) tb.click();
    setTimeout(() => {
      const want = String(e.detail.path).toLowerCase();
      let idx = MODELS.findIndex(m => m.path.toLowerCase() === want);
      if (idx < 0){
        const tail = want.slice(want.lastIndexOf('models/'));
        idx = MODELS.findIndex(m => m.lc.endsWith(tail));
      }
      if (idx >= 0){ ensureModelUI(); selectModel(idx); }
    }, 60);
  });
}