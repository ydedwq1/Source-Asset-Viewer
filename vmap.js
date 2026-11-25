// vmap.js — карты Source 2 (Hammer / CS2): DMX binary 5–9, формат vmap.
// Чистый JS, без зависимостей. Отдаёт готовую геометрию в мировых координатах (Z вверх, как в VMF).
//
//   isVMAP(buffer)            -> bool
//   parseVMAP(buffer)         -> { version, buckets, entities, stats, assetRefs }
//     buckets:  Map<materialKey, { material, pos[], nrm[], uv[] }>   (треугольники, мировые координаты)
//     entities: [{ classname, targetname, origin:[x,y,z], angles:[p,y,r], model, props }]

const TD = new TextDecoder('utf-8');

/* ======================================================================
   DMX binary reader
   ====================================================================== */
const T = { ELEM: 1, INT: 2, FLOAT: 3, BOOL: 4, STR: 5, BIN: 6, TIME: 7, COLOR: 8, V2: 9, V3: 10, V4: 11, ANG: 12, QUAT: 13, MAT: 14, U64: 15, U8: 16 };
const ARR = 32;   // типы массивов = базовый тип + 32

export function isVMAP(buffer){
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer, 0, Math.min(64, buffer.byteLength));
  const head = TD.decode(u8.subarray(0, 64));
  return head.startsWith('<!-- dmx encoding');
}

function parseDMX(buffer){
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let nl = 0; while (nl < u8.length && u8[nl] !== 10) nl++;
  const header = TD.decode(u8.subarray(0, nl));
  const hm = /<!--\s*dmx encoding (\w+)\s+(\d+)\s+format\s+(\S+)\s+(\d+)\s*-->/.exec(header);
  if (!hm) throw new Error('VMAP: не найден заголовок DMX');
  const encoding = hm[1], encVer = +hm[2], format = hm[3], fmtVer = +hm[4];
  if (encoding !== 'binary') throw new Error('VMAP: текстовый DMX (' + encoding + ') не поддерживается — пересохраните карту в Hammer (бинарный формат по умолчанию)');
  if (encVer < 5) throw new Error('VMAP: DMX binary ' + encVer + ' слишком старый (нужен 5+)');

  let p = nl + 1;
  if (u8[p] === 0) p++;                                  // завершающий NUL строки заголовка

  const i32 = () => { const v = dv.getInt32(p, true); p += 4; return v; };
  const u8v = () => u8[p++];
  const f32 = () => { const v = dv.getFloat32(p, true); p += 4; return v; };
  const cstr = () => { let e = p; while (e < u8.length && u8[e] !== 0) e++; const s = TD.decode(u8.subarray(p, e)); p = e + 1; return s; };
  let strings = [];

  const scalar = (t, inlineStr) => {
    switch (t){
      case T.INT: return i32();
      case T.FLOAT: return f32();
      case T.BOOL: return u8v() !== 0;
      case T.STR: return inlineStr ? cstr() : strings[i32()];
      case T.BIN: { const n = i32(); const b = u8.subarray(p, p + n); p += n; return b; }
      case T.TIME: return i32();
      case T.COLOR: { const c = [u8[p], u8[p + 1], u8[p + 2], u8[p + 3]]; p += 4; return c; }
      case T.V2: return [f32(), f32()];
      case T.V3: case T.ANG: return [f32(), f32(), f32()];
      case T.V4: case T.QUAT: return [f32(), f32(), f32(), f32()];
      case T.MAT: { const m = []; for (let i = 0; i < 16; i++) m.push(f32()); return m; }
      case T.U64: { const v = dv.getBigUint64(p, true); p += 8; return v; }
      case T.U8: return u8v();
      case T.ELEM: return { ref: i32() };
      default: throw new Error('VMAP: неизвестный тип атрибута ' + t);
    }
  };
  const readValue = (t, inlineStr) => {
    if (t > ARR){
      const n = i32(), bt = t - ARR, out = new Array(n);
      if (bt === T.INT){ for (let i = 0; i < n; i++) out[i] = dv.getInt32(p + i * 4, true); p += n * 4; return out; }
      if (bt === T.FLOAT){ for (let i = 0; i < n; i++) out[i] = dv.getFloat32(p + i * 4, true); p += n * 4; return out; }
      for (let i = 0; i < n; i++) out[i] = bt === T.STR ? cstr() : scalar(bt, inlineStr);
      return out;
    }
    return scalar(t, inlineStr);
  };

  // prefix-элементы (имена атрибутов и строки записаны прямо в тексте)
  const prefix = {};
  const pc = i32();
  for (let k = 0; k < pc; k++){
    const na = i32();
    for (let a = 0; a < na; a++){ const nm = cstr(), t = u8v(); prefix[nm] = readValue(t, true); }
  }
  // словарь строк
  const sc = i32(); strings = new Array(sc); for (let i = 0; i < sc; i++) strings[i] = cstr();
  // заголовки элементов
  const ec = i32(), els = new Array(ec);
  for (let i = 0; i < ec; i++){
    const type = strings[i32()], name = strings[i32()]; p += 16;     // GUID пропускаем
    els[i] = { type, name, a: Object.create(null) };
  }
  // атрибуты
  for (let i = 0; i < ec; i++){
    const na = i32(), A = els[i].a;
    for (let k = 0; k < na; k++){
      const nm = strings[i32()], t = u8v();
      if (t === T.BIN + ARR){ const n = i32(), v = []; for (let q = 0; q < n; q++){ const l = i32(); v.push(u8.subarray(p, p + l)); p += l; } A[nm] = v; }
      else A[nm] = readValue(t, false);
    }
  }
  return { header, encVer, format, fmtVer, prefix, els };
}

