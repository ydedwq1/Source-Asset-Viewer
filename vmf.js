// vmf.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { Store, t, LANG, normMat, EntityIcons, walkDrop, addFilesToStore, getExt, shouldKeepFile } from './core.js';
import { TexStore } from './vtf.js';
import { splitAndIngestArchives, ingestArchives, getRecordBuffer } from './archives.js';
import { rebuildFileMapFromStore, buildModelFromPath, hasModelForPath } from './models.js';
import { parseVMAP, isVMAP } from './vmap.js';
import { initEntEditor, entSetContext, saveVMF } from './entedit.js';
import { initDemo, loadDemoFile } from './demview.js';
import { initCutscene, cutsceneMapChanged, unloadCutscene, cutsceneReload } from './cutscene.js';
import { Plugins } from './plugins.js';
import { initSceneAnim, sceneAnimReset, sceneAnimMapReady, stepSceneAnims, isScenePovActive, applyScenePovCamera } from './sceneanim.js';

const vmfCanvas = document.getElementById('vmfCanvas');
const vmfRenderer = new THREE.WebGLRenderer({ canvas: vmfCanvas, antialias: true, preserveDrawingBuffer: true });
vmfRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
vmfRenderer.outputColorSpace = THREE.SRGBColorSpace;

const vmfScene = new THREE.Scene();
vmfScene.background = new THREE.Color(0x0e1116);
const vmfCamera = new THREE.PerspectiveCamera(70, 1, 1, 500000);
vmfCamera.position.set(600, 600, 600);
const vmfControls = new OrbitControls(vmfCamera, vmfRenderer.domElement);
vmfControls.enableDamping = true; vmfControls.dampingFactor = 0.075;
vmfControls.screenSpacePanning = true; vmfControls.maxDistance = 200000; vmfControls.minDistance = 5;

const vmfHemi = new THREE.HemisphereLight(0xcfe0ff, 0x30323a, 1.15); vmfScene.add(vmfHemi);
vmfRenderer.shadowMap.enabled = true; vmfRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
const vmfSunA = new THREE.DirectionalLight(0xffffff, 1.15); vmfSunA.position.set(1, 2, 0.7); vmfScene.add(vmfSunA);
const vmfSunB = new THREE.DirectionalLight(0xffffff, 0.45); vmfSunB.position.set(-1.2, 1.1, -0.9); vmfScene.add(vmfSunB);

const vmfGrid = new THREE.GridHelper(4096, 64, 0x2a3340, 0x1a2029);
vmfGrid.material.transparent = true; vmfGrid.material.opacity = 0.35; vmfGrid.position.y = -0.5;
vmfScene.add(vmfGrid);

let vmfGroup = null, vmfTrigGroup = null, vmfEntGroup = null;
let currentMapName = 'map', currentMapText = null, vmfLoaded = false, vmfWireframe = false;
let currentMapBuf = null, currentMapKind = 'vmf';
let _vmfLoadToken = 0;
let _hasSky3Ents = false;

const vmfUI = {
  dropzone: document.getElementById('vmfDropzone'), btnShot: document.getElementById('vmfBtnShot'),
  btnFit: document.getElementById('vmfBtnFit'), btnWire: document.getElementById('vmfBtnWire'),
  btnPanel: document.getElementById('vmfBtnPanel'), btnGLB: document.getElementById('vmfBtnGLB'),
  panel: document.getElementById('vmfPanel'), optTriggers: document.getElementById('optTriggers'),
  optEntities: document.getElementById('optEntities'), optEntIcons: document.getElementById('optEntIcons'),
  optEntIconsTop: document.getElementById('optEntIconsTop'), iconSize: document.getElementById('vmfIconSize'),
  optGlass: document.getElementById('optGlass'), optTex: document.getElementById('optTex'),
  optSky: document.getElementById('optSky'),
  optEntModels: document.getElementById('optEntModels'),
  optAttach: document.getElementById('optAttach')
};

const VMF_MATS = {
  concrete: new THREE.MeshStandardMaterial({ name: 'concrete', color: 0x9b9b95, roughness: 0.96, metalness: 0, side: THREE.DoubleSide }),
  metal:    new THREE.MeshStandardMaterial({ name: 'metal', color: 0x8d939c, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide }),
  tile:     new THREE.MeshStandardMaterial({ name: 'tile', color: 0xdcdcdc, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
  glass:    new THREE.MeshStandardMaterial({ name: 'glass', color: 0x9fd8e8, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }),
  water:    new THREE.MeshStandardMaterial({ name: 'water', color: 0x3a8cd9, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false }),
  sign:     new THREE.MeshStandardMaterial({ name: 'sign', color: 0xd88a2a, roughness: 0.7, metalness: 0, side: THREE.DoubleSide }),
  light:    new THREE.MeshStandardMaterial({ name: 'light', color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 1, roughness: 1, side: THREE.DoubleSide }),
  sky:      new THREE.MeshStandardMaterial({ name: 'sky', color: 0x7ea6d0, roughness: 1, metalness: 0, side: THREE.BackSide }),
  other:    new THREE.MeshStandardMaterial({ name: 'other', color: 0xb0a89c, roughness: 0.85, metalness: 0, side: THREE.DoubleSide })
};

let _lastStatusKey = 'waiting_file', _lastStatusParams = null;
export function vmfSetStatus(keyOrText, params, busy = false){
  _lastStatusKey = keyOrText; _lastStatusParams = params || null;
  const st = document.getElementById('vmfStatus');
  const tx = document.getElementById('vmfStatusText');
  if (tx) tx.textContent = t(keyOrText, params);
  if (st) {
    st.classList.toggle('busy', busy);
    st.classList.remove('hide');
    if (!busy) { clearTimeout(vmfSetStatus._t); vmfSetStatus._t = setTimeout(() => st.classList.add('hide'), 4000); }
  }
}
export function vmfSetProgress(v){ const el = document.getElementById('vmfProgress'); if (el) el.style.width = (v * 100) + '%'; }
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

function disposeGroup(g){
  if (!g) return;
  g.traverse(o => {
    if (o.userData && o.userData.isEntityModelInstance) return;
    if (o.geometry) o.geometry.dispose();
    if (o.isSprite && o.material) o.material.dispose();
  });
  vmfScene.remove(g);
}

let _fixedSize = null, _prevPR = null;
// Фиксированное разрешение рендера (для записи видео): w,h > 0 — включить, 0 — вернуть размер по панели.
function vmfSetRenderSize(w, h){
  if (w > 0 && h > 0){
    if (!_fixedSize) _prevPR = vmfRenderer.getPixelRatio();
    _fixedSize = { w, h }; vmfRenderer.setPixelRatio(1); vmfCanvas.style.objectFit = 'contain';
  } else if (_fixedSize){
    _fixedSize = null; vmfCanvas.style.objectFit = ''; vmfRenderer.setPixelRatio(_prevPR || Math.min(window.devicePixelRatio, 2));
  }
  vmfResize();
}
// «Чистый» вид: прячем сетку, контуры триггеров, иконки/точки сущностей и маркеры attachment — всё, чего нет в самой игре.
let _cleanSaved = null;
function vmfSetClean(on){
  if (on && !_cleanSaved){
    _cleanSaved = [];
    const hide = o => { if (o.visible){ _cleanSaved.push(o); o.visible = false; } };
    hide(vmfGrid); if (vmfTrigGroup) hide(vmfTrigGroup);
    if (vmfEntGroup) vmfEntGroup.traverse(o => { if (o.isSprite || o.isPoints || o.isLine || (o.userData && o.userData.isAttachmentMarkerGroup)) hide(o); });
  } else if (!on && _cleanSaved){ for (const o of _cleanSaved) o.visible = true; _cleanSaved = null; }
}
// Меши мира для физики: без неба и воды
function vmfWorldMeshes(){
  const out = [];
  if (vmfGroup) vmfGroup.traverse(o => {
    if (!o.isMesh || !o.geometry || (o.userData && o.userData.isSky)) return;
    const m = o.material; if (m && ((m.userData && m.userData.isWater) || m.name === 'water')) return;
    out.push(o);
  });
  return out;
}

export function vmfResize(){
  const panes = document.getElementById('paneVmf');
  if (!panes) return;
  if (_fixedSize){ vmfRenderer.setSize(_fixedSize.w, _fixedSize.h, false); vmfCamera.aspect = _fixedSize.w / _fixedSize.h; vmfCamera.updateProjectionMatrix(); return; }
  const w = vmfCanvas.clientWidth || panes.clientWidth, h = vmfCanvas.clientHeight || panes.clientHeight;
  if (!w || !h) return;
  vmfRenderer.setSize(w, h, false);
  vmfCamera.aspect = w / h; vmfCamera.updateProjectionMatrix();
}

function tokenize(src){
  const tokens = []; const n = src.length; let i = 0;
  while (i < n){
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (ch === '{' || ch === '}') { tokens.push(ch); i++; continue; }
    if (ch === '"') { let j = i + 1, s = ''; while (j < n && src[j] !== '"') { s += src[j]; j++; } tokens.push(s); i = j + 1; continue; }
    let j = i; while (j < n && ' \t\n\r{}"'.indexOf(src[j]) === -1) j++;
    tokens.push(src.slice(i, j)); i = j;
  }
  return tokens;
}

function parseBlock(tokens, i, name){
  const node = { name: name || '', props: {}, children: [], items: [], nextIndex: i + 1 };
  i++;
  while (i < tokens.length && tokens[i] !== '}'){
    const tok = tokens[i];
    if (tokens[i + 1] === '{') { const child = parseBlock(tokens, i + 1, tok); node.children.push(child); node.items.push(child); i = child.nextIndex; }
    else { const key = tok; const val = tokens[i + 1] !== undefined ? tokens[i + 1] : ''; node.props[key.toLowerCase()] = val; node.items.push([key, val]); i += 2; }
  }
  i++; node.nextIndex = i; return node;
}

function parseVMF(tokens){
  const blocks = []; let i = 0;
  while (i < tokens.length){
    const name = tokens[i];
    if (tokens[i + 1] === '{') { const b = parseBlock(tokens, i + 1, name); blocks.push(b); i = b.nextIndex; }
    else i++;
  }
  return blocks;
}

let _entsAll = [];
function vmapEntAdapt(e){
  const props = {}; for (const k in (e.props || {})) props[k.toLowerCase()] = String(e.props[k]);
  const o = Array.isArray(e.origin) ? e.origin.join(' ') : (e.origin || null);
  const an = Array.isArray(e.angles) ? e.angles.join(' ') : (e.angles || null);
  if (o && props.origin == null) props.origin = o; if (an && props.angles == null) props.angles = an;
  return { classname: e.classname, origin: o, targetname: e.targetname || '', model: e.model || null, angles: an, scale: null, modelscale: null, props, node: null };
}

const VMF_NUM_RE = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

function parsePlaneStr(str){
  if (!str) return null;
  const m = String(str).match(VMF_NUM_RE);
  if (!m || m.length < 9) return null;
  return [[+m[0], +m[1], +m[2]], [+m[3], +m[4], +m[5]], [+m[6], +m[7], +m[8]]];
}

function planeFromPts(p1, p2, p3){
  const ux = p1[0] - p2[0], uy = p1[1] - p2[1], uz = p1[2] - p2[2];
  const vx = p3[0] - p2[0], vy = p3[1] - p2[1], vz = p3[2] - p2[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz); if (len < 1e-9) return null;
  nx /= len; ny /= len; nz /= len;
  const d = nx * p1[0] + ny * p1[1] + nz * p1[2];
  return { nx, ny, nz, d };
}

function parseAxis(str){
  if (!str) return null;
  const m = String(str).match(VMF_NUM_RE);
  if (!m || m.length < 5) return null;
  return { x: +m[0], y: +m[1], z: +m[2], shift: +m[3], scale: +m[4] || 1 };
}

const VMF_MAXC = 131072;
const MAT_U_DEFAULT = { x: 1, y: 0, z: 0, scale: 1, shift: 0 };
const MAT_V_DEFAULT = { x: 0, y: 1, z: 0, scale: 1, shift: 0 };

function intersect3(a, b, c){
  const cx = b.ny * c.nz - b.nz * c.ny;
  const cy = b.nz * c.nx - b.nx * c.nz;
  const cz = b.nx * c.ny - b.ny * c.nx;
  const det = a.nx * cx + a.ny * cy + a.nz * cz;
  if (Math.abs(det) < 1e-6) return null;

  const dx = c.ny * a.nz - c.nz * a.ny;
  const dy = c.nz * a.nx - c.nx * a.nz;
  const dz = c.nx * a.ny - c.ny * a.nx;

  const ex = a.ny * b.nz - a.nz * b.ny;
  const ey = a.nz * b.nx - a.nx * b.nz;
  const ez = a.nx * b.ny - a.ny * b.nx;

  const x = (a.d * cx + b.d * dx + c.d * ex) / det;
  const y = (a.d * cy + b.d * dy + c.d * ey) / det;
  const z = (a.d * cz + b.d * dz + c.d * ez) / det;

  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null;
  if (Math.abs(x) > VMF_MAXC || Math.abs(y) > VMF_MAXC || Math.abs(z) > VMF_MAXC) return null;

  return [x, y, z];
}

function getQuadCorners(poly){
  if (!poly || poly.length < 4) return null;
  if (poly.length === 4) return poly;
  let p = poly.slice();
  for (let iter = 0; iter < 4 && p.length > 4; iter++){
    let bestIdx = -1;
    for (let i = 0; i < p.length; i++){
      const prev = p[(i + p.length - 1) % p.length], curr = p[i], next = p[(i + 1) % p.length];
      const d1 = [curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2]];
      const d2 = [next[0] - curr[0], next[1] - curr[1], next[2] - curr[2]];
      const l1 = Math.hypot(d1[0], d1[1], d1[2]), l2 = Math.hypot(d2[0], d2[1], d2[2]);
      if (l1 < 1e-3 || l2 < 1e-3){ bestIdx = i; break; }
      const dot = (d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]) / (l1 * l2);
      if (dot > 0.985){ bestIdx = i; break; }
    }
    if (bestIdx >= 0) p.splice(bestIdx, 1);
    else break;
  }
  return p.length === 4 ? p : null;
}

