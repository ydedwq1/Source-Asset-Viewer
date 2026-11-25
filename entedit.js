// entedit.js — Hammer-подобный редактор сущностей: окно «Object Properties» (Class Info / Outputs / Inputs / Flags / VisGroup),
// список сущностей, подсветка радиуса, живое обновление света и тумана, сохранение изменённого .vmf.
import * as THREE from 'three';
import { LANG } from './core.js';
import { getKV, setKV, getConns, setConns, newConn, getVisgroups, getEntVis, setEntVis, snapshot, restore, parseColor, colorToHex, hexToRGB, serializeVMF } from './vmfio.js';

/* ======================= тексты ======================= */
const TX = {
  en: { title: 'Object Properties', close: 'Close', t_class: 'Class Info', t_out: 'Outputs', t_in: 'Inputs', t_flags: 'Flags', t_vis: 'VisGroup', cls: 'Class:', kv: 'Keyvalues:',
    copy: 'copy', paste: 'paste', pn: 'Property Name', pv: 'Value', help: 'Help', comments: 'Comments', ok: 'OK', cancel: 'Cancel', apply: 'Apply', smart: 'SmartEdit',
    mark: 'Mark', add: 'Add...', del: 'Delete', myout: 'My Output', tgt: 'Target Entity', tinp: 'Target Input', par: 'Parameter', dly: 'Delay', once: 'Only Once',
    f_out: 'My output named', f_tgt: 'Targets entities named', f_via: 'Via this input', f_par: 'With a parameter override of', f_dly: 'After a delay in seconds of', f_once: 'Fire once only',
    from: 'From entity', outn: 'Output', noin: 'No entity fires an output at this one.', noflags: 'This class has no known flags. Raw value:', raw: 'Raw spawnflags',
    novis: 'No visgroups in this map.', ents: 'Entities', search: 'Search…', all: 'All classes', save: 'Save VMF', ro: 'Read-only (Source 2 map): editing is available for .vmf only.',
    addkey: 'add key', nokv: 'Select an entity: click an icon in the 3D view or pick one from the list.', shown: 'shown', tip_sel: 'Click an entity icon to open its properties', clip: 'Copied' },
  ru: { title: 'Свойства объекта', close: 'Закрыть', t_class: 'Class Info', t_out: 'Outputs', t_in: 'Inputs', t_flags: 'Flags', t_vis: 'VisGroup', cls: 'Класс:', kv: 'Keyvalues:',
    copy: 'копир.', paste: 'встав.', pn: 'Свойство', pv: 'Значение', help: 'Справка', comments: 'Комментарии', ok: 'OK', cancel: 'Отмена', apply: 'Применить', smart: 'SmartEdit',
    mark: 'Метка', add: 'Добавить…', del: 'Удалить', myout: 'Мой Output', tgt: 'Цель', tinp: 'Input цели', par: 'Параметр', dly: 'Задержка', once: 'Один раз',
    f_out: 'Мой output', f_tgt: 'Имя целевых сущностей', f_via: 'Через этот input', f_par: 'Параметр (override)', f_dly: 'Задержка, сек', f_once: 'Сработать только раз',
    from: 'От сущности', outn: 'Output', noin: 'Ни одна сущность не вызывает эту.', noflags: 'Для класса нет известных флагов. Значение:', raw: 'spawnflags',
    novis: 'В карте нет visgroup.', ents: 'Сущности', search: 'Поиск…', all: 'Все классы', save: 'Сохранить VMF', ro: 'Только чтение (карта Source 2): правка доступна для .vmf.',
    addkey: 'добавить ключ', nokv: 'Выберите сущность: клик по иконке в 3D или из списка.', shown: 'показано', tip_sel: 'Клик по иконке сущности открывает её свойства', clip: 'Скопировано' }
};
const tr = k => (TX[LANG] && TX[LANG][k]) || TX.en[k] || k;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nums = s => (String(s || '').match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || []).map(Number);

/* ======================= словарь классов (мини-FGD) ======================= */
// тип: s строка · i целое · f дробь · c выбор · k цвет+яркость (r g b I) · k3 цвет (r g b) · v вектор · m модель · snd звук · t имя цели
const K = (key, name, type = 's', def = '', help = '', ch = null) => ({ key, name, type, def, help, ch });
const YN = [['0', 'No'], ['1', 'Yes']];
const STYLES = [['0', 'Normal'], ['10', 'Fluorescent flicker'], ['2', 'Slow, strong pulse'], ['11', 'Slow pulse, not fading to black'], ['5', 'Gentle flicker'], ['1', 'Flicker A'], ['6', 'Flicker B'], ['3', 'Candle A'], ['7', 'Candle B'], ['8', 'Candle C'], ['4', 'Fast strobe'], ['9', 'Slow strobe'], ['12', 'Underwater light mutation']];
const PRESETS = [['0', 'None'], ['1', 'Huge Machine'], ['2', 'Big Machine'], ['3', 'Machine'], ['4', 'Slow Fade in'], ['5', 'Fade in'], ['6', 'Quick Fade in'], ['7', 'Slow Pulse'], ['8', 'Pulse'], ['9', 'Quick Pulse'], ['10', 'Slow Fade out'], ['11', 'Fade out'], ['12', 'Quick Fade out'], ['13', 'Slow Pulse, Fade out']];
const LFO = [['0', 'None'], ['1', 'Square'], ['2', 'Triangle'], ['3', 'Random']];
const NAME = K('targetname', 'Name', 's', '', 'The name that other entities refer to this entity by, via Inputs/Outputs (or directly as a target).');
const LIGHT_BASE = [
  K('_light', 'Brightness', 'k', '255 255 255 200', 'Red, green, blue and brightness (intensity) of the light.'),
  K('_lightHDR', 'BrightnessHDR', 'k', '-1 -1 -1 1', 'HDR color/brightness override. -1 -1 -1 1 = same as LDR.'),
  K('_lightscaleHDR', 'BrightnessScaleHDR', 'f', '1', 'Amount to scale the light by when compiling for HDR.')
];
const ATTN = [
  K('_constant_attn', 'Constant', 's', '0', 'Constant attenuation (0 = use falloff distances).'), K('_linear_attn', 'Linear', 's', '0', 'Linear attenuation.'), K('_quadratic_attn', 'Quadratic', 's', '1', 'Quadratic attenuation.'),
  K('_fifty_percent_distance', 'Fifty percent falloff distance', 'i', '0', 'Distance at which the light is at 50% intensity. Overrides attenuation if set.'),
  K('_zero_percent_distance', 'Zero percent falloff distance', 'i', '0', 'Distance at which the light reaches 0%. Must be larger than the 50% distance.'),
  K('_hardfalloff', 'Hard falloff', 'i', '0', 'If non-zero, light cuts off abruptly at this distance.')
];
// Lua/VScript/длинные значения показываем в многострочном поле
const isScriptKV = (k, v) => { v = String(v == null ? '' : v); return v.length > 80 || v.includes('\n') || (/(^|_)(code|script|lua|vscripts|think|onthink)/i.test(String(k)) && v.length > 24); };
const COMMON_IN = ['Kill', 'KillHierarchy', 'AddOutput', 'FireUser1', 'FireUser2', 'FireUser3', 'FireUser4', 'SetParent', 'ClearParent', 'RunScriptCode', 'CallScriptFunction'];
const COMMON_OUT = ['OnUser1', 'OnUser2', 'OnUser3', 'OnUser4'];
const DEFS = {};
const def = (cls, o) => { DEFS[cls] = { keys: [NAME, ...(o.keys || [])], flags: o.flags || {}, inputs: o.inputs || [], outputs: o.outputs || [], desc: o.desc || '' }; };
const ANG = K('angles', 'Pitch Yaw Roll (Y Z X)', 'v', '0 0 0', 'This entity\'s orientation in the world. Pitch is rotation around the Y axis, yaw around Z, roll around X.');

