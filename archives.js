// archives.js
import { Store, getExt, shouldKeepFile, ICON_PATH_RE, EntityIcons, fmtB, Packer, pmap, emitProgress, readStored, gameFromVpk, gameOf } from './core.js';

const VPK_SIGNATURE   = 0x55AA1234;
const VPK_TERMINATOR  = 0xFFFF;
const VPK_DIR_ARCHIVE = 0x7FFF;
const MAX_VPK_FILE_SIZE = 512 * 1024 * 1024;
const MAX_WAD_LUMP_SIZE = 16 * 1024 * 1024;
const MAX_VPK_TREE_SIZE = 64 * 1024 * 1024;
// ✅ FIX #4: общие лимиты VPK (защита от бомб)
const MAX_VPK_FILES_COUNT = 200_000;
const MAX_VPK_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

export async function parseVPKDirectory(vpkBlob){
  if (vpkBlob.size < 12) throw new Error('VPK: blob too small');
  const headerBuf = await vpkBlob.slice(0, 28).arrayBuffer();
  const header    = new DataView(headerBuf);
  const magic     = header.getUint32(0, true);
  if (magic !== VPK_SIGNATURE) throw new Error(`VPK: bad signature`);

  const version    = header.getUint32(4, true);
  const treeSize   = header.getUint32(8, true);
  const headerSize = version === 1 ? 12 : version === 2 ? 28 : 0;
  if (!headerSize) throw new Error('VPK: unsupported version');
  if (treeSize > MAX_VPK_TREE_SIZE) throw new Error('VPK: tree too large');
  const dataSectionStart = headerSize + treeSize;
  if (dataSectionStart > vpkBlob.size) throw new Error('VPK: tree out of bounds');

  const treeBuf = await vpkBlob.slice(headerSize, dataSectionStart).arrayBuffer();
  const tree    = new DataView(treeBuf);
  const bytes   = new Uint8Array(treeBuf);
  const dec     = new TextDecoder('utf-8');
  const N       = treeBuf.byteLength;

  const files = new Map();
  let p = 0;
  const readStr = () => {
    const start = p;
    while (p < N && tree.getUint8(p) !== 0) p++;
    const s = dec.decode(bytes.subarray(start, p));
    p++;
    return s;
  };

  while (p < N){
    const ext = readStr();
    if (ext === '') break;
    while (p < N){
      const path = readStr();
      if (path === '') break;
      while (p < N){
        const name = readStr();
        if (name === '') break;
        if (p + 18 > N) { p = N; break; }
        p += 4;
        const preloadBytes = tree.getUint16(p, true); p += 2;
        const archiveIndex = tree.getUint16(p, true); p += 2;
        const offset       = tree.getUint32(p, true); p += 4;
        const length       = tree.getUint32(p, true); p += 4;
        p += 2;
        if (length > MAX_VPK_FILE_SIZE || preloadBytes > MAX_VPK_FILE_SIZE) continue;
        let preload = null;
        if (preloadBytes > 0){
          if (p + preloadBytes > N) { p = N; break; }
          preload = bytes.slice(p, p + preloadBytes);
          p += preloadBytes;
        }
        const realExt  = ext  === ' ' ? '' : ext;
        const realPath = path === ' ' ? '' : path;
        const realName = name === ' ' ? '' : name;
        const fullPath = (realPath ? realPath + '/' : '') + realName + (realExt ? '.' + realExt : '');
        files.set(fullPath, { path: fullPath, preload, preloadBytes, archiveIndex, offset, length, dataSectionStart });
      }
    }
  }
  return { version, headerSize, treeSize, dataSectionStart, files };
}

export async function getFileFromVPK(vpkBlob, info, partResolver = null){
  const { preload, preloadBytes, archiveIndex, offset, length, dataSectionStart } = info;
  if (length > MAX_VPK_FILE_SIZE) throw new Error('VPK: file too large');
  const totalLen = (preloadBytes || 0) + length;
  if (totalLen > MAX_VPK_FILE_SIZE) throw new Error('VPK: file too large');
  const out = new Uint8Array(totalLen);
  if (preload && preload.byteLength) out.set(preload, 0);

  if (length > 0){
    if (archiveIndex !== VPK_DIR_ARCHIVE){
      if (!partResolver) throw new Error(`VPK: missing part`);
      const partBlob = await partResolver(archiveIndex);
      if (!partBlob) throw new Error(`VPK: part not found`);
      if (offset + length > partBlob.size) throw new Error('VPK: part out of bounds');
      const buf = await partBlob.slice(offset, offset + length).arrayBuffer();
      out.set(new Uint8Array(buf), preloadBytes || 0);
    } else {
      const start = dataSectionStart + offset;
      if (start + length > vpkBlob.size) throw new Error('VPK: data out of bounds');
      const buf = await vpkBlob.slice(start, start + length).arrayBuffer();
      out.set(new Uint8Array(buf), preloadBytes || 0);
    }
  }
  return out.buffer;
}