function parseDispInfo(node){
  if (!node) return null;
  const power = parseInt(node.props.power || '0', 10); if (power < 2 || power > 4) return null;
  const size = (1 << power) + 1; let start = null;
  if (node.props.startposition){ const m = node.props.startposition.match(VMF_NUM_RE); if (m && m.length >= 3) start = [+m[0], +m[1], +m[2]]; }
  const normals = new Array(size * size); for (let i = 0; i < size * size; i++) normals[i] = [0, 0, 0, 0];
  const normalsBlock = node.children.find(c => c.name === 'normals');
  if (normalsBlock){
    for (let row = 0; row < size; row++){
      const str = normalsBlock.props['row' + row]; if (!str) continue;
      const nums = str.match(VMF_NUM_RE); if (!nums) continue;
      const count = Math.min(Math.floor(nums.length / 3), size);
      for (let col = 0; col < count; col++){
        const o = col * 3;
        normals[row * size + col] = [parseFloat(nums[o]), parseFloat(nums[o + 1]), parseFloat(nums[o + 2]), 0];
      }
    }
  }
  const distBlock = node.children.find(c => c.name === 'distances');
  if (distBlock){
    let anyNonZero = false; const tmp = [];
    for (let row = 0; row < size; row++){
      const str = distBlock.props['row' + row]; tmp[row] = []; if (!str) continue;
      const nums = str.match(VMF_NUM_RE); if (!nums) continue;
      for (let col = 0; col < Math.min(nums.length, size); col++){
        const v = parseFloat(nums[col]); tmp[row][col] = v; if (v !== 0) anyNonZero = true;
      }
    }
    if (anyNonZero){ for (let row = 0; row < size; row++){ for (let col = 0; col < size; col++){ const v = tmp[row] && tmp[row][col]; if (v != null) normals[row * size + col][3] = v; } } }
  }
  const alphas = new Float32Array(size * size);
  const alphaBlock = node.children.find(c => c.name === 'alphas');
  if (alphaBlock){
    for (let row = 0; row < size; row++){
      const str = alphaBlock.props['row' + row]; if (!str) continue;
      const nums = str.match(VMF_NUM_RE); if (!nums) continue;
      for (let col = 0; col < Math.min(nums.length, size); col++) alphas[row * size + col] = Math.min(1, Math.max(0, parseFloat(nums[col]) / 255));
    }
  }
  return { power, start, size, normals, alphas, elevation: parseFloat(node.props.elevation) || 0 };
}

const DISP_TRANSPOSE = true;
const _q4 = p => Math.round(p[0] * 4) + '_' + Math.round(p[1] * 4) + '_' + Math.round(p[2] * 4);

function prepareDisp(disp, poly, faceNormal, acc){
  const N = 1 << disp.power; const size = N + 1;
  const cPoly = getQuadCorners(poly);
  if (!cPoly || cPoly.length !== 4) return null;

  let startIdx = 0;
  if (disp.start){
    let bestD = Infinity;
    for (let i = 0; i < 4; i++){
      const p = cPoly[i];
      const d = (p[0] - disp.start[0]) ** 2 + (p[1] - disp.start[1]) ** 2 + (p[2] - disp.start[2]) ** 2;
      if (d < bestD) { bestD = d; startIdx = i; }
    }
  }
  const c = [];
  for (let i = 0; i < 4; i++) c.push(cPoly[(startIdx + i) % 4]);
  const uEnd = DISP_TRANSPOSE ? c[1] : c[3];
  const vEnd = DISP_TRANSPOSE ? c[3] : c[1];
  const diag = c[2], elev = disp.elevation || 0;
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const pts = new Array(size * size), bases = new Array(size * size), loc = new Array(size * size), keys = new Array(size * size);

  for (let j = 0; j < size; j++){
    for (let i = 0; i < size; i++){
      const s = i / N, t = j / N;
      const top = lerp3(c[0], uEnd, s), bot = lerp3(vEnd, diag, s), base = lerp3(top, bot, t);
      const nn = disp.normals[j * size + i] || [0, 0, 0, 0];
      let nx = nn[0], ny = nn[1], nz = nn[2];
      if (nx === 0 && ny === 0 && nz === 0){ nx = faceNormal.nx; ny = faceNormal.ny; nz = faceNormal.nz; }
      let dist = nn[3];
      if (!isFinite(dist) || Math.abs(dist) > 8192) dist = 0;
      const px = base[0] + nx * dist + faceNormal.nx * elev,
            py = base[1] + ny * dist + faceNormal.ny * elev,
            pz = base[2] + nz * dist + faceNormal.nz * elev;
      bases[j * size + i] = base;
      pts[j * size + i] = (isFinite(px) && isFinite(py) && isFinite(pz)) ? [px, py, pz] : base;
    }
  }

  for (let j = 0; j < size; j++){
    for (let i = 0; i < size; i++){
      const idx = j * size + i;
      const il = Math.max(0, i - 1), ir = Math.min(N, i + 1), jl = Math.max(0, j - 1), jr = Math.min(N, j + 1);
      const A = pts[j * size + ir], B = pts[j * size + il], C = pts[jr * size + i], D = pts[jl * size + i];
      const ax = A[0] - B[0], ay = A[1] - B[1], az = A[2] - B[2], bx = C[0] - D[0], by = C[1] - D[1], bz = C[2] - D[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-9){ nx = faceNormal.nx; ny = faceNormal.ny; nz = faceNormal.nz; }
      else {
        nx /= nl; ny /= nl; nz /= nl;
        if (nx * faceNormal.nx + ny * faceNormal.ny + nz * faceNormal.nz < 0){ nx = -nx; ny = -ny; nz = -nz; }
      }
      loc[idx] = [nx, ny, nz];
      const key = _q4(pts[idx]); keys[idx] = key;
      let a = acc.get(key); if (!a){ a = [0, 0, 0]; acc.set(key, a); }
      a[0] += nx; a[1] += ny; a[2] += nz;
    }
  }
  return { N, size, pts, bases, loc, keys, alphas: disp.alphas };
}

function emitDisp(it, bucket, ua, va, uScale, vScale, useTex, acc){
  const { N, size, pts, bases, loc, keys, alphas } = it;
  const getN = idx => { const a = acc.get(keys[idx]); if (a){ const l = Math.hypot(a[0], a[1], a[2]); if (l > 1e-6) return [a[0] / l, a[1] / l, a[2] / l]; } return loc[idx]; };
  const emit = idx => {
    const p = pts[idx], n = getN(idx);
    bucket.pos.push(p[0], p[1], p[2]); bucket.nrm.push(n[0], n[1], n[2]);
    if (useTex){
      const b = bases[idx];
      bucket.uv.push((b[0] * ua.x + b[1] * ua.y + b[2] * ua.z) / uScale + ua.shift, (b[0] * va.x + b[1] * va.y + b[2] * va.z) / vScale + va.shift);
    }
    if (bucket.blend) bucket.alp.push(alphas ? alphas[idx] : 0);
  };
  let tri = 0;
  for (let j = 0; j < N; j++){
    for (let i = 0; i < N; i++){
      const a = j * size + i, b = a + 1, c = (j + 1) * size + i, d = c + 1;
      if (((i + j) & 1) === 0){ emit(a); emit(b); emit(d); emit(a); emit(d); emit(c); }
      else { emit(a); emit(b); emit(c); emit(b); emit(d); emit(c); }
      tri += 2;
    }
  }
  return tri;
}