def('light', { desc: 'Invisible omnidirectional lightsource that is baked into lightmaps by VRAD.', keys: [...LIGHT_BASE, K('style', 'Appearance', 'c', '0', 'Light animation style.', STYLES), K('pattern', 'Custom Appearance', 's', '', 'Custom light style pattern (a-z), e.g. "mmnmmommommnonmmonqnmmo".'), ...ATTN], flags: { 1: 'Initially dark' }, inputs: ['Toggle', 'TurnOn', 'TurnOff', 'SetPattern', 'FadeToPattern'] });
def('light_spot', { desc: 'Spotlight baked into lightmaps by VRAD.', keys: [...LIGHT_BASE, ANG, K('pitch', 'Pitch', 'f', '0', 'Overrides the pitch of angles.'), K('_inner_cone', 'Inner (bright) angle', 'i', '30', 'Angle of the full-brightness cone.'), K('_cone', 'Outer (fading) angle', 'i', '45', 'Angle of the outer, fading cone.'), K('_exponent', 'Focus', 'f', '1', 'Exponent of the falloff between inner and outer cone.'), K('style', 'Appearance', 'c', '0', 'Light animation style.', STYLES), ...ATTN], flags: { 1: 'Initially dark' }, inputs: ['Toggle', 'TurnOn', 'TurnOff', 'SetPattern', 'FadeToPattern'] });
def('light_environment', { desc: 'Sun and sky ambient light for the map.', keys: [ANG, K('pitch', 'Pitch', 'f', '0', 'Sun pitch; overrides angles. Negative = sun above horizon.'), ...LIGHT_BASE, K('_ambient', 'Ambient', 'k', '255 255 255 20', 'Color and brightness of the sky ambient light.'), K('_ambientHDR', 'AmbientHDR', 'k', '-1 -1 -1 1', 'HDR ambient override.'), K('_AmbientScaleHDR', 'AmbientScaleHDR', 'f', '1', 'Scale of the HDR ambient light.'), K('SunSpreadAngle', 'SunSpreadAngle', 'f', '0', 'Angular extent of the sun for soft shadows.')] });
def('light_dynamic', { desc: 'Dynamic (run-time) light.', keys: [ANG, K('_light', 'Color (R G B Brightness)', 'k', '255 255 255 200', ''), K('brightness', 'Brightness', 'i', '0', ''), K('_inner_cone', 'Inner (bright) angle', 'i', '30', ''), K('_cone', 'Outer (fading) angle', 'i', '45', ''), K('pitch', 'Pitch', 'f', '-90', ''), K('distance', 'Distance', 'f', '120', 'Maximum distance of the light.'), K('spotlight_radius', 'Spotlight Radius', 'f', '80', ''), K('style', 'Appearance', 'c', '0', '', STYLES)], inputs: ['Toggle', 'TurnOn', 'TurnOff', 'Color', 'Brightness', 'Distance'] });
def('env_fog_controller', { desc: 'Controls the fog in the map. One fog controller should be master (or referenced by the player/trigger).', keys: [K('fogenable', 'Fog Enable', 'c', '1', 'Whether fog is on.', YN), K('fogblend', 'Fog Blend', 'c', '0', 'Blend between primary and secondary color by view angle.', YN), K('use_angles', 'Use Angles for Fog Dir', 'c', '0', '', YN), K('fogcolor', 'Primary Fog Color', 'k3', '255 255 255', 'Primary fog color.'), K('fogcolor2', 'Secondary Fog Color', 'k3', '255 255 255', 'Secondary fog color (used with Fog Blend).'), K('fogdir', 'Primary Fog Direction', 'v', '1 0 0', ''), K('fogstart', 'Fog Start', 'f', '500', 'Distance at which fog begins.'), K('fogend', 'Fog End', 'f', '2000', 'Distance at which fog is fully opaque.'), K('fogmaxdensity', 'Fog Max Density [0..1]', 'f', '1', 'Maximum fog density.'), K('foglerptime', 'Fog Lerp Time', 'f', '0', ''), K('farz', 'Far Z Clip Plane', 'f', '-1', 'Far clip plane distance; -1 = default.')], flags: { 1: 'Master (Active)' }, inputs: ['TurnOn', 'TurnOff', 'SetColor', 'SetColorSecondary', 'SetStartDist', 'SetEndDist', 'SetMaxDensity', 'SetFarZ', 'SetBlendTime', 'StartFogTransition'] });
def('env_tonemap_controller', { desc: 'Controls HDR tonemapping, bloom and auto-exposure through inputs (see logic_auto example: OnMapSpawn → SetAutoExposureMin/Max, SetBloomScale).', inputs: ['SetAutoExposureMin', 'SetAutoExposureMax', 'SetBloomScale', 'SetTonemapScale', 'SetTonemapRate', 'UseDefaultAutoExposure', 'UseDefaultBloomScale', 'SetBloomScaleRange'] });
def('env_sun', { desc: 'Visible sun with glow and overlay.', keys: [K('use_angles', 'Use Angles', 'c', '0', '', YN), K('pitch', 'Pitch', 'f', '0', ''), ANG, K('rendercolor', 'Sun Color (R G B)', 'k3', '100 80 80', ''), K('overlaycolor', 'Overlay Color (R G B)', 'k3', '0 0 0', ''), K('size', 'Size', 'i', '16', ''), K('overlaysize', 'Overlay Size', 'i', '-1', ''), K('material', 'Material Name', 's', 'sprites/light_glow02_add_noz', '')], inputs: ['TurnOn', 'TurnOff', 'SetColor'] });
def('point_spotlight', { desc: 'Visible spotlight beam with a glow.', keys: [ANG, K('spotlightlength', 'Beam Length', 'i', '500', ''), K('spotlightwidth', 'Beam Width', 'i', '50', ''), K('rendercolor', 'Color (R G B)', 'k3', '255 255 255', ''), K('renderamt', 'Brightness', 'i', '255', ''), K('HDRColorScale', 'HDR color scale', 'f', '1', '')], flags: { 1: 'Start On', 2: 'No Dynamic Light' }, inputs: ['LightOn', 'LightOff'] });
def('env_sprite', { desc: 'Sprite entity.', keys: [K('model', 'Sprite Name', 'm', 'sprites/glow01.spr', ''), K('rendercolor', 'Color (R G B)', 'k3', '255 255 255', ''), K('renderamt', 'FX Amount (0 - 255)', 'i', '255', ''), K('scale', 'Scale', 'f', '', ''), K('framerate', 'Frame Rate', 'f', '10', ''), K('GlowProxySize', 'Size of Glow Proxy Geometry', 'f', '2', '')], flags: { 1: 'Start on', 2: 'Play once' }, inputs: ['ShowSprite', 'HideSprite', 'ToggleSprite', 'ColorRedValue', 'SetScale'] });
def('env_projectedtexture', { desc: 'Projected texture / flashlight-like dynamic light.', keys: [ANG, K('lightcolor', 'Light Color', 'k', '255 255 255 200', ''), K('lightfov', 'FOV', 'f', '90', ''), K('nearz', 'NearZ', 'f', '4', ''), K('farz', 'FarZ', 'f', '750', ''), K('enableshadows', 'Enable Shadows', 'c', '0', '', YN), K('brightnessscale', 'Brightness scale', 'f', '1', ''), K('texturename', 'Texture Name', 's', 'effects/flashlight001', ''), K('target', 'Target', 't', '', '')], flags: { 1: 'Enabled' }, inputs: ['TurnOn', 'TurnOff', 'SetFOV', 'SetTarget'] });
def('ambient_generic', {
  desc: 'Universal ambient sound. Use it to play a sound, optionally looped, with modulation and a max audible distance.',
  keys: [K('message', 'Sound Name', 'snd', '', 'Name of the GameSound entry or .wav file to play.'),
    K('radius', 'Max Audible Distance', 's', '1250', 'Maximum distance at which this sound is audible.'),
    K('health', 'Volume', 'i', '10', 'Sound volume, 0 - 10.'), K('volstart', 'Start Volume', 'i', '0', 'Starting volume if the sound has fade/spin settings. 0 - 100.'),
    K('fadeinsecs', 'Fade in time in seconds (0-100)', 'i', '0', 'Time to fade in from the start volume.'), K('fadeoutsecs', 'Fade out time in seconds (0-100)', 'i', '0', 'Time to fade out when stopped.'),
    K('pitch', 'Pitch', 'i', '100', 'Playback pitch, 1 - 255 (100 = normal).'), K('pitchstart', 'Start Pitch', 'i', '100', 'Starting pitch.'),
    K('spinup', 'Spin up time (0-100)', 'i', '0', ''), K('spindown', 'Spin down time (0-100)', 'i', '0', ''), K('cspinup', 'Incremental Spinup Count', 'i', '0', ''),
    K('sourceentityname', 'SourceEntityName', 't', '', 'If set, the sound plays from this entity instead of this one.'),
    K('preset', 'Dynamic Presets', 'c', '0', 'Preset fade/pulse behaviours.', PRESETS),
    K('lfotype', 'LFO type', 'c', '0', 'Low-frequency oscillator waveform.', LFO), K('lforate', 'LFO rate (0-1000)', 'i', '0', ''), K('lfomodpitch', 'LFO mod pitch (0-100)', 'i', '0', ''), K('lfomodvol', 'LFO mod vol (0-100)', 'i', '0', '')],
  flags: { 1: 'Play everywhere', 16: 'Start Silent', 32: 'Is NOT Looped' }, inputs: ['PlaySound', 'StopSound', 'ToggleSound', 'Pitch', 'Volume', 'FadeIn', 'FadeOut'] });
