// export.js — скачивание и конвертация звуков: оригинал / WAV / OGG (Opus) / MP4 (AAC) / ZIP
// Кодирование через WebCodecs (быстро, не в реальном времени), запасной путь — MediaRecorder.

const te = new TextEncoder();
const concat = parts => {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts){ out.set(p, o); o += p.length; }
  return out;
};

/* ============================== OGG (Opus) ============================== */
const OGG_TAB = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++){
    let c = (i << 24) >>> 0;
    for (let k = 0; k < 8; k++) c = (c & 0x80000000) ? (((c << 1) ^ 0x04C11DB7) >>> 0) : ((c << 1) >>> 0);
    t[i] = c;
  }
  return t;
})();
function oggCrc(u8){
  let c = 0;
  for (let i = 0; i < u8.length; i++) c = (((c << 8) >>> 0) ^ OGG_TAB[((c >>> 24) ^ u8[i]) & 255]) >>> 0;
  return c;
}
function oggPage(type, granule, serial, seq, packets){
  const segs = [];
  for (const p of packets){ let n = p.length; while (n >= 255){ segs.push(255); n -= 255; } segs.push(n); }
  if (segs.length > 255) throw new Error('ogg: too many segments');
  const body = concat(packets), head = new Uint8Array(27 + segs.length), dv = new DataView(head.buffer);
  head.set([0x4f, 0x67, 0x67, 0x53, 0, type]);
  dv.setBigUint64(6, BigInt(granule), true);
  dv.setUint32(14, serial, true); dv.setUint32(18, seq, true); dv.setUint32(22, 0, true);
  head[26] = segs.length; head.set(segs, 27);
  const page = concat([head, body]);
  new DataView(page.buffer).setUint32(22, oggCrc(page), true);
  return page;
}
// packets: [{ data: Uint8Array, samples: number }] (samples @48 kHz)
export function muxOgg(packets, { channels, rate, preSkip = 312, totalSamples }){
  const serial = (Math.random() * 0xFFFFFFFF) >>> 0, out = [];
  const oh = new Uint8Array(19), odv = new DataView(oh.buffer);
  oh.set(te.encode('OpusHead')); oh[8] = 1; oh[9] = channels;
  odv.setUint16(10, preSkip, true); odv.setUint32(12, rate, true); odv.setInt16(16, 0, true); oh[18] = 0;
  const vendor = te.encode('source-asset-viewer'), ot = new Uint8Array(8 + 4 + vendor.length + 4), tdv = new DataView(ot.buffer);
  ot.set(te.encode('OpusTags')); tdv.setUint32(8, vendor.length, true); ot.set(vendor, 12); tdv.setUint32(12 + vendor.length, 0, true);
  out.push(oggPage(0x02, 0, serial, 0, [oh]));
  out.push(oggPage(0x00, 0, serial, 1, [ot]));
  let seq = 2, cum = 0, i = 0;
  const limit = preSkip + (totalSamples || Infinity);
  while (i < packets.length){
    const chunk = []; let segs = 0;
    while (i < packets.length && chunk.length < 40){
      const need = Math.floor(packets[i].data.length / 255) + 1;
      if (segs + need > 255) break;
      chunk.push(packets[i].data); segs += need; cum += packets[i].samples; i++;
    }
    const last = i >= packets.length;
    out.push(oggPage(last ? 0x04 : 0x00, Math.min(preSkip + cum, last ? limit : Infinity), serial, seq++, chunk));
  }
  return new Blob(out, { type: 'audio/ogg' });
}

