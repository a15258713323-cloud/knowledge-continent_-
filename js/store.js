/* ============================================================================
 * 进度存储 —— 全部数据存本地，无账号、不上云
 * 对应《03_技术设计文档.md》§6 本地存储设计（web 版用 localStorage 替代 SQLite）
 * ========================================================================== */

const KEY = 'kc_progress_v1';
const PACK_OVERRIDE_KEY = 'kc_pack_override_v1';

export const defaultState = () => ({
  playerName: '',
  totalXp: 0,
  stars: 0,
  cleared: {},          // levelId -> { stars, accuracy, xp, bestCombo, durationMs, finishedAt }
  attempts: [],         // { quizId, pointId, levelId, stageId, correct, mode, at }
  wrongBook: {},        // quizId -> { wrongCount, corrected, lastAnswer, pointId, levelId, updatedAt }
  pointStats: {},       // pointId -> { answered, correct }
  levelProgress: {},    // levelId -> { pointIndex }
  achievements: [],     // 已解锁成就 id
  streak: 0,
  lastCheckin: '',
  skippedStudy: 0,      // 跳过讲解的次数（计入档案）
  settings: {
    themeMode: 'auto',  // auto | light | dark | system
    dayStart: '07:00',
    nightStart: '19:00',
    warm: false,
    motion: true,
    sfx: true,
    autoNext: false,
    apiKey: '',
    apiBase: 'https://api.deepseek.com',
  },
  createdAt: Date.now(),
});

let state = defaultState();
const listeners = new Set();

function revive(raw) {
  const base = defaultState();
  const merged = Object.assign(base, raw || {});
  merged.settings = Object.assign(base.settings, (raw && raw.settings) || {});
  // 保证嵌套对象存在，避免旧版本数据缺字段导致崩溃
  ['cleared', 'wrongBook', 'pointStats', 'levelProgress'].forEach((k) => {
    if (!merged[k] || typeof merged[k] !== 'object') merged[k] = {};
  });
  ['attempts', 'achievements'].forEach((k) => {
    if (!Array.isArray(merged[k])) merged[k] = [];
  });
  return merged;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? revive(JSON.parse(raw)) : defaultState();
  } catch (e) {
    state = defaultState();
  }
  return state;
}

export function get() { return state; }

export function set(patch) {
  Object.assign(state, patch);
  save();
  emit();
}

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
  emit();
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('进度保存失败', e);
  }
}

export function reset() {
  state = defaultState();
  save();
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() { listeners.forEach((fn) => fn(state)); }

/* ---------------------------------------------------------------- 关卡包覆盖 */

export function getPackOverride() {
  try {
    const raw = localStorage.getItem(PACK_OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function setPackOverride(pack) {
  localStorage.setItem(PACK_OVERRIDE_KEY, JSON.stringify(pack));
}

export function clearPackOverride() {
  localStorage.removeItem(PACK_OVERRIDE_KEY);
}

/* ---------------------------------------------------------------- 打卡 */

const today = () => new Date().toLocaleDateString('sv-SE');   // YYYY-MM-DD

export function doCheckin() {
  const t = today();
  if (state.lastCheckin === t) return { ok: false, reason: 'already' };

  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.toLocaleDateString('sv-SE');

  state.streak = state.lastCheckin === y ? state.streak + 1 : 1;
  state.lastCheckin = t;
  save();
  emit();
  return { ok: true, streak: state.streak, date: t };
}