function tryBuildSolid(sides, sign, eps){
  const P = sides.length;
  const nx = new Float64Array(P), ny = new Float64Array(P), nz = new Float64Array(P), dd = new Float64Array(P);
  for (let i = 0; i < P; i++){
    const pl = sides[i].plane;
    nx[i] = pl.nx * sign;
    ny[i] = pl.ny * sign;
    nz[i] = pl.nz * sign;
    dd[i] = pl.d * sign;
  }

  const pts = [];
  const DEDUP = Math.max(0.08, eps * 0.1);
  for (let i = 0; i < P - 2; i++){
    for (let j = i + 1; j < P - 1; j++){
      for (let k = j + 1; k < P; k++){
        const p = intersect3(sides[i].plane, sides[j].plane, sides[k].plane);
        if (!p) continue;

        let inside = true;
        for (let m = 0; m < P; m++){
          if (nx[m] * p[0] + ny[m] * p[1] + nz[m] * p[2] - dd[m] > eps){
            inside = false;
            break;
          }
        }
        if (!inside) continue;

        let dup = false;
        for (let q = 0; q < pts.length; q++){
          const o = pts[q];
          if (Math.abs(o[0] - p[0]) < DEDUP && Math.abs(o[1] - p[1]) < DEDUP && Math.abs(o[2] - p[2]) < DEDUP){
            dup = true; break;
          }
        }
        if (!dup) pts.push(p);
      }
    }
  }

  if (pts.length < 4) return null;

  const faces = [];
  const FACE_EPS = Math.max(eps * 1.5, 0.4);
  for (let i = 0; i < P; i++){
    const fnx = nx[i], fny = ny[i], fnz = nz[i], fd = dd[i];
    const on = [];
    for (let q = 0; q < pts.length; q++){
      const p = pts[q];
      if (Math.abs(fnx * p[0] + fny * p[1] + fnz * p[2] - fd) <= FACE_EPS) on.push(p);
    }
    if (on.length < 3) continue;

    let cx = 0, cy = 0, cz = 0;
    for (const p of on){ cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= on.length; cy /= on.length; cz /= on.length;

    let ux, uy, uz;
    if (Math.abs(fnz) < 0.9) { ux = -fny; uy = fnx; uz = 0; }
    else { ux = 0; uy = -fnz; uz = fny; }
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = fny * uz - fnz * uy, vy = fnz * ux - fnx * uz, vz = fnx * uy - fny * ux;

    on.sort((a, b) => {
      const aa = Math.atan2((a[0] - cx) * vx + (a[1] - cy) * vy + (a[2] - cz) * vz, (a[0] - cx) * ux + (a[1] - cy) * uy + (a[2] - cz) * uz);
      const bb = Math.atan2((b[0] - cx) * vx + (b[1] - cy) * vy + (b[2] - cz) * vz, (b[0] - cx) * ux + (b[1] - cy) * uy + (b[2] - cz) * uz);
      return aa - bb;
    });

    faces.push({
      plane: { nx: fnx, ny: fny, nz: fnz, d: fd },
      poly: on,
      material: sides[i].material,
      uaxis: sides[i].uaxis,
      vaxis: sides[i].vaxis,
      dispinfo: sides[i].dispinfo
    });
  }

  if (faces.length < 4) return null;
  return { faces, pts };
}

function buildSolidFaces(sides){
  const P = sides.length;
  if (P < 4) return null;
  for (const sign of [1, -1]){
    for (const eps of [0.15, 0.45, 0.85, 1.5, 2.5]){
      const res = tryBuildSolid(sides, sign, eps);
      if (res && res.faces && res.faces.length >= 4) return res;
    }
  }
  return null;
}

function materialCategory(mat){
  const m = (mat || '').toLowerCase().replace(/\\/g, '/');
  const base = m.split('/').pop() || '';
  if (m.startsWith('tools/') || base.startsWith('tools')) {
    if (m.includes('skybox')) return 'sky';
    if (m.includes('trigger')) return 'trigger';
    return 'skip';
  }
  if (base.includes('nodraw') || base.includes('invisible') || base.includes('playerclip') || base.includes('npcclip') || base.includes('areaportal') || base.includes('occluder') || base.includes('blocklight') || base.includes('blocksound')) return 'skip';
  if (m.includes('water')) return 'water';
  if (base.startsWith('glass') || m.includes('/glass')) return 'glass';
  if (m.includes('lights/') || m.includes('/light')) return 'light';
  if (m.includes('signage') || m.includes('hazard')) return 'sign';
  if (m.includes('metal')) return 'metal';
  if (m.includes('tile') || m.includes('observation_tile')) return 'tile';
  if (m.includes('concrete')) return 'concrete';
  return 'other';
}

let _dispBlocksSeen = 0;
function collectSolid(node){
  const sides = [];
  for (const ch of node.children){
    if (ch.name !== 'side') continue;
    const pts = parsePlaneStr(ch.props.plane); if (!pts) continue;
    const pl = planeFromPts(pts[0], pts[1], pts[2]); if (!pl) continue;
    const side = { plane: pl, pts, material: ch.props.material || '', uaxis: parseAxis(ch.props.uaxis), vaxis: parseAxis(ch.props.vaxis), dispinfo: null };
    const di = ch.children.find(c => c.name === 'dispinfo'); if (di){ _dispBlocksSeen++; side.dispinfo = parseDispInfo(di); }
    sides.push(side);
  }
  return sides;
}

function collectSolidsRecursive(node, out){
  for (const ch of node.children){
    if (!ch) continue;
    if (ch.name === 'solid') out.push(collectSolid(ch));
    else if (ch.children && ch.children.length) collectSolidsRecursive(ch, out);
  }
}

const _mapModelCache = new Map();
async function _getMapModelTemplate(mdlPath){
  const key = mdlPath.toLowerCase();
  if (_mapModelCache.has(key)) return _mapModelCache.get(key);
  const p = buildModelFromPath(mdlPath, { texSize: 512 }).catch(() => null);
  _mapModelCache.set(key, p);
  return p;
}

function _attachmentWorldPos(template, att){
  if (att.bone < 0 || !template.bones) return null;
  const bone = template.bones[att.bone];
  if (!bone || !bone.poseToBone) return null;
  const m = bone.poseToBone, l = att.local;
  return [
    m[0] * l[3] + m[1] * l[7] + m[2]  * l[11] + m[3],
    m[4] * l[3] + m[5] * l[7] + m[6]  * l[11] + m[7],
    m[8] * l[3] + m[9] * l[7] + m[10] * l[11] + m[11]
  ];
}

async function _loadEntityModels(entities, parentGroup, token){
  const byPath = new Map();
  for (const e of entities){
    if (!e.model || !e.origin) continue;
    if (e.props.rendermode === '10' || (e.props.rendermode === '1' && e.props.renderamt === '0')) continue;
    if (!hasModelForPath(e.model)) continue;
    const key = e.model.toLowerCase();
    if (!byPath.has(key)) byPath.set(key, []);
    byPath.get(key).push(e);
  }
  if (!byPath.size) return;

  const paths = [...byPath.keys()];
  const templates = await Promise.all(paths.map(p => _getMapModelTemplate(p)));
  if (token !== _vmfLoadToken) return;

  const modelGroup = new THREE.Group();
  modelGroup.name = 'entity-models';
  modelGroup.userData.isModelGroup = true;
  parentGroup.add(modelGroup);

  const modelsVisible = (vmfUI.optEntModels ? vmfUI.optEntModels.checked : true);
  const markersVisible = (vmfUI.optAttach ? vmfUI.optAttach.checked : false);
  const isPhysicsProp = /^prop_physics|prop_ragdoll/i;

  for (let i = 0; i < paths.length; i++){
    const template = templates[i];
    if (!template || !template.group) continue;
    const list = byPath.get(paths[i]);

    for (const e of list){
      const nums = String(e.origin).match(VMF_NUM_RE);
      if (!nums || nums.length < 3) continue;
      const x = +nums[0], y = +nums[1], z = +nums[2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;

      const inst = template.group.clone(true);
      inst.rotation.x = 0;
      inst.traverse(o => { if (o.isMesh) o.userData.isEntityModelInstance = true; });

      if (template.attachments && template.attachments.length){
        const markers = new THREE.Group();
        markers.userData.isAttachmentMarkerGroup = true;
        markers.name = 'attachments';
        for (const att of template.attachments){
          const pos = _attachmentWorldPos(template, att);
          if (!pos) continue;
          const marker = new THREE.Mesh(
            new THREE.SphereGeometry(3.5, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0xff66ff, depthTest: false, transparent: true, opacity: 0.9 })
          );
          marker.position.set(pos[0], pos[1], pos[2]);
          marker.renderOrder = 998;
          marker.userData.isAttachmentMarker = true;
          marker.userData.attachName = att.name;
          marker.visible = markersVisible;
          markers.add(marker);
        }
        if (markers.children.length) inst.add(markers);
      }

      const wrapper = new THREE.Group();
wrapper.position.set(x, y, z);
wrapper.userData.isEntityModel = true;
wrapper.userData.entId = String((e.props && (e.props.id || e.props.hammerid)) || e.id || '');
wrapper.userData.ent = e;
wrapper.userData.modelPath = e.model;
wrapper.userData.skinFamily = parseInt(e.props && e.props.skin, 10) || 0;

      if (e.angles){
        const a = String(e.angles).match(VMF_NUM_RE);
        if (a && a.length >= 3){
          const pitch = THREE.MathUtils.degToRad(+a[0] || 0);
          const yaw   = THREE.MathUtils.degToRad(+a[1] || 0);
          const roll  = THREE.MathUtils.degToRad(+a[2] || 0);
          wrapper.rotation.set(roll, pitch, yaw, 'ZYX');
        } else if (a && a.length === 2){
          wrapper.rotation.z = THREE.MathUtils.degToRad(+a[1] || 0);
        }
      }

      const s = parseFloat(e.scale) || parseFloat(e.modelscale) || 1;
      if (isFinite(s) && s !== 0 && s !== 1) wrapper.scale.setScalar(s);

      wrapper.add(inst);
      wrapper.visible = modelsVisible;
      modelGroup.add(wrapper);

      if (isPhysicsProp.test(e.classname) && vmfGroup) {
        wrapper.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(inst);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const rayOrigin = new THREE.Vector3(center.x, box.max.y, center.z);
          const raycaster = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, -1, 0));
          const hits = raycaster.intersectObjects(vmfGroup.children, true);
          if (hits.length > 0) {
            const hit = hits.find(h => h.point.y < center.y - 1);
            if (hit) {
              const drop = box.min.y - hit.point.y;
              if (drop > 0.1) {
                wrapper.position.z -= drop;
                wrapper.updateMatrixWorld(true);
              }
            }
          }
        }
      }
    }
  }
}