/* ============================== MP4 (AAC) ============================== */
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = n => [(n >>> 8) & 255, n & 255];
const zeros = n => new Array(n).fill(0);
function box(type, ...parts){
  const body = concat(parts.map(p => p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(te.encode(type), 4); out.set(body, 8);
  return out;
}
// frames: Uint8Array[] (сырые AAC-кадры), asc: AudioSpecificConfig
export function muxMp4(frames, { channels, rate, asc, frameSamples = 1024 }){
  const n = frames.length, dur = n * frameSamples;
  const matrix = [...u32(0x10000), ...zeros(12), ...u32(0x10000), ...zeros(12), ...u32(0x40000000)];
  const mvhd = box('mvhd', [0, 0, 0, 0], u32(0), u32(0), u32(rate), u32(dur), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(2));
  const tkhd = box('tkhd', [0, 0, 0, 3], u32(0), u32(0), u32(1), u32(0), u32(dur), zeros(8), u16(0), u16(0), u16(0x100), u16(0), matrix, u32(0), u32(0));
  const mdhd = box('mdhd', [0, 0, 0, 0], u32(0), u32(0), u32(rate), u32(dur), u16(0x55c4), u16(0));
  const hdlr = box('hdlr', [0, 0, 0, 0], u32(0), te.encode('soun'), zeros(12), te.encode('SoundHandler\0'));
  const smhd = box('smhd', [0, 0, 0, 0], u16(0), u16(0));
  const dinf = box('dinf', box('dref', [0, 0, 0, 0], u32(1), box('url ', [0, 0, 0, 1])));
  const esdsBody = [
    0, 0, 0, 0,
    0x03, 23 + asc.length, ...u16(1), 0,
    0x04, 15 + asc.length, 0x40, 0x15, 0, 0, 0, ...u32(0), ...u32(0),
    0x05, asc.length, ...asc,
    0x06, 1, 2
  ];
  const mp4a = box('mp4a', zeros(6), u16(1), zeros(8), u16(channels), u16(16), u16(0), u16(0), u32((rate * 65536) >>> 0), box('esds', esdsBody));
  const stsd = box('stsd', [0, 0, 0, 0], u32(1), mp4a);
  const stts = box('stts', [0, 0, 0, 0], u32(1), u32(n), u32(frameSamples));
  const stsc = box('stsc', [0, 0, 0, 0], u32(1), u32(1), u32(n), u32(1));
  const szs = new Uint8Array(n * 4), sdv = new DataView(szs.buffer);
  frames.forEach((f, i) => sdv.setUint32(i * 4, f.length));
  const stsz = box('stsz', [0, 0, 0, 0], u32(0), u32(n), szs);
  const ftyp = box('ftyp', te.encode('M4A '), u32(0), te.encode('M4A '), te.encode('mp42'), te.encode('isom'));
  const build = off => {
    const stco = box('stco', [0, 0, 0, 0], u32(1), u32(off));
    const stbl = box('stbl', stsd, stts, stsc, stsz, stco);
    const minf = box('minf', smhd, dinf, stbl);
    const mdia = box('mdia', mdhd, hdlr, minf);
    return box('moov', mvhd, box('trak', tkhd, mdia));
  };
  const moovSize = build(0).length;
  const moov = build(ftyp.length + moovSize + 8);
  let dataLen = 0; for (const f of frames) dataLen += f.length;
  const mdatHead = new Uint8Array(8); new DataView(mdatHead.buffer).setUint32(0, 8 + dataLen); mdatHead.set(te.encode('mdat'), 4);
  return new Blob([ftyp, moov, mdatHead, ...frames], { type: 'audio/mp4' });
}

/* ============================== ZIP (store) ============================== */
const ZTAB = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++){ let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = ZTAB[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zipStore(files){            // files: [{ name, data: Uint8Array }]
  const parts = [], central = []; let off = 0;
  const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files){
    const name = te.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    if (sz >= 0xFFFFFFFF || off >= 0xFFFFFFFF) throw new Error('ZIP > 4 GB');
    const lh = new Uint8Array(30 + name.length), dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, dosT, true); dv.setUint16(12, dosD, true); dv.setUint32(14, crc, true);
    dv.setUint32(18, sz, true); dv.setUint32(22, sz, true); dv.setUint16(26, name.length, true); lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(12, dosT, true); cv.setUint16(14, dosD, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, sz, true); cv.setUint32(24, sz, true); cv.setUint16(28, name.length, true); cv.setUint32(42, off, true); ch.set(name, 46);
    parts.push(lh, f.data); central.push(ch); off += lh.length + sz;
  }
  let cs = 0; for (const c of central) cs += c.length;
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cs, true); ev.setUint32(16, off, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/* ============================== decode / WAV ============================== */
export async function decodeAudio(ab, rate = 48000){
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('Web Audio unsupported');
  const ctx = new Ctx(2, 1, rate), copy = ab.slice(0);
  // старый Safari: decodeAudioData без Promise — используем колбэки
  return await new Promise((res, rej) => {
    try { const p = ctx.decodeAudioData(copy, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }
  });
}
export function audioBufferToWav(buf){
  const ch = Math.min(2, buf.numberOfChannels), n = buf.length, rate = buf.sampleRate;
  const out = new ArrayBuffer(44 + n * ch * 2), dv = new DataView(out);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++){
    const v = Math.max(-1, Math.min(1, chans[c][i]));
    dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2;
  }
  return out;
}

/* ============================== encoders ============================== */
async function encodeWebCodecs(audio, kind, onProgress){
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') throw new Error('WebCodecs unsupported');
  const ch = Math.min(2, audio.numberOfChannels), rate = audio.sampleRate;
  const cfg = kind === 'opus'
    ? { codec: 'opus', sampleRate: rate, numberOfChannels: ch, bitrate: 128000 }
    : { codec: 'mp4a.40.2', sampleRate: rate, numberOfChannels: ch, bitrate: 128000 };
  const sup = await AudioEncoder.isConfigSupported(cfg);
  if (!sup || !sup.supported) throw new Error(kind + ' encoder unsupported');
  const packets = []; let desc = null, err = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
      if (meta && meta.decoderConfig && meta.decoderConfig.description && !desc){
        const d = meta.decoderConfig.description;
        desc = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
      }
      const samples = kind === 'aac' ? 1024 : Math.round((chunk.duration || 20000) * rate / 1e6);
      packets.push({ data, samples });
    },
    error: e => { err = e; }
  });
  enc.configure(cfg);
  const BLOCK = 48000, total = audio.length, chans = []; for (let c = 0; c < ch; c++) chans.push(audio.getChannelData(c));
  try {
  for (let i = 0; i < total; i += BLOCK){
    if (err) throw err;
    const n = Math.min(BLOCK, total - i), planar = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) planar.set(chans[c].subarray(i, i + n), c * n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(i * 1e6 / rate), data: planar });
    enc.encode(ad); ad.close();
    // раньше при ошибке кодировщика ожидание 'dequeue' могло зависнуть навсегда
    while (enc.encodeQueueSize > 4 && !err && enc.state === 'configured')
      await new Promise(r => { enc.addEventListener('dequeue', r, { once: true }); setTimeout(r, 300); });
    if (onProgress) onProgress(Math.min(1, (i + n) / total));
  }
  await enc.flush();
  } finally { if (enc.state !== 'closed') { try { enc.close(); } catch (_) {} } }
  if (err) throw err;
  return { packets, desc, ch, rate, total };
}
function makeAsc(rate, ch){
  const idx = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000].indexOf(rate);
  const v = (2 << 11) | ((idx < 0 ? 3 : idx) << 7) | (ch << 3);
  return Uint8Array.from([v >> 8, v & 255]);
}
async function recordMedia(audio, mime){
  const ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: audio.sampleRate });
  const dest = ac.createMediaStreamDestination(), src = ac.createBufferSource();
  src.buffer = audio; src.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: mime }), chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => { rec.onstop = r; });
  if (ac.state === 'suspended') { try { await ac.resume(); } catch (_) {} }
  rec.start(); src.start();
  await new Promise(r => { src.onended = r; });
  rec.stop(); await stopped; ac.close();
  return new Blob(chunks, { type: mime.split(';')[0] });
}
const canRec = m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m);