export async function getRecordBuffer(rec){
  if (!rec) throw new Error('no record');
  if (rec.h) return await readStored(rec);
  if (rec._vpk){
    const dirRec = Store.files.get(rec._vpk.vpkPath);
    if (!dirRec || !dirRec.blob) throw new Error('VPK not found');
    const partResolver = async (archiveIndex) => {
      const suffix   = '_' + String(archiveIndex).padStart(3, '0');
      const partPath = rec._vpk.vpkPath.replace(/_dir\.vpk$/i, suffix + '.vpk');
      const partRec  = Store.files.get(partPath);
      return partRec ? partRec.blob : null;
    };
    return await getFileFromVPK(dirRec.blob, rec._vpk.info, partResolver);
  }
  if (rec.blob){
    if (rec.blob.size > MAX_VPK_FILE_SIZE) throw new Error('file too large');
    return await rec.blob.arrayBuffer();
  }
  throw new Error('no data source');
}

// Распаковка VPK: в хранилище попадают ТОЛЬКО нужные файлы (дедуп + сжатие), сам архив не хранится
async function extractVPK(dirBlob, game, partResolver, label, only = null){
  const dir = await parseVPKDirectory(dirBlob);
  let totalBytes = 0, fileCount = 0, overLimit = 0;
  const kept = [];
  for (const info of dir.files.values()){
    if (!shouldKeepFile(info.path)) continue;
    const size = (info.preloadBytes || 0) + info.length;
    if (size > MAX_VPK_FILE_SIZE) continue;
    if (only && !only(info.path)) continue;
    if (fileCount + 1 > MAX_VPK_FILES_COUNT || totalBytes + size > MAX_VPK_TOTAL_BYTES){ overLimit++; continue; }
    fileCount++; totalBytes += size;
    kept.push(info);
  }
  const packer = new Packer(), counts = { vtf: 0, models: 0, icons: 0, audio: 0, failed: 0, overLimit }; let done = 0;
  try {
    await pmap(kept, 6, async (info) => {
      const ext = getExt(info.path);
      let ab;
      try { ab = await getFileFromVPK(dirBlob, info, partResolver); } catch (_) { counts.failed++; emitProgress(label, ++done, kept.length); return; }
      if (/^(png|jpe?g|bmp)$/.test(ext)){
        if (ICON_PATH_RE.test(info.path)){
          const name = info.path.split('/').pop();
          try { if (await EntityIcons.addFromFile(new File([new Blob([ab])], name), name)) counts.icons++; } catch (_) {}
        }
      } else {
        await packer.add(info.path, new Uint8Array(ab), { g: game });
        if (ext === 'vtf') counts.vtf++;
        else if (ext === 'mdl' || ext === 'vvd' || ext === 'vtx' || ext === 'phy') counts.models++;
        else if (ext === 'wav' || ext === 'mp3' || ext === 'ogg') counts.audio++;
      }
      emitProgress(label, ++done, kept.length);
    });
  } finally { try { await packer.flush(); } catch (e) { if (!packer.failed) throw e; } }
  if (packer.failed) throw packer.failed;
  return { counts, stats: packer.stats };
}

// Выбранные VPK-группы, которым ещё не хватает _dir.vpk (можно выбирать файлы по очереди)
const _vpkSession = new Map();