function buildVmtIndex(){
  const idx = new Map();
  for (const f of Store.listByExt('vmt')){ const k = normMat(f.path); if (!idx.has(k)) idx.set(k, f); }
  return idx;
}
async function getMatInfo(key, vmtIdx){
  const rec = vmtIdx.get(key); if (!rec) return null;
  try {
    const buf = await getRecordBuffer(rec);
    const txt = new TextDecoder('utf-8').decode(buf).toLowerCase().replace(/\/\/.*$/gm, '');
    const flag = n => new RegExp('["\']?\\$' + n + '["\']?\\s+["\']?(1|true)(?![0-9a-z])').test(txt);
    const m = /["']?\$basetexture["']?\s+["']?([^\s"']+)/.exec(txt);
    const m2 = /["']?\$basetexture2["']?\s+["']?([^\s"']+)/.exec(txt);
    return { base: m ? normMat(m[1]) : '', base2: m2 ? normMat(m2[1]) : '', blend: !!m2 && /worldvertextransition/.test(txt), alphatest: flag('alphatest'), translucent: flag('translucent') };
  } catch (e) { return null; }
}
function pickVtf(key){
  if (!key) return null;
  const list = TexStore.byBase.get(key.split('/').pop());
  if (!list || !list.length) return null;
  for (const f of list) if (normMat(f.path) === key) return f;
  return list[0];
}

function solidBBox(sides){
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const sd of sides){ if (!sd.pts) continue; for (const p of sd.pts) for (let k = 0; k < 3; k++){ if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } }
  return isFinite(mn[0]) ? { mn, mx } : null;
}
function detectSky3D(solids, entities){
  const out = { set: new Set(), box: null };
  const cam = entities.find(e => e.classname === 'sky_camera' && e.origin); if (!cam) return out;
  const o = String(cam.origin).match(VMF_NUM_RE); if (!o || o.length < 3) return out;
  const P = [+o[0], +o[1], +o[2]], n = solids.length;
  const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
  const find = x => { while (parent[x] !== x){ parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const CELL = 512, M = 16, grid = new Map(), bb = new Array(n);
  const overlap = (a, b) => a.mn[0] - M <= b.mx[0] && a.mx[0] + M >= b.mn[0] && a.mn[1] - M <= b.mx[1] && a.mx[1] + M >= b.mn[1] && a.mn[2] - M <= b.mx[2] && a.mx[2] + M >= b.mn[2];
  for (let i = 0; i < n; i++){
    const b = solidBBox(solids[i]); bb[i] = b; if (!b) continue;
    if (Math.max(b.mx[0] - b.mn[0], b.mx[1] - b.mn[1], b.mx[2] - b.mn[2]) > 4096) continue;
    const x0 = Math.floor((b.mn[0] - M) / CELL), x1 = Math.floor((b.mx[0] + M) / CELL), y0 = Math.floor((b.mn[1] - M) / CELL), y1 = Math.floor((b.mx[1] + M) / CELL), z0 = Math.floor((b.mn[2] - M) / CELL), z1 = Math.floor((b.mx[2] + M) / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++){
      const key = x + ',' + y + ',' + z; let list = grid.get(key); if (!list){ list = []; grid.set(key, list); }
      for (const j of list) if (overlap(b, bb[j])) uni(i, j);
      list.push(i);
    }
  }
  let best = -1, bestD = Infinity;
  for (let i = 0; i < n; i++){
    const b = bb[i]; if (!b) continue;
    if (Math.max(b.mx[0] - b.mn[0], b.mx[1] - b.mn[1], b.mx[2] - b.mn[2]) > 4096) continue;
    let d2 = 0; for (let k = 0; k < 3; k++){ const v = Math.max(b.mn[k] - P[k], 0, P[k] - b.mx[k]); d2 += v * v; }
    if (d2 < bestD){ bestD = d2; best = i; }
  }
  if (best < 0 || Math.sqrt(bestD) > 1024) return out;
  const root = find(best); let cnt = 0;
  for (let i = 0; i < n; i++) if (bb[i] && find(i) === root) cnt++;
  if (cnt > n * 0.5) return out;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++){
    if (!bb[i] || find(i) !== root) continue;
    out.set.add(i);
    for (let k = 0; k < 3; k++){ if (bb[i].mn[k] < mn[k]) mn[k] = bb[i].mn[k]; if (bb[i].mx[k] > mx[k]) mx[k] = bb[i].mx[k]; }
  }
  out.box = { mn: mn.map(v => v - 64), mx: mx.map(v => v + 64) };
  return out;
}
function inBox(box, origin){
  if (!box || !origin) return false;
  const o = String(origin).match(VMF_NUM_RE); if (!o || o.length < 3) return false;
  for (let k = 0; k < 3; k++){ const v = +o[k]; if (v < box.mn[k] || v > box.mx[k]) return false; }
  return true;
}

function applyBlendShader(mat, td1, td2){
  const sc = new THREE.Vector2((td1.origWidth || td1.width) / (td2.origWidth || td2.width), (td1.origHeight || td1.height) / (td2.origHeight || td2.height));
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.map2 = { value: td2.texture };
    sh.uniforms.uv2scale = { value: sc };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float blendAlpha;\nvarying float vBlend;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blendAlpha;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D map2;\nuniform vec2 uv2scale;\nvarying float vBlend;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 c1 = texture2D( map, vMapUv );
          vec4 c2 = texture2D( map2, vMapUv * uv2scale );
          diffuseColor *= mix( c1, c2, clamp( vBlend, 0.0, 1.0 ) );
        #endif`);
  };
  mat.customProgramCacheKey = () => 'vmf-blend';
}

function mapBox(){
  const box = new THREE.Box3(); if (!vmfGroup) return box;
  vmfGroup.updateMatrixWorld(true);
  vmfGroup.traverse(o => { if (o.isMesh && !(o.userData && o.userData.isSky)) box.expandByObject(o); });
  if (box.isEmpty()) box.setFromObject(vmfGroup);
  return box;
}

function reloadCurrent(){
  return currentMapKind === 'vmap' && currentMapBuf
    ? loadVMAPBuffer(currentMapBuf, currentMapName, { skipFit: true })
    : loadVMFText(currentMapText, currentMapName, { skipFit: true });
}

async function reloadKeepCamera(){
  if (!currentMapText) return;
  const savedPos = vmfCamera.position.clone(), savedTarget = vmfControls.target.clone(), savedNear = vmfCamera.near, savedFar = vmfCamera.far;
  await reloadCurrent();
  vmfCamera.position.copy(savedPos); vmfControls.target.copy(savedTarget);
  vmfCamera.near = savedNear; vmfCamera.far = savedFar; vmfCamera.updateProjectionMatrix(); vmfControls.update();
}

const VR_TX = {
  ru: { title: 'Освещение (VRAD)', on: 'Предпросмотр VRAD', shadow: 'Тени от солнца', bounce: 'Отражённый свет (оценка)', quality: 'Качество', gain: 'Яркость', info: 'Источники',
        fast: 'Быстро', norm: 'Нормально', high: 'Высокое', none: 'нет света → ambient', off: 'выкл (fullbright)' },
  en: { title: 'Lighting (VRAD)', on: 'VRAD preview', shadow: 'Sun shadows', bounce: 'Bounce light (estimate)', quality: 'Quality', gain: 'Brightness', info: 'Lights',
        fast: 'Fast', norm: 'Normal', high: 'High', none: 'no lights → ambient', off: 'off (fullbright)' }
};
const vr = k => (VR_TX[LANG] || VR_TX.en)[k];
const VR_K = 1.2e5;
// Browser preview only: keep the dynamic-light count bounded. This is not a full VRAD bake.
const VR_QUALITY = { fast: { lights: 8, shadow: 0 }, norm: { lights: 16, shadow: 1024 }, high: { lights: 32, shadow: 2048 } };
let _vradSrc = { env: null, lights: [] }, _vrad = null;
const vradUI = {};
const vrNums = s => (String(s == null ? '' : s).match(VMF_NUM_RE) || []).map(Number);
function vrColor(str, def){
  const n = vrNums(str); if (n.length < 3) return def;
  return { c: new THREE.Color().setRGB(n[0] / 255, n[1] / 255, n[2] / 255, THREE.SRGBColorSpace), b: n.length > 3 ? n[3] : 200 };
}
const vrPos = o => { const n = vrNums(o); return n.length < 3 ? null : new THREE.Vector3(n[0], n[2], -n[1]); };
function vrDir(p){
  const a = vrNums(p.angles), yaw = THREE.MathUtils.degToRad(a[1] || 0);
  const pz = (p.pitch != null && String(p.pitch).trim() !== '') ? Math.sin(THREE.MathUtils.degToRad(parseFloat(p.pitch) || 0)) : -Math.sin(THREE.MathUtils.degToRad(a[0] || 0));
  const h = Math.sqrt(Math.max(0, 1 - pz * pz));
  return new THREE.Vector3(h * Math.cos(yaw), pz, -h * Math.sin(yaw)).normalize();
}
function disposeVrad(){
  if (!_vrad) return;
  vmfScene.remove(_vrad.group);
  _vrad.group.traverse(o => { if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose(); });
  _vrad = null;
}
function vradLights(V, cap){
  for (const l of V.lightObjs){ V.group.remove(l); if (l.target) V.group.remove(l.target); }
  V.lightObjs = [];
  const n = Math.min(cap, V.cand.length);
  for (let i = 0; i < n; i++){
    const { e, p, pos, c } = V.cand[i];
    const I = (c.b / 255) * VR_K;
    let dist = parseFloat(p._zero_percent_distance) || 0;
    if (!(dist > 0)) dist = THREE.MathUtils.clamp(Math.sqrt(I / 0.07), 150, 8000);
    let L;
    if (e.classname === 'light_spot'){
      const cone = parseFloat(p._cone), inner = parseFloat(p._inner_cone);
      const outer = cone > 0 ? cone : 45, inn = isFinite(inner) ? inner : 30;
      L = new THREE.SpotLight(c.c, I, dist, THREE.MathUtils.degToRad(Math.min(outer, 85)), THREE.MathUtils.clamp(1 - inn / outer, 0, 1), 2);
      L.target.position.copy(pos).addScaledVector(vrDir(p), 100); V.group.add(L.target);
    } else L = new THREE.PointLight(c.c, I, dist, 2);
    L.position.copy(pos); L.userData.base = I; V.group.add(L); V.lightObjs.push(L);
  }
}
function buildVrad(box){
  disposeVrad();
  const { env, lights } = _vradSrc;
  const g = new THREE.Group(); g.name = 'vrad';
  const sph = box.isEmpty() ? new THREE.Sphere(new THREE.Vector3(), 2048) : box.getBoundingSphere(new THREE.Sphere());
  const R = Math.max(sph.radius, 256);
  const V = { group: g, sun: null, hemi: null, lightObjs: [], cand: [], cap: -1, hasEnv: !!env };

  const amb = env ? vrColor(env.props._ambient, null) : null;
  const ac = amb ? amb.c : new THREE.Color(0xffffff);
  const sunCol = env ? vrColor(env.props._light, { c: new THREE.Color(1, 1, 1), b: 200 }).c : new THREE.Color(1, 1, 1);
  V.hemi = new THREE.HemisphereLight(ac, ac.clone().lerp(sunCol, 0.45).multiplyScalar(0.75), 1);
  V.hemi.userData.base = Math.max(amb ? (amb.b / 255) * Math.PI : 0, env ? 0.35 : 0.5);
  g.add(V.hemi);

  if (env){
    const s = vrColor(env.props._light, { c: new THREE.Color(1, 1, 1), b: 200 });
    const sun = new THREE.DirectionalLight(s.c, 1); sun.userData.base = (s.b / 255) * Math.PI * 1.1;
    const dir = vrDir(env.props);
    sun.position.copy(sph.center).addScaledVector(dir, -R * 2); sun.target.position.copy(sph.center);
    const sc = sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = R * 4; sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 2;
    sun.shadow.autoUpdate = false;
    g.add(sun, sun.target); V.sun = sun;
    const fd = dir.clone(); fd.x *= -1; fd.z *= -1; fd.y = -0.45; fd.normalize();
    const fill = new THREE.DirectionalLight(ac.clone().lerp(sunCol, 0.5), 1); fill.userData.base = sun.userData.base * 0.28;
    fill.position.copy(sph.center).addScaledVector(fd, -R * 2); fill.target.position.copy(sph.center);
    g.add(fill, fill.target); V.fill = fill;
  }
  for (const e of lights){
    const pos = vrPos(e.origin); if (!pos) continue;
    const p = e.props || {}, c = vrColor(p._light, { c: new THREE.Color(1, 1, 1), b: 200 });
    if (c.b > 0) V.cand.push({ e, p, pos, c });
  }
  V.cand.sort((a, b) => b.c.b - a.c.b);
  // Static map geometry receives the sun shadow, but does not cast it by default.
  // Rendering every map face as a caster is extremely expensive on large maps.
  vmfGroup && vmfGroup.traverse(o => {
    if (!o.isMesh || (o.userData && o.userData.isSky)) return;
    o.receiveShadow = true;
    o.castShadow = false;
  });
  vmfScene.add(g); _vrad = V;
}
function applyVrad(){
  const on = !!(vradUI.on && vradUI.on.checked), V = _vrad;
  const fullbright = !(on && V);
  vmfHemi.visible = vmfSunA.visible = vmfSunB.visible = fullbright;
  if (V) V.group.visible = !fullbright;
  const info = vradUI.info;
  if (fullbright){ if (info) info.textContent = on ? vr('none') : vr('off'); return; }
  const q = VR_QUALITY[vradUI.q.value] || VR_QUALITY.norm, gain = +vradUI.gain.value || 1;
  const shadowsOn = !!(V.sun && vradUI.shadow.checked && q.shadow > 0);
  vmfRenderer.shadowMap.enabled = shadowsOn;
  if (V.cap !== q.lights){ V.cap = q.lights; vradLights(V, q.lights); }
  V.hemi.intensity = (V.hemi.userData.base + (vradUI.bounce.checked ? 0.4 : 0)) * gain;
  if (V.fill){ V.fill.visible = vradUI.bounce.checked; V.fill.intensity = V.fill.userData.base * gain; }
  if (V.sun){
    V.sun.intensity = V.sun.userData.base * gain; V.sun.castShadow = shadowsOn;
    if (shadowsOn && V.sun.shadow.mapSize.x !== q.shadow){
      V.sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (V.sun.shadow.map){ V.sun.shadow.map.dispose(); V.sun.shadow.map = null; }
      V.sun.shadow.needsUpdate = true;
    } else if (shadowsOn && !V.sun.shadow.map) {
      V.sun.shadow.needsUpdate = true;
    }
  }
  for (const L of V.lightObjs) L.intensity = L.userData.base * gain;
  if (info) info.textContent = (V.sun ? '☀ + ' : '') + V.lightObjs.length + '/' + V.cand.length + (!V.sun && !V.cand.length ? ' · ' + vr('none') : '');
}
function initVradUI(){
  const ids = { on: 'optVrad', shadow: 'optVradShadow', bounce: 'optVradBounce', q: 'vradQ', gain: 'vradGain', info: 'vradInfo' };
  for (const k in ids) vradUI[k] = document.getElementById(ids[k]);
  if (!vradUI.on) return;
  const KEY = 'sav_vrad';
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s){ vradUI.on.checked = !!s.on; vradUI.shadow.checked = !!s.sh; vradUI.bounce.checked = !!s.bn; if (VR_QUALITY[s.q]) vradUI.q.value = s.q; if (s.g) vradUI.gain.value = s.g; } } catch (_) {}
  const txt = (id, k) => { const el = document.getElementById(id); if (el) el.textContent = vr(k); };
  const fill = () => {
    txt('vradTitle', 'title'); txt('vradLblOn', 'on'); txt('vradLblSh', 'shadow'); txt('vradLblBn', 'bounce'); txt('vradLblQ', 'quality'); txt('vradLblG', 'gain'); txt('vradLblI', 'info');
    [...vradUI.q.options].forEach(o => { o.textContent = vr(o.value); });
    applyVrad();
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ on: vradUI.on.checked, sh: vradUI.shadow.checked, bn: vradUI.bounce.checked, q: vradUI.q.value, g: vradUI.gain.value })); } catch (_) {} };
  for (const k of ['on', 'shadow', 'bounce', 'q']) vradUI[k].addEventListener('change', () => { save(); applyVrad(); });
  vradUI.gain.addEventListener('input', () => { save(); applyVrad(); });
  window.addEventListener('langchange', fill);
  fill();
}

