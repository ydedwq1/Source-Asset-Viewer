// vtf.js
import * as THREE from 'three';
import { Store, normMat, gameOf } from './core.js';
import { getRecordBuffer } from './archives.js';

const IS_COARSE = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;

const VTF_SIG = 0x00465456;
const VTF_FORMAT_NAMES = {
  0:'RGBA8888',1:'ABGR8888',2:'RGB888',3:'BGR888',4:'RGB565',5:'I8',6:'IA88',
  7:'P8',8:'A8',9:'RGB888_BS',10:'BGR888_BS',11:'ARGB8888',12:'BGRA8888',
  13:'DXT1',14:'DXT3',15:'DXT5',16:'BGRX8888',17:'BGR565',18:'BGRX5551',
  19:'BGRA4444',20:'DXT1_1A',21:'BGRA5551',22:'UV88',23:'UVWQ8888',
  24:'RGBA16F',25:'RGBA16',26:'UVLX8888',27:'BC4',28:'BC5'
};
export const vtfFmtName = f => VTF_FORMAT_NAMES[f] || ('Format ' + f);
const vtfIsBlock = f => (f >= 13 && f <= 15) || f === 20 || f === 27 || f === 28;
const vtfBlockSz = f => (f === 13 || f === 20 || f === 27) ? 8 : 16;

function vtfBPP(f){
  switch (f){
    case 0: case 1: case 11: case 12: case 16: case 23: case 26: return 4;
    case 2: case 3: case 9: case 10: return 3;
    case 4: case 6: case 17: case 18: case 19: case 21: case 22: return 2;
    case 5: case 7: case 8: return 1;
    case 24: case 25: return 8;
    default: return 4;
  }
}
function vtfMipSize(w, h, f){
  if (vtfIsBlock(f)) return Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * vtfBlockSz(f);
  return w * h * vtfBPP(f);
}
function alphaPal(a0, a1, p){
  p[0] = a0; p[1] = a1;
  if (a0 > a1) { for (let i = 1; i <= 6; i++) p[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7); }
  else { for (let i = 1; i <= 4; i++) p[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5); p[6] = 0; p[7] = 255; }
  return p;
}

