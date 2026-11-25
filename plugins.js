// plugins.js — глобальное состояние плагинов (сохраняется в localStorage).
export const PLUGIN_DEFS = [
  { key: 'dem',      icon: '🎬', i18n: 'plugin_dem' },
  { key: 'cutscene', icon: '🎞', i18n: 'plugin_cutscene' }
];

export const Plugins = {
  state: { dem: true, cutscene: true },
  listeners: new Set(),

  isEnabled(k){ return this.state[k] !== false; },

  set(k, v){
    this.state[k] = !!v;
    try { localStorage.setItem('sav_plugins', JSON.stringify(this.state)); } catch(_){}
    for (const fn of this.listeners){ try { fn(k, this.state[k]); } catch(_){} }
  },

  toggle(k){ this.set(k, !this.isEnabled(k)); },

  on(fn){ this.listeners.add(fn); return () => this.listeners.delete(fn); }
};

try {
  const s = JSON.parse(localStorage.getItem('sav_plugins') || 'null');
  if (s && typeof s === 'object') Object.assign(Plugins.state, s);
} catch(_){}