def('logic_relay', { desc: 'Relays an input to its output. Useful to group several outputs behind one trigger and to enable/disable them.', keys: [K('StartDisabled', 'Start Disabled', 'c', '0', 'Start with the relay disabled.', YN)], flags: { 1: 'Only trigger once', 2: 'Allow fast retrigger' }, outputs: ['OnSpawn', 'OnTrigger'], inputs: ['Trigger', 'Enable', 'Disable', 'Toggle', 'CancelPending', 'EnableRefire', 'DisableRefire'] });
def('logic_auto', { desc: 'Fires outputs when the map spawns, a game is loaded or a new game begins.', keys: [K('globalstate', 'Global State to Read', 's', '', 'Only fire if this global state is set.')], flags: { 1: 'Remove on fire' }, outputs: ['OnMapSpawn', 'OnNewGame', 'OnLoadGame', 'OnMapTransition', 'OnBackgroundMap', 'OnMultiNewMap', 'OnMultiNewRound'] });
def('logic_timer', { desc: 'Fires an output at regular or random intervals.', keys: [K('UseRandomTime', 'Use Random Time', 'c', '0', '', YN), K('LowerRandomBound', 'Minimum Random Interval', 'f', '1', ''), K('UpperRandomBound', 'Maximum Random Interval', 'f', '5', ''), K('RefireTime', 'Refire Interval', 'f', '1', ''), K('StartDisabled', 'Start Disabled', 'c', '0', '', YN)], outputs: ['OnTimer', 'OnTimerHigh', 'OnTimerLow'], inputs: ['Enable', 'Disable', 'Toggle', 'RefireTime', 'ResetTimer', 'FireTimer', 'Add', 'Subtract', 'LowerRandomBound', 'UpperRandomBound'] });
def('logic_case', { desc: 'Compares an input value against up to 16 cases and fires the matching output.', keys: Array.from({ length: 16 }, (_, i) => K('Case' + String(i + 1).padStart(2, '0'), 'Case ' + String(i + 1).padStart(2, '0'), 's', '', '')), outputs: [...Array.from({ length: 16 }, (_, i) => 'OnCase' + String(i + 1).padStart(2, '0')), 'OnDefault'], inputs: ['InValue', 'PickRandom', 'PickRandomShuffle'] });
def('logic_branch', { desc: 'Holds a boolean and fires OnTrue/OnFalse on Test.', keys: [K('InitialValue', 'Initial Value', 'c', '0', '', YN)], outputs: ['OnTrue', 'OnFalse'], inputs: ['SetValue', 'SetValueTest', 'Toggle', 'ToggleTest', 'Test'] });
def('logic_compare', { desc: 'Compares an input number against a compare value.', keys: [K('InitialValue', 'Initial Value', 'f', '', ''), K('CompareValue', 'Compare Value', 'f', '', '')], outputs: ['OnLessThan', 'OnEqualTo', 'OnNotEqualTo', 'OnGreaterThan'], inputs: ['SetValue', 'SetValueCompare', 'SetCompareValue', 'CompareValues'] });
def('math_counter', { desc: 'Holds a number between min and max.', keys: [K('startvalue', 'Initial Value', 'i', '0', ''), K('min', 'Minimum Legal Value', 'i', '0', ''), K('max', 'Maximum Legal Value', 'i', '0', ''), K('StartDisabled', 'Start Disabled', 'c', '0', '', YN)], outputs: ['OutValue', 'OnHitMin', 'OnHitMax', 'OnGetValue', 'OnChangedFromMin', 'OnChangedFromMax'], inputs: ['Add', 'Subtract', 'Multiply', 'Divide', 'SetValue', 'SetValueNoFire', 'SetHitMax', 'SetHitMin', 'GetValue', 'Enable', 'Disable'] });
const TRIG_FLAGS = { 1: 'Clients', 2: 'NPCs', 8: 'Pushables', 16: 'Physics Objects', 64: 'Everything', 512: 'Fire once only?' };
const TRIG_OUT = ['OnTrigger', 'OnStartTouch', 'OnStartTouchAll', 'OnEndTouch', 'OnEndTouchAll', 'OnTouching', 'OnNotTouching'];
def('trigger_multiple', { desc: 'Trigger volume that can fire repeatedly.', keys: [K('StartDisabled', 'Start Disabled', 'c', '0', '', YN), K('wait', 'Delay Before Reset', 'i', '1', ''), K('filtername', 'Filter Name', 't', '', '')], flags: TRIG_FLAGS, outputs: TRIG_OUT, inputs: ['Enable', 'Disable', 'Toggle', 'TouchTest'] });
def('trigger_once', { desc: 'Trigger volume that fires once and removes itself.', keys: [K('StartDisabled', 'Start Disabled', 'c', '0', '', YN), K('filtername', 'Filter Name', 't', '', '')], flags: TRIG_FLAGS, outputs: TRIG_OUT, inputs: ['Enable', 'Disable', 'Toggle', 'TouchTest'] });
def('func_button', { desc: 'Pressable button brush.', keys: [K('speed', 'Speed', 'i', '5', ''), K('wait', 'Delay Before Reset (-1 stay)', 'i', '3', ''), K('health', 'Health (0 = unbreakable)', 'i', '0', ''), K('sounds', 'Sounds', 'i', '0', ''), K('locked_sound', 'Locked Sound', 's', '', ''), K('unlocked_sound', 'Unlocked Sound', 's', '', '')], flags: { 1: "Don't move", 32: 'Toggle', 256: 'Touch Activates', 512: 'Damage Activates', 1024: 'Use Activates', 2048: 'Starts locked', 4096: 'Sparks' }, outputs: ['OnDamaged', 'OnPressed', 'OnUseLocked', 'OnIn', 'OnOut'], inputs: ['Lock', 'Unlock', 'Press', 'PressIn', 'PressOut'] });
def('func_door', { desc: 'Moving door brush.', keys: [K('speed', 'Move Speed', 'i', '100', ''), K('wait', 'Delay Before Close (-1 stay open)', 'i', '4', ''), K('lip', 'Lip', 'i', '0', ''), K('forceclosed', 'Force Closed', 'c', '0', '', YN), K('health', 'Health', 'i', '0', '')], flags: { 1: 'Starts Open', 4: 'Non-solid to Player', 8: 'Passable', 32: 'Toggle', 256: 'Use Opens', 1024: 'Touch Opens', 2048: 'Starts locked' }, outputs: ['OnClose', 'OnOpen', 'OnFullyClosed', 'OnFullyOpen', 'OnBlockedClosing', 'OnBlockedOpening', 'OnUnblockedClosing', 'OnUnblockedOpening', 'OnLockedUse'], inputs: ['Open', 'Close', 'Toggle', 'Lock', 'Unlock', 'SetSpeed'] });
const PROP = [K('model', 'World Model', 'm', '', 'Model path (models/…mdl).'), K('skin', 'Skin', 'i', '0', ''), K('modelscale', 'Model Scale', 'f', '1', ''), ANG, K('rendercolor', 'Color (R G B)', 'k3', '255 255 255', ''), K('renderamt', 'FX Amount (0 - 255)', 'i', '255', ''), K('solid', 'Collisions', 'c', '6', '', [['0', 'Not Solid'], ['2', 'Use Bounding Box'], ['6', 'Use VPhysics']]), K('fademindist', 'Start Fade Dist/Pixels', 'f', '-1', ''), K('fademaxdist', 'End Fade Dist/Pixels', 'f', '0', '')];
def('prop_dynamic', { desc: 'Animated/static prop that can be controlled by inputs.', keys: [...PROP, K('DefaultAnim', 'Default Animation', 's', '', '')], flags: { 1: 'Use Hitboxes for Renderbox', 64: 'Start with collision disabled' }, outputs: ['OnAnimationBegun', 'OnAnimationDone'], inputs: ['SetAnimation', 'SetDefaultAnimation', 'TurnOn', 'TurnOff', 'Skin', 'EnableCollision', 'DisableCollision', 'DisableShadow', 'EnableShadow'] });
def('prop_static', { desc: 'Static prop baked into the map.', keys: PROP.filter(k => k.key !== 'renderamt'), flags: { 256: 'Start with collision disabled' } });
def('prop_physics', { desc: 'Physics-simulated prop.', keys: [...PROP, K('health', 'Health', 'i', '0', '')], flags: { 1: 'Start Asleep', 2: 'Debris - Don\'t collide with the player', 4: 'Motion Disabled' }, outputs: ['OnBreak', 'OnTakeDamage', 'OnPlayerUse', 'OnPhysGunPickup', 'OnPhysGunDrop'], inputs: ['Wake', 'Sleep', 'EnableMotion', 'DisableMotion', 'Break', 'SetHealth'] });
def('env_shake', { desc: 'Screen shake.', keys: [K('amplitude', 'Amplitude (0-16)', 'f', '4', ''), K('radius', 'Effect Radius', 'f', '500', ''), K('duration', 'Duration', 'f', '1', ''), K('frequency', 'Frequency', 'f', '2.5', '')], flags: { 1: 'GlobalShake', 4: 'In Air', 8: 'Physics', 16: 'Ignore Rotation' }, inputs: ['StartShake', 'StopShake', 'Amplitude', 'Frequency'] });
def('env_fade', { desc: 'Screen fade.', keys: [K('duration', 'Duration', 'f', '2', ''), K('holdtime', 'Hold Time', 'f', '0', ''), K('renderamt', 'Fade Alpha', 'i', '255', ''), K('rendercolor', 'Fade Color (R G B)', 'k3', '0 0 0', '')], flags: { 1: 'Fade From', 2: 'Modulate', 4: 'Triggering player only', 8: 'Stay Out' }, outputs: ['OnBeginFade'], inputs: ['Fade'] });
def('game_text', { desc: 'On-screen text.', keys: [K('message', 'Message Text', 's', '', ''), K('x', 'X (0 - 1.0 = left to right)', 'f', '-1', ''), K('y', 'Y (0 - 1.0 = top to bottom)', 'f', '-1', ''), K('holdtime', 'Hold Time', 'f', '1', ''), K('color', 'Color1 (R G B)', 'k3', '100 100 100', '')], flags: { 1: 'All Players' }, inputs: ['Display', 'SetText'] });