const _aPal = new Uint8Array(8), _aIdx = new Uint8Array(16), _bPal = new Uint8Array(8), _bIdx = new Uint8Array(16);
const _alpha = new Uint8Array(16), _col = new Uint8Array(12);
function bc4Block(u8, at, pal, idx){
  alphaPal(u8[at], u8[at + 1], pal);
  let v = 0, bl = 0, bp = at + 2;
  for (let i = 0; i < 16; i++){ while (bl < 3){ v |= u8[bp++] << bl; bl += 8; } idx[i] = v & 7; v >>>= 3; bl -= 3; }
}
function decodeDXT(u8, off, w, h, f){
  const out = new Uint8Array(w * h * 4), bw = Math.ceil(w / 4), bh = Math.ceil(h / 4);
  const isD1 = (f === 13 || f === 20), aP = _alpha, pal = _col; let p = off;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++){
    if (!isD1){
      if (f === 14){ for (let i = 0; i < 16; i += 2){ const b = u8[p + (i >> 1)]; aP[i] = (b & 0xF) * 17; aP[i + 1] = ((b >> 4) & 0xF) * 17; } }
      else { bc4Block(u8, p, _aPal, _aIdx); for (let i = 0; i < 16; i++) aP[i] = _aPal[_aIdx[i]]; }
      p += 8;
    }
    const c0 = u8[p] | (u8[p + 1] << 8), c1 = u8[p + 2] | (u8[p + 3] << 8);
    const bits = (u8[p + 4] | (u8[p + 5] << 8) | (u8[p + 6] << 16) | (u8[p + 7] << 24)) >>> 0; p += 8;
    const r0 = (c0 >> 11) & 0x1F, g0 = (c0 >> 5) & 0x3F, b0 = c0 & 0x1F;
    const r1 = (c1 >> 11) & 0x1F, g1 = (c1 >> 5) & 0x3F, b1 = c1 & 0x1F;
    const cr0 = (r0 << 3) | (r0 >> 2), cg0 = (g0 << 2) | (g0 >> 4), cb0 = (b0 << 3) | (b0 >> 2);
    const cr1 = (r1 << 3) | (r1 >> 2), cg1 = (g1 << 2) | (g1 >> 4), cb1 = (b1 << 3) | (b1 >> 2);
    pal[0] = cr0; pal[1] = cg0; pal[2] = cb0; pal[3] = cr1; pal[4] = cg1; pal[5] = cb1;
    let t3 = false;
    if (c0 > c1 || !isD1){
      pal[6] = (2 * cr0 + cr1) / 3 | 0; pal[7] = (2 * cg0 + cg1) / 3 | 0; pal[8] = (2 * cb0 + cb1) / 3 | 0;
      pal[9] = (cr0 + 2 * cr1) / 3 | 0; pal[10] = (cg0 + 2 * cg1) / 3 | 0; pal[11] = (cb0 + 2 * cb1) / 3 | 0;
    } else {
      pal[6] = (cr0 + cr1) / 2 | 0; pal[7] = (cg0 + cg1) / 2 | 0; pal[8] = (cb0 + cb1) / 2 | 0;
      pal[9] = 0; pal[10] = 0; pal[11] = 0; t3 = true;
    }
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++){
      const px = bx * 4 + x, py = by * 4 + y; if (px >= w || py >= h) continue;
      const ci = (bits >> ((y * 4 + x) * 2)) & 3, o = (py * w + px) * 4;
      out[o] = pal[ci * 3]; out[o + 1] = pal[ci * 3 + 1]; out[o + 2] = pal[ci * 3 + 2];
      out[o + 3] = isD1 ? (t3 && ci === 3 ? 0 : 255) : aP[y * 4 + x];
    }
  }
  return out;
}
function decodeBC(u8, offset, w, h, f){
  const out = new Uint8Array(w * h * 4);
  const bw = Math.ceil(w / 4), bh = Math.ceil(h / 4);
  let p = offset;
  if (f === 27){
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++){
      bc4Block(u8, p, _aPal, _aIdx); p += 8;
      for (let i = 0; i < 16; i++){
        const x = i & 3, y = i >> 2, px = bx * 4 + x, py = by * 4 + y;
        if (px >= w || py >= h) continue;
        const o = (py * w + px) * 4, v = _aPal[_aIdx[i]];
        out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255;
      }
    }
  } else {
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++){
      bc4Block(u8, p, _aPal, _aIdx); bc4Block(u8, p + 8, _bPal, _bIdx); p += 16;
      for (let i = 0; i < 16; i++){
        const x = i & 3, y = i >> 2, px = bx * 4 + x, py = by * 4 + y;
        if (px >= w || py >= h) continue;
        const o = (py * w + px) * 4;
        const nx = _aPal[_aIdx[i]] / 255 * 2 - 1, ny = _bPal[_bIdx[i]] / 255 * 2 - 1;
        const nzSq = 1 - nx * nx - ny * ny, nz = nzSq > 0 ? Math.sqrt(nzSq) : 0;
        out[o] = Math.round((nx + 1) * 0.5 * 255); out[o + 1] = Math.round((ny + 1) * 0.5 * 255);
        out[o + 2] = Math.round((nz + 1) * 0.5 * 255); out[o + 3] = 255;
      }
    }
  }
  return out;
}
const h2f = h => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, m = h & 1023;
  if (e === 0) return s * m * 5.960464477539063e-8; if (e === 31) return m ? 0 : s * 65504; return s * (1 + m / 1024) * Math.pow(2, e - 15); };
