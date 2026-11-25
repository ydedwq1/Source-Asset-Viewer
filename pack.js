// pack.js — сжатие, хеш и усечение VTF (без зависимостей, работает и в Node 18+)
// crypto.subtle доступен только в secure context (https / localhost). На телефоне по http://IP его нет —
// тогда используем запасной 128-битный хеш, чтобы импорт не падал.
function fallbackHash(u8){
  let h1 = 0x9e3779b1, h2 = 0x85ebca6b, h3 = 0xc2b2ae35, h4 = 0x27d4eb2f;
  for (let i = 0; i < u8.length; i++){
    const b = u8[i];
    h1 = Math.imul(h1 ^ b, 2654435761); h1 ^= h1 >>> 15;
    h2 = Math.imul(h2 ^ b, 2246822519); h2 ^= h2 >>> 13;
    h3 = Math.imul(h3 ^ b, 3266489917); h3 ^= h3 >>> 16;
    h4 = Math.imul(h4 ^ b, 668265263);  h4 ^= h4 >>> 11;
  }
  const n = u8.length | 0;
  h1 = Math.imul(h1 ^ n, 2246822519) ^ h2; h2 = Math.imul(h2 ^ (n >>> 3), 3266489917) ^ h3;
  h3 = Math.imul(h3 ^ n, 668265263) ^ h4;  h4 = Math.imul(h4 ^ h1, 2654435761);
  return [h1, h2, h3, h4].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
export async function sha256(u8){
  if (globalThis.crypto && crypto.subtle){
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
    let s = ''; for (let i = 0; i < 16; i++) s += d[i].toString(16).padStart(2, '0');   // 128 бит достаточно для дедупа
    return s;
  }
  return fallbackHash(u8);
}
export async function deflate(u8){
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter(); w.write(u8).catch(() => {}); w.close().catch(() => {});
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
export async function inflate(u8){
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter(); w.write(u8).catch(() => {}); w.close().catch(() => {});
  return await new Response(ds.readable).arrayBuffer();
}

/* ---- усечение VTF: выбрасываем самые большие мипы (в файле они лежат В КОНЦЕ) ----
   Возвращает новый Uint8Array или null, если файл небезопасно трогать. */
const blockFmt = f => (f >= 13 && f <= 15) || f === 20 || f === 27 || f === 28;
function bpp(f){
  switch (f){
    case 0: case 1: case 11: case 12: case 16: case 23: case 26: return 4;
    case 2: case 3: case 9: case 10: return 3;
    case 4: case 6: case 17: case 18: case 19: case 21: case 22: return 2;
    case 5: case 7: case 8: return 1;
    case 24: case 25: return 8;
    default: return 4;
  }
}
function mipBytes(w, h, f){
  if (blockFmt(f)) return Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * ((f === 13 || f === 20 || f === 27) ? 8 : 16);
  return w * h * bpp(f);
}
export function trimVTF(u8, drop){
  if (!drop || u8.length < 80) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x00465456) return null;
  const major = dv.getUint32(4, true), minor = dv.getUint32(8, true);
  if (major !== 7) return null;
  const headerSize = dv.getUint32(12, true);
  const w = dv.getUint16(16, true), h = dv.getUint16(18, true);
  const flags = dv.getUint32(20, true);
  const frames = dv.getUint16(24, true) || 1;
  const fmt = dv.getUint32(52, true);
  const mips = u8[56] || 1;
  if (flags & 0x4000) return null;                         // cubemap: не трогаем
  if (fmt > 28 || !w || !h || mips < 2) return null;
  const loFmt = dv.getUint32(57, true), loW = u8[61], loH = u8[62];
  const depth = minor >= 2 ? (dv.getUint16(63, true) || 1) : 1;
  const maxDim = Math.max(w, h);
  if (maxDim < 256) return null;
  const d = Math.min(drop, mips - 1, Math.floor(Math.log2(maxDim / 128)));   // не опускаемся ниже 128 px
  if (d < 1) return null;

  // где начинаются данные мипов
  let dataStart;
  if (minor >= 3){
    const numRes = headerSize >= 72 ? dv.getUint32(68, true) : 0;
    if (numRes > 0){
      if (numRes > 32 || 80 + numRes * 8 > u8.length) return null;
      let hi = -1;
      for (let i = 0; i < numRes; i++) if (u8[80 + i * 8] === 0x30) hi = dv.getUint32(80 + i * 8 + 4, true);
      if (hi < 0) return null;
      for (let i = 0; i < numRes; i++){                    // другие ресурсы не должны лежать после картинки
        const tag = u8[80 + i * 8], fl = u8[80 + i * 8 + 3], off = dv.getUint32(80 + i * 8 + 4, true);
        if (tag !== 0x30 && tag !== 0x01 && !(fl & 2) && off > hi) return null;
      }
      dataStart = hi;
    }
  }
  if (dataStart === undefined){
    const lo = (loW > 0 && loH > 0 && loFmt !== 0xFFFFFFFF && loFmt <= 28) ? mipBytes(loW, loH, loFmt) : 0;
    dataStart = headerSize + lo;
  }
  // сохраняем мипы mips-1 .. d (маленькие идут первыми)
  let cut = dataStart;
  for (let i = mips - 1; i >= d; i--) cut += mipBytes(Math.max(1, w >> i), Math.max(1, h >> i), fmt) * frames * depth;
  if (cut > u8.length || cut < dataStart) return null;
  const out = u8.slice(0, cut);
  const odv = new DataView(out.buffer);
  odv.setUint16(16, Math.max(1, w >> d), true);
  odv.setUint16(18, Math.max(1, h >> d), true);
  out[56] = mips - d;
  return out;
}