const BASE_FLAGS_NONE = {};
const defFor = cls => DEFS[cls] || null;
const inputsFor = cls => { const d = defFor(cls); return [...new Set([...(d ? d.inputs : []), ...COMMON_IN])]; };
const outputsFor = cls => { const d = defFor(cls); return [...new Set([...(d ? d.outputs : []), ...COMMON_OUT])]; };
const ALL_OUT = [...new Set(Object.values(DEFS).flatMap(d => d.outputs).concat(COMMON_OUT))];
const SPECIAL_TGT = ['!activator', '!caller', '!self', '!player', '!picker'];

/* ======================= состояние ======================= */
let api = null, ctx = { kind: 'vmf', tree: null, entities: [], name: 'map' };
const S = { ent: null, tab: 'class', smart: true, snap: null, outSel: -1, outClip: null, kvClip: null, listOpen: false, dirty: false, help: '' };
let dlg, body, listEl, helper = null;

const ro = () => true;   // сайт — просмотрщик: редактирование отключено
const targetsOf = () => [...new Set(ctx.entities.map(e => e.targetname).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const matchTarget = (nm, e) => !!nm && (nm === e.targetname || nm === e.classname || (nm.endsWith('*') && e.targetname && e.targetname.startsWith(nm.slice(0, -1))));
const label = e => `${e.classname}${e.targetname ? ' · ' + e.targetname : ''}`;

/* ======================= подсветка в 3D ======================= */
function radiusOf(e){
  const g = k => parseFloat(getKV(e, k)); const c = e.classname;
  if (c === 'ambient_generic'){ if ((parseInt(getKV(e, 'spawnflags')) || 0) & 1) return 0; const r = g('radius'); return isFinite(r) ? r : 1250; }
  if (c === 'light' || c === 'light_spot') return g('_zero_percent_distance') > 0 ? g('_zero_percent_distance') : 0;
  if (c === 'light_dynamic') return g('distance') || 120;
  if (c === 'env_projectedtexture') return g('farz') || 750;
  if (c === 'env_shake') return g('radius') || 0;
  return 0;
}
function clearHelper(){
  if (!helper) return;
  if (helper.parent) helper.parent.remove(helper);
  helper.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  helper = null;
}
function buildHelper(e){
  clearHelper();
  const grp = api && api.getGroup && api.getGroup(); const o = nums(e && e.origin); if (!grp || o.length < 3) return;
  helper = new THREE.Group(); helper.position.set(o[0], o[1], o[2]);
  const mk = (geo, color, op) => { const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthTest: false })); m.renderOrder = 1000; return m; };
  helper.add(mk(new THREE.EdgesGeometry(new THREE.BoxGeometry(40, 40, 40)), 0xffe066, 1));
  const r = radiusOf(e);
  if (r > 0 && r < 100000) helper.add(mk(new THREE.WireframeGeometry(new THREE.SphereGeometry(r, 28, 16)), e.classname === 'ambient_generic' ? 0x5ee0a0 : 0xffe066, 0.28));
  grp.add(helper);
}