export async function ingestVPKs(vpkList, only = null){
  const groups = _vpkSession;
  for (const { file, path } of vpkList){
    const relPath = (path || file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const m = relPath.match(/^(.+?)(?:_(dir|\d{3}))?\.vpk$/i);
    if (!m) continue;
    const base = m[1], suffix = m[2];
    if (!groups.has(base)) groups.set(base, { dirPath: null, dirFile: null, parts: {} });
    const g = groups.get(base);
    if (suffix && suffix.toLowerCase() === 'dir' || !suffix) { g.dirPath = relPath; g.dirFile = file; }
    else g.parts['_' + suffix] = { path: relPath, file };
  }

  let totalVtf = 0, totalIcons = 0, totalModels = 0, totalAudio = 0;
  const errors = [];
  for (const [base, g] of [...groups]){
    if (!g.dirFile){ errors.push(`${base.split('/').pop()}: нет _dir.vpk — выбери его (части уже запомнены) / no _dir.vpk yet — select it, parts are remembered`); continue; }
    groups.delete(base);
    try {
      const partResolver = async (ai) => {
        const p = g.parts['_' + String(ai).padStart(3, '0')];
        return p ? p.file : null;
      };
      const r = await extractVPK(g.dirFile, gameFromVpk(g.dirPath), partResolver, base.split('/').pop(), only);
      totalVtf += r.counts.vtf; totalModels += r.counts.models; totalIcons += r.counts.icons; totalAudio += r.counts.audio;
      if (r.counts.overLimit) errors.push(`${base}: ${r.counts.overLimit} files skipped (size/count limit)`);
      if (r.counts.failed) errors.push(`${base}: ${r.counts.failed} files unreadable — select ALL _NNN.vpk parts together with _dir.vpk`);
    } catch (err) { errors.push(`${base}: ${err.message}`); }
  }
  return { vtfCount: totalVtf, iconCount: totalIcons, modelCount: totalModels, audioCount: totalAudio, errors };
}

// Перенос старого хранилища (целые VPK / сырые blob) в упакованный формат
export async function optimizeStorage(){
  const out = { vpks: 0, files: 0, errors: [] };
  const all = [...Store.files.values()];
  const dirs = all.filter(f => f.ext === 'vpk' && f.blob && !/_\d{3}\.vpk$/i.test(f.path));
  for (const d of dirs){
    try {
      const prefix = d.path.replace(/_dir\.vpk$/i, '_');
      const resolver = async (ai) => { const r = Store.files.get(prefix + String(ai).padStart(3, '0') + '.vpk'); return r ? r.blob : null; };
      await extractVPK(d.blob, gameFromVpk(d.path), resolver, d.path.split('/').pop());
      const parts = all.filter(f => f.ext === 'vpk' && f.blob && f.path !== d.path && /_\d{3}\.vpk$/i.test(f.path) && f.path.startsWith(prefix)).map(f => f.path);
      await Store.deleteMany([d.path, ...parts]);
      out.vpks++;
    } catch (e) { out.errors.push(`${d.path}: ${e.message}`); }
  }
  const legacy = [...Store.files.values()].filter(f => f.blob && !f.h && !f._vpk);
  const raw = legacy.filter(f => f.ext === 'wad' || f.ext === 'pak' || f.ext === 'vpk');
  if (raw.length) await Store.deleteMany(raw.map(f => f.path));       // уже разобраны на VTF
  const rest = legacy.filter(f => !raw.includes(f));
  const packer = new Packer(); let done = 0;
  try {
    await pmap(rest, 6, async (f) => {
      const g = gameOf(f);
      const u8 = new Uint8Array(await f.blob.arrayBuffer());
      await packer.add(f.path, u8, { g });
      out.files++; emitProgress('optimize', ++done, rest.length);
    });
    await packer.flush();
  } catch (e) { out.errors.push(e.message); }
  return out;
}

export async function ingestWAD3(wadList){
  let total = 0; const errors = [];
  const packer = new Packer();
  for (const { file } of wadList){
    try {
      const buf = await file.arrayBuffer();
      const u8 = new Uint8Array(buf), dv = new DataView(buf);
      if (u8.length < 12) throw new Error('WAD too small');
      if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'WAD3') throw new Error('не WAD3');
      const numLumps = dv.getInt32(4, true), infoOfs = dv.getInt32(8, true);
      if (numLumps < 0 || numLumps > 100000) throw new Error('WAD: bad lump count');
      if (infoOfs < 12 || infoOfs + numLumps * 32 > u8.length) throw new Error('WAD: bad dir offset');
      const decoder = new TextDecoder('latin1'), wadName = file.name.replace(/\.wad$/i, '');
      for (let i = 0; i < numLumps; i++){
        const base = infoOfs + i * 32;
        if (base + 32 > u8.length) break;
        const filePos = dv.getInt32(base, true), diskSize = dv.getInt32(base + 4, true);
        if (filePos < 0 || diskSize < 0) continue;
        if (diskSize > MAX_WAD_LUMP_SIZE) continue;
        const type = u8[base + 12], compression = u8[base + 13];
        let nameEnd = base + 16;
        while (nameEnd < base + 32 && u8[nameEnd] !== 0) nameEnd++;
        const rawName = decoder.decode(u8.subarray(base + 16, nameEnd));
        if (type !== 0x43 || compression !== 0) continue;
        if (diskSize < 40 + 768 || filePos + diskSize > u8.length) continue;
        const lump = buf.slice(filePos, filePos + diskSize);
        const lU8 = new Uint8Array(lump), lDv = new DataView(lump);
        const w = lDv.getUint32(16, true), h = lDv.getUint32(20, true);
        if (!w || !h || w > 4096 || h > 4096) continue;
        const off0 = lDv.getUint32(24, true), palStart = diskSize - 768;
        if (palStart < off0 + w * h) continue;
        const headerSize = 64, rowSize = w * 4;
        const vtfBuf = new ArrayBuffer(headerSize + w * h * 4);
        const vDv = new DataView(vtfBuf), vU8 = new Uint8Array(vtfBuf);
        vDv.setUint32(0, 0x00465456, true); vDv.setUint32(4, 7, true); vDv.setUint32(8, 1, true);
        vDv.setUint32(12, headerSize, true); vDv.setUint16(16, w, true); vDv.setUint16(18, h, true);
        vDv.setUint16(24, 1, true); vDv.setUint32(52, 0, true); vU8[56] = 1;
        const pal = lU8.subarray(palStart, palStart + 768), src = lU8.subarray(off0, off0 + w * h);
        for (let y = 0; y < h; y++){
          const dst = headerSize + (h - 1 - y) * rowSize;
          for (let x = 0; x < w; x++){
            const idx = src[y * w + x], p3 = idx * 3;
            vU8[dst + x * 4] = pal[p3]; vU8[dst + x * 4 + 1] = pal[p3 + 1];
            vU8[dst + x * 4 + 2] = pal[p3 + 2]; vU8[dst + x * 4 + 3] = (idx === 255) ? 0 : 255;
          }
        }
        const cleanName = rawName.replace(/^[+\-][A-Z]?\d+/, '') || rawName;
        const virtualPath = wadName + '/' + cleanName + '.vtf';
        await packer.add(virtualPath, new Uint8Array(vtfBuf)); total++;
      }
    } catch (err) { errors.push(`${file.name}: ${err.message}`); }
  }
  try { await packer.flush(); } catch (e) { errors.push(e.message); }
  return { vtfCount: total, errors };
}

