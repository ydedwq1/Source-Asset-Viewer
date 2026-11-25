// vmfio.js — правка дерева VMF: свойства, connections (outputs), visgroups, сериализация. Без зависимостей.
// Узел дерева: { name, props{lowercase}, children[], items[] }, где items — упорядоченный список [key, value] | childNode.

export const isKV = it => Array.isArray(it);
const isMeta = x => !isKV(x) && /^(connections|editor)$/i.test(x.name);

export function syncDerived(e){
  const p = e.props;
  e.classname = (p.classname || '').toLowerCase(); e.origin = p.origin || null; e.targetname = p.targetname || '';
  e.model = p.model || null; e.angles = p.angles || null; e.scale = p.scale || null; e.modelscale = p.modelscale || null;
}
export function getKV(e, key){ const v = e.props[String(key).toLowerCase()]; return v === undefined ? null : v; }
export function setKV(e, key, val){
  const lk = String(key).toLowerCase(); val = val == null ? '' : String(val);
  const items = e.node ? e.node.items : null;
  if (val === ''){
    delete e.props[lk];
    if (items) for (let i = items.length - 1; i >= 0; i--) if (isKV(items[i]) && items[i][0].toLowerCase() === lk) items.splice(i, 1);
  } else {
    e.props[lk] = val;
    if (items){
      const it = items.find(x => isKV(x) && x[0].toLowerCase() === lk);
      if (it) it[1] = val;
      else { let at = items.findIndex(x => !isKV(x)); if (at < 0) at = items.length; items.splice(at, 0, [key, val]); }
    }
  }
  syncDerived(e);
}

/* ---- connections ---- */
const connBlock = (e, create) => {
  const n = e.node; if (!n) return null;
  let b = n.items.find(x => !isKV(x) && x.name.toLowerCase() === 'connections');
  if (!b && create){ b = { name: 'connections', props: {}, children: [], items: [] }; n.items.push(b); n.children.push(b); }
  return b || null;
};
export function getConns(e){
  const b = connBlock(e, false), rows = []; if (!b) return rows;
  for (const it of b.items){
    if (!isKV(it)) continue;
    const v = String(it[1]), sep = v.indexOf('\x1b') >= 0 ? '\x1b' : ',', p = v.split(sep);
    let target = p[0] || '', input = p[1] || '', param = '', delay = '0', times = '-1';
    if (p.length >= 5){ times = p[p.length - 1]; delay = p[p.length - 2]; param = p.slice(2, -2).join(sep); }
    else { param = p[2] || ''; delay = p[3] || '0'; }
    rows.push({ out: it[0], target, input, param, delay: String(parseFloat(delay) || 0), times: times || '-1' });
  }
  return rows;
}
export function setConns(e, rows){
  let b = connBlock(e, rows.length > 0);
  if (!b) return;
  if (!rows.length){ const n = e.node; n.items = n.items.filter(x => x !== b); n.children = n.children.filter(x => x !== b); return; }
  b.items = rows.map(r => {
    const f = [r.target, r.input, r.param, r.delay, r.times];
    const sep = f.some(s => String(s).includes(',')) ? '\x1b' : ',';
    return [r.out, f.join(sep)];
  });
}
export function newConn(){ return { out: 'OnTrigger', target: '', input: '', param: '', delay: '0', times: '-1' }; }

/* ---- visgroups ---- */
export function getVisgroups(tree){
  const out = [], root = (tree || []).find(b => b.name === 'visgroups'); if (!root) return out;
  (function walk(n, d){ for (const c of n.children) if (c.name === 'visgroup'){ out.push({ id: c.props.visgroupid, name: c.props.name || '?', depth: d }); walk(c, d + 1); } })(root, 0);
  return out;
}
export function getEntVis(e){
  const ed = e.node && e.node.items.find(x => !isKV(x) && x.name === 'editor'); if (!ed) return [];
  return ed.items.filter(it => isKV(it) && it[0].toLowerCase() === 'visgroupid').map(it => String(it[1]));
}
export function setEntVis(e, ids){
  const n = e.node; if (!n) return;
  let ed = n.items.find(x => !isKV(x) && x.name === 'editor');
  if (!ed){ ed = { name: 'editor', props: {}, children: [], items: [] }; n.items.push(ed); n.children.push(ed); }
  ed.items = ed.items.filter(it => !(isKV(it) && it[0].toLowerCase() === 'visgroupid'));
  ed.items.unshift(...ids.map(i => ['visgroupid', String(i)]));
}

/* ---- снимок / откат (для Cancel) ---- */
const clone = x => isKV(x) ? [x[0], x[1]] : { name: x.name, props: { ...x.props }, children: [], items: x.items.map(clone) };
export function snapshot(e){ return e.node ? e.node.items.filter(x => isKV(x) || isMeta(x)).map(clone) : null; }
export function restore(e, snap){
  const n = e.node; if (!n || !snap) return;
  const keep = n.items.filter(x => !isKV(x) && !isMeta(x));
  n.items = snap.map(clone).concat(keep); n.children = n.items.filter(x => !isKV(x));
  n.props = {}; for (const it of n.items) if (isKV(it)) n.props[it[0].toLowerCase()] = it[1];
  e.props = n.props; syncDerived(e);
}

/* ---- цвет "r g b [brightness]" ---- */
export function parseColor(s, def = '255 255 255 200'){
  const m = String(s == null || s === '' ? def : s).match(/-?\d*\.?\d+/g) || [];
  const c = v => Math.max(0, Math.min(255, Math.round(+v || 0)));
  return { r: c(m[0]), g: c(m[1]), b: c(m[2]), br: m.length > 3 ? +m[3] : null };
}
export const colorToHex = c => '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('');
export function hexToRGB(h){ const n = parseInt(h.slice(1), 16); return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 }; }

/* ---- сериализация ---- */
function ser(node, ind, out){
  out.push(ind + node.name, ind + '{');
  const i2 = ind + '\t';
  for (const it of node.items) isKV(it) ? out.push(`${i2}"${it[0]}" "${it[1]}"`) : ser(it, i2, out);
  out.push(ind + '}');
}
export function serializeVMF(tree){ const out = []; for (const b of tree) ser(b, '', out); return out.join('\n') + '\n'; }