const FG_TX = {
  ru: { title: 'Туман', on: 'Туман из карты', scale: 'Дальность ×', info: 'env_fog_controller', none: 'нет в карте', disabled: 'есть, но fogenable=0', off: 'выкл' },
  en: { title: 'Fog', on: 'Map fog', scale: 'Distance ×', info: 'env_fog_controller', none: 'none in map', disabled: 'present, fogenable=0', off: 'off' }
};
const fgT = k => (FG_TX[LANG] || FG_TX.en)[k];
let _fogSrc = null, _fogAny = false;
const fogUI = {};
const FOG_BG = new THREE.Color(0x0e1116);
function fogPick(ents){
  const cs = ents.filter(e => e.classname === 'env_fog_controller');
  _fogAny = cs.length > 0;
  const on = cs.filter(e => String((e.props || {}).fogenable) === '1');
  const e = (on.find(x => String((x.props || {}).spawnflags || '') !== '') || on[0]);
  if (!e) return null;
  const p = e.props || {};
  const col = vrColor(p.fogcolor, { c: new THREE.Color(0.5, 0.5, 0.5), b: 0 }).c;
  const start = parseFloat(p.fogstart), end = parseFloat(p.fogend);
  return { color: col, start: isFinite(start) ? start : 64, end: isFinite(end) && end > 0 ? end : 2000, maxd: p.fogmaxdensity != null ? parseFloat(p.fogmaxdensity) : 1 };
}
function applyFog(){
  const on = !!(fogUI.on && fogUI.on.checked), F = _fogSrc, k = +(fogUI.scale && fogUI.scale.value) || 1;
  if (on && F){
    const s = Math.min(F.start * k, F.end * k - 1);
    vmfScene.fog = new THREE.Fog(F.color, Math.max(0, s), F.end * k);
    vmfScene.background = F.color;
  } else { vmfScene.fog = null; vmfScene.background = FOG_BG; }
  if (fogUI.info) fogUI.info.textContent = F ? (on ? Math.round(F.start * k) + ' → ' + Math.round(F.end * k) : fgT('off')) : (_fogAny ? fgT('disabled') : fgT('none'));
}
function initFogUI(){
  const ids = { on: 'optFog', scale: 'fogScale', info: 'fogInfo' };
  for (const k in ids) fogUI[k] = document.getElementById(ids[k]);
  if (!fogUI.on) return;
  const KEY = 'sav_fog';
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s){ fogUI.on.checked = !!s.on; if (s.k) fogUI.scale.value = s.k; } } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ on: fogUI.on.checked, k: fogUI.scale.value })); } catch (_) {} };
  const txt = (id, k) => { const el = document.getElementById(id); if (el) el.textContent = fgT(k); };
  const fill = () => { txt('fogTitle', 'title'); txt('fogLblOn', 'on'); txt('fogLblS', 'scale'); txt('fogLblI', 'info'); applyFog(); };
  fogUI.on.addEventListener('change', () => { save(); applyFog(); });
  fogUI.scale.addEventListener('input', () => { save(); applyFog(); });
  window.addEventListener('langchange', fill);
  fill();
}

const _fbIcons = new Map();
function fallbackIcon(cls){
  cls = String(cls || '');
  const P = [['light', '#f2c230', '☼'], ['info_', '#4a90d9', 'i'], ['env_', '#3fae6a', 'E'], ['logic_', '#8e6bd8', 'L'], ['math_', '#8e6bd8', 'M'],
    ['npc_', '#46b36e', 'N'], ['prop_', '#4f9be0', 'P'], ['ai_', '#d9739b', 'AI'], ['point_', '#e08a3c', 'P'], ['trigger_', '#e0643c', 'T'],
    ['func_', '#9aa3ad', 'F'], ['game_', '#d94a4a', 'G'], ['filter_', '#4aa8b8', 'F'], ['sky', '#6fa8dc', 'S'], ['item_', '#c8a24a', 'I'], ['weapon_', '#c8a24a', 'W']];
  let hit = null; for (const p of P) if (cls.startsWith(p[0])) { hit = p; break; }
  const key = hit ? hit[0] : '_other'; let tex = _fbIcons.get(key); if (tex) return tex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = hit ? hit[1] : '#8a8f98'; g.strokeStyle = '#ffffff'; g.lineWidth = 6;
  g.beginPath(); g.roundRect ? g.roundRect(8, 8, 112, 112, 22) : g.rect(8, 8, 112, 112); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(hit ? hit[2] : (cls[0] || '?').toUpperCase(), 64, 68);
  tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; _fbIcons.set(key, tex); return tex;
}
const iconTex = cls => EntityIcons.get(cls) || fallbackIcon(cls);

