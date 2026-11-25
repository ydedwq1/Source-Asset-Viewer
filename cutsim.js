// cutsim.js — симуляция «кат-сцены» карты по connections (I/O) энтити. Без зависимостей от three.
// Делает то же, что dem.js для .dem: превращает данные в таймлайн, который можно проиграть/перемотать.
// Работает на списке энтити vmf.js ({ node, props, classname, targetname, origin, angles, model }).
import { getConns, isKV } from './vmfio.js';

const lc = s => String(s == null ? '' : s).toLowerCase();
export const nums = s => (String(s == null ? '' : s).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
const vec3 = (s, d = 0) => { const n = nums(s); return [n[0] ?? d, n[1] ?? d, n[2] ?? d]; };
export const entKey = (e, i) => String((e.props && (e.props.id || e.props.hammerid)) || e.id || ('i' + i));

const TRIG = /^(trigger_|func_button|func_door|func_rot_button|func_physbox_multiplayer$)/;
const MAX_EVENTS = 5000, HORIZON = 3600, TIMER_MAX = 400;      // TIMER_MAX: тиков одного logic_timer на один Enable
export const PHYS_CLASS = /^prop_physics/;                       // тела, которые физика (physics.js) может двигать
const PHYS_IN = /^(enablemotion|disablemotion|wake)$/;

function splitRow(v){
  const s = String(v), sep = s.indexOf('\x1b') >= 0 ? '\x1b' : (s.indexOf(',') >= 0 ? ',' : ':'), p = s.split(sep);
  let param = p[2] || '', delay = p[3], times = p[4];
  if (p.length > 5){ times = p[p.length - 1]; delay = p[p.length - 2]; param = p.slice(2, -2).join(sep); }
  const tm = parseInt(times, 10);
  return { target: p[0] || '', input: p[1] || '', param, delay: parseFloat(delay) || 0, times: isNaN(tm) ? -1 : tm };
}

let _cc = new WeakMap();
const resetConns = () => { _cc = new WeakMap(); };
function connsOf(e){
  const hit = _cc.get(e); if (hit) return hit;
  const rows = e.node ? getConns(e) : [];
  const items = e.node ? e.node.items : [];
  for (const it of items){
    if (!isKV(it) || !/^on[a-z0-9_]+$/i.test(it[0]) || !/[,\x1b]/.test(String(it[1]))) continue;
    const r = splitRow(it[1]); rows.push({ out: it[0], target: r.target, input: r.input, param: r.param, delay: String(r.delay), times: String(r.times) });
  }
  _cc.set(e, rows);
  return rows;
}

export function indexEntities(ents){
  const keyOf = new Map(), byKey = new Map(), byName = new Map(), byClass = new Map();
  ents.forEach((e, i) => {
    const k = entKey(e, i); keyOf.set(e, k); byKey.set(k, e);
    const n = lc(e.targetname || (e.props && e.props.targetname)); if (n){ if (!byName.has(n)) byName.set(n, []); byName.get(n).push(e); }
    const c = lc(e.classname); if (!byClass.has(c)) byClass.set(c, []); byClass.get(c).push(e);
  });
  return { ents, keyOf, byKey, byName, byClass };
}

function resolve(ix, name, self){
  const n = lc(name); if (!n) return [];
  if (n === '!self') return self ? [self] : [];
  if (n[0] === '!') return [];
  if (n.includes('*')){
    const re = new RegExp('^' + n.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), out = [];
    for (const [k, v] of ix.byName) if (re.test(k)) out.push(...v);
    return out;
  }
  return ix.byName.get(n) || ix.byClass.get(n) || [];
}

export function hasCutscene(ents){
  resetConns();
  const ix = indexEntities(ents);
  if (!(ix.byClass.get('point_viewcontrol') || []).length) return false;
  for (const e of ents){
    if (!e.node) continue;
    for (const r of connsOf(e)){
      const tg = resolve(ix, r.target, e);
      if (/^(enable|setparent)$/i.test(r.input) && tg.some(t => t.classname === 'point_viewcontrol')) return true;
    }
  }
  return false;
}

export function findRoots(ents){
  resetConns();
  const ix = indexEntities(ents), targeted = new Set(), withOut = [];
  for (const e of ents){
    if (!e.node) continue;
    const rows = connsOf(e); if (!rows.length) continue;
    withOut.push(e);
    for (const r of rows) for (const t of resolve(ix, r.target, e)) targeted.add(t);
  }
  return withOut.filter(e => e.classname === 'logic_auto' || (!targeted.has(e) && (TRIG.test(e.classname) || /^logic_/.test(e.classname))));
}

/* ---------- симуляция ---------- */
export function simulate(ents, root){
  resetConns();
  const ix = indexEntities(ents), kOf = e => ix.keyOf.get(e);
  const q = []; let seq = 0;
  const events = [], consoleLog = [], sounds = [], used = new Map(), dyn = new Map(), flags = new Map();
  const rowsOf = e => [...connsOf(e).map((r, i) => ({ ...r, _id: kOf(e) + '#' + i })), ...(dyn.get(e) || [])];
  const push = ev => { ev.seq = seq++; let i = q.length; while (i > 0 && (q[i - 1].t > ev.t || (q[i - 1].t === ev.t && q[i - 1].seq > ev.seq))) i--; q.splice(i, 0, ev); };

  function fire(e, out, t){
    for (const r of rowsOf(e)){
      if (lc(r.out) !== lc(out)) continue;
      const times = Number(r.times === undefined ? -1 : r.times), uid = r._id;
      if (times > 0 && (used.get(uid) || 0) >= times) continue;
      used.set(uid, (used.get(uid) || 0) + 1);
      for (const tg of resolve(ix, r.target, e)) push({ t: t + (parseFloat(r.delay) || 0), ent: tg, input: r.input, param: r.param, src: e });
    }
  }
  const F = e => { const k = kOf(e); let f = flags.get(k); if (!f){ f = { off: lc((e.props || {}).startdisabled) === '1', fired: false, timer: false }; flags.set(k, f); } return f; };

  // Старт фоновых звуков ambient_generic, которые не Start Silent (0x10)
  for (const e of ents) {
    if (e.classname === 'ambient_generic') {
      const pr = e.props || {};
      const sf = parseInt(pr.spawnflags || 0, 10);
      const isStartSilent = (sf & 16) !== 0;
      const soundFile = pr.message || pr.sound || '';
      if (!isStartSilent && soundFile) {
        sounds.push({
          t: 0,
          ent: e,
          msg: soundFile,
          radius: +pr.radius || 0,
          stop: false,
          loop: !(sf & 32),
          pitch: parseInt(pr.pitch || 100, 10)
        });
      }
    }
  }

  // Старт сцены
  const rootE = root || null;
  if (rootE){
    if (rootE.classname === 'logic_auto'){ fire(rootE, 'OnMapSpawn', 0); fire(rootE, 'OnNewGame', 0); }
    else if (TRIG.test(rootE.classname)){ events.push({ t: 0, ent: rootE, input: 'Touch', param: '', src: null, state: false }); fire(rootE, 'OnTrigger', 0); fire(rootE, 'OnStartTouch', 0); fire(rootE, 'OnPressed', 0); }
    else push({ t: 0, ent: rootE, input: 'Trigger', param: '', src: null });
  }

  let guard = 0;
  while (q.length && guard++ < MAX_EVENTS){
    const ev = q.shift(); if (ev.t > HORIZON) break;
    const e = ev.ent, pr = e.props || {}, cls = e.classname, inp = lc(ev.input), P = String(ev.param || ''), f = F(e);
    const rec = { t: ev.t, ent: e, input: ev.input, param: P, src: ev.src, state: false };
    events.push(rec);

    if (inp === 'addoutput'){
      const m = P.match(/^(\S+)\s+([\s\S]*)$/);
      if (m && /^on/i.test(m[1])){
        const r = splitRow(m[2]); const row = { out: m[1], target: r.target, input: r.input, param: r.param, delay: r.delay, times: r.times, _id: kOf(e) + '#d' + (seq++) };
        if (!dyn.has(e)) dyn.set(e, []); dyn.get(e).push(row);
      } else if (m){ rec.state = true; rec.kv = lc(m[1]); rec.val = m[2]; }
      continue;
    }
    if (/^logic_relay$/.test(cls)){
      if (inp === 'trigger'){ if (!f.off && !((parseInt(pr.spawnflags, 10) || 0) & 1 && f.fired)){ f.fired = true; fire(e, 'OnTrigger', ev.t); } }
      else if (inp === 'enable') f.off = false; else if (inp === 'disable') f.off = true; else if (inp === 'toggle') f.off = !f.off;
      else if (inp === 'kill') f.off = true;
      continue;
    }
    if (TRIG.test(cls)){
      if (inp === 'trigger'){ if (!f.off){ fire(e, 'OnTrigger', ev.t); } }
      else if (inp === 'enable') f.off = false; else if (inp === 'disable') f.off = true; else if (inp === 'toggle') f.off = !f.off;
      else if (inp === 'press' || inp === 'use'){ if (!f.off) fire(e, 'OnPressed', ev.t); }
      continue;
    }
    if (cls === 'logic_timer'){
      const refire = parseFloat(pr.refiretime) || 1;
      if (inp === 'enable' || inp === 'resettimer'){ f.timer = true; f.n = 0; f.gen = (f.gen || 0) + 1; push({ t: ev.t + refire, ent: e, input: '__tick', param: String(f.gen) }); }
      else if (inp === 'disable'){ f.timer = false; }
      else if (inp === '__tick'){ events.pop(); if (f.timer && String(f.gen) === P && ++f.n <= TIMER_MAX){ events.push({ ...rec, input: 'OnTimer' }); fire(e, 'OnTimer', ev.t); push({ t: ev.t + refire, ent: e, input: '__tick', param: P }); } }
      continue;
    }
    if (cls === 'point_teleport' && inp === 'teleport'){
      const tg = resolve(ix, pr.target, e); rec.state = true; rec.tele = tg;
      continue;
    }
    if (cls === 'point_clientcommand' || cls === 'point_servercommand'){
      if (inp === 'command'){ consoleLog.push({ t: ev.t, text: P }); if (/^\s*(quit|disconnect|exit)\b/i.test(P)) rec.quit = true; }
      continue;
    }
    
    if (cls === 'ambient_generic'){
      const sf = parseInt(pr.spawnflags || 0, 10);
      if (inp === 'playsound'){ 
        sounds.push({ t: ev.t, ent: e, msg: pr.message || pr.sound || '', radius: +pr.radius || 0, stop: false, loop: !(sf & 32), pitch: parseInt(pr.pitch || 100, 10) }); 
      }
      else if (inp === 'stopsound'){ 
        sounds.push({ t: ev.t, ent: e, msg: pr.message || pr.sound || '', radius: +pr.radius || 0, stop: true }); 
      }
      continue;
    }
    
    if (/^(setanimation|setparent|setparentattachment|setparentattachmentmaintainoffset|clearparent|setlocalorigin|setlocalangles|kill|killhierarchy|enable|disable|enabledraw|disabledraw|skin|setbodygroup|break|enablemotion|disablemotion|wake)$/.test(inp)) rec.state = true;
  }

  events.sort((a, b) => a.t - b.t);
  sounds.sort((a, b) => a.t - b.t);
  
  const quitEv = events.find(x => x.quit), quit = quitEv ? quitEv.t : null;
  const stateEvents = events.filter(x => x.state);
  const tracked = new Map();
  for (const e of ents) tracked.set(kOf(e), e);
  return { ix, root: rootE, events, stateEvents, console: consoleLog, sounds, quit, lastT: events.length ? events[events.length - 1].t : 0, tracked, kOf, resolve: n => resolve(ix, n, null) };
}

/* ---------- состояние в момент T ---------- */
function baseState(e){
  const p = e.props || {};
  return { origin: vec3(e.origin || p.origin), angles: vec3(e.angles || p.angles), anim: null, visible: true, parent: '', parentAtt: '', lo: [0, 0, 0], la: [0, 0, 0] };
}

export function stateAt(sim, T){
  const st = new Map(), cam = { active: false, ent: null, since: 0 };
  const S = e => { const k = sim.kOf(e); let s = st.get(k); if (!s){ s = baseState(e); st.set(k, s); } return s; };
  for (const ev of sim.stateEvents){
    if (ev.t > T) break;
    const e = ev.ent, s = S(e), inp = lc(ev.input), P = ev.param;
    if (inp === 'addoutput'){
      if (ev.kv === 'origin') s.origin = vec3(ev.val); else if (ev.kv === 'angles') s.angles = vec3(ev.val);
      else if (ev.kv === 'skin' || ev.kv === 'model') s[ev.kv] = ev.val;
      continue;
    }
    if (inp === 'teleport'){
      for (const tg of ev.tele || []){ const ts = S(tg); ts.origin = vec3(e.origin || e.props.origin); ts.angles = vec3(e.angles || e.props.angles); ts.teleT = ev.t; }
      continue;
    }
    switch (inp){
      case 'enable': if (e.classname === 'point_viewcontrol'){ cam.active = true; cam.ent = sim.kOf(e); cam.since = ev.t; } else if (e.classname === 'prop_dynamic' || e.classname === 'prop_dynamic_override') s.visible = true; break;
      case 'disable': if (e.classname === 'point_viewcontrol'){ if (cam.ent === sim.kOf(e)) cam.active = false; } else if (/^prop_dynamic/.test(e.classname)) s.visible = false; break;
      case 'enabledraw': s.visible = true; break;
      case 'disabledraw': case 'kill': case 'killhierarchy': case 'break': s.visible = false; break;
      case 'setanimation': s.anim = { name: P, t0: ev.t }; break;
      case 'setparent': { const m = String(P).trim().split(/\s+/), tg = resolve(sim.ix, m[0], e)[0]; s.parent = tg ? sim.kOf(tg) : ''; if (m[1]) s.parentAtt = m[1]; break; }
      case 'setparentattachment': case 'setparentattachmentmaintainoffset': s.parentAtt = String(P).trim(); break;
      case 'clearparent': s.parent = ''; s.parentAtt = ''; break;
      case 'setlocalorigin': s.lo = vec3(P); break;
      case 'setlocalangles': s.la = vec3(P); break;
      case 'skin': s.skin = +P || 0; break;
    }
  }
  return { st, cam, get: e => S(e) };
}

export function collectActors(sim){
  const actors = new Set(), camEnts = new Set(), camParents = new Set(), phys = new Set();
  for (const ev of sim.stateEvents){
    const inp = lc(ev.input), k = sim.kOf(ev.ent);
    if (inp === 'setanimation') actors.add(k);
    if (ev.ent.classname === 'point_viewcontrol'){
      if (inp === 'enable') camEnts.add(k);
      if (inp === 'setparent'){ camEnts.add(k); const tg = resolve(sim.ix, String(ev.param).trim().split(/\s+/)[0], ev.ent)[0]; if (tg){ camParents.add(sim.kOf(tg)); actors.add(sim.kOf(tg)); } }
    }
    if (PHYS_IN.test(inp) && PHYS_CLASS.test(ev.ent.classname)){ phys.add(k); actors.add(k); }
    if (inp === 'teleport') for (const tg of ev.tele || []){ actors.add(sim.kOf(tg)); if (PHYS_CLASS.test(tg.classname)) phys.add(sim.kOf(tg)); }
  }
  return { actors, camEnts, camParents, phys };
}