/* ======================= список сущностей ======================= */
function buildList(){
  if (!listEl) return;
  const q = listEl.querySelector('.eh-q').value.trim().toLowerCase(), cf = listEl.querySelector('.eh-cf').value;
  const counts = new Map(); for (const e of ctx.entities) counts.set(e.classname, (counts.get(e.classname) || 0) + 1);
  const sel = listEl.querySelector('.eh-cf'), cur = sel.value;
  if (sel.dataset.n !== String(ctx.entities.length)){
    sel.innerHTML = `<option value="">${esc(tr('all'))}</option>` + [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join('');
    sel.value = cur; sel.dataset.n = String(ctx.entities.length);
  }
  const rows = ctx.entities.filter(e => (!cf || e.classname === cf) && (!q || e.classname.includes(q) || e.targetname.toLowerCase().includes(q) || String(e.model || '').toLowerCase().includes(q)));
  rows.sort((a, b) => a.classname.localeCompare(b.classname) || a.targetname.localeCompare(b.targetname));
  const MAX = 400, ul = listEl.querySelector('.eh-ul'); ul.textContent = '';
  const frag = document.createDocumentFragment();
  rows.slice(0, MAX).forEach(e => {
    const li = document.createElement('li'); li.className = 'eh-li' + (e === S.ent ? ' sel' : '');
    li.innerHTML = `<b>${esc(e.classname)}</b><span>${esc(e.targetname || e.model || '')}</span>`; li.onclick = () => selectEnt(e, { open: true, focus: true });
    frag.appendChild(li);
  });
  ul.appendChild(frag);
  listEl.querySelector('.eh-cnt').textContent = `${Math.min(MAX, rows.length)}/${rows.length} ${tr('shown')}`;
}
function toggleList(force){
  S.listOpen = force == null ? !S.listOpen : force;
  listEl.classList.toggle('open', S.listOpen);
  const b = document.getElementById('vmfBtnEnts'); if (b) b.classList.toggle('active', S.listOpen);
  if (S.listOpen) buildList();
}

/* ======================= выбор / фокус ======================= */
function flyTo(e){
  const o = nums(e.origin); if (o.length < 3 || !api) return;
  const t = new THREE.Vector3(o[0], o[2], -o[1]), cam = api.camera, ctl = api.controls;
  const dir = cam.position.clone().sub(ctl.target); const d = Math.min(Math.max(dir.length(), 150), 600);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0.8, 1); dir.setLength(d);
  ctl.target.copy(t); cam.position.copy(t).add(dir); ctl.update();
}
export function selectEnt(e, opt = {}){
  S.ent = e || null; S.outSel = -1;
  if (!e){ clearHelper(); closeDlg(); if (listEl) buildList(); return; }
  S.snap = snapshot(e); buildHelper(e);
  if (opt.focus) flyTo(e);
  if (opt.open) openDlg();
  if (listEl) buildList();
}

/* ======================= запись значений ======================= */
function setVal(key, val){
  if (ro()) return;
  setKV(S.ent, key, val); S.dirty = true; markDirty();
  if (/^(origin|angles|pitch|radius|_zero_percent_distance|distance|farz|spawnflags|classname)$/i.test(key)) buildHelper(S.ent);
  api.onEdit(S.ent, key);
}
function markDirty(){ const b = document.getElementById('vmfBtnSaveVmf'); if (b) b.classList.toggle('active', S.dirty); }

