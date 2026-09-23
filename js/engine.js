/* ============================================================================
 * 游戏引擎 —— 解锁 / 星级 / 经验 / 掌握度 / 成就
 * 对应《03_技术设计文档.md》§5.1 ~ §5.3 与《02_产品原型文档.md》§5
 * ========================================================================== */

import { allLevels, getConfig, stages, getIndex } from './data.js';
import { get, set as setState, doCheckin } from './store.js';

/* ---------------------------------------------------------------- 经验与等级 */

export function levelInfo(xp) {
  const table = getConfig('levels', [{ exp: 0, title: '代码学徒' }]);
  const total = xp == null ? get().totalXp : xp;

  let idx = 0;
  for (let i = 0; i < table.length; i++) {
    if (total >= table[i].exp) idx = i;
  }
  const cur = table[idx];
  const next = table[idx + 1] || cur;
  const span = Math.max(1, next.exp - cur.exp);
  const inLv = total - cur.exp;

  return {
    lv: idx + 1,
    title: cur.title,
    inLv,
    need: span,
    nextTitle: next.title,
    pct: Math.min(100, Math.round(inLv / span * 100)),
  };
}

/* ---------------------------------------------------------------- 解锁 */

/** 只有正课关卡参与线性解锁；刷题关与参考资料始终可进入 */
function normalLevels() {
  return allLevels().filter((l) => (l.role || 'normal') === 'normal');
}

export function isLevelUnlocked(level) {
  const role = level.role || 'normal';
  if (role === 'exam' || role === 'reference') return true;

  const list = normalLevels();
  const i = list.findIndex((l) => l.id === level.id);
  if (i <= 0) return true;
  return !!get().cleared[list[i - 1].id];
}

export function isLevelCleared(levelId) {
  return !!get().cleared[levelId];
}

/**
 * 关卡节点状态。
 * cleared 已通关 / full 满星 / open 可挑战 / locked 未解锁
 */
export function nodeState(level) {
  const rec = get().cleared[level.id];
  const thresholds = getConfig('starThresholds', [0.6, 0.8, 1.0]);
  if (rec) {
    return rec.stars >= thresholds.length ? 'full' : 'cleared';
  }
  return isLevelUnlocked(level) ? 'open' : 'locked';
}

/** 未解锁时，提示需要先通关哪一关 */
export function lockedReason(level) {
  const list = normalLevels();
  const i = list.findIndex((l) => l.id === level.id);
  if (i <= 0) return '';
  const prev = list[i - 1];
  return prev ? `需先通关：${prev.name}` : '';
}

/* ---------------------------------------------------------------- 星级与经验 */

export function starsFor(accuracy) {
  const th = getConfig('starThresholds', [0.6, 0.8, 1.0]);
  let n = 0;
  th.forEach((t) => { if (accuracy + 1e-9 >= t) n++; });
  return n;
}

export function passRate() { return getConfig('passRate', 0.6); }
export function masteryRate() { return getConfig('masteryRate', 0.8); }

/**
 * 结算一次关卡：写成绩、累计经验星星、检查成就。
 * @returns {{ passed, stars, accuracy, xp, newAchievements, unlockedNext }}
 */