/* ======================================================================
   Math: углы Source (pitch, yaw, roll) -> матрица, как AngleMatrix() в engine
   ====================================================================== */
const D2R = Math.PI / 180;
function angleMatrix(a){
  const sp = Math.sin(a[0] * D2R), cp = Math.cos(a[0] * D2R);
  const sy = Math.sin(a[1] * D2R), cy = Math.cos(a[1] * D2R);
  const sr = Math.sin(a[2] * D2R), cr = Math.cos(a[2] * D2R);
  return [
    cp * cy,  sr * sp * cy - cr * sy,  cr * sp * cy + sr * sy,
    cp * sy,  sr * sp * sy + cr * cy,  cr * sp * sy - sr * cy,
    -sp,      sr * cp,                 cr * cp
  ];                                                    // row-major 3x3
}
const mul3 = (A, B) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
};
/* ======================================================================
   Material key
   ====================================================================== */
export function vmatKey(s){
  let m = String(s || '').toLowerCase().replace(/\\/g, '/').replace(/\.vmat(_c)?$/, '');
  const i = m.lastIndexOf('materials/'); if (i >= 0) m = m.slice(i + 10);
  return m.replace(/^\/+/, '');
}

/* ======================================================================
   Triangulation (ear clipping в проекции по доминирующей оси нормали)
   ====================================================================== */