/* ======================= окно ======================= */
function ensureDom(){
  const pane = document.getElementById('paneVmf'); if (!pane || dlg) return;
  dlg = document.createElement('div'); dlg.id = 'ehDlg'; dlg.className = 'eh-dlg'; dlg.hidden = true;
  dlg.innerHTML = `<div class="eh-title"><span class="eh-ttl"></span><button class="eh-x" title="Esc">✕</button></div>
    <div class="eh-tabs"></div><div class="eh-body"></div>
    <div class="eh-foot"><button class="btn" data-a="ok"></button><button class="btn" data-a="cancel"></button><button class="btn" data-a="apply"></button></div>
    <datalist id="ehClsList"></datalist><datalist id="ehTgtList"></datalist><datalist id="ehOutList"></datalist><datalist id="ehInList"></datalist>`;
  pane.appendChild(dlg); body = dlg.querySelector('.eh-body');
  dlg.querySelector('.eh-x').onclick = closeDlg;
  dlg.querySelector('.eh-foot').onclick = ev => {
    const a = ev.target.dataset && ev.target.dataset.a; if (!a) return;
    if (a === 'cancel' && S.ent && S.snap){ restore(S.ent, S.snap); api.onEdit(S.ent, '*'); buildHelper(S.ent); }
    if (a === 'ok' || a === 'cancel') closeDlg(); else S.snap = snapshot(S.ent);
  };
  dlg.querySelector('.eh-tabs').onclick = ev => { const t = ev.target.dataset && ev.target.dataset.t; if (t){ S.tab = t; render(); } };
  const bar = dlg.querySelector('.eh-title'); let drag = null;
  bar.addEventListener('pointerdown', ev => {
    if (ev.target.closest('button') || matchMedia('(max-width:700px)').matches) return;
    const r = dlg.getBoundingClientRect(), pr = pane.getBoundingClientRect(); drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, px: pr.left, py: pr.top };
    bar.setPointerCapture(ev.pointerId);
  });
  bar.addEventListener('pointermove', ev => { if (!drag) return; dlg.style.left = (ev.clientX - drag.dx - drag.px) + 'px'; dlg.style.top = (ev.clientY - drag.dy - drag.py) + 'px'; dlg.style.right = 'auto'; });
  bar.addEventListener('pointerup', () => { drag = null; });
  body.addEventListener('input', onInput); body.addEventListener('change', onInput); body.addEventListener('click', onClick); body.addEventListener('focusin', onFocus);
  addEventListener('keydown', ev => { if (ev.key === 'Escape' && !dlg.hidden) closeDlg(); });

  listEl = document.createElement('div'); listEl.id = 'ehList'; listEl.className = 'eh-list';
  listEl.innerHTML = `<div class="eh-lh"><b class="eh-lt"></b><span class="eh-cnt"></span></div><input class="eh-q" type="search"><select class="eh-cf"></select><ul class="eh-ul"></ul>`;
  pane.appendChild(listEl);
  listEl.querySelector('.eh-q').oninput = buildList; listEl.querySelector('.eh-cf').onchange = buildList;
  fillTexts();
}
function fillTexts(){
  if (!dlg) return;
  const f = dlg.querySelector('.eh-foot').children; f[0].textContent = tr('close'); f[1].hidden = f[2].hidden = true;
  listEl.querySelector('.eh-lt').textContent = tr('ents'); listEl.querySelector('.eh-q').placeholder = tr('search');
  const b = document.getElementById('vmfBtnEnts'); if (b){ const s = b.querySelector('span'); if (s) s.textContent = tr('ents'); }
  const sv = document.getElementById('vmfBtnSaveVmf'); if (sv) sv.title = tr('save');
  if (!dlg.hidden) render();
}
function openDlg(){ ensureDom(); dlg.hidden = false; render(); }
function closeDlg(){ if (dlg) dlg.hidden = true; }

function render(){
  if (!dlg || !S.ent) return;
  const e = S.ent;
  dlg.querySelector('.eh-ttl').textContent = `${tr('title')}: ${e.targetname || '—'} - ${e.classname}`;
  dlg.querySelector('#ehClsList').innerHTML = Object.keys(DEFS).sort().map(c => `<option value="${c}">`).join('');
  dlg.querySelector('#ehTgtList').innerHTML = [...SPECIAL_TGT, ...targetsOf()].map(c => `<option value="${esc(c)}">`).join('');
  const tabs = [['class', 't_class'], ['out', 't_out'], ['in', 't_in'], ['flags', 't_flags'], ['vis', 't_vis']];
  dlg.querySelector('.eh-tabs').innerHTML = tabs.map(([k, l]) => `<button data-t="${k}" class="${S.tab === k ? 'on' : ''}">${esc(tr(l))}</button>`).join('');
  body.innerHTML = ({ class: tabClass, out: tabOut, in: tabIn, flags: tabFlags, vis: tabVis })[S.tab]();
  if (S.tab === 'out') syncOutForm();
}

/* ---- Class Info ---- */
function editorHTML(k, val, unset){
  const dis = ro() ? 'disabled' : '', cls = unset ? 'eh-unset' : '';
  if (k.type === 'c'){
    const opts = k.ch.slice(); if (!opts.some(o => o[0] === String(val))) opts.push([String(val), String(val)]);
    return `<select class="${cls}" data-v ${dis}>${opts.map(o => `<option value="${esc(o[0])}" ${o[0] === String(val) ? 'selected' : ''}>${esc(o[0] + ': ' + o[1])}</option>`).join('')}</select>`;
  }
  if (k.type === 'k' || k.type === 'k3'){
    const c = parseColor(val, k.def);
    return `<span class="eh-col ${cls}"><input type="color" data-cc value="${colorToHex(c)}" ${dis}><span class="eh-rgb">${c.r} ${c.g} ${c.b}</span>${k.type === 'k' ? `<input type="number" class="eh-br" data-cb value="${c.br == null ? 200 : c.br}" ${dis}>` : ''}</span>`;
  }
  const list = k.type === 't' ? 'list="ehTgtList"' : '';
  if (isScriptKV(k.key, val)) return `<textarea class="eh-code ${cls}" data-v rows="6" spellcheck="false" ${dis}>${esc(val)}</textarea>`;
  return `<input class="${cls}" data-v type="text" ${list} value="${esc(val)}" placeholder="${esc(k.def)}" ${(k.type === 'i' || k.type === 'f') ? 'inputmode="decimal"' : ''} ${dis}>`;
}
function tabClass(){
  const e = S.ent, d = defFor(e.classname), R = ro();
  let rows = '';
  if (S.smart){
    const keys = d ? d.keys.slice() : [NAME];
    if (e.origin && !keys.some(k => k.key === 'origin')) keys.splice(1, 0, K('origin', 'Origin', 'v', '0 0 0', 'Position in the world (X Y Z).'));
    if (e.angles && !keys.some(k => k.key === 'angles')) keys.push(ANG);
    const known = new Set(keys.map(k => k.key.toLowerCase()).concat(['classname', 'id', 'spawnflags', 'comments']));
    for (const lk of Object.keys(e.props)) if (!known.has(lk)) keys.push(K(lk, lk, 's', '', 'Custom keyvalue.'));
    rows = keys.map(k => { const v = getKV(e, k.key), unset = v === null; return `<tr data-k="${esc(k.key)}" data-t="${k.type}"><td class="n">${esc(k.name)}</td><td class="v">${editorHTML(k, unset ? k.def : v, unset)}</td></tr>`; }).join('');
  } else {
    const items = e.node ? e.node.items.filter(it => Array.isArray(it)) : Object.entries(e.props);
    rows = items.map(([k, v]) => `<tr data-k="${esc(k)}" data-t="s"><td class="n">${esc(k)} <a data-del="${esc(k)}" title="${esc(tr('del'))}">×</a></td><td class="v">${isScriptKV(k, v) ? `<textarea class="eh-code" data-v rows="6" spellcheck="false" ${R ? 'disabled' : ''}>${esc(v)}</textarea>` : `<input data-v type="text" value="${esc(v)}" ${R ? 'disabled' : ''}>`}</td></tr>`).join('')
      + (R ? '' : `<tr class="eh-addkey"><td class="n"><input id="ehNk" placeholder="${esc(tr('addkey'))}"></td><td class="v"><input id="ehNv" placeholder="value"><button class="btn" data-addkey>＋</button></td></tr>`);
  }
  const cm = getKV(e, 'comments') || '';
  return `
    <div class="eh-top"><div><label>${esc(tr('cls'))}</label><input class="eh-cls" list="ehClsList" value="${esc(e.classname)}" ${R ? 'disabled' : ''}></div>
    <button class="btn eh-smart ${S.smart ? 'active' : ''}" data-smart>${esc(tr('smart'))}</button></div>
    <div class="eh-kvh"><span>${esc(tr('kv'))}</span><button class="btn sm" data-kvcopy>${esc(tr('copy'))}</button><button class="btn sm" data-kvpaste ${R ? 'disabled' : ''}>${esc(tr('paste'))}</button></div>
    <div class="eh-split"><div class="eh-tbl"><table><thead><tr><th>${esc(tr('pn'))}</th><th>${esc(tr('pv'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="eh-side"><div class="eh-h"><b>${esc(tr('help'))}</b><p id="ehHelp">${esc(S.help || (d && d.desc) || tr('nokv'))}</p></div>
    <div class="eh-h"><b>${esc(tr('comments'))}</b><textarea data-comments ${R ? 'disabled' : ''}>${esc(cm)}</textarea></div></div></div>`;
}

