// physics.js — «запекание» физики в фиксированном шаге (эмуляция VPhysics / Havok)
const S = 0.0254, DT = 1 / 60, GRAVITY = 600; // sv_gravity в HL2 по умолчанию = 600 unit/с²
const MAX_SIM_SECONDS = 40, MAX_TRIS = 600000;
const MAX_VELOCITY = 3500 * S; // Ограничение sv_maxvelocity (88.9 м/с)
const MAX_ANGULAR_VELOCITY = 30.0; // rad/s (защита от дикого раскручивания)

const RAPIER_URLS = [
  'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.12.0/rapier.es.js',
  'https://unpkg.com/@dimforge/rapier3d-compat@0.12.0/rapier.es.js'
];
const lc = s => String(s == null ? '' : s).toLowerCase();

let _R = null, _loading = null;
export function loadRapier(){
  if (_R) return Promise.resolve(_R);
  if (_loading) return _loading;
  _loading = (async () => {
    for (const url of RAPIER_URLS){
      try {
        const m = await import(/* webpackIgnore: true */ url);
        const R = (m.default && m.default.init) ? m.default : m;
        await R.init();
        _R = R; return R;
      } catch (e){ console.warn('[physics] rapier load failed', url, e); }
    }
    _loading = null;
    return null;
  })();
  return _loading;
}

export function collectWorldTris(items, regions){
  const out = []; let tris = 0;
  for (const it of items){
    const P = it.position, I = it.index, e = it.m;
    if (!P || !P.length) continue;
    const nv = (P.length / 3) | 0, X = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++){
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      X[i * 3]     = e[0] * x + e[4] * y + e[8]  * z + e[12];
      X[i * 3 + 1] = e[1] * x + e[5] * y + e[9]  * z + e[13];
      X[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    const n = I ? I.length : nv;
    for (let k = 0; k + 2 < n; k += 3){
      const a = I ? I[k] : k, b = I ? I[k + 1] : k + 1, c = I ? I[k + 2] : k + 2;
      const ax = X[a * 3], ay = X[a * 3 + 1], az = X[a * 3 + 2],
            bx = X[b * 3], by = X[b * 3 + 1], bz = X[b * 3 + 2],
            cx = X[c * 3], cy = X[c * 3 + 1], cz = X[c * 3 + 2];
      const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx),
            mny = Math.min(ay, by, cy), mxy = Math.max(ay, by, cy),
            mnz = Math.min(az, bz, cz), mxz = Math.max(az, bz, cz);
      let hit = !regions;
      if (!hit) for (const r of regions){ if (mxx >= r.min[0] && mnx <= r.max[0] && mxy >= r.min[1] && mny <= r.max[1] && mxz >= r.min[2] && mnz <= r.max[2]){ hit = true; break; } }
      if (!hit) continue;
      out.push(ax * S, ay * S, az * S, bx * S, by * S, bz * S, cx * S, cy * S, cz * S);
      if (++tris >= MAX_TRIS) break;
    }
    if (tris >= MAX_TRIS) break;
  }
  const verts = Float32Array.from(out), idx = new Uint32Array(verts.length / 3);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  return { verts, idx, tris };
}