export async function ingestPAKs(pakList){
  const wads = []; const errors = [];
  for (const { file } of pakList){
    try {
      const buf = await file.arrayBuffer();
      const u8 = new Uint8Array(buf), dv = new DataView(buf);
      if (u8.length < 12) throw new Error('PAK too small');
      if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'PACK') throw new Error('не PAK');
      const dirOff = dv.getUint32(4, true), dirLen = dv.getUint32(8, true);
      if (dirOff + dirLen > u8.length) throw new Error('PAK: dir out of bounds');
      const count = Math.floor(dirLen / 64), decoder = new TextDecoder('utf-8');
      for (let i = 0; i < count; i++){
        const base = dirOff + i * 64;
        if (base + 64 > u8.length) break;
        let nameEnd = base;
        while (nameEnd < base + 56 && u8[nameEnd] !== 0) nameEnd++;
        const name = decoder.decode(u8.subarray(base, nameEnd));
        if (!/\.wad$/i.test(name)) continue;

        // ✅ FIX #12: жёсткая валидация
        const filePos = dv.getUint32(base + 56, true);
        const fileLen = dv.getUint32(base + 60, true);
        if (filePos < 12 || fileLen === 0) continue;
        if (filePos > u8.length || fileLen > u8.length - filePos) continue;
        if (fileLen > 256 * 1024 * 1024) continue;
        const baseName = name.split('/').pop();
        if (!baseName || !/\.wad$/i.test(baseName)) continue;
        const wadBytes = u8.slice(filePos, filePos + fileLen);
        wads.push({ file: new File([wadBytes], baseName), path: name });
      }
    } catch (err) { errors.push(`${file.name}: ${err.message}`); }
  }
  let total = 0;
  if (wads.length){ const r = await ingestWAD3(wads); total = r.vtfCount; errors.push(...r.errors); }
  return { vtfCount: total, errors };
}

export async function ingestArchives(archiveList, only = null){
  const vpks = archiveList.filter(x => /\.vpk$/i.test(x.path || x.file.name));
  const wads = archiveList.filter(x => /\.wad$/i.test(x.path || x.file.name));
  const paks = archiveList.filter(x => /\.pak$/i.test(x.path || x.file.name));
  const out = { vtfCount: 0, iconCount: 0, modelCount: 0, audioCount: 0, errors: [] };
  if (vpks.length){ const r = await ingestVPKs(vpks, only); out.audioCount += r.audioCount; out.vtfCount += r.vtfCount; out.iconCount += r.iconCount; out.modelCount += r.modelCount; out.errors.push(...r.errors); }
  if (wads.length){ const r = await ingestWAD3(wads); out.vtfCount += r.vtfCount; out.errors.push(...r.errors); }
  if (paks.length){ const r = await ingestPAKs(paks); out.vtfCount += r.vtfCount; out.errors.push(...r.errors); }
  return out;
}

// ✅ FIX #14: ошибки не теряются
export async function splitAndIngestArchives(list, only = null){
  const isArch = x => /\.(vpk|wad|pak)$/i.test(x.path || x.file.name || '');
  const archives = list.filter(isArch);
  const normal = list.filter(x => !isArch(x));
  let result = null;
  if (archives.length){
    try { result = await ingestArchives(archives, only); }
    catch (err){
      console.error('[archives] ingest failed:', err);
      result = { vtfCount: 0, iconCount: 0, modelCount: 0, audioCount: 0, errors: [err.message || String(err)] };
    }
  }
  return { normal, result };
}