function triangulate(P){                                // P: [[x,y,z], ...]  ->  индексы в P
  const n = P.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];
  // нормаль Ньюэлла
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++){ const a = P[i], b = P[(i + 1) % n]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  let u, v, sgn;
  if (az >= ax && az >= ay){ u = 0; v = 1; sgn = nz >= 0 ? 1 : -1; }
  else if (ax >= ay){ u = 1; v = 2; sgn = nx >= 0 ? 1 : -1; }
  else { u = 2; v = 0; sgn = ny >= 0 ? 1 : -1; }
  const X = i => P[i][u], Y = i => P[i][v];
  const cross = (a, b, c) => sgn * ((X(b) - X(a)) * (Y(c) - Y(a)) - (Y(b) - Y(a)) * (X(c) - X(a)));
  const inTri = (a, b, c, q) => cross(a, b, q) >= -1e-9 && cross(b, c, q) >= -1e-9 && cross(c, a, q) >= -1e-9;
  const idx = []; for (let i = 0; i < n; i++) idx.push(i);
  const out = []; let guard = n * n + 8;
  while (idx.length > 3 && guard-- > 0){
    let clipped = false;
    for (let i = 0; i < idx.length; i++){
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cross(a, b, c) <= 1e-9) continue;             // вогнутая вершина
      let ok = true;
      for (const q of idx){ if (q === a || q === b || q === c) continue; if (inTri(a, b, c, q)){ ok = false; break; } }
      if (!ok) continue;
      out.push(a, b, c); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  else if (idx.length > 3) for (let i = 1; i < idx.length - 1; i++) out.push(idx[0], idx[i], idx[i + 1]);   // вырожденный полигон — веер
  return out;
}

/* ======================================================================
   Polygon mesh (half-edge) -> треугольники по материалам
   ====================================================================== */
function streamMap(els, arrRef){
  const out = {};
  if (!arrRef || arrRef.ref < 0) return out;
  const arr = els[arrRef.ref]; if (!arr) return out;
  for (const sr of (arr.a.streams || [])){
    const s = els[sr.ref]; if (!s) continue;
    const nm = s.a.standardAttributeName || (s.name || '').split(':')[0];
    out[nm] = s.a.data;
  }
  return out;
}

function meshToBuckets(els, meshEl, xf, buckets, stats){
  const m = meshEl.a;
  const vIdx = m.vertexDataIndices, eVert = m.edgeVertexIndices, eNext = m.edgeNextIndices;
  const eVD = m.edgeVertexDataIndices, fEdge = m.faceEdgeIndices, fDataIdx = m.faceDataIndices;
  if (!eVert || !eNext || !fEdge || !vIdx) return;
  const vd = streamMap(els, m.vertexData), fvd = streamMap(els, m.faceVertexData), fd = streamMap(els, m.faceData);
  const pos = vd.position; if (!pos) return;
  const nrmS = fvd.normal, uvS = fvd.texcoord, matIdx = fd.materialindex;
  const mats = (m.materials || []).map(vmatKey);
  const { M, T } = xf;
  // матрица нормалей: для M = R*S берём обратную транспонированную через масштаб по столбцам
  const cl = [Math.hypot(M[0], M[3], M[6]) || 1, Math.hypot(M[1], M[4], M[7]) || 1, Math.hypot(M[2], M[5], M[8]) || 1];
  const NM = [M[0] / (cl[0] * cl[0]), M[1] / (cl[1] * cl[1]), M[2] / (cl[2] * cl[2]),
              M[3] / (cl[0] * cl[0]), M[4] / (cl[1] * cl[1]), M[5] / (cl[2] * cl[2]),
              M[6] / (cl[0] * cl[0]), M[7] / (cl[1] * cl[1]), M[8] / (cl[2] * cl[2])];
  const wp = p => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + T[0], M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + T[1], M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + T[2]];
  const wn = q => {
    const x = NM[0] * q[0] + NM[1] * q[1] + NM[2] * q[2], y = NM[3] * q[0] + NM[4] * q[1] + NM[5] * q[2], z = NM[6] * q[0] + NM[7] * q[1] + NM[8] * q[2];
    const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l];
  };
  const flip = (M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6])) < 0;   // зеркалирование меняет обход

  for (let f = 0; f < fEdge.length; f++){
    const e0 = fEdge[f]; if (e0 < 0) continue;
    const loop = []; let e = e0, guard = 0;
    do { loop.push(e); e = eNext[e]; } while (e !== e0 && e >= 0 && ++guard < 4096);
    if (loop.length < 3) continue;
    const P = loop.map(ed => pos[vIdx[eVert[ed]]]);
    if (P.some(q => !q)) continue;
    const tris = triangulate(P); if (!tris.length) continue;

    const mi = matIdx ? matIdx[fDataIdx ? fDataIdx[f] : f] : 0;
    const matName = mats[mi] !== undefined ? mats[mi] : (mats[0] || '');
    let b = buckets.get(matName);
    if (!b){ b = { material: matName, pos: [], nrm: [], uv: [] }; buckets.set(matName, b); }

    // нормаль грани по Ньюэллу на случай отсутствия потока normal
    let fx = 0, fy = 0, fz = 0;
    for (let i = 0; i < P.length; i++){ const a = P[i], c = P[(i + 1) % P.length]; fx += (a[1] - c[1]) * (a[2] + c[2]); fy += (a[2] - c[2]) * (a[0] + c[0]); fz += (a[0] - c[0]) * (a[1] + c[1]); }
    const fl = Math.hypot(fx, fy, fz) || 1, FN = [fx / fl, fy / fl, fz / fl];

    const W = P.map(wp);
    const N = loop.map(ed => { const q = nrmS && eVD ? nrmS[eVD[ed]] : null; return wn(q || FN); });
    const U = loop.map(ed => (uvS && eVD && uvS[eVD[ed]]) || [0, 0]);
    for (let i = 0; i < tris.length; i += 3){
      const ord = flip ? [tris[i], tris[i + 2], tris[i + 1]] : [tris[i], tris[i + 1], tris[i + 2]];
      for (const k of ord){ b.pos.push(W[k][0], W[k][1], W[k][2]); b.nrm.push(N[k][0], N[k][1], N[k][2]); b.uv.push(U[k][0], U[k][1]); }
      stats.tris++;
    }
    stats.faces++;
  }
  stats.meshes++;
}