export const canOgg = () => typeof AudioEncoder !== 'undefined' || canRec('audio/ogg;codecs=opus');
export const canMp4 = () => typeof AudioEncoder !== 'undefined' || canRec('audio/mp4;codecs=mp4a.40.2') || canRec('audio/mp4');

/* ============================== main entry ============================== */
// fmt: 'orig' | 'wav' | 'ogg' | 'mp4'; raw — исходные байты; prep — { buf, mime } после починки ADPCM
export async function convertAudio(fmt, { raw, prep, origExt, onProgress }){
  if (fmt === 'orig') return { blob: new Blob([raw]), ext: origExt };
  if (fmt === 'wav'){
    if (prep.mime === 'audio/wav') return { blob: new Blob([prep.buf], { type: 'audio/wav' }), ext: 'wav' };
    const a = await decodeAudio(prep.buf);
    return { blob: new Blob([audioBufferToWav(a)], { type: 'audio/wav' }), ext: 'wav' };
  }
  const audio = await decodeAudio(prep.buf);
  if (fmt === 'ogg'){
    try {
      const r = await encodeWebCodecs(audio, 'opus', onProgress);
      let preSkip = 312;
      if (r.desc && r.desc.length >= 12 && String.fromCharCode(...r.desc.subarray(0, 8)) === 'OpusHead') preSkip = r.desc[10] | (r.desc[11] << 8);
      return { blob: muxOgg(r.packets, { channels: r.ch, rate: r.rate, preSkip, totalSamples: r.total }), ext: 'ogg' };
    } catch (e){
      if (canRec('audio/ogg;codecs=opus')) return { blob: await recordMedia(audio, 'audio/ogg;codecs=opus'), ext: 'ogg' };
      throw new Error('OGG: ' + e.message);
    }
  }
  if (fmt === 'mp4'){
    try {
      const r = await encodeWebCodecs(audio, 'aac', onProgress);
      const asc = r.desc && r.desc.length ? r.desc : makeAsc(r.rate, r.ch);
      return { blob: muxMp4(r.packets.map(p => p.data), { channels: r.ch, rate: r.rate, asc }), ext: 'mp4' };
    } catch (e){
      const m = canRec('audio/mp4;codecs=mp4a.40.2') ? 'audio/mp4;codecs=mp4a.40.2' : canRec('audio/mp4') ? 'audio/mp4' : null;
      if (m) return { blob: await recordMedia(audio, m), ext: 'mp4' };
      throw new Error('MP4: ' + e.message);
    }
  }
  throw new Error('unknown format ' + fmt);
}

export function saveBlob(blob, filename){
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 30000);
}