export function finishLevel(level, session) {
  const s = get();
  const rules = getConfig('xpRules', {});
  const perCorrect = rules.perCorrect ?? 6;
  const levelClear = rules.levelClear ?? 60;
  const bossBonus = rules.bossBonus ?? 50;
  const comboBonus = rules.comboBonus ?? 2;
  const perfectBonus = rules.perfectBonus ?? 40;

  // 只统计客观题（主观题不计入通关分数）
  const objective = session.items.filter((it) => it.correct !== null);
  const total = objective.length;
  const correct = objective.filter((it) => it.correct).length;
  const accuracy = total ? correct / total : 0;

  const passed = accuracy + 1e-9 >= passRate();
  const stars = passed ? starsFor(accuracy) : 0;

  let xp = perCorrect * correct + comboBonus * (session.maxCombo || 0);
  if (passed) xp += levelClear;
  if (passed && level.boss) xp += bossBonus;
  if (passed && total > 0 && correct === total) xp += perfectBonus;

  // 写成绩（取历史最好）
  const old = s.cleared[level.id];
  const record = {
    stars: Math.max(stars, old ? old.stars : 0),
    accuracy: old ? Math.max(accuracy, old.accuracy) : accuracy,
    xp: (old ? old.xp : 0) + xp,
    bestCombo: Math.max(session.maxCombo || 0, old ? old.bestCombo : 0),
    durationMs: session.durationMs || 0,
    finishedAt: Date.now(),
    passed: passed || (old ? old.passed : false),
  };

  const gainedStars = record.stars - (old ? old.stars : 0);
  s.cleared[level.id] = record;
  s.totalXp += xp;
  s.stars += Math.max(0, gainedStars);

  // 断点清除
  delete s.levelProgress[level.id];

  const newAchievements = checkAchievements();

  setState({});

  const nextLevel = findNextLevel(level);

  return {
    passed,
    stars,
    accuracy,
    correct,
    total,
    xp,
    gainedStars: Math.max(0, gainedStars),
    newAchievements,
    unlockedNext: nextLevel && isLevelUnlocked(nextLevel) ? nextLevel : null,
    perfect: passed && total > 0 && correct === total,
  };
}

function findNextLevel(level) {
  const list = allLevels();
  const i = list.findIndex((l) => l.id === level.id);
  return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
}

/* ---------------------------------------------------------------- 作答流水 */

export function recordAttempt(item, mode = 'level') {
  const s = get();
  s.attempts.push({
    quizId: item.quizId,
    pointId: item.pointId,
    levelId: item.levelId,
    stageId: item.stageId,
    correct: item.correct,
    score: item.score,
    mode,
    at: Date.now(),
  });
  // 只留最近 3000 条，避免无限增长
  if (s.attempts.length > 3000) s.attempts = s.attempts.slice(-3000);

  // 知识点掌握度累计
  if (item.pointId && item.correct !== null) {
    const st = s.pointStats[item.pointId] || { answered: 0, correct: 0 };
    st.answered += 1;
    if (item.correct) st.correct += 1;
    s.pointStats[item.pointId] = st;
  }

  // 错题本
  if (item.correct === false) {
    const w = s.wrongBook[item.quizId] || {
      wrongCount: 0, corrected: 0, pointId: item.pointId, levelId: item.levelId,
    };
    w.wrongCount += 1;
    w.corrected = 0;
    w.lastAnswer = item.answer;
    w.updatedAt = Date.now();
    s.wrongBook[item.quizId] = w;
  } else if (item.correct === true) {
    const w = s.wrongBook[item.quizId];
    if (w) { w.corrected = 1; w.updatedAt = Date.now(); }
  }

  setState({ attempts: s.attempts, pointStats: s.pointStats, wrongBook: s.wrongBook });
}

/* ---------------------------------------------------------------- 掌握度 */

export function pointMastery(pointId) {
  const st = get().pointStats[pointId];
  if (!st || !st.answered) {
    return { answered: 0, correct: 0, accuracy: 0, mastered: false, level: 'none' };
  }
  const accuracy = st.correct / st.answered;
  const mastered = accuracy + 1e-9 >= masteryRate();
  let level = 'weak';                      // ✕ 未掌握
  if (mastered) level = 'mastered';        // ✓ 已掌握
  else if (accuracy >= masteryRate() * 0.75) level = 'shaky';  // △ 不熟练
  return { answered: st.answered, correct: st.correct, accuracy, mastered, level };
}

export function masteredCount() {
  const s = get();
  return Object.keys(s.pointStats).filter((id) => pointMastery(id).mastered).length;
}

export function overallAccuracy() {
  const s = get();
  let a = 0, c = 0;
  s.attempts.forEach((x) => {
    if (x.correct === null) return;
    a += 1;
    if (x.correct) c += 1;
  });
  return { answered: a, correct: c, accuracy: a ? c / a : 0 };
}

/**
 * 薄弱知识点排行（按正确率升序）。
 * 只取「有作答记录 且 未达到掌握线」的知识点 —— 已达标的点不该出现在薄弱榜里。
 */