/* ---- Outputs ---- */
const outRows = () => getConns(S.ent);
function outTableHTML(rows){
  return rows.map((r, i) => `<tr data-i="${i}" class="${i === S.outSel ? 'sel' : ''}"><td>${esc(r.out)}</td><td>${esc(r.target)}</td><td>${esc(r.input)}</td><td>${esc(r.param)}</td><td>${esc(r.delay)}</td><td>${r.times === '1' ? 'Yes' : 'No'}</td></tr>`).join('');
}
function tabOut(){
  const rows = outRows(), R = ro(), dis = R ? 'disabled' : '';
  return `<div class="eh-tbl eh-otbl"><table><thead><tr><th>${esc(tr('myout'))}</th><th>${esc(tr('tgt'))}</th><th>${esc(tr('tinp'))}</th><th>${esc(tr('par'))}</th><th>${esc(tr('dly'))}</th><th>${esc(tr('once'))}</th></tr></thead><tbody id="ehOutBody">${outTableHTML(rows)}</tbody></table></div>
  <div class="eh-form">
   <label>${esc(tr('f_out'))}</label><input data-of="out" list="ehOutList" ${dis}>
   <label>${esc(tr('f_tgt'))}</label><div class="eh-pick"><input data-of="target" list="ehTgtList" ${dis}><button class="btn sm" data-mark title="${esc(tr('mark'))}">◎</button></div>
   <label>${esc(tr('f_via'))}</label><input data-of="input" list="ehInList" ${dis}>
   <label>${esc(tr('f_par'))}</label><input data-of="param" ${dis}>
   <label>${esc(tr('f_dly'))}</label><div class="eh-pick"><input data-of="delay" type="number" step="0.01" min="0" style="width:90px" ${dis}><label class="eh-chk"><input type="checkbox" data-of="once" ${dis}> ${esc(tr('f_once'))}</label></div>
  </div>
  <div class="eh-btns"><button class="btn" data-mark>${esc(tr('mark'))}</button><button class="btn" data-oadd ${dis}>${esc(tr('add'))}</button><button class="btn" data-ocopy>${esc(tr('copy'))}</button><button class="btn" data-opaste ${dis}>${esc(tr('paste'))}</button><button class="btn" data-odel ${dis}>${esc(tr('del'))}</button></div>`;
}
function syncOutForm(){
  const rows = outRows(), r = rows[S.outSel]; const f = n => body.querySelector(`[data-of="${n}"]`); if (!f('out')) return;
  f('out').value = r ? r.out : ''; f('target').value = r ? r.target : ''; f('input').value = r ? r.input : ''; f('param').value = r ? r.param : '';
  f('delay').value = r ? r.delay : ''; f('once').checked = !!r && r.times === '1';
  dlg.querySelector('#ehOutList').innerHTML = [...new Set([...outputsFor(S.ent.classname), ...ALL_OUT])].map(o => `<option value="${o}">`).join('');
  refreshInputList(r ? r.target : '');
}
function refreshInputList(tgt){
  const hit = ctx.entities.filter(e => matchTarget(tgt, e)); const set = new Set();
  if (hit.length) hit.forEach(e => inputsFor(e.classname).forEach(i => set.add(i))); else Object.values(DEFS).forEach(d => d.inputs.forEach(i => set.add(i))), COMMON_IN.forEach(i => set.add(i));
  dlg.querySelector('#ehInList').innerHTML = [...set].map(o => `<option value="${o}">`).join('');
}
function saveRows(rows){ setConns(S.ent, rows); S.dirty = true; markDirty(); const tb = body.querySelector('#ehOutBody'); if (tb) tb.innerHTML = outTableHTML(rows); }

