/* ============================================================================
 * 存档备份 —— 导出 / 导入，用于换设备、换浏览器
 *
 * 为什么要它：
 *   进度只存在本机 localStorage，换手机或清缓存就没了。
 *   这里把进度打成一个 JSON 文件，新设备上导入即可继续。
 *
 * 合并策略（用户已确认：智能合并）：
 *   进度类字段一律「取两边更好的」，只增不减；
 *   设置类字段保留本机，避免导入别人的存档把你的主题/Key 冲掉。
 *
 * 安全：
 *   导出的文件**不含 API Key**。Key 属于凭证，不该写进一个可能被
 *   转存到网盘/聊天记录的 JSON 里。换设备后重新填一次即可。
 * ========================================================================== */

import { get, set } from './store.js';

const FORMAT = 'knowledge-continent-save';
const VERSION = 1;

/** attempts 是每题一条记录，长期玩会越来越大，导入时只保留最近这么多条 */
const MAX_ATTEMPTS = 20000;

/* ---------------------------------------------------------------- 工具 */

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const arr = (x) => (Array.isArray(x) ? x : []);

/** 把可能残缺的存档对象补齐成完整结构，缺字段不会导致崩溃 */
function normalize(raw) {
  const r = obj(raw);
  const s = obj(r.settings);
  return {
    playerName: typeof r.playerName === 'string' ? r.playerName : '',
    totalXp: num(r.totalXp),
    stars: num(r.stars),
    cleared: obj(r.cleared),
    attempts: arr(r.attempts),
    wrongBook: obj(r.wrongBook),
    pointStats: obj(r.pointStats),
    levelProgress: obj(r.levelProgress),
    achievements: arr(r.achievements).filter((x) => typeof x === 'string'),
    streak: num(r.streak),
    lastCheckin: typeof r.lastCheckin === 'string' ? r.lastCheckin : '',
    skippedStudy: num(r.skippedStudy),
    createdAt: num(r.createdAt),
    settings: s,
  };
}

/** 取较晚的日期字符串（都按 YYYY-MM-DD，可直接字典序比较） */
function laterDate(a, b) {
  const x = typeof a === 'string' ? a : '';
  const y = typeof b === 'string' ? b : '';
  return y > x ? y : x;
}

/* ---------------------------------------------------------------- 导出 */

/** 组装存档文件内容 */
export function buildBackup() {
  const state = get();
  const s = normalize(state);

  // 设置项：整体带上，但剔除 API Key（凭证不外流）
  const settings = Object.assign({}, s.settings);
  delete settings.apiKey;

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    app: '知识大陆 · 浏览器可玩版',
    summary: statsOf(s),
    state: {
      playerName: s.playerName,
      totalXp: s.totalXp,
      stars: s.stars,
      cleared: s.cleared,
      attempts: s.attempts,
      wrongBook: s.wrongBook,
      pointStats: s.pointStats,
      levelProgress: s.levelProgress,
      achievements: s.achievements,
      streak: s.streak,
      lastCheckin: s.lastCheckin,
      skippedStudy: s.skippedStudy,
      createdAt: s.createdAt,
      settings,
    },
  };
}