export async function loadVMFText(text, name, opts = {}){
  const token = ++_vmfLoadToken;
  disposeGroup(vmfGroup); disposeGroup(vmfTrigGroup); disposeGroup(vmfEntGroup);
  sceneAnimReset();
  vmfGroup = vmfTrigGroup = vmfEntGroup = null;
  currentMapName = (name || 'map').replace(/\.(vmf|txt|vmx|map)$/i, '');
  currentMapText = text; currentMapKind = 'vmf'; currentMapBuf = null;
  vmfUI.dropzone.classList.add('hidden');
  vmfSetStatus('parsing', null, true); vmfSetProgress(0.02); await nextFrame();
  if (token !== _vmfLoadToken) return;

  const tokens = tokenize(text); const tree = parseVMF(tokens);
  vmfSetProgress(0.08); await nextFrame();
  if (token !== _vmfLoadToken) return;

  const solids = []; let entities = []; _dispBlocksSeen = 0;
  const invisibleEntities = /^(trigger_|logic_|point_|env_|info_|math_|path_|keyframe_|move_|func_areaportal|func_occluder|func_viscluster|func_instance|ai_|npc_|script_|sky_camera|sound_|ambient_|water_|color_|filter_|game_|player_|weapon_|item_|prop_door_rotating)/i;

  for (const node of tree){
    if (node.name === 'world') collectSolidsRecursive(node, solids);
    else if (node.name === 'entity'){
      const cls = (node.props.classname || '').toLowerCase();
      entities.push({
        classname: cls,
        origin: node.props.origin || null,
        targetname: node.props.targetname || '',
        model: node.props.model || null,
        angles: node.props.angles || null,
        scale: node.props.scale || null,
        modelscale: node.props.modelscale || null,
        props: node.props, node
      });
      const isInvisible = invisibleEntities.test(cls) || (cls === 'func_brush' && (node.props.rendermode === '10' || node.props.renderamt === '0'));
      if (!isInvisible) {
        collectSolidsRecursive(node, solids);
      }
    }
  }
  
  const vradEnv = entities.find(e => e.classname === 'light_environment') || null;
  const fogEnts = entities.filter(e => e.classname === 'env_fog_controller');
  vmfSetStatus('found_brushes', { n: solids.length }, true); vmfSetProgress(0.12); await nextFrame();
  if (token !== _vmfLoadToken) return;

  const skyOn = vmfUI.optSky ? vmfUI.optSky.checked : false;
  const sky3 = detectSky3D(solids, entities);
  _hasSky3Ents = !!sky3.box;
  if (!skyOn && sky3.box) entities = entities.filter(e => !inBox(sky3.box, e.origin));
  _vradSrc = { env: vradEnv, lights: entities.filter(e => e.classname === 'light' || e.classname === 'light_spot') };

  const buckets = new Map(), trigPositions = []; let faceCount = 0, triCount = 0, dispCount = 0;
  const dispAcc = new Map(), dispItems = [];
  const getBucket = (key, cat, matKey, isSky) => {
    let b = buckets.get(key); if (!b) { b = { pos: [], nrm: [], uv: [], cat, matKey, texData: null, isSky: !!isSky || cat === 'sky' }; buckets.set(key, b); } return b;
  };
  const texPromises = [];

  const matRes = new Map();
  if (vmfUI.optTex.checked && TexStore.enabled){
    const vmtIdx = buildVmtIndex(); const names = new Set();
    for (const sides of solids) for (const sd of sides){
      const cat = materialCategory(sd.material); if (cat === 'skip' || cat === 'trigger') continue;
      const k = normMat(sd.material); if (k) names.add(k);
    }
    let q = 0;
    for (const k of names){
      const info = await getMatInfo(k, vmtIdx);
      matRes.set(k, { rec: pickVtf(info && info.base) || pickVtf(k), rec2: (info && info.base2) ? pickVtf(info.base2) : null, info });
      if (++q % 150 === 0){ await nextFrame(); if (token !== _vmfLoadToken) return; }
    }
  }

  for (let si = 0; si < solids.length; si++){
    const sides = solids[si];
    let res = buildSolidFaces(sides);
    if (!res || !res.faces || !res.faces.length) continue;

    let hasVisible = false, hasTrigger = false;
    const dispMats = new Set(res.faces.filter(f => !!f.dispinfo).map(f => normMat(f.material)));

    for (const f of res.faces){
      const cat = materialCategory(f.material);
      if (cat === 'skip') continue;
      if (cat === 'trigger'){ hasTrigger = true; continue; }
      
      const fMat = normMat(f.material);
      if (!f.dispinfo && dispMats.has(fMat)) continue;

      hasVisible = true;
      const mKey = fMat; const mr = matRes.get(mKey); const fileRec = mr && mr.rec;
      const useTex = !!(fileRec && vmfUI.optTex.checked);
      const inS3 = sky3.set.has(si), pf = inS3 ? 's3:' : '';
      const wantBlend = !!(f.dispinfo && useTex && mr.info && mr.info.blend && mr.rec2);
      let bucket = useTex ? getBucket(pf + (wantBlend ? 'btex:' : 'tex:') + mKey, cat, mKey, inS3) : getBucket(pf + 'cat:' + cat, cat, null, inS3);
      if (wantBlend && !bucket.blend){ bucket.blend = true; bucket.alp = []; bucket.tex2Promise = true; texPromises.push(TexStore.makeTexture(mr.rec2, 512, getRecordBuffer).then(td => { if (td) bucket.texData2 = td; })); }
      if (useTex && !bucket.texData && !bucket.texPromise){ bucket.texPromise = true; bucket.info = mr.info; texPromises.push(TexStore.makeTexture(fileRec, 512, getRecordBuffer).then(td => { if (td) bucket.texData = td; })); }
      const ua = f.uaxis || MAT_U_DEFAULT, va = f.vaxis || MAT_V_DEFAULT;
      const n = f.plane, poly = f.poly; const uScale = ua.scale || 1, vScale = va.scale || 1;

      if (f.dispinfo){
        const it = prepareDisp(f.dispinfo, poly, n, dispAcc);
        if (it){
          dispItems.push({ it, bucket, ua, va, uScale, vScale, useTex });
          triCount += it.N * it.N * 2;
          dispCount++;
        }
      } else {
        for (let t = 1; t < poly.length - 1; t++){
          const tri = [poly[0], poly[t], poly[t + 1]];
          for (const A of tri){
            bucket.pos.push(A[0], A[1], A[2]); bucket.nrm.push(n.nx, n.ny, n.nz);
            if (useTex){ const u = (A[0] * ua.x + A[1] * ua.y + A[2] * ua.z) / uScale + ua.shift; const v = (A[0] * va.x + A[1] * va.y + A[2] * va.z) / vScale + va.shift; bucket.uv.push(u, v); }
          }
          triCount++;
        }
      }
      faceCount++;
    }

    if (!hasVisible && hasTrigger){
      let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
      for (const p of res.pts){
        if (p[0] < mnx) mnx = p[0]; if (p[0] > mxx) mxx = p[0];
        if (p[1] < mny) mny = p[1]; if (p[1] > mxy) mxy = p[1];
        if (p[2] < mnz) mnz = p[2]; if (p[2] > mxz) mxz = p[2];
      }
      const c = [[mnx, mny, mnz], [mxx, mny, mnz], [mxx, mxy, mnz], [mnx, mxy, mnz], [mnx, mny, mxz], [mxx, mny, mxz], [mxx, mxy, mxz], [mnx, mxy, mxz]];
      const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (const [a, b] of edges) trigPositions.push(c[a][0], c[a][1], c[a][2], c[b][0], c[b][1], c[b][2]);
    }
    if (si % 200 === 0){
      vmfSetProgress(0.12 + 0.78 * (si / solids.length));
      vmfSetStatus('processing', { n: si, m: solids.length }, true);
      await nextFrame();
      if (token !== _vmfLoadToken) return;
    }
  }

  for (const d of dispItems) emitDisp(d.it, d.bucket, d.ua, d.va, d.uScale, d.vScale, d.useTex, dispAcc);
  if (texPromises.length){ await Promise.all(texPromises); if (token !== _vmfLoadToken) return; }

  vmfSetStatus('building_meshes', null, true); vmfSetProgress(0.93); await nextFrame();
  if (token !== _vmfLoadToken) return;

  vmfGroup = new THREE.Group(); vmfGroup.name = 'map'; vmfGroup.rotation.x = -Math.PI / 2;
  for (const [key, b] of buckets){
    if (b.pos.length === 0) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
    if (b.uv.length && b.texData){
      const ow = b.texData.origWidth || b.texData.width || 1, oh = b.texData.origHeight || b.texData.height || 1;
      for (let q = 0; q < b.uv.length; q += 2){ b.uv[q] /= ow; b.uv[q + 1] /= oh; }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    }
    const blendOK = !!(b.blend && b.texData && b.texData2 && b.alp && b.alp.length * 3 === b.pos.length);
    if (blendOK) g.setAttribute('blendAlpha', new THREE.Float32BufferAttribute(b.alp, 1));
    
    let mat;
    const isWater = (b.cat === 'water');
    if (b.texData){
      const isGlass = (b.cat === 'glass') && vmfUI.optGlass.checked;
      const info = b.info || {};
      const useMask  = !isGlass && !isWater && !!info.alphatest;
      const useBlend = isGlass || isWater || (!!info.translucent && !info.alphatest);
      
      mat = new THREE.MeshStandardMaterial({
        map: b.texData.texture,
        color: isWater ? 0x66aaff : 0xffffff,
        roughness: isWater ? 0.1 : 0.9,
        metalness: isWater ? 0.2 : 0,
        side: THREE.DoubleSide,
        transparent: useBlend,
        alphaTest: useMask ? 0.5 : 0,
        opacity: isWater ? 0.75 : (isGlass ? 0.30 : 1.0),
        depthWrite: !useBlend
      });
      mat.name = b.matKey || 'tex_mat';
      mat.userData.isGlass = (b.cat === 'glass'); mat.userData.isWater = isWater;
      if (blendOK) applyBlendShader(mat, b.texData, b.texData2);
    } else {
      mat = VMF_MATS[b.cat] || VMF_MATS.other;
    }
    
    const mesh = new THREE.Mesh(g, mat); mesh.name = key;
    if (b.isSky){ mesh.userData.isSky = true; mesh.visible = skyOn; }
    if (vmfWireframe && mat.map) mat.wireframe = vmfWireframe;
    vmfGroup.add(mesh);
  }
  vmfScene.add(vmfGroup);

  vmfTrigGroup = new THREE.Group(); vmfTrigGroup.name = 'triggers'; vmfTrigGroup.rotation.x = -Math.PI / 2;
  if (trigPositions.length){
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(trigPositions, 3));
    vmfTrigGroup.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.65 })));
  }
  vmfTrigGroup.visible = vmfUI.optTriggers.checked; vmfScene.add(vmfTrigGroup);

  vmfEntGroup = new THREE.Group(); vmfEntGroup.name = 'entities'; vmfEntGroup.rotation.x = -Math.PI / 2; vmfEntGroup.visible = vmfUI.optEntities.checked;
  {
    const pos = [], col = []; const C_LIGHT = new THREE.Color(0xffe066), C_PROP = new THREE.Color(0x62b6ff), C_NPC = new THREE.Color(0x6ee7a0), C_OTHER = new THREE.Color(0xd98cff);
    const showIcons = vmfUI.optEntIcons ? vmfUI.optEntIcons.checked : true, onTop = vmfUI.optEntIconsTop ? vmfUI.optEntIconsTop.checked : true;
    const iconSize = vmfUI.iconSize ? (+vmfUI.iconSize.value || 96) : 96;
    for (const e of entities){
      if (!e.origin) continue;
      if (e.model && hasModelForPath(e.model)) continue;
      const nums = String(e.origin).match(VMF_NUM_RE); if (!nums || nums.length < 3) continue;
      const x = +nums[0], y = +nums[1], z = +nums[2]; let c = C_OTHER;
      if (e.classname.startsWith('light')) c = C_LIGHT; else if (e.classname.startsWith('prop_')) c = C_PROP; else if (e.classname.startsWith('npc_')) c = C_NPC;
      const tex = showIcons ? iconTex(e.classname) : null;
      if (tex){
        const mat = new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthTest: !onTop, depthWrite: false, sizeAttenuation: true, toneMapped: false });
        const spr = new THREE.Sprite(mat); spr.position.set(x, y, z); spr.scale.set(iconSize, iconSize, 1); spr.renderOrder = onTop ? 999 : 1; spr.userData.classname = e.classname; spr.userData.ent = e; vmfEntGroup.add(spr);
      } else { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
    }
    if (pos.length){
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); eg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      vmfEntGroup.add(new THREE.Points(eg, new THREE.PointsMaterial({ size: 14, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })));
    }
  }
  vmfScene.add(vmfEntGroup);
  _entsAll = entities; entSetContext({ kind: 'vmf', tree, entities: entities.filter(e => e.node), name: currentMapName });
  cutsceneMapChanged();

  _loadEntityModels(entities, vmfEntGroup, token).then(() => {
  if (token === _vmfLoadToken){
    applyVrad();
    sceneAnimMapReady();
  }
}).catch(err => console.warn('[vmf] entity models:', err));

  const box = mapBox(), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  buildVrad(box); applyVrad();
  _fogSrc = fogPick(fogEnts); applyFog();

  document.getElementById('s-solids').textContent = solids.length.toLocaleString(LANG);
  document.getElementById('s-faces').textContent = faceCount.toLocaleString(LANG);
  document.getElementById('s-tris').textContent = triCount.toLocaleString(LANG);
  document.getElementById('s-ents').textContent = entities.length.toLocaleString(LANG);
  document.getElementById('s-mats').textContent = [...buckets.keys()].length.toLocaleString(LANG);
  document.getElementById('s-tex').textContent = Store.listByExt('vtf').length.toLocaleString(LANG);
  const sIco = document.getElementById('s-icons'); if (sIco) sIco.textContent = EntityIcons.count.toLocaleString(LANG);
  const sDisp = document.getElementById('s-disp'); if (sDisp) sDisp.textContent = dispCount.toLocaleString(LANG) + (_dispBlocksSeen !== dispCount ? ' / ' + _dispBlocksSeen.toLocaleString(LANG) : '');
  document.getElementById('s-size').textContent = isFinite(size.x) ? `${Math.round(size.x)}×${Math.round(size.y)}×${Math.round(size.z)}` : '—';

  if (!opts.skipFit) { vmfFitCamera(box, center, size); } else { vmfControls.update(); }
  vmfUI.btnShot.disabled = false; vmfUI.btnFit.disabled = false; vmfUI.btnWire.disabled = false; vmfUI.btnPanel.disabled = false; vmfUI.btnGLB.disabled = false;
  vmfSetProgress(1); setTimeout(() => vmfSetProgress(0), 500); vmfLoaded = true;
  vmfSetStatus('done_brushes', { n: solids.length, m: triCount.toLocaleString(LANG) }, false);
}

export async function loadVMAPBuffer(buf, name, opts = {}){
  disposeVrad(); applyVrad();
  _fogSrc = null; _fogAny = false; applyFog();
  const token = ++_vmfLoadToken;
  disposeGroup(vmfGroup); disposeGroup(vmfTrigGroup); disposeGroup(vmfEntGroup);
  sceneAnimReset();
  vmfGroup = vmfTrigGroup = vmfEntGroup = null;
  currentMapName = (name || 'map').replace(/\.txt$/i, '').replace(/\.vmap$/i, '');
  currentMapText = '\u0000vmap'; currentMapBuf = buf; currentMapKind = 'vmap';
  vmfUI.dropzone.classList.add('hidden');
  vmfSetStatus('parsing', null, true); vmfSetProgress(0.05); await nextFrame();
  if (token !== _vmfLoadToken) return;

  let data;
  try { data = parseVMAP(buf); }
  catch (err){
    console.error('[vmap]', err);
    currentMapText = null; currentMapBuf = null; currentMapKind = 'vmf';
    vmfUI.dropzone.classList.remove('hidden'); vmfSetProgress(0);
    vmfSetStatus('error', { msg: err.message }, false);
    return;
  }
  vmfSetStatus('found_brushes', { n: data.stats.meshes }, true); vmfSetProgress(0.6); await nextFrame();
  if (token !== _vmfLoadToken) return;

  const skyOn = vmfUI.optSky ? vmfUI.optSky.checked : false;
  vmfGroup = new THREE.Group(); vmfGroup.name = 'map'; vmfGroup.rotation.x = -Math.PI / 2;
  vmfTrigGroup = new THREE.Group(); vmfTrigGroup.name = 'triggers'; vmfTrigGroup.rotation.x = -Math.PI / 2;
  let matCount = 0;
  for (const [key, b] of data.buckets){
    if (!b.pos.length) continue;
    const cat = materialCategory(key);
    if (cat === 'skip') continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
    if (cat === 'trigger'){
      vmfTrigGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), new THREE.LineBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.65 })));
      g.dispose(); continue;
    }
    const mat = cat === 'other'
      ? new THREE.MeshStandardMaterial({ color: 0x9b9b95, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
      : (VMF_MATS[cat] || VMF_MATS.other);
    if (cat === 'other') mat.name = key;
    const mesh = new THREE.Mesh(g, mat); mesh.name = key;
    if (cat === 'sky'){ mesh.userData.isSky = true; mesh.visible = skyOn; }
    if (vmfWireframe && cat === 'other') mat.wireframe = true;
    vmfGroup.add(mesh); matCount++;
  }
  vmfScene.add(vmfGroup);
  vmfTrigGroup.visible = vmfUI.optTriggers.checked; vmfScene.add(vmfTrigGroup);

  vmfEntGroup = new THREE.Group(); vmfEntGroup.name = 'entities'; vmfEntGroup.rotation.x = -Math.PI / 2; vmfEntGroup.visible = vmfUI.optEntities.checked;
  {
    const pos = [], col = [];
    const C_LIGHT = new THREE.Color(0xffe066), C_PROP = new THREE.Color(0x62b6ff), C_NPC = new THREE.Color(0x6ee7a0), C_OTHER = new THREE.Color(0xd98cff);
    const showIcons = vmfUI.optEntIcons ? vmfUI.optEntIcons.checked : true, onTop = vmfUI.optEntIconsTop ? vmfUI.optEntIconsTop.checked : true;
    const iconSize = vmfUI.iconSize ? (+vmfUI.iconSize.value || 96) : 96;
    for (const e0 of data.entities){
      const e = e0._ad || (e0._ad = vmapEntAdapt(e0));
      const [x, y, z] = e0.origin; let c = C_OTHER;
      if (e.classname.startsWith('light')) c = C_LIGHT; else if (e.classname.startsWith('prop_')) c = C_PROP; else if (e.classname.startsWith('npc_')) c = C_NPC;
      const tex = showIcons ? iconTex(e.classname) : null;
      if (tex){
        const sm = new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthTest: !onTop, depthWrite: false, sizeAttenuation: true, toneMapped: false });
        const spr = new THREE.Sprite(sm); spr.position.set(x, y, z); spr.scale.set(iconSize, iconSize, 1); spr.renderOrder = onTop ? 999 : 1; spr.userData.classname = e.classname; spr.userData.ent = e; vmfEntGroup.add(spr);
      } else { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
    }
    if (pos.length){
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); eg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      vmfEntGroup.add(new THREE.Points(eg, new THREE.PointsMaterial({ size: 14, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })));
    }
  }
  vmfScene.add(vmfEntGroup);
  _entsAll = []; cutsceneMapChanged(); entSetContext({ kind: 'vmap', tree: null, entities: data.entities.map(e => e._ad || (e._ad = vmapEntAdapt(e))), name: currentMapName });

  const box = mapBox(), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const setS = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setS('s-solids', data.stats.meshes.toLocaleString(LANG));
  setS('s-faces', data.stats.faces.toLocaleString(LANG));
  setS('s-tris', data.stats.tris.toLocaleString(LANG));
  setS('s-ents', data.entities.length.toLocaleString(LANG));
  setS('s-mats', matCount.toLocaleString(LANG));
  setS('s-tex', Store.listByExt('vtf').length.toLocaleString(LANG));
  setS('s-icons', EntityIcons.count.toLocaleString(LANG));
  setS('s-disp', '—');
  setS('s-size', isFinite(size.x) ? `${Math.round(size.x)}×${Math.round(size.y)}×${Math.round(size.z)}` : '—');

  if (!opts.skipFit) vmfFitCamera(box, center, size); else vmfControls.update();
  vmfUI.btnShot.disabled = false; vmfUI.btnFit.disabled = false; vmfUI.btnWire.disabled = false; vmfUI.btnPanel.disabled = false; vmfUI.btnGLB.disabled = false;
  vmfSetProgress(1); setTimeout(() => vmfSetProgress(0), 500); vmfLoaded = true;
  vmfSetStatus('done_brushes', { n: data.stats.meshes, m: data.stats.tris.toLocaleString(LANG) }, false);
}

