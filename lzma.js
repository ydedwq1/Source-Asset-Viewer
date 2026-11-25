// lzma.js — распаковщик LZMA-alone (.lzma / Steam Workshop *_legacy.bin). Чистый JS, без зависимостей.
// Формат: props u8 (lc/lp/pb) | dictSize u32 | size u64 (все 0xFF = неизвестен) | поток range-coder
const tick = () => new Promise(r => setTimeout(r, 0));
const LIM = 0x7fffffff;                       // предел одного Uint8Array в браузерах

// Быстрая проверка заголовка (13 байт): подходит ли это под LZMA-alone
export function looksLikeLzma(h){
  if (!h || h.length < 13 || h[0] >= 225) return false;
  const d = h[1] | (h[2] << 8) | (h[3] << 16) | (h[4] << 24);
  if (d !== 0 && (d >>> 0) < 4096) return false;
  const lo = (h[5] | (h[6] << 8) | (h[7] << 16) | (h[8] << 24)) >>> 0, hi = (h[9] | (h[10] << 8) | (h[11] << 16) | (h[12] << 24)) >>> 0;
  return (lo === 0xFFFFFFFF && hi === 0xFFFFFFFF) || hi < 0x200;       // размер < 2 ТБ — правдоподобно
}

export async function lzmaDecode(src, onProgress){
  if (src.length < 14) throw new Error('lzma:trunc');
  let d = src[0]; if (d >= 225) throw new Error('lzma:props');
  const lc = d % 9; d = (d / 9) | 0; const lp = d % 5, pb = (d / 5) | 0;
  const lo = (src[5] | (src[6] << 8) | (src[7] << 16) | (src[8] << 24)) >>> 0, hi = (src[9] | (src[10] << 8) | (src[11] << 16) | (src[12] << 24)) >>> 0;
  const unknown = lo === 0xFFFFFFFF && hi === 0xFFFFFFFF;
  const size = unknown ? -1 : hi * 4294967296 + lo;
  if (size > LIM) throw new Error('lzma:big');

  let out;
  try { out = new Uint8Array(unknown ? 1 << 24 : size); } catch (_) { throw new Error('lzma:big'); }
  let outPos = 0;

  let pos = 13, range = 0xFFFFFFFF, code = 0;
  if (src[pos++] !== 0) throw new Error('lzma:data');
  for (let i = 0; i < 4; i++) code = ((code << 8) | src[pos++]) >>> 0;
  const srcLen = src.length;

  const mk = n => new Uint16Array(n).fill(1024);
  const isMatch = mk(12 << 4), isRep = mk(12), isRepG0 = mk(12), isRepG1 = mk(12), isRepG2 = mk(12), isRep0Long = mk(12 << 4);
  const posSlotP = mk(4 << 6), posSpecial = mk(115), align = mk(16);
  const lenP = mk(514), repLenP = mk(514);
  const lit = mk(0x300 << (lc + lp));

  function bit(probs, i){
    const p = probs[i], bound = (range >>> 11) * p;
    let b;
    if (code < bound){ range = bound; probs[i] = p + ((2048 - p) >>> 5); b = 0; }
    else { range -= bound; code -= bound; probs[i] = p - (p >>> 5); b = 1; }
    if (range < 0x1000000){ range = (range << 8) >>> 0; code = ((code << 8) | src[pos++]) >>> 0; }
    return b;
  }
  function tree(probs, off, n){ let m = 1; for (let i = 0; i < n; i++) m = (m << 1) | bit(probs, off + m); return m - (1 << n); }
  function rtree(probs, off, n){ let m = 1, s = 0; for (let i = 0; i < n; i++){ const b = bit(probs, off + m); m = (m << 1) | b; s |= b << i; } return s; }
  function direct(n){
    let r = 0;
    while (n--){
      range >>>= 1; let b = 0;
      if (code >= range){ code -= range; b = 1; }
      if (range < 0x1000000){ range = (range << 8) >>> 0; code = ((code << 8) | src[pos++]) >>> 0; }
      r = (r << 1) | b;
    }
    return r >>> 0;
  }
  function len(L, ps){
    if (!bit(L, 0)) return tree(L, 2 + (ps << 3), 3);
    if (!bit(L, 1)) return 8 + tree(L, 130 + (ps << 3), 3);
    return 16 + tree(L, 258, 8);
  }

  const pbMask = (1 << pb) - 1, lpMask = (1 << lp) - 1;
  let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0, nextTick = 1 << 22;

  while (unknown || outPos < size){
    if (pos > srcLen + 4) throw new Error('lzma:trunc');
    if (outPos >= nextTick){
      nextTick += 1 << 22;
      if (onProgress) onProgress(outPos, size > 0 ? size : srcLen);
      await tick();
    }
    if (unknown && outPos + 300 > out.length){          // запас под одну копию
      if (out.length * 2 > LIM) throw new Error('lzma:big');
      const n = new Uint8Array(out.length * 2); n.set(out); out = n;
    }
    const ps = outPos & pbMask;
    if (!bit(isMatch, (state << 4) + ps)){
      const prev = outPos > 0 ? out[outPos - 1] : 0;
      const base = 0x300 * (((outPos & lpMask) << lc) + (prev >> (8 - lc)));
      let sym = 1;
      if (state >= 7){
        let mb = out[outPos - rep0 - 1];
        do {
          const m = (mb >> 7) & 1; mb <<= 1;
          const b = bit(lit, base + ((1 + m) << 8) + sym);
          sym = (sym << 1) | b;
          if (m !== b) break;
        } while (sym < 0x100);
      }
      while (sym < 0x100) sym = (sym << 1) | bit(lit, base + sym);
      out[outPos++] = sym & 0xFF;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }
    let l;
    if (bit(isRep, state)){
      if (outPos === 0) throw new Error('lzma:data');
      if (!bit(isRepG0, state)){
        if (!bit(isRep0Long, (state << 4) + ps)){
          state = state < 7 ? 9 : 11;
          out[outPos] = out[outPos - rep0 - 1]; outPos++;
          continue;
        }
      } else {
        let dist;
        if (!bit(isRepG1, state)) dist = rep1;
        else { if (!bit(isRepG2, state)) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
        rep1 = rep0; rep0 = dist;
      }
      l = len(repLenP, ps);
      state = state < 7 ? 8 : 11;
    } else {
      rep3 = rep2; rep2 = rep1; rep1 = rep0;
      l = len(lenP, ps);
      state = state < 7 ? 7 : 10;
      const slot = tree(posSlotP, (l < 4 ? l : 3) << 6, 6);
      if (slot < 4) rep0 = slot;
      else {
        const nd = (slot >> 1) - 1;
        let dist = ((2 | (slot & 1)) << nd) >>> 0;
        if (slot < 14) dist += rtree(posSpecial, dist - slot, nd);
        else dist += (direct(nd - 4) << 4 >>> 0) + rtree(align, 0, 4);
        rep0 = dist;
        if (rep0 === 0xFFFFFFFF) break;                  // маркер конца потока
      }
    }
    l += 2;
    if (rep0 >= outPos) throw new Error('lzma:data');
    if (!unknown && l > size - outPos) l = size - outPos;
    for (let s = outPos - rep0 - 1, e = outPos + l; outPos < e; ) out[outPos++] = out[s++];
  }
  return unknown ? out.subarray(0, outPos) : out;
}