const hdr8 = v => Math.round(255 * Math.pow(v < 0 ? 0 : v > 1 ? 1 : v, 1 / 2.2));
function decodePixels(u8, off, w, h, f){
  if (f === 27 || f === 28) return decodeBC(u8, off, w, h, f);
  if (vtfIsBlock(f)) return decodeDXT(u8, off, w, h, f);
  const out = new Uint8Array(w * h * 4), tot = w * h; let p = off;
  switch (f){
    case 0: for (let i = 0; i < tot; i++, p += 4){ out[i*4]=u8[p]; out[i*4+1]=u8[p+1]; out[i*4+2]=u8[p+2]; out[i*4+3]=u8[p+3]; } break;
    case 1: for (let i = 0; i < tot; i++, p += 4){ out[i*4]=u8[p+3]; out[i*4+1]=u8[p+2]; out[i*4+2]=u8[p+1]; out[i*4+3]=u8[p]; } break;
    case 2: for (let i = 0; i < tot; i++, p += 3){ out[i*4]=u8[p]; out[i*4+1]=u8[p+1]; out[i*4+2]=u8[p+2]; out[i*4+3]=255; } break;
    case 3: for (let i = 0; i < tot; i++, p += 3){ out[i*4]=u8[p+2]; out[i*4+1]=u8[p+1]; out[i*4+2]=u8[p]; out[i*4+3]=255; } break;
    case 4: for (let i = 0; i < tot; i++, p += 2){ const c = u8[p] | (u8[p+1] << 8); const r = (c >> 11) & 0x1F, g = (c >> 5) & 0x3F, b = c & 0x1F; out[i*4]=(r<<3)|(r>>2); out[i*4+1]=(g<<2)|(g>>4); out[i*4+2]=(b<<3)|(b>>2); out[i*4+3]=255; } break;
    case 5: for (let i = 0; i < tot; i++, p++){ const v = u8[p]; out[i*4]=v; out[i*4+1]=v; out[i*4+2]=v; out[i*4+3]=255; } break;
    case 6: for (let i = 0; i < tot; i++, p += 2){ const v = u8[p]; out[i*4]=v; out[i*4+1]=v; out[i*4+2]=v; out[i*4+3]=u8[p+1]; } break;
    case 7: for (let i = 0; i < tot; i++, p++){ const v = u8[p]; out[i*4]=v; out[i*4+1]=v; out[i*4+2]=v; out[i*4+3]=255; } break;
    case 8: for (let i = 0; i < tot; i++, p++){ out[i*4]=255; out[i*4+1]=255; out[i*4+2]=255; out[i*4+3]=u8[p]; } break;
    case 11: for (let i = 0; i < tot; i++, p += 4){ out[i*4]=u8[p+1]; out[i*4+1]=u8[p+2]; out[i*4+2]=u8[p+3]; out[i*4+3]=u8[p]; } break;
    case 12: for (let i = 0; i < tot; i++, p += 4){ out[i*4]=u8[p+2]; out[i*4+1]=u8[p+1]; out[i*4+2]=u8[p]; out[i*4+3]=u8[p+3]; } break;
    case 16: for (let i = 0; i < tot; i++, p += 4){ out[i*4]=u8[p+2]; out[i*4+1]=u8[p+1]; out[i*4+2]=u8[p]; out[i*4+3]=255; } break;
    case 17: for (let i = 0; i < tot; i++, p += 2){ const c = u8[p] | (u8[p+1] << 8); const b = (c >> 11) & 0x1F, g = (c >> 5) & 0x3F, r = c & 0x1F; out[i*4]=(r<<3)|(r>>2); out[i*4+1]=(g<<2)|(g>>4); out[i*4+2]=(b<<3)|(b>>2); out[i*4+3]=255; } break;
    case 18: for (let i = 0; i < tot; i++, p += 2){ const c = u8[p] | (u8[p+1] << 8); const b = c & 0x1F, g = (c >> 5) & 0x1F, r = (c >> 10) & 0x1F; out[i*4]=(r<<3)|(r>>2); out[i*4+1]=(g<<3)|(g>>2); out[i*4+2]=(b<<3)|(b>>2); out[i*4+3]=255; } break;
    case 19: for (let i = 0; i < tot; i++, p += 2){ const c = u8[p] | (u8[p+1] << 8); const b = c & 0xF, g = (c >> 4) & 0xF, r = (c >> 8) & 0xF, a = (c >> 12) & 0xF; out[i*4]=(r<<4)|r; out[i*4+1]=(g<<4)|g; out[i*4+2]=(b<<4)|b; out[i*4+3]=(a<<4)|a; } break;
    case 21: for (let i = 0; i < tot; i++, p += 2){ const c = u8[p] | (u8[p+1] << 8); const b = c & 0x1F, g = (c >> 5) & 0x1F, r = (c >> 10) & 0x1F, a = (c >> 15) & 1; out[i*4]=(r<<3)|(r>>2); out[i*4+1]=(g<<3)|(g>>2); out[i*4+2]=(b<<3)|(b>>2); out[i*4+3]=a?255:0; } break;
    case 9: for (let i = 0; i < tot; i++, p += 3){ const r = u8[p], g = u8[p+1], b = u8[p+2]; out[i*4]=r; out[i*4+1]=g; out[i*4+2]=b; out[i*4+3]=(!r && !g && b === 255) ? 0 : 255; } break;
    case 10: for (let i = 0; i < tot; i++, p += 3){ const b = u8[p], g = u8[p+1], r = u8[p+2]; out[i*4]=r; out[i*4+1]=g; out[i*4+2]=b; out[i*4+3]=(!r && !g && b === 255) ? 0 : 255; } break;
    case 22: for (let i = 0; i < tot; i++, p += 2){ out[i*4]=u8[p]^0x80; out[i*4+1]=u8[p+1]^0x80; out[i*4+2]=255; out[i*4+3]=255; } break;
    case 24: for (let i = 0; i < tot; i++, p += 8){ out[i*4]=hdr8(h2f(u8[p] | (u8[p+1] << 8))); out[i*4+1]=hdr8(h2f(u8[p+2] | (u8[p+3] << 8))); out[i*4+2]=hdr8(h2f(u8[p+4] | (u8[p+5] << 8))); out[i*4+3]=255; } break;
    case 25: for (let i = 0; i < tot; i++, p += 8){ out[i*4]=u8[p+1]; out[i*4+1]=u8[p+3]; out[i*4+2]=u8[p+5]; out[i*4+3]=255; } break;
    default: for (let i = 0; i < tot; i++){ const x = i % w, y = (i / w) | 0, c = ((x >> 3) ^ (y >> 3)) & 1 ? 180 : 110; out[i*4]=c; out[i*4+1]=(c*0.6)|0; out[i*4+2]=c; out[i*4+3]=255; }
  }
  return out;
}
function flipV(pix, w, h){
  const out = new Uint8Array(pix.length), rs = w * 4;
  for (let y = 0; y < h; y++){ const s = (h - 1 - y) * rs; out.set(pix.subarray(s, s + rs), y * rs); }
  return out;
}