/* ======================================================================
   Public: parseVMAP
   ====================================================================== */
export function parseVMAP(buffer){
  const dmx = parseDMX(buffer);
  const els = dmx.els;
  const root = els.find(e => e.type === 'CMapRootElement');
  if (!root) throw new Error('VMAP: нет CMapRootElement (это точно .vmap?)');
  const world = root.a.world && els[root.a.world.ref];
  if (!world) throw new Error('VMAP: нет CMapWorld');

  const buckets = new Map(), entities = [], stats = { meshes: 0, faces: 0, tris: 0, nodes: 0, groups: 0, skipped: 0 };
  const seen = new Set();

  const visit = (el, parentXf, depth) => {
    if (!el || seen.has(el) || depth > 64) return;
    seen.add(el); stats.nodes++;
    const a = el.a;
    const local = { origin: a.origin, angles: a.angles, scales: a.scales };
    const me = composeAffine(parentXf, local);

    if (el.type === 'CMapMesh' || el.type === 'CMapMeshInstance'){
      const md = a.meshData && els[a.meshData.ref];
      if (md && !a.force_hidden) meshToBuckets(els, md, me, buckets, stats); else if (md) stats.skipped++;
    } else if (el.type === 'CMapEntity'){
      const ep = a.entity_properties && els[a.entity_properties.ref];
      const props = {};
      if (ep) for (const k in ep.a){ const v = ep.a[k]; if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') props[k] = v; }
      entities.push({
        classname: String(props.classname || '').toLowerCase(),
        targetname: String(props.targetname || ''),
        origin: [me.T[0], me.T[1], me.T[2]],
        angles: a.angles ? a.angles.slice() : [0, 0, 0],
        model: props.model || props.model_path || null,
        props
      });
    } else if (el.type === 'CMapGroup' || el.type === 'CMapWorld' || el.type === 'CMapPrefab' || el.type === 'CMapInstance'){
      stats.groups++;
    }
    for (const c of (a.children || [])) visit(els[c.ref], me, depth + 1);
  };
  visit(world, { M: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] }, 0);

  // worldspawn → тоже сущность (настройки карты)
  const wp = world.a.entity_properties && els[world.a.entity_properties.ref];
  const worldProps = {}; if (wp) for (const k in wp.a){ const v = wp.a[k]; if (typeof v === 'string') worldProps[k] = v; }

  return {
    version: dmx.fmtVer, encoding: dmx.encVer, buckets, entities, stats, worldProps,
    assetRefs: Array.isArray(dmx.prefix.map_asset_references) ? dmx.prefix.map_asset_references.slice() : [],
    thumbnail: dmx.prefix.asset_preview_thumbnail instanceof Uint8Array ? dmx.prefix.asset_preview_thumbnail : null
  };
}

// Аффинная композиция: parent = { M(3x3 row-major), T }, local = { origin, angles, scales }
function composeAffine(parent, local){
  const o = local.origin || [0, 0, 0], s = local.scales || [1, 1, 1], R = angleMatrix(local.angles || [0, 0, 0]);
  const RS = [R[0] * s[0], R[1] * s[1], R[2] * s[2], R[3] * s[0], R[4] * s[1], R[5] * s[2], R[6] * s[0], R[7] * s[1], R[8] * s[2]];
  const M = mul3(parent.M, RS);
  const T = [parent.M[0] * o[0] + parent.M[1] * o[1] + parent.M[2] * o[2] + parent.T[0],
             parent.M[3] * o[0] + parent.M[4] * o[1] + parent.M[5] * o[2] + parent.T[1],
             parent.M[6] * o[0] + parent.M[7] * o[1] + parent.M[8] * o[2] + parent.T[2]];
  return { M, T };
}