export async function loadMapFromStore(path){
  const rec = Store.get(path);
  if (!rec) throw new Error('map not found: ' + path);
  const buf = await getRecordBuffer(rec);
  const name = path.split('/').pop() || 'map';
  const tabEl = document.querySelector('#topbar .tab[data-tab="vmf"]');
  if (tabEl) tabEl.click();
  await new Promise(r => setTimeout(r, 60));
  if (isVMAP(buf)) return loadVMAPBuffer(buf, name);
  return loadVMFText(new TextDecoder('utf-8').decode(buf), name);
}

export function vmfFitCamera(box, center, size){
  if (!isFinite(size.x) || size.length() === 0){ vmfCamera.position.set(600, 600, 600); vmfControls.target.set(0, 0, 0); vmfControls.update(); return; }
  const radius = Math.max(size.length() * 0.5, 64); vmfControls.target.copy(center);
  vmfCamera.position.copy(center).add(new THREE.Vector3(radius * 0.85, radius * 0.75, radius * 0.85));
  vmfCamera.near = Math.max(1, radius / 2000); vmfCamera.far = radius * 30 + 20000;
  vmfCamera.updateProjectionMatrix(); vmfControls.update();
  vmfGrid.position.y = box.min.y - 1; const gs = Math.max(1024, Math.ceil(radius * 2 / 512) * 512); vmfGrid.scale.setScalar(gs / 4096);
}

async function openMapFile(file){
  const buf = await file.arrayBuffer();
  if (isVMAP(buf)) return loadVMAPBuffer(buf, file.name);
  return loadVMFText(new TextDecoder('utf-8').decode(buf), file.name);
}

