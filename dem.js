// dem.js — разбор Source Engine .dem (HL2DEMO). Без зависимостей от three.
// Читает: заголовок, список кадров, путь камеры игрока (origin/angles из democmdinfo), консольные команды, размеры блоков.
// Не декодирует: сетевые сообщения внутри пакетов (сущности, звуки), usercmd-биты, string tables.
// Версии: demo protocol 3 (HL2/Orange Box/L4D) и 4 (L4D2/CS:GO/Portal 2). Кадр proto 4 имеет лишний байт playerslot.

const _td = new TextDecoder('latin1');
const CMD = { SIGNON: 1, PACKET: 2, SYNCTICK: 3, CONSOLECMD: 4, USERCMD: 5, DATATABLES: 6, STOP: 7 };
const INFO_SIZE = 76;                                   // democmdinfo: flags + 3×(origin, angles, localAngles) ×2 = 4 + 72

function cstr(u8, off, n){
  let e = off; const end = Math.min(off + n, u8.length);
  while (e < end && u8[e] !== 0) e++;
  return _td.decode(u8.subarray(off, e));
}

export function isDem(buf){
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
  return u8.length >= 8 && cstr(u8, 0, 8) === 'HL2DEMO';
}

function readHeader(dv, u8){
  return {
    demoProtocol: dv.getInt32(8, true), networkProtocol: dv.getInt32(12, true),
    server: cstr(u8, 16, 260), client: cstr(u8, 276, 260), map: cstr(u8, 536, 260), gameDir: cstr(u8, 796, 260),
    playbackTime: dv.getFloat32(1056, true), ticks: dv.getInt32(1060, true), frames: dv.getInt32(1064, true), signonLength: dv.getInt32(1068, true)
  };
}

// Один проход по кадрам с заданным числом democmdinfo в пакете. Возвращает { ok, result }.
function walk(dv, u8, h, nInfo){
  const proto = h.demoProtocol, tickBytes = proto >= 4 ? 1 : 0;
  const stringTables = proto >= 4 ? 9 : 8, customData = proto >= 4 ? 8 : -1;
  const r = { path: [], console: [], counts: {}, signonBytes: 0, packetBytes: 0, usercmds: 0, stopped: false, endOffset: 0, error: null };
  let p = 1072; const n = u8.length;
  const bump = k => { r.counts[k] = (r.counts[k] || 0) + 1; };
  while (p < n){
    const cmd = u8[p];
    if (cmd === CMD.STOP){ r.stopped = true; r.endOffset = p + 1; bump('stop'); break; }   // у dem_stop хвост может быть обрезан
    if (p + 5 > n){ r.error = 'trunc'; break; }
    const tick = dv.getInt32(p + 1, true); let o = p + 5 + tickBytes;
    if (cmd === CMD.SIGNON || cmd === CMD.PACKET){
      const infoOff = o; o += INFO_SIZE * nInfo + 8;              // + sequence in/out
      if (o + 4 > n){ r.error = 'trunc'; break; }
      const len = dv.getInt32(o, true); o += 4;
      if (len < 0 || o + len > n){ r.error = 'badlen'; break; }
      if (cmd === CMD.PACKET){
        r.packetBytes += len;
        r.path.push({
          tick, flags: dv.getInt32(infoOff, true),
          origin: [dv.getFloat32(infoOff + 4, true), dv.getFloat32(infoOff + 8, true), dv.getFloat32(infoOff + 12, true)],
          angles: [dv.getFloat32(infoOff + 16, true), dv.getFloat32(infoOff + 20, true), dv.getFloat32(infoOff + 24, true)]
        });
      } else r.signonBytes += len;
      o += len; bump(cmd === CMD.PACKET ? 'packet' : 'signon');
    } else if (cmd === CMD.SYNCTICK){ bump('synctick'); }
    else if (cmd === CMD.CONSOLECMD || cmd === CMD.USERCMD || cmd === CMD.DATATABLES || cmd === stringTables || cmd === customData){
      if (cmd === CMD.USERCMD) o += 4;                             // outgoing sequence
      if (o + 4 > n){ r.error = 'trunc'; break; }
      const len = dv.getInt32(o, true); o += 4;
      if (len < 0 || o + len > n){ r.error = 'badlen'; break; }
      if (cmd === CMD.CONSOLECMD) r.console.push({ tick, text: cstr(u8, o, len) });
      else if (cmd === CMD.USERCMD) r.usercmds++;
      o += len;
      bump(cmd === CMD.CONSOLECMD ? 'console' : cmd === CMD.USERCMD ? 'usercmd' : cmd === CMD.DATATABLES ? 'datatables' : cmd === stringTables ? 'stringtables' : 'custom');
    } else { r.error = 'cmd' + cmd; break; }
    p = o; r.endOffset = p;
  }
  return { ok: r.stopped && !r.error, result: r };
}

export function parseDem(buffer){
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 1072 || !isDem(u8)) throw new Error('not HL2DEMO');
  const header = readHeader(dv, u8);
  if (header.demoProtocol < 2 || header.demoProtocol > 4) throw new Error('dem:proto ' + header.demoProtocol);
  // число democmdinfo зависит от игры (1 или 2 при сплитскрине) — берём тот вариант, что доходит до dem_stop
  let best = null;
  for (const nInfo of header.demoProtocol >= 4 ? [1, 2] : [1]){
    const w = walk(dv, u8, header, nInfo);
    if (!best || w.ok || w.result.path.length > best.result.path.length) best = w;
    if (w.ok) break;
  }
  const r = best.result;
  // путь: только неотрицательные тики, по возрастанию, без дублей одного тика (оставляем последний)
  const byTick = new Map();
  for (const s of r.path) if (s.tick >= 0 && isFinite(s.origin[0]) && isFinite(s.origin[1]) && isFinite(s.origin[2])) byTick.set(s.tick, s);
  const path = [...byTick.values()].sort((a, b) => a.tick - b.tick);
  const lastTick = path.length ? path[path.length - 1].tick : 0;
  const ticks = header.ticks > 0 ? header.ticks : lastTick;
  const tickRate = header.playbackTime > 0 && header.ticks > 0 ? header.ticks / header.playbackTime : 66.6667;
  return {
    header, path, console: r.console, counts: r.counts, signonBytes: r.signonBytes, packetBytes: r.packetBytes,
    complete: best.ok, error: r.error, ticks, tickRate, duration: ticks / tickRate, size: u8.length
  };
}

// Поза в момент tick (дробный): lerp позиции, lerp углов по кратчайшей дуге. Бинарный поиск по path.
export function sampleDem(dem, tick){
  const P = dem.path; if (!P.length) return null;
  if (tick <= P[0].tick) return { origin: P[0].origin.slice(), angles: P[0].angles.slice() };
  const last = P[P.length - 1]; if (tick >= last.tick) return { origin: last.origin.slice(), angles: last.angles.slice() };
  let lo = 0, hi = P.length - 1;
  while (hi - lo > 1){ const m = (lo + hi) >> 1; if (P[m].tick <= tick) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], s = (tick - a.tick) / Math.max(1, b.tick - a.tick);
  const o = [0, 1, 2].map(i => a.origin[i] + (b.origin[i] - a.origin[i]) * s);
  const an = [0, 1, 2].map(i => { let d = ((b.angles[i] - a.angles[i] + 540) % 360) - 180; return a.angles[i] + d * s; });
  return { origin: o, angles: an };
}