/* ---- Inputs (обратные связи) ---- */
function tabIn(){
  const e = S.ent, rows = [];
  if (e.targetname || e.classname) for (const o of ctx.entities){
    if (!o.node) continue;
    getConns(o).forEach(c => { if (matchTarget(c.target, e) && (e.targetname || c.target === e.classname)) rows.push({ o, c }); });
  }
  if (!rows.length) return `<div class="eh-empty">${esc(tr('noin'))}</div>`;
  return `<div class="eh-tbl eh-otbl" style="height:100%"><table><thead><tr><th>${esc(tr('from'))}</th><th>${esc(tr('outn'))}</th><th>${esc(tr('tinp'))}</th><th>${esc(tr('par'))}</th><th>${esc(tr('dly'))}</th></tr></thead><tbody>${rows.map((r, i) => `<tr data-src="${ctx.entities.indexOf(r.o)}"><td>${esc(label(r.o))}</td><td>${esc(r.c.out)}</td><td>${esc(r.c.input)}</td><td>${esc(r.c.param)}</td><td>${esc(r.c.delay)}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ---- Flags ---- */
function tabFlags(){
  const e = S.ent, d = defFor(e.classname), v = parseInt(getKV(e, 'spawnflags')) || 0, dis = ro() ? 'disabled' : '';
  const fl = d ? Object.entries(d.flags) : [];
  return `<div class="eh-flags">${fl.length ? fl.map(([b, n]) => `<label class="eh-chk"><input type="checkbox" data-flag="${b}" ${v & b ? 'checked' : ''} ${dis}> [${b}] ${esc(n)}</label>`).join('') : `<div class="eh-empty">${esc(tr('noflags'))}</div>`}
  <div class="eh-raw"><label>${esc(tr('raw'))}</label><input data-rawflags type="number" value="${v}" ${dis}></div></div>`;
}

/* ---- VisGroup ---- */
function tabVis(){
  const vg = getVisgroups(ctx.tree); if (!vg.length) return `<div class="eh-empty">${esc(tr('novis'))}</div>`;
  const mine = new Set(getEntVis(S.ent)), dis = ro() ? 'disabled' : '';
  return `<div class="eh-flags">${vg.map(g => `<label class="eh-chk" style="padding-left:${g.depth * 16}px"><input type="checkbox" data-vis="${esc(g.id)}" ${mine.has(String(g.id)) ? 'checked' : ''} ${dis}> ${esc(g.name)}</label>`).join('')}</div>`;
}

/* ======================= обработчики ======================= */
function onFocus(ev){
  const tr_ = ev.target.closest && ev.target.closest('tr[data-k]'); if (!tr_) return;
  const e = S.ent, d = defFor(e.classname), k = d && d.keys.find(x => x.key === tr_.dataset.k);
  const h = body.querySelector('#ehHelp'); if (h){ S.help = k ? `${k.name} (${tr_.dataset.k})${k.help ? ' — ' + k.help : ''}` : tr_.dataset.k; h.textContent = S.help; }
}
function onInput(ev){
  const t = ev.target, e = S.ent; if (!e || ro()) return;
  const row = t.closest('tr[data-k]');
  if (row && (t.matches('[data-cc],[data-cb]'))){
    const c = row.querySelector('[data-cc]'), b = row.querySelector('[data-cb]'), rgb = hexToRGB(c.value);
    row.querySelector('.eh-rgb').textContent = `${rgb.r} ${rgb.g} ${rgb.b}`; row.querySelector('.eh-col').classList.remove('eh-unset');
    setVal(row.dataset.k, `${rgb.r} ${rgb.g} ${rgb.b}` + (b ? ' ' + (b.value === '' ? 0 : b.value) : '')); return;
  }
  if (row && t.matches('[data-v]')){ t.classList.remove('eh-unset'); setVal(row.dataset.k, t.value); return; }
  if (t.matches('.eh-cls')){ if (ev.type === 'change' && t.value.trim()){ setVal('classname', t.value.trim()); render(); } return; }
  if (t.matches('[data-comments]')){ setVal('comments', t.value); return; }
  if (t.matches('[data-flag]')){ let v = parseInt(getKV(e, 'spawnflags')) || 0; const b = +t.dataset.flag; v = t.checked ? (v | b) : (v & ~b); setVal('spawnflags', v ? String(v) : ''); const r = body.querySelector('[data-rawflags]'); if (r) r.value = v; return; }
  if (t.matches('[data-rawflags]')){ setVal('spawnflags', t.value === '0' ? '' : t.value); return; }
  if (t.matches('[data-vis]')){ const ids = [...body.querySelectorAll('[data-vis]')].filter(x => x.checked).map(x => x.dataset.vis); setEntVis(e, ids); S.dirty = true; markDirty(); return; }
  const of = t.dataset && t.dataset.of;
  if (of){
    const rows = outRows(), r = rows[S.outSel]; if (!r) return;
    if (of === 'once') r.times = t.checked ? '1' : '-1'; else r[of] = t.value;
    if (of === 'target') refreshInputList(t.value);
    saveRows(rows);
  }
}
function onClick(ev){
  const t = ev.target, e = S.ent;
  const d = n => t.closest(`[${n}]`);
  if (d('data-smart')){ S.smart = !S.smart; render(); return; }
  if (d('data-kvcopy')){ const kv = e.node ? e.node.items.filter(Array.isArray).map(a => [a[0], a[1]]) : Object.entries(e.props); S.kvClip = kv; try { navigator.clipboard && navigator.clipboard.writeText(kv.map(([k, v]) => `"${k}" "${v}"`).join('\n')); } catch (_) {} return; }
  if (d('data-kvpaste')){ if (!S.kvClip || ro()) return; for (const [k, v] of S.kvClip) if (!/^(classname|id|origin|targetname)$/i.test(k)) setVal(k, v); render(); return; }
  if (d('data-addkey')){ const k = body.querySelector('#ehNk').value.trim(), v = body.querySelector('#ehNv').value; if (k){ setVal(k, v); render(); } return; }
  const del = t.closest('[data-del]'); if (del){ setVal(del.dataset.del, ''); render(); return; }
  const trr = t.closest('#ehOutBody tr'); if (trr){ S.outSel = +trr.dataset.i; body.querySelectorAll('#ehOutBody tr').forEach(x => x.classList.toggle('sel', x === trr)); syncOutForm(); return; }
  const src = t.closest('tr[data-src]'); if (src){ const o = ctx.entities[+src.dataset.src]; if (o) selectEnt(o, { open: true, focus: true }); return; }
  if (d('data-mark')){ const rows = outRows(), r = rows[S.outSel]; const h = r && ctx.entities.find(x => matchTarget(r.target, x) && x !== e); if (h){ buildHelper(h); flyTo(h); } return; }
  if (d('data-oadd')){ const rows = outRows(), n = newConn(); const outs = outputsFor(e.classname); n.out = outs[0] || 'OnTrigger'; rows.push(n); S.outSel = rows.length - 1; saveRows(rows); syncOutForm(); return; }
  if (d('data-ocopy')){ const r = outRows()[S.outSel]; if (r) S.outClip = { ...r }; return; }
  if (d('data-opaste')){ if (!S.outClip) return; const rows = outRows(); rows.push({ ...S.outClip }); S.outSel = rows.length - 1; saveRows(rows); syncOutForm(); return; }
  if (d('data-odel')){ const rows = outRows(); if (S.outSel < 0 || !rows[S.outSel]) return; rows.splice(S.outSel, 1); S.outSel = Math.min(S.outSel, rows.length - 1); saveRows(rows); syncOutForm(); return; }
}

/* ======================= экспорт ======================= */
export function saveVMF(){
  if (!ctx.tree) return;
  const url = URL.createObjectURL(new Blob([serializeVMF(ctx.tree)], { type: 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = (ctx.name || 'map') + '.vmf'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); S.dirty = false; markDirty();
}

/* ======================= публичный API ======================= */
// vmf.js вызывает после загрузки карты
export function entSetContext(c){
  ensureDom(); clearHelper(); closeDlg(); S.ent = null; S.dirty = false; markDirty();
  ctx = { kind: c.kind || 'vmf', tree: c.tree || null, entities: c.entities || [], name: c.name || 'map' };
  const b = document.getElementById('vmfBtnEnts'); if (b) b.disabled = false;
  
  const sel = listEl.querySelector('.eh-cf'); sel.dataset.n = ''; buildList();
}
export function initEntEditor(a){
  api = a; ensureDom();
  const b = document.getElementById('vmfBtnEnts'); if (b) b.onclick = () => toggleList();
  
  window.addEventListener('langchange', fillTexts);
  // выбор кликом по иконке (отличаем клик от вращения камеры)
  const cv = a.canvas; let down = null; const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  cv.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
  cv.addEventListener('pointerup', ev => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5 || performance.now() - down.t > 500){ down = null; return; }
    down = null;
    const g = a.getGroup(); if (!g || !g.visible || !ctx.entities.length) return;
    const r = cv.getBoundingClientRect(); v2.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, a.camera);
    const hits = ray.intersectObjects(g.children.filter(o => o.isSprite), false).filter(h => h.object.userData && h.object.userData.ent);
    if (hits.length) selectEnt(hits[0].object.userData.ent, { open: true });
  });
  fillTexts();
}