export function weakPoints(limit = 5) {
  const s = get();
  const rows = [];
  Object.keys(s.pointStats).forEach((pid) => {
    const m = pointMastery(pid);
    if (!m.answered || m.mastered) return;
    rows.push({ pointId: pid, ...m });
  });
  rows.sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered);
  return rows.slice(0, limit);
}

/* ---------------------------------------------------------------- 成就 */

export function achievementProgress(a) {
  const s = get();
  const cond = a.condition || {};
  const v = cond.value;

  switch (cond.type) {
    case 'clearedCount': {
      const n = Object.values(s.cleared).filter((r) => r.passed).length;
      return { cur: n, max: v, ok: n >= v };
    }
    case 'clearedStages': {
      let done = 0;
      stages().forEach((st) => {
        const normals = (st.levels || []).filter((l) => (l.role || 'normal') === 'normal');
        if (normals.length && normals.every((l) => s.cleared[l.id] && s.cleared[l.id].passed)) done++;
      });
      return { cur: done, max: v, ok: done >= v };
    }
    case 'stars':
      return { cur: s.stars, max: v, ok: s.stars >= v };
    case 'streak':
      return { cur: s.streak, max: v, ok: s.streak >= v };
    case 'masteredPoints': {
      const n = masteredCount();
      return { cur: n, max: v, ok: n >= v };
    }
    case 'perfectLevels': {
      const n = Object.values(s.cleared).filter((r) => r.accuracy >= 0.9999 && r.passed).length;
      return { cur: n, max: v, ok: n >= v };
    }
    case 'accuracy': {
      const o = overallAccuracy();
      const min = cond.minAnswered || 0;
      if (o.answered < min) return { cur: Math.round(o.accuracy * 100), max: Math.round(v * 100), ok: false, note: `至少答 ${min} 题` };
      return { cur: Math.round(o.accuracy * 100), max: Math.round(v * 100), ok: o.accuracy >= v };
    }
    case 'allCleared': {
      const normals = normalLevels();
      const n = normals.filter((l) => s.cleared[l.id] && s.cleared[l.id].passed).length;
      return { cur: n, max: normals.length, ok: normals.length > 0 && n === normals.length };
    }
    default:
      return { cur: 0, max: 1, ok: false };
  }
}

/** 检查并解锁成就，返回本次新解锁的成就数组 */
export function checkAchievements() {
  const s = get();
  const unlocked = [];
  (getIndex().achievements || []).forEach((a) => {
    if (s.achievements.includes(a.id)) return;
    if (achievementProgress(a).ok) {
      s.achievements.push(a.id);
      unlocked.push(a);
    }
  });
  if (unlocked.length) setState({ achievements: s.achievements });
  return unlocked;
}

/* ---------------------------------------------------------------- 打卡 */

export function checkin() {
  const r = doCheckin();
  if (r.ok) checkAchievements();
  return r;
}

/* ---------------------------------------------------------------- 关卡会话 */

/**
 * 生成一关的作答序列：按知识点顺序，每点的题目全部出（保证每点至少 1 题）。
 * 序列一旦生成即固定，中途退出按知识点粒度保存进度。
 * opts.shuffleQuizzes：只打乱知识点内部的题目顺序，知识点顺序保持不变。
 */
export function buildSession(level, points, opts = {}) {
  const items = [];
  (points || []).forEach((pt) => {
    const bucket = (pt.quizzes || []).map((q) => ({
      quizId: q.id,
      pointId: pt.id,
      levelId: level.id,
      stageId: level.stageId,
      quiz: q,
      pointName: pt.name,
    }));
    if (opts.shuffleQuizzes && bucket.length > 1) {
      for (let i = bucket.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
      }
    }
    items.push(...bucket);
  });
  return items;
}

/** 跳过的讲解数量（档案展示用） */
export function skippedStudyCount() { return get().skippedStudy || 0; }

export function addSkippedStudy(n = 1) {
  const s = get();
  s.skippedStudy = (s.skippedStudy || 0) + n;
  setState({ skippedStudy: s.skippedStudy });
}