export function parseVTF(buffer){
  const u8 = new Uint8Array(buffer);
  if (u8.length < 64) throw new Error('VTF too small');
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== VTF_SIG) throw new Error('not VTF');
  const major = dv.getUint32(4, true), minor = dv.getUint32(8, true);
  const headerSize = dv.getUint32(12, true);
  const width = dv.getUint16(16, true), height = dv.getUint16(18, true);
  const flags = dv.getUint32(20, true);
  let frames = dv.getUint16(24, true); if (!frames) frames = 1;
  const firstFrame = dv.getUint16(26, true);
  const hiFmt = dv.getUint32(52, true);
  let mipCount = u8[56]; if (!mipCount) mipCount = 1;
  const loFmt = dv.getUint32(57, true), loW = u8[61], loH = u8[62];
  let depth = 1;
  if (major > 7 || (major === 7 && minor >= 2)){ if (u8.length >= 65) depth = dv.getUint16(63, true) || 1; }
  let numRes = 0;
  if (major > 7 || (major === 7 && minor >= 3)){ if (headerSize >= 72 && u8.length >= 72) numRes = dv.getUint32(68, true); }
  if (!width || !height) throw new Error('zero dimensions');
  let loSize = 0;
  if (loW > 0 && loH > 0 && loFmt !== 0xFFFFFFFF && loFmt <= 28) loSize = vtfMipSize(loW, loH, loFmt);
  const faces = (flags & 0x4000) ? ((major === 7 && minor < 5 && firstFrame !== 0xFFFF) ? 7 : 6) : 1;
  let dataStart = headerSize + numRes * 8 + loSize;
  if (numRes > 0 && numRes <= 32 && 80 + numRes * 8 <= u8.length){
    for (let i = 0; i < numRes; i++){
      if (u8[80 + i * 8] === 0x30){ const o = dv.getUint32(80 + i * 8 + 4, true); if (o > 0 && o < u8.length) dataStart = o; }
    }
  }
  const mipOffsets = []; let cur = dataStart;
  for (let i = mipCount - 1; i >= 0; i--){
    const mw = Math.max(1, width >> i), mh = Math.max(1, height >> i);
    mipOffsets[i] = cur;
    cur += vtfMipSize(mw, mh, hiFmt) * frames * faces * depth;
  }
  return { u8, width, height, frames, faces, depth, mipmaps: mipCount, format: hiFmt,
    formatName: vtfFmtName(hiFmt), version: major + '.' + minor, flags, firstFrame, mipOffsets };
}
export function decodeVTFFrame(vtf, mip, fi){
  const mw = Math.max(1, vtf.width >> mip), mh = Math.max(1, vtf.height >> mip);
  const mipSize = vtfMipSize(mw, mh, vtf.format), stride = mipSize * (vtf.faces || 1) * vtf.depth;
  const off = vtf.mipOffsets[mip] + fi * stride;
  if (off + mipSize > vtf.u8.length) throw new Error('mip truncated');
  const pix = decodePixels(vtf.u8, off, mw, mh, vtf.format);
  return { width: mw, height: mh, pixels: flipV(pix, mw, mh) };
}