/** 存档文件名：知识大陆存档_昵称_20260923-1530.json */
export function backupFileName(name) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
    + `-${p(d.getHours())}${p(d.getMinutes())}`;
  const safe = String(name || '玩家').replace(/[\\/:*?"<>|\s]/g, '').slice(0, 12) || '玩家';
  return `知识大陆存档_${safe}_${stamp}.json`;
}

/** 触发浏览器下载，返回存档内容 */
export function exportSave() {
  const data = buildBackup();
  const blob = new Blob([JSON.stringify(data, null, 1)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(data.state.playerName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return data;
}

/* ---------------------------------------------------------------- 导入 */

/** 读取并校验存档文件，返回 { state, meta } */
export async function readSaveFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    throw new Error('不是合法的 JSON 文件');
  }
  if (!data || typeof data !== 'object') throw new Error('文件内容为空');

  // 兼容两种写法：带外壳的 {format,state}，或是直接一份裸 state
  let raw;
  if (data.state && typeof data.state === 'object') {
    if (data.format && data.format !== FORMAT) {
      throw new Error('这不是「知识大陆」的存档文件');
    }
    if (num(data.version) > VERSION) {
      throw new Error(`存档版本 v${data.version} 高于当前应用支持的 v${VERSION}，请先更新应用`);
    }
    raw = data.state;
  } else if (typeof data.totalXp === 'number' || data.cleared || data.pointStats) {
    raw = data;   // 裸存档，宽松接受
  } else {
    throw new Error('文件里找不到进度数据');
  }

  const state = normalize(raw);
  if (!Object.keys(state.cleared).length && !state.totalXp && !state.attempts.length) {
    throw new Error('存档里没有任何进度');
  }
  return {
    state,
    meta: {
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      playerName: state.playerName,
    },
  };
}

/* ---------------------------------------------------------------- 合并 */

/** 单关记录比较：星多者胜 → 正确率高者胜 → 经验多者胜 */
function betterClear(a, b) {
  const x = obj(a);
  const y = obj(b);
  const rank = (c) => [num(c.stars), num(c.accuracy), num(c.xp)];
  const rx = rank(x);
  const ry = rank(y);
  for (let i = 0; i < rx.length; i++) {
    if (ry[i] !== rx[i]) return ry[i] > rx[i] ? y : x;
  }
  return num(y.finishedAt) > num(x.finishedAt) ? y : x;
}

/**
 * 合并两份进度。返回 { state, delta }
 * delta 用于告诉用户「这次导入带来了什么」
 */
export function mergeState(localRaw, incomingRaw) {
  const a = normalize(localRaw);
  const b = normalize(incomingRaw);

  const out = normalize({});
  out.playerName = a.playerName || b.playerName;

  out.totalXp = Math.max(a.totalXp, b.totalXp);
  out.stars = Math.max(a.stars, b.stars);
  out.streak = Math.max(a.streak, b.streak);
  out.skippedStudy = Math.max(a.skippedStudy, b.skippedStudy);
  out.lastCheckin = laterDate(a.lastCheckin, b.lastCheckin);

  // createdAt 取更早的（保留「第一个存档建立时间」）
  const created = [a.createdAt, b.createdAt].filter((x) => x > 0);
  out.createdAt = created.length ? Math.min(...created) : Date.now();

  // 设置项：保留本机
  out.settings = Object.assign({}, a.settings);

  // ---- 通关记录：逐关取更优 ----
  const cleared = Object.assign({}, a.cleared);
  let levelsImproved = 0;
  Object.keys(b.cleared).forEach((id) => {
    const merged = id in cleared ? betterClear(cleared[id], b.cleared[id]) : b.cleared[id];
    if (JSON.stringify(merged) !== JSON.stringify(cleared[id] || null)) levelsImproved++;
    cleared[id] = merged;
  });
  out.cleared = cleared;

  // ---- 答题流水：按「题号 + 时间」去重取并集 ----
  const seen = new Set();
  const merged_attempts = [];
  a.attempts.concat(b.attempts).forEach((t) => {
    if (!t || typeof t !== 'object') return;
    const k = `${t.quizId}|${t.at}`;
    if (seen.has(k)) return;
    seen.add(k);
    merged_attempts.push(t);
  });
  merged_attempts.sort((x, y) => num(x.at) - num(y.at));
  out.attempts = merged_attempts.slice(-MAX_ATTEMPTS);

  // ---- 错题本：取并集，错次取高，订正状态取「已订正」 ----
  const wrong = {};
  Object.keys(a.wrongBook).forEach((k) => { wrong[k] = Object.assign({}, obj(a.wrongBook[k])); });
  let newWrong = 0;
  Object.keys(b.wrongBook).forEach((k) => {
    const x = wrong[k];
    const y = obj(b.wrongBook[k]);
    if (!x) { wrong[k] = Object.assign({}, y); newWrong++; return; }
    const later = num(y.updatedAt) > num(x.updatedAt) ? y : x;
    wrong[k] = {
      wrongCount: Math.max(num(x.wrongCount), num(y.wrongCount)),
      corrected: !!(x.corrected || y.corrected),
      lastAnswer: later.lastAnswer !== undefined ? later.lastAnswer : x.lastAnswer,
      pointId: later.pointId || x.pointId,
      levelId: later.levelId || x.levelId,
      updatedAt: Math.max(num(x.updatedAt), num(y.updatedAt)),
    };
  });
  out.wrongBook = wrong;

  // ---- 知识点掌握：答对/答题数各取高 ----
  const ps = {};
  Object.keys(a.pointStats).forEach((k) => {
    const x = obj(a.pointStats[k]);
    ps[k] = { answered: num(x.answered), correct: num(x.correct) };
  });
  let pointsImproved = 0;
  Object.keys(b.pointStats).forEach((k) => {
    const x = ps[k] || { answered: 0, correct: 0 };
    const y = obj(b.pointStats[k]);
    const merged = {
      answered: Math.max(num(x.answered), num(y.answered)),
      correct: Math.max(num(x.correct), num(y.correct)),
    };
    if (merged.answered !== num(x.answered) || merged.correct !== num(x.correct)) pointsImproved++;
    ps[k] = merged;
  });
  out.pointStats = ps;

  // ---- 关卡内进度：取更靠后的 ----
  const lp = {};
  Object.keys(a.levelProgress).forEach((k) => {
    lp[k] = { pointIndex: num(obj(a.levelProgress[k]).pointIndex) };
  });
  Object.keys(b.levelProgress).forEach((k) => {
    const x = lp[k] || { pointIndex: 0 };
    const y = obj(b.levelProgress[k]);
    lp[k] = { pointIndex: Math.max(num(x.pointIndex), num(y.pointIndex)) };
  });
  out.levelProgress = lp;

  // ---- 成就：取并集 ----
  const ach = Array.from(new Set(a.achievements.concat(b.achievements)));
  out.achievements = ach;

  const delta = {
    xpGain: out.totalXp - a.totalXp,
    starGain: out.stars - a.stars,
    levelsImproved,
    newWrong,
    pointsImproved,
    newAchievements: ach.length - a.achievements.length,
    newAttempts: out.attempts.length - a.attempts.length,
  };
  return { state: out, delta };
}

/** 把一份已解析的存档合并进本机并落盘，返回合并明细 */
export function applyMerged(incomingState) {
  const before = normalize(get());
  const { state: merged, delta } = mergeState(before, incomingState);
  set(merged);
  return { delta, before: statsOf(before), after: statsOf(merged) };
}

/** 读文件 → 合并 → 落盘。返回合并明细，供 UI 展示。 */
export async function importSave(file) {
  const { state, meta } = await readSaveFile(file);
  return Object.assign({ meta }, applyMerged(state));
}

/* ---------------------------------------------------------------- 展示用统计 */

export function statsOf(raw) {
  const s = normalize(raw);
  const levels = Object.keys(s.cleared).length;
  const wrong = Object.keys(s.wrongBook).length;
  const mastered = Object.values(s.pointStats)
    .filter((v) => num(obj(v).answered) > 0
      && num(obj(v).correct) / Math.max(1, num(obj(v).answered)) >= 0.8).length;
  return {
    playerName: s.playerName,
    totalXp: s.totalXp,
    stars: s.stars,
    levels,
    wrong,
    mastered,
    achievements: s.achievements.length,
    attempts: s.attempts.length,
    streak: s.streak,
    lastCheckin: s.lastCheckin,
  };
}

export function currentStats() { return statsOf(get()); }