export function initVMF() {
  new ResizeObserver(vmfResize).observe(document.getElementById('paneVmf'));
  initVradUI();
  initFogUI();
  initEntEditor({
    canvas: vmfCanvas, camera: vmfCamera, controls: vmfControls, getGroup: () => vmfEntGroup,
    onEdit: (e) => {
      try {
        if (/^light/.test(e.classname)){ buildVrad(mapBox()); applyVrad(); }
        else if (e.classname === 'env_fog_controller'){ _fogSrc = fogPick(_entsAll.filter(x => x.classname === 'env_fog_controller')); applyFog(); }
      } catch (err) { console.warn('[ent] onEdit', err); }
    }
  });
  const sv = document.getElementById('vmfBtnSaveVmf'); if (sv) sv.onclick = () => saveVMF();
  initDemo({
    scene: vmfScene, camera: vmfCamera, controls: vmfControls,
    status: txt => vmfSetStatus(txt, null, false), hideDrop: () => vmfUI.dropzone.classList.add('hidden'),
    hasMap: () => !!vmfGroup, getMapName: () => currentMapName,
    fit: (box, center, size) => vmfFitCamera(box, center, size)
  });
  initSceneAnim({
  scene: vmfScene,
  camera: vmfCamera,
  controls: vmfControls,
  canvas: vmfCanvas,
  status: txt => vmfSetStatus(txt, null, false),
  getEntities: () => _entsAll,
  getWrappers: () => {
    const out = [];
    if (vmfEntGroup) vmfEntGroup.traverse(o => { if (o.userData && o.userData.isEntityModel) out.push(o); });
    return out;
  },
  optAttach: () => !!(vmfUI.optAttach && vmfUI.optAttach.checked),
  applyVrad: () => { try { applyVrad(); } catch (_) {} }
});

  // Initialize the cutscene module with the same live scene/camera used by the VMF viewer.
  initCutscene({
    scene: vmfScene, camera: vmfCamera, controls: vmfControls, canvas: vmfCanvas,
    status: txt => vmfSetStatus(txt, null, false),
    getEntities: () => _entsAll,
    getWrappers: () => {
      const out = [];
      if (vmfEntGroup) vmfEntGroup.traverse(o => { if (o.userData && o.userData.isEntityModel) out.push(o); });
      return out;
    },
    getWorldMeshes: vmfWorldMeshes,
    hasMap: () => !!vmfGroup,
    getMapName: () => currentMapName,
    hideDrop: () => vmfUI.dropzone.classList.add('hidden'),
    fit: (box, center, size) => vmfFitCamera(box, center, size),
    setRenderSize: (w, h) => {
      if (w > 0 && h > 0) _fixedSize = { w, h };
      else _fixedSize = null;
      vmfResize();
    },
    setClean: vmfSetClean
  });

  {
    const demBtn = document.getElementById('vmfBtnDem');
    if (demBtn) demBtn.style.display = Plugins.isEnabled('dem') ? '' : 'none';
    const cutBtn = document.getElementById('vmfBtnCut');
    if (cutBtn && !Plugins.isEnabled('cutscene')) cutBtn.style.display = 'none';
  }
  Plugins.on((k, v) => {
    if (k === 'dem'){
      const b = document.getElementById('vmfBtnDem');
      if (b) b.style.display = v ? '' : 'none';
      if (!v){
        const bar = document.getElementById('demBar'); if (bar) bar.hidden = true;
        const info = document.getElementById('demInfo'); if (info) info.hidden = true;
      }
    }
    if (k === 'physics') cutsceneReload();
    if (k === 'cutscene'){
      const b = document.getElementById('vmfBtnCut');
      if (!v){
        if (b) b.style.display = 'none';
        unloadCutscene();
      } else if (vmfLoaded){
        cutsceneMapChanged();
      }
    }
  });

  function vmfAnimate(now){
  requestAnimationFrame(vmfAnimate);
  if (document.getElementById('paneVmf').classList.contains('active')) {
    stepSceneAnims(now);
    if (!isScenePovActive()) vmfControls.update();
    applyScenePovCamera();
    vmfRenderer.render(vmfScene, vmfCamera);
  }
}
requestAnimationFrame(vmfAnimate);

  document.getElementById('vmfBtnOpen').addEventListener('click', () => document.getElementById('vmfFileInput').click());
  document.getElementById('vmfCard').addEventListener('click', () => document.getElementById('vmfFileInput').click());
  document.getElementById('vmfBtnTex').addEventListener('click', () => document.getElementById('vmfTexInput').click());

  const icoBadge = () => { const b = document.getElementById('vmfIconBadge'); if (b) b.textContent = EntityIcons.count; };
  EntityIcons.onChange(icoBadge);
  icoBadge();

  document.getElementById('vmfBtnIcons').addEventListener('click', () => document.getElementById('vmfIconInput').click());
  document.getElementById('vmfIconInput').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    vmfSetStatus('Загрузка иконок…', null, true);
    try {
      const before = EntityIcons.count;
      await addFilesToStore(files.map(f => ({ path: f.name, file: f })));
      vmfSetStatus('Иконок загружено: {n}', { n: EntityIcons.count - before }, false);
      if (currentMapText) await reloadCurrent();
    } catch (err) { vmfSetStatus('error', { msg: err.message }, false); }
  });

  document.getElementById('vmfTexInput').addEventListener('change', async e => {
    if (e.target.files.length){
      const list = [...e.target.files].map(f => ({ path: f.webkitRelativePath || f.name, file: f }));
      const { normal, result } = await splitAndIngestArchives(list);
      if (normal.length) await addFilesToStore(normal);
      rebuildFileMapFromStore();
      await TexStore.rebuild();
      if (currentMapText) await reloadCurrent();
      else if (result?.errors?.length) vmfSetStatus('error', { msg: result.errors.join('; ') }, false);
      else vmfSetStatus('tex_added', null, false);
    }
    e.target.value = '';
  });

  document.getElementById('vmfFileInput').addEventListener('change', async e => {
    if (e.target.files && e.target.files[0]){
      const file = e.target.files[0];
      if (/\.dem$/i.test(file.name)){ await loadDemoFile(file); e.target.value = ''; return; }
      if (/\.bsp$/i.test(file.name)){
        vmfSetStatus('reading', null, true);
        try {
          const frame = document.getElementById('converterFrame');
          if (!frame || !frame.contentWindow) throw new Error('Конвертер не загружен');
          const requestId = Date.now() + Math.floor(Math.random() * 1000);
          const result = new Promise((resolve, reject) => {
            const onMessage = ev => {
              const d = ev.data || {}; if (d.requestId !== requestId || !['sav-bsp-converted','sav-bsp-error'].includes(d.type)) return;
              window.removeEventListener('message', onMessage);
              if (d.type === 'sav-bsp-error') { reject(new Error(d.error || 'Ошибка конвертации')); return; }
              (async () => {
                const safe = String(d.name || 'map').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'map';
                const root = `user_maps/${safe}/`;
                const rows = (d.files || []).map(x => ({ path: root + String(x.name || 'resource').replace(/\\/g, '/').replace(/^\/+/, ''), file: new File([x.data], x.name || 'resource') }));
                if (!rows.some(x => /\.vmf$/i.test(x.path))) throw new Error('Конвертер не вернул VMF');
                await addFilesToStore(rows, { silent: true }); rebuildFileMapFromStore();
                const recPath = rows.find(x => /\.vmf$/i.test(x.path)).path;
                await loadMapFromStore(recPath); resolve();
              })().catch(reject);
            };
            window.addEventListener('message', onMessage);
          });
          frame.contentWindow.postMessage({ type: 'sav-convert-bsp', requestId, name: file.name, buffer: await file.arrayBuffer() }, '*');
          await result;
        } catch (err) { vmfSetStatus('error', { msg: err.message }, false); }
      } else if (/\.(vpk|wad|pak)$/i.test(file.name)){
        try {
          const r = await ingestArchives([{ file, path: file.name }]);
          rebuildFileMapFromStore();
          if (r.errors && r.errors.length) vmfSetStatus('error', { msg: r.errors.join('; ') }, false);
          else vmfSetStatus('archives_loaded', { vtf: r.vtfCount, ico: r.iconCount }, false);
          if (currentMapText) await reloadCurrent();
        } catch (err) { vmfSetStatus('error', { msg: err.message }, false); }
      } else {
        vmfSetStatus('reading', null, true);
        try { await addFilesToStore([{ path: file.name, file }], { silent: true }); rebuildFileMapFromStore(); await openMapFile(file); }
        catch (err) { vmfSetStatus('read_fail', null, false); }
      }
    }
    e.target.value = '';
  });

  const paneVmf = document.getElementById('paneVmf');
  ['dragenter', 'dragover'].forEach(ev => paneVmf.addEventListener(ev, e => { e.preventDefault(); vmfUI.dropzone.classList.remove('hidden'); vmfUI.dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => paneVmf.addEventListener(ev, e => { e.preventDefault(); if (ev === 'dragleave' && e.relatedTarget && paneVmf.contains(e.relatedTarget)) return; vmfUI.dropzone.classList.remove('dragover'); }));
  paneVmf.addEventListener('drop', async e => {
    e.preventDefault(); const dt = e.dataTransfer; if (!dt) return;
    try {
      let list = await walkDrop(dt); if (!list.length) return;
      const demItem = list.find(x => /\.dem$/i.test(x.file.name));
      if (demItem){ list = list.filter(x => x !== demItem); if (!list.length){ await loadDemoFile(demItem.file); return; } }
      const { normal, result: archiveResult } = await splitAndIngestArchives(list);
      const hasVmf = normal.some(x => /\.(vmf|vmap|txt|vmx|map)$/i.test(x.file.name));
      if (normal.length) await addFilesToStore(normal);
      rebuildFileMapFromStore();
      if (hasVmf){ const target = normal.find(x => /\.(vmf|vmap|txt|vmx|map)$/i.test(x.file.name)); await openMapFile(target.file); }
      else if (currentMapText) await reloadCurrent();
      if (demItem) await loadDemoFile(demItem.file);
      if (archiveResult && archiveResult.errors && archiveResult.errors.length && !hasVmf){
        vmfSetStatus('error', { msg: archiveResult.errors.join('; ') }, false);
      } else if (archiveResult && archiveResult.vtfCount && !hasVmf){
        vmfSetStatus('archives_loaded', { vtf: archiveResult.vtfCount, ico: archiveResult.iconCount }, false);
      }
    } catch (err) { vmfSetStatus('error', { msg: err.message }, false); }
  });

  vmfUI.optTriggers.addEventListener('change', () => { if (vmfTrigGroup) vmfTrigGroup.visible = vmfUI.optTriggers.checked; });
  if (vmfUI.optSky) vmfUI.optSky.addEventListener('change', () => {
    if (vmfGroup) vmfGroup.traverse(o => { if (o.userData && o.userData.isSky) o.visible = vmfUI.optSky.checked; });
    if (_hasSky3Ents) reloadKeepCamera();
  });
  vmfUI.optEntities.addEventListener('change', () => { if (vmfEntGroup) vmfEntGroup.visible = vmfUI.optEntities.checked; });
  vmfUI.optGlass.addEventListener('change', () => {
    VMF_MATS.glass.opacity = vmfUI.optGlass.checked ? 0.30 : 1.0;
    VMF_MATS.glass.transparent = vmfUI.optGlass.checked; VMF_MATS.glass.needsUpdate = true;
    if (vmfGroup){ vmfGroup.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.isGlass){ o.material.transparent = vmfUI.optGlass.checked; o.material.opacity = vmfUI.optGlass.checked ? 0.30 : 1.0; o.material.depthWrite = !vmfUI.optGlass.checked; o.material.needsUpdate = true; } }); }
  });

  vmfUI.optTex.addEventListener('change', async () => {
    if (!currentMapText) return;
    const savedPos = vmfCamera.position.clone();
    const savedTarget = vmfControls.target.clone();
    const savedNear = vmfCamera.near, savedFar = vmfCamera.far;
    await reloadCurrent();
    vmfCamera.position.copy(savedPos);
    vmfControls.target.copy(savedTarget);
    vmfCamera.near = savedNear; vmfCamera.far = savedFar;
    vmfCamera.updateProjectionMatrix();
    vmfControls.update();
  });
  if (vmfUI.optEntIcons) vmfUI.optEntIcons.addEventListener('change', () => { if (!vmfEntGroup) return; vmfEntGroup.traverse(o => { if (o.isSprite) o.visible = vmfUI.optEntIcons.checked; }); });
  if (vmfUI.optEntIconsTop) vmfUI.optEntIconsTop.addEventListener('change', () => { if (!vmfEntGroup) return; const onTop = vmfUI.optEntIconsTop.checked; vmfEntGroup.traverse(o => { if (o.isSprite && o.material){ o.material.depthTest = !onTop; o.material.needsUpdate = true; o.renderOrder = onTop ? 999 : 1; } }); });
  if (vmfUI.iconSize) vmfUI.iconSize.addEventListener('change', () => { if (!vmfEntGroup) return; const s = +vmfUI.iconSize.value || 96; vmfEntGroup.traverse(o => { if (o.isSprite) o.scale.set(s, s, 1); }); });

  if (vmfUI.optEntModels) vmfUI.optEntModels.addEventListener('change', () => {
    if (!vmfEntGroup) return;
    const show = vmfUI.optEntModels.checked;
    vmfEntGroup.traverse(o => {
      if (o.userData && o.userData.isModelGroup) o.visible = show;
    });
  });

  if (vmfUI.optAttach) vmfUI.optAttach.addEventListener('change', () => {
    if (!vmfEntGroup) return;
    const show = vmfUI.optAttach.checked;
    vmfEntGroup.traverse(o => {
      if (o.userData && o.userData.isAttachmentMarker) o.visible = show;
    });
  });

  document.getElementById('vmfBtnFit').addEventListener('click', () => { if (!vmfGroup) return; const box = mapBox(); vmfFitCamera(box, box.getCenter(new THREE.Vector3()), box.getSize(new THREE.Vector3())); });
  document.getElementById('vmfBtnWire').addEventListener('click', e => {
    vmfWireframe = !vmfWireframe; e.currentTarget.classList.toggle('active', vmfWireframe);
    for (const k in VMF_MATS) VMF_MATS[k].wireframe = vmfWireframe;
    if (vmfGroup) vmfGroup.traverse(o => { if (o.isMesh && o.material && o.material.map) o.material.wireframe = vmfWireframe; });
  });
  document.getElementById('vmfBtnPanel').addEventListener('click', () => { vmfUI.panel.classList.toggle('open'); document.getElementById('vmfBtnPanel').classList.toggle('active', vmfUI.panel.classList.contains('open')); });

  document.getElementById('vmfBtnShot').addEventListener('click', async () => {
    if (!vmfGroup) return; const btn = document.getElementById('vmfBtnShot'); btn.disabled = true;
    const prevPanelOpen = vmfUI.panel.classList.contains('open'), prevStatusHidden = document.getElementById('vmfStatus').classList.contains('hide'), prevHintHidden = document.getElementById('vmfHint').classList.contains('hide');
    if (document.getElementById('optUI').checked){ vmfUI.panel.classList.remove('open'); document.getElementById('vmfBtnPanel').classList.remove('active'); document.getElementById('vmfStatus').classList.add('hide'); document.getElementById('vmfHint').classList.add('hide'); await nextFrame(); await nextFrame(); }
    const oldPR = vmfRenderer.getPixelRatio();
    if (document.getElementById('optHD').checked){ vmfRenderer.setPixelRatio(oldPR * 2); vmfRenderer.setSize(paneVmf.clientWidth, paneVmf.clientHeight, false); vmfCamera.aspect = paneVmf.clientWidth / paneVmf.clientHeight; vmfCamera.updateProjectionMatrix(); await nextFrame(); await nextFrame(); }
    vmfRenderer.render(vmfScene, vmfCamera); const url = vmfRenderer.domElement.toDataURL('image/png');
    if (document.getElementById('optHD').checked){ vmfRenderer.setPixelRatio(oldPR); vmfRenderer.setSize(paneVmf.clientWidth, paneVmf.clientHeight, false); vmfCamera.aspect = paneVmf.clientWidth / paneVmf.clientHeight; vmfCamera.updateProjectionMatrix(); }
    if (document.getElementById('optUI').checked && prevPanelOpen){ vmfUI.panel.classList.add('open'); document.getElementById('vmfBtnPanel').classList.add('active'); }
    if (!prevStatusHidden) document.getElementById('vmfStatus').classList.remove('hide');
    if (!prevHintHidden) document.getElementById('vmfHint').classList.remove('hide');
    const fl = document.getElementById('vmfFlash'); fl.classList.add('on'); requestAnimationFrame(() => fl.classList.remove('on'));
    const ts = new Date(), pad = n => String(n).padStart(2, '0');
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    const suffix = document.getElementById('optHD').checked ? '_HD' : ''; const fname = `${currentMapName}_${stamp}${suffix}.png`;
    const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    btn.disabled = false; vmfSetStatus('shot_saved', { name: fname }, false);
  });

  document.getElementById('vmfBtnGLB').addEventListener('click', async () => {
    if (!vmfGroup) return; const btn = document.getElementById('vmfBtnGLB'); btn.disabled = true; vmfSetStatus('prep_glb', null, true); vmfSetProgress(0.05); await nextFrame();
    const root = new THREE.Group(); root.name = currentMapName || 'map'; root.add(vmfGroup.clone(true));
    if (document.getElementById('optGLBEnts').checked && vmfEntGroup){ const entClone = vmfEntGroup.clone(true); const sprites = []; entClone.traverse(o => { if (o.isSprite) sprites.push(o); }); for (const sp of sprites) if (sp.parent) sp.parent.remove(sp); root.add(entClone); }
    if (document.getElementById('optGLBTriggers').checked && vmfTrigGroup){ root.add(vmfTrigGroup.clone(true)); }
    root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      if (Array.isArray(o.material)) o.material = o.material.map(m => m.clone());
      else o.material = o.material.clone();
      const m = o.material;
      if (m.wireframe) m.wireframe = false;
      const isGlass = m.userData && m.userData.isGlass;
      if (isGlass && m.transparent && m.opacity < 1){
        m.alphaTest = 0;
        m.depthWrite = false;
        m.transparent = true;
      } else if (m.alphaTest > 0){
        m.opacity = 1.0;
        m.transparent = false;
      }
      m.needsUpdate = true;
    });
    const maxTex = parseInt(document.getElementById('glbTexSize').value, 10) || 2048; const exporter = new GLTFExporter();
    await new Promise(resolve => {
      exporter.parse(root, (result) => {
        try {
          const blob = new Blob([result], { type: 'model/gltf-binary' }); const url = URL.createObjectURL(blob); const fname = (currentMapName || 'map') + '.glb';
          const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 60000); vmfSetStatus('glb_saved', { name: fname, size: (blob.size / 1024 / 1024).toFixed(1) }, false);
        } catch (e) { vmfSetStatus('error', { msg: e.message }, false); } finally { btn.disabled = false; resolve(); }
      }, (e) => { vmfSetStatus('error', { msg: (e.message || e) }, false); btn.disabled = false; resolve(); }, { binary: true, embedImages: true, onlyVisible: false, maxTextureSize: maxTex });
    });
  });
  setTimeout(() => document.getElementById('vmfHint').classList.add('hide'), 6000);
}