export async function bakePhysics(R, bodies, opts){
  const { sim, dur, quatOf, worldTris, onProgress } = opts, yieldFn = opts.yieldFn || (() => new Promise(r => setTimeout(r, 0)));
  const num = s => (String(s == null ? '' : s).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
  const result = new Map();
  const impactSounds = [];
  const eventQueue = R.EventQueue ? new R.EventQueue(true) : null;
  const colliderBodies = new Map();
  const lastImpact = new Map();

  const byKey = new Map(); for (const b of bodies) byKey.set(b.key, { b, ev: [], t0: null });
  for (const ev of sim.stateEvents){
    const inp = lc(ev.input);
    if (inp === 'teleport'){
      const o = num(ev.ent.origin || (ev.ent.props || {}).origin), a = num(ev.ent.angles || (ev.ent.props || {}).angles);
      for (const tg of ev.tele || []){ const r = byKey.get(sim.kOf(tg)); if (r) r.ev.push({ t: ev.t, type: 'tp', pos: [o[0] || 0, o[1] || 0, o[2] || 0], quat: quatOf([a[0] || 0, a[1] || 0, a[2] || 0]) }); }
    } else if (/^(enablemotion|wake)$/.test(inp)){ const r = byKey.get(sim.kOf(ev.ent)); if (r) r.ev.push({ t: ev.t, type: 'dyn' }); }
    else if (inp === 'disablemotion'){ const r = byKey.get(sim.kOf(ev.ent)); if (r) r.ev.push({ t: ev.t, type: 'fix' }); }
    else if (/^(kill|killhierarchy|break)$/.test(inp)){ const r = byKey.get(sim.kOf(ev.ent)); if (r) r.ev.push({ t: ev.t, type: 'off' }); }
  }

  for (const r of byKey.values()){
    for (const e of r.ev){ if (e.type === 'dyn' || (e.type === 'tp' && !r.b.motionDisabled)){ r.t0 = e.t; break; } }
  }
  const active = [...byKey.values()].filter(r => r.t0 != null);
  if (!active.length) return result;

  const world = new R.World({ x: 0, y: 0, z: -GRAVITY * S });
  world.timestep = DT;
  // Настройки солвера под Havok
  if (world.integrationParameters) {
    world.integrationParameters.numSolverIterations = 12; // жесткие контакты без эффекта «батута»
  }

  try {
    // Статичный мир: высокое трение, минимальный отскок
    if (worldTris && worldTris.verts.length >= 9){
      const cd = R.ColliderDesc.trimesh(worldTris.verts, worldTris.idx);
      if (cd) world.createCollider(cd.setFriction(0.9).setRestitution(0.04));
    }

    // Тела (пропы)
    for (const r of active){
      const b = r.b;
      const bd = R.RigidBodyDesc.fixed()
        .setTranslation(b.origin[0] * S, b.origin[1] * S, b.origin[2] * S)
        .setRotation({ x: b.quat[0], y: b.quat[1], z: b.quat[2], w: b.quat[3] });
      const rb = world.createRigidBody(bd);
      let cd = null;

      if (b.hull && b.hull.length >= 12){
        const pts = new Float32Array(b.hull.length);
        for (let i = 0; i < pts.length; i++) pts[i] = b.hull[i] * S;
        try { cd = R.ColliderDesc.convexHull(pts); } catch (_) { cd = null; }
      }
      if (!cd){
        let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        const H = b.hull && b.hull.length >= 3 ? b.hull : new Float32Array([-8, -8, -8, 8, 8, 8]);
        for (let i = 0; i + 2 < H.length; i += 3) {
          for (let c = 0; c < 3; c++){
            mn[c] = Math.min(mn[c], H[i + c]);
            mx[c] = Math.max(mx[c], H[i + c]);
          }
        }
        cd = R.ColliderDesc.cuboid(Math.max(0.5, (mx[0] - mn[0]) / 2) * S, Math.max(0.5, (mx[1] - mn[1]) / 2) * S, Math.max(0.5, (mx[2] - mn[2]) / 2) * S)
          .setTranslation((mx[0] + mn[0]) / 2 * S, (mx[1] + mn[1]) / 2 * S, (mx[2] + mn[2]) / 2 * S);
      }

      // Трение и отскок Havok (0.05 вместо 0.25)
      cd.setFriction(0.85).setRestitution(0.05).setDensity(600);
      const collider = world.createCollider(cd, rb);
      if (collider && eventQueue && R.ActiveEvents) {
        try { collider.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS); colliderBodies.set(collider.handle, r); } catch (_) {}
      }

      // Демпфирование Source / Havok: гасит бесконечное вращение и отскоки
      rb.setLinearDamping(0.2);
      rb.setAngularDamping(0.8);
      rb.enableCcd(true);

      r.rb = rb; r.i = 0; r.started = false; r.hidden = false; r.pos = []; r.quat = [];
      r.ev.sort((x, y) => x.t - y.t);
    }

    const tStart = Math.min(...active.map(r => r.t0));
    const tEnd = Math.min(dur, tStart + MAX_SIM_SECONDS);
    const steps = Math.max(1, Math.ceil((tEnd - tStart) / DT));
    let lastEventT = 0; for (const r of active) for (const e of r.ev) lastEventT = Math.max(lastEventT, e.t);

    for (let s = 0; s <= steps; s++){
      const t = tStart + s * DT;
      for (const r of active){
        while (r.i < r.ev.length && r.ev[r.i].t <= t + 1e-9){
          const e = r.ev[r.i++], rb = r.rb;
          if (e.type === 'tp'){
            rb.setTranslation({ x: e.pos[0] * S, y: e.pos[1] * S, z: e.pos[2] * S }, true);
            rb.setRotation({ x: e.quat[0], y: e.quat[1], z: e.quat[2], w: e.quat[3] }, true);
            rb.setLinvel({ x: 0, y: 0, z: 0 }, true); rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
            if (!r.b.motionDisabled || r.started) rb.setBodyType(R.RigidBodyType.Dynamic, true);
          } else if (e.type === 'dyn'){
            rb.setBodyType(R.RigidBodyType.Dynamic, true);
            rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rb.wakeUp();
          } else if (e.type === 'fix'){
            rb.setBodyType(R.RigidBodyType.Fixed, true);
          } else if (e.type === 'off'){
            r.hidden = true; rb.setBodyType(R.RigidBodyType.Fixed, true);
          }
        }
        if (!r.started && t >= r.t0 - 1e-9){ r.started = true; r.tFirst = t; }
        if (r.started){
          const p = r.rb.translation(), q = r.rb.rotation();
          r.pos.push(p.x / S, p.y / S, p.z / S); r.quat.push(q.x, q.y, q.z, q.w);

          // Ограничение скорости (sv_maxvelocity) — не дает телам улетать от взрыва коллизий
          if (r.rb.isDynamic()){
            const v = r.rb.linvel();
            const speed = Math.hypot(v.x, v.y, v.z);
            if (speed > MAX_VELOCITY){
              const sc = MAX_VELOCITY / speed;
              r.rb.setLinvel({ x: v.x * sc, y: v.y * sc, z: v.z * sc }, true);
            }
            const w = r.rb.angvel();
            const wSpeed = Math.hypot(w.x, w.y, w.z);
            if (wSpeed > MAX_ANGULAR_VELOCITY){
              const sc = MAX_ANGULAR_VELOCITY / wSpeed;
              r.rb.setAngvel({ x: w.x * sc, y: w.y * sc, z: w.z * sc }, true);
            }
          }
        }
      }

      if (t > lastEventT && active.every(r => r.started && (r.rb.isSleeping() || r.rb.isFixed()))) break;
      const preVel = new Map();
      if (eventQueue) for (const r of active) if (r.started && r.rb.isDynamic()) preVel.set(r.rb.handle, r.rb.linvel());
      world.step(eventQueue || undefined);
      if (eventQueue) {
        try { eventQueue.drainCollisionEvents((h1, h2, started) => {
          if (!started) return;
          const r1 = colliderBodies.get(h1), r2 = colliderBodies.get(h2);
          const candidates = [r1, r2].filter(Boolean);
          if (!candidates.length) return;
          let best = null, speed = 0;
          for (const r of candidates) {
            const v = preVel.get(r.rb.handle); if (!v) continue;
            const n = Math.hypot(v.x, v.y, v.z); if (n > speed) { speed = n; best = r; }
          }
          const units = speed / S;
          if (!best || units < 70) return;
          const key = best.b.key, prev = lastImpact.get(key) ?? -Infinity;
          if (t - prev < 0.05) return;
          lastImpact.set(key, t);
          const mat = lc((best.b.ent && best.b.ent.props && (best.b.ent.props.surfaceprop || best.b.ent.props.material)) || '');
          const material = /metal|steel|iron/.test(mat) ? 'metal' : /wood|wooden/.test(mat) ? 'wood' : /glass/.test(mat) ? 'glass' : /concrete|rock|stone/.test(mat) ? 'stone' : 'generic';
          impactSounds.push({ t, intensity: Math.max(0.08, Math.min(1, (units * units) / (320 * 320))), material });
        }); } catch (e) { console.warn('[physics] collision events', e); }
      }
      if (onProgress && (s & 63) === 0){ onProgress(Math.min(1, s / steps)); }
      if ((s & 127) === 127) await yieldFn();
    }

    for (const r of active){
      if (!r.pos.length) continue;
      result.set(r.b.key, { t0: r.tFirst, dt: DT, n: r.pos.length / 3, pos: Float32Array.from(r.pos), quat: Float32Array.from(r.quat) });
    }
  } finally { try { if (eventQueue && eventQueue.free) eventQueue.free(); } catch (_) {} try { world.free(); } catch (_) {} }
  result.sounds = impactSounds;
  return result;
}

const _o = new Array(7);
export function samplePhys(P, t){
  if (!P || t < P.t0 - 1e-9) return null;
  const f = Math.min(Math.max(0, (t - P.t0) / P.dt), P.n - 1), i = Math.floor(f), j = Math.min(P.n - 1, i + 1), s = f - i;
  for (let c = 0; c < 3; c++) _o[c] = P.pos[i * 3 + c] + (P.pos[j * 3 + c] - P.pos[i * 3 + c]) * s;
  let ax = P.quat[i * 4], ay = P.quat[i * 4 + 1], az = P.quat[i * 4 + 2], aw = P.quat[i * 4 + 3];
  let bx = P.quat[j * 4], by = P.quat[j * 4 + 1], bz = P.quat[j * 4 + 2], bw = P.quat[j * 4 + 3];
  if (ax * bx + ay * by + az * bz + aw * bw < 0){ bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let x = ax + (bx - ax) * s, y = ay + (by - ay) * s, z = az + (bz - az) * s, w = aw + (bw - aw) * s;
  const l = Math.hypot(x, y, z, w) || 1;
  _o[3] = x / l; _o[4] = y / l; _o[5] = z / l; _o[6] = w / l;
  return _o;
}