/* ================================================================
   VMT / VTF RESOLUTION
   ================================================================ */
const _vmtInfoCache = new Map();

export async function getVmtInfo(vmtRec, depth = 0){
  if (!vmtRec || depth > 3) return null;
  if (_vmtInfoCache.has(vmtRec.path)) return _vmtInfoCache.get(vmtRec.path);

  try {
    const buf = await getRecordBuffer(vmtRec);
    const txt = new TextDecoder('utf-8').decode(buf);
    const clean = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    const flag = n => new RegExp('["\']?\\$' + n + '["\']?\\s+["\']?(1|true)(?![0-9a-z])', 'i').test(clean);
    const alphatest = flag('alphatest');
    const translucent = flag('translucent');

    let base = '';
    const m = /["']?\$basetexture["']?\s*(?:["']([^"'\r\n]+)["']|([^\s\r\n{}]+))/i.exec(clean);
    if (m){
      const raw = (m[1] || m[2] || '').trim();
      if (raw) base = normMat(raw);
    }
    if (!base){
      const m2 = /["']?\$basetexture2["']?\s*(?:["']([^"'\r\n]+)["']|([^\s\r\n{}]+))/i.exec(clean);
      if (m2){
        const raw = (m2[1] || m2[2] || '').trim();
        if (raw) base = normMat(raw);
      }
    }

    if (!base){
      const incMatch = /["']?include["']?\s*(?:["']([^"'\r\n]+)["']|([^\s\r\n{}]+))/i.exec(clean);
      if (incMatch){
        const incPath = normMat(incMatch[1] || incMatch[2] || '');
        if (incPath){
          const parentVmt = TexStore.findVmtRecord([incPath], gameOf(vmtRec));
          if (parentVmt && parentVmt.path !== vmtRec.path){
            const parentInfo = await getVmtInfo(parentVmt, depth + 1);
            if (parentInfo){
              const res = {
                base: parentInfo.base,
                alphatest: alphatest || parentInfo.alphatest,
                translucent: translucent || parentInfo.translucent
              };
              _vmtInfoCache.set(vmtRec.path, res);
              return res;
            }
          }
        }
      }
    }

    const res = { base, alphatest, translucent };
    _vmtInfoCache.set(vmtRec.path, res);
    return res;
  } catch (e) {
    console.warn('[vmt] parse error:', vmtRec.path, e);
  }

  _vmtInfoCache.set(vmtRec.path, null);
  return null;
}

export function getMaterialCandidateKeys(mdl, texName, modelPath = null){
  const keys = [];
  const cleanTex = String(texName || '').replace(/\\/g, '/').toLowerCase().replace(/\.v(mt|tf)$/, '').replace(/^materials\//i, '').replace(/^\/+/, '').trim();
  if (!cleanTex) return keys;
  const baseName = cleanTex.split('/').pop();

  const cds = (mdl.cdtextures && mdl.cdtextures.length) ? mdl.cdtextures : [''];

  for (const rawCd of cds){
    const cd = String(rawCd || '').replace(/\\/g, '/').toLowerCase().replace(/^materials\//i, '').replace(/^\/+|\/+$/g, '').trim();
    if (cd){
      keys.push(cd + '/' + cleanTex);
      if (cleanTex !== baseName) keys.push(cd + '/' + baseName);
    }
  }

  keys.push(cleanTex);
  if (baseName !== cleanTex) keys.push(baseName);

  if (modelPath){
    const norm = normMat(modelPath);
    const slash = norm.lastIndexOf('/');
    if (slash > 0){
      const mdlDir = norm.slice(0, slash);
      keys.push(mdlDir + '/' + cleanTex);
      keys.push(mdlDir + '/' + baseName);
    }
  }

  return [...new Set(keys)];
}

export const TexStore = {
  vtfByPath: new Map(),
  vmtByPath: new Map(),
  byBase: new Map(),
  vmtByBase: new Map(),
  _texCache: new Map(),
  enabled: true,
  preferGame: null,
  MAX_CACHE: IS_COARSE ? 90 : 300,

  async rebuild(){
    this.vtfByPath.clear();
    this.vmtByPath.clear();
    this.byBase.clear();
    this.vmtByBase.clear();
    _vmtInfoCache.clear();
    this._texCache.clear();

    for (const f of Store.listByExt('vtf')){
      const norm = normMat(f.path);
      if (!this.vtfByPath.has(norm)) this.vtfByPath.set(norm, []);
      this.vtfByPath.get(norm).push(f);

      const base = f.path.split('/').pop().toLowerCase().replace(/\.vtf$/, '');
      if (!this.byBase.has(base)) this.byBase.set(base, []);
      this.byBase.get(base).push(f);
    }

    for (const f of Store.listByExt('vmt')){
      const norm = normMat(f.path);
      if (!this.vmtByPath.has(norm)) this.vmtByPath.set(norm, []);
      this.vmtByPath.get(norm).push(f);

      const base = f.path.split('/').pop().toLowerCase().replace(/\.vmt$/, '');
      if (!this.vmtByBase.has(base)) this.vmtByBase.set(base, []);
      this.vmtByBase.get(base).push(f);
    }
  },

  _pickBest(list, preferGame = null, modelPrefix = null){
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];
    if (modelPrefix){
      const m = list.find(r => r.path.startsWith(modelPrefix));
      if (m) return m;
    }
    if (preferGame){
      const g = list.find(r => gameOf(r) === preferGame);
      if (g) return g;
    }
    return list[0];
  },

  findVmtRecord(candidates, preferGame = null, modelPrefix = null){
    if (typeof candidates === 'string') candidates = [candidates];
    for (const key of candidates){
      const norm = normMat(key);
      const list = this.vmtByPath.get(norm);
      if (list && list.length){
        const res = this._pickBest(list, preferGame, modelPrefix);
        if (res) return res;
      }
    }
    for (const key of candidates){
      const base = normMat(key).split('/').pop();
      const list = this.vmtByBase.get(base);
      if (list && list.length){
        const res = this._pickBest(list, preferGame, modelPrefix);
        if (res) return res;
      }
    }
    return null;
  },

  findVtfRecord(candidates, preferGame = null, modelPrefix = null){
    if (typeof candidates === 'string') candidates = [candidates];
    for (const key of candidates){
      const norm = normMat(key);
      const list = this.vtfByPath.get(norm);
      if (list && list.length){
        const res = this._pickBest(list, preferGame, modelPrefix);
        if (res) return res;
      }
    }
    for (const key of candidates){
      const base = normMat(key).split('/').pop();
      const list = this.byBase.get(base);
      if (list && list.length){
        const res = this._pickBest(list, preferGame, modelPrefix);
        if (res) return res;
      }
    }
    return null;
  },

  async resolveModelTexture(mdl, texName, preferGame = null, modelPrefix = null, modelPath = null){
    if (!texName) return null;
    const candidates = getMaterialCandidateKeys(mdl, texName, modelPath);

    // 1. Поиск через VMT (стандартный путь Source Engine)
    const vmtRec = this.findVmtRecord(candidates, preferGame, modelPrefix);
    if (vmtRec){
      const info = await getVmtInfo(vmtRec);
      if (info && info.base){
        const vtfRec = this.findVtfRecord([info.base], preferGame, modelPrefix);
        if (vtfRec) return { vtfRec, vmtRec, info };
      }
      const vmtAsVtf = normMat(vmtRec.path);
      const vtfFromVmt = this.findVtfRecord([vmtAsVtf], preferGame, modelPrefix);
      if (vtfFromVmt) return { vtfRec: vtfFromVmt, vmtRec, info };
    }

    // 2. Прямой поиск VTF по путям кандидатов
    const directVtf = this.findVtfRecord(candidates, preferGame, modelPrefix);
    if (directVtf) return { vtfRec: directVtf, vmtRec: null, info: null };

    // 3. Запасной поиск в той же папке аддона
    if (modelPrefix){
      const base = String(texName).split('/').pop().toLowerCase().replace(/\.v(mt|tf)$/, '');
      const list = this.byBase.get(base);
      if (list && list.length){
        const local = list.find(r => r.path.startsWith(modelPrefix));
        if (local) return { vtfRec: local, vmtRec: null, info: null };
      }
    }

    return null;
  },

  findByMat(matName, preferGame = null, modelPrefix = null){
    if (!this.enabled) return null;
    const pg = preferGame || this.preferGame;
    return this.findVtfRecord([matName], pg, modelPrefix);
  },

  _touch(k, v){ this._texCache.delete(k); this._texCache.set(k, v); },
  _evict(){
    while (this._texCache.size > this.MAX_CACHE){
      const k = this._texCache.keys().next().value;
      const v = this._texCache.get(k);
      this._texCache.delete(k);
      if (v && v.texture) v.texture.dispose();
    }
  },

  async makeTexture(fileRec, maxW = 512, getRecordBufferFn){
    if (!fileRec || !getRecordBufferFn) return null;
    if (IS_COARSE && maxW > 256) maxW = 256;
    const cacheKey = fileRec.path + '@' + maxW;
    if (this._texCache.has(cacheKey)){ const hit = this._texCache.get(cacheKey); this._touch(cacheKey, hit); return hit; }
    try {
      const buf = await getRecordBufferFn(fileRec);
      const vtf = parseVTF(buf);
      let mip = 0;
      for (let i = 0; i < vtf.mipmaps; i++){
        const w = Math.max(1, vtf.width >> i);
        if (w <= maxW) { mip = i; break; }
        mip = i;
      }
      const res = decodeVTFFrame(vtf, mip, 0);
      const cv = document.createElement('canvas');
      cv.width = res.width; cv.height = res.height;
      const ctx = cv.getContext('2d');
      const id = ctx.createImageData(res.width, res.height);
      id.data.set(res.pixels);
      ctx.putImageData(id, 0, 0);
      let hasAlpha = false;
      const step = Math.max(1, Math.floor(res.width * res.height / 8000));
      for (let i = 3; i < res.pixels.length; i += 4 * step) if (res.pixels[i] < 250) { hasAlpha = true; break; }
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = IS_COARSE ? 2 : 4;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      const out = { texture: tex, width: res.width, height: res.height, origWidth: vtf.width, origHeight: vtf.height, hasAlpha };
      this._texCache.set(cacheKey, out);
      this._evict();
      return out;
    } catch (e) {
      this._texCache.set(cacheKey, null);
      this._evict();
      return null;
    }
  }
};