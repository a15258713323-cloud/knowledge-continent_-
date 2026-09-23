/* ============================================================================
 * 答题判定引擎
 * 对应《03_技术设计文档.md》§5.4 与《02_产品原型文档.md》§5.2
 *
 * 客观题（单选/多选/判断/填空）全部离线判定；
 * 主观题优先调大模型批改，无 API Key 或断网时降级为本地关键词评分。
 * ========================================================================== */

/* ---------------------------------------------------------------- 归一化 */

/** 全角 → 半角 */
function toHalfWidth(s) {
  return s.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  ).replace(/\u3000/g, ' ');
}

/** 归一化答案文本：去空白、转小写、全角转半角、统一常见符号 */
export function normalizeAnswer(s) {
  let t = String(s == null ? '' : s);
  t = toHalfWidth(t);
  t = t.toLowerCase();
  // 统一各种等于号 / 冒号 / 逗号
  t = t.replace(/[＝]/g, '=').replace(/[：]/g, ':').replace(/[，、]/g, ',');
  t = t.replace(/[（]/g, '(').replace(/[）]/g, ')');
  t = t.replace(/[；]/g, ';');
  // 去掉所有空白
  t = t.replace(/\s+/g, '');
  // 去掉句末标点
  t = t.replace(/[。.;;,]+$/g, '');
  return t;
}

/** 尝试把答案解析成数字（含百分比、分数） */
function asNumber(t) {
  if (!/^[-+]?\d*\.?\d+(%?)$/.test(t)) return null;
  const pct = t.endsWith('%');
  const n = parseFloat(t.replace('%', ''));
  if (Number.isNaN(n)) return null;
  return pct ? n / 100 : n;
}

/**
 * 判定填空答案是否匹配。
 * 依次尝试：归一化精确匹配 → 数字等价 → 去标点包含
 */
export function answerMatches(input, acceptList) {
  const inp = normalizeAnswer(input);
  if (!inp) return false;

  for (const raw of acceptList || []) {
    const acc = normalizeAnswer(raw);
    if (!acc) continue;
    if (inp === acc) return true;

    // 数字等价：0.70 / 0.7 / .7 视为相同
    const a = asNumber(inp);
    const b = asNumber(acc);
    if (a !== null && b !== null) {
      if (Math.abs(a - b) < 1e-6) return true;
      // 允许 1% 相对误差（浮点计算题）
      if (Math.abs(b) > 1e-9 && Math.abs(a - b) / Math.abs(b) < 0.01) return true;
    }
  }
  return false;
}

/* ---------------------------------------------------------------- 单题判定 */

/**
 * 判一道题。
 * @returns {{correct: boolean|null, score: number, detail: object}}
 *   correct 为 null 表示主观题（不计入通关分数）
 *   score 为 0~1 的得分比例
 */
export function judge(quiz, answer, opts = {}) {
  const partial = opts.multiChoicePartial === true;

  switch (quiz.type) {
    case 'single': {
      const picked = Array.isArray(answer) ? answer[0] : answer;
      const truth = (quiz.answer || [])[0];
      return {
        correct: picked === truth,
        score: picked === truth ? 1 : 0,
        detail: { picked, truth },
      };
    }

    case 'multiple': {
      const picked = [...new Set(Array.isArray(answer) ? answer : [])].sort();
      const truth = [...new Set(quiz.answer || [])].sort();
      const hit = picked.filter((k) => truth.includes(k)).length;
      const wrong = picked.filter((k) => !truth.includes(k)).length;
      const exact = hit === truth.length && wrong === 0;

      let score = 0;
      if (exact) score = 1;
      else if (partial && truth.length && wrong === 0) {
        score = hit / truth.length * 0.5;   // 少选给半分
      }
      return { correct: exact, score, detail: { picked, truth, hit, wrong } };
    }

    case 'boolean': {
      const picked = Array.isArray(answer) ? answer[0] : answer;
      const truth = (quiz.answer || [])[0];
      return {
        correct: picked === truth,
        score: picked === truth ? 1 : 0,
        detail: { picked, truth },
      };
    }

    case 'fill': {
      const inputs = Array.isArray(answer) ? answer : [answer];
      const blanks = quiz.blanks || [];
      const marks = blanks.map((b, i) => answerMatches(inputs[i], b.accept));
      const hit = marks.filter(Boolean).length;
      const all = marks.length > 0 && hit === marks.length;
      return {
        correct: all,
        score: marks.length ? hit / marks.length : 0,
        detail: { marks, inputs, blanks },
      };
    }

    case 'subjective': {
      const graded = localGrade(quiz, answer);
      // 主观题不计入通关分数：correct 为 null
      return { correct: null, score: graded.score, detail: graded };
    }

    default:
      return { correct: false, score: 0, detail: { error: `未知题型 ${quiz.type}` } };
  }
}

/* ---------------------------------------------------------------- 本地评分 */

/**
 * 主观题本地关键词评分（离线降级方案）。
 * 对每个评分点检查是否命中其关键词，得分 = 命中点的权重之和。
 */
export function localGrade(quiz, answerText) {
  const text = normalizeAnswer(answerText);
  const rubric = quiz.rubric || [];

  if (!text) {
    return {
      score: 0,
      points: rubric.map((r) => ({ point: r.point, weight: r.weight, hit: false, comment: '未作答' })),
      comment: '未作答',
      method: 'local',
    };
  }

  const points = rubric.map((r) => {
    const kws = (r.keywords && r.keywords.length) ? r.keywords : [r.point];
    const hit = kws.some((k) => {
      const nk = normalizeAnswer(k);
      return nk.length >= 1 && text.includes(nk);
    });
    return {
      point: r.point,
      weight: r.weight,
      hit,
      comment: hit ? '已答到' : '未答到',
    };
  });

  const score = points.reduce((s, p) => s + (p.hit ? p.weight : 0), 0);
  const missed = points.filter((p) => !p.hit);
  const comment = missed.length === 0
    ? '要点基本都答到了。'
    : `还有 ${missed.length} 个要点没答到，建议补充。`;

  return { score: Math.min(1, score), points, comment, method: 'local' };
}

/* ---------------------------------------------------------------- 大模型批改 */

const GRADE_PROMPT = `你是一位严谨的阅卷老师。请根据题干、参考答案和评分点，对学生答案打分。

要求：
1. 严格按评分点逐条判断学生是否答到，不要因为表述不同就判错，只要语义正确即算答到。
2. 返回**严格的 JSON**，不要有任何多余文字、不要用 markdown 代码块包裹。
3. JSON 格式：
{"score": 0.0~1.0 的浮点数, "points": [{"point": "评分点原文", "hit": true/false, "comment": "一句话点评"}], "comment": "总体点评，40 字以内"}`;

/**
 * 调 DeepSeek 批改主观题。失败时抛错，由调用方降级到本地评分。
 */
export async function aiGrade(quiz, answerText, settings, timeoutMs = 20000) {
  const key = (settings.apiKey || '').trim();
  if (!key) throw new Error('未配置 API Key');

  const base = (settings.apiBase || 'https://api.deepseek.com').replace(/\/+$/, '');
  const rubricText = (quiz.rubric || [])
    .map((r, i) => `${i + 1}. ${r.point}（权重 ${r.weight}）`)
    .join('\n');

  const user = `【题干】\n${quiz.stem}\n\n【参考答案】\n${quiz.reference || '（见评分点）'}\n\n【评分点】\n${rubricText}\n\n【学生答案】\n${answerText || '（空）'}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.2,
        messages: [
          { role: 'system', content: GRADE_PROMPT },
          { role: 'user', content: user },
        ],
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`批改接口返回 ${res.status}${body ? '：' + body.slice(0, 120) : ''}`);
  }

  const data = await res.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message
    && data.choices[0].message.content) || '';
  const json = extractJson(content);
  if (!json) throw new Error('批改结果无法解析');

  // 与本地评分点对齐，防止模型漏字段
  const localPoints = quiz.rubric || [];
  const modelPoints = Array.isArray(json.points) ? json.points : [];
  const points = localPoints.map((r, i) => {
    const mp = modelPoints.find((p) => p && p.point && p.point === r.point) || modelPoints[i] || {};
    return {
      point: r.point,
      weight: r.weight,
      hit: mp.hit === true,
      comment: mp.comment || (mp.hit ? '已答到' : '未答到'),
    };
  });

  let score = typeof json.score === 'number' ? json.score : null;
  if (score === null) {
    score = points.reduce((s, p) => s + (p.hit ? p.weight : 0), 0);
  }
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    points,
    comment: json.comment || '',
    method: 'ai',
    raw: content,
  };
}

/** 从模型输出里抠出 JSON（兼容被 ``` 包裹或带前后废话的情况） */
function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) { /* 继续尝试 */ }
  const m = /\{[\s\S]*\}/.exec(cleaned);
  if (m) {
    try { return JSON.parse(m[0]); } catch (e) { /* ignore */ }
  }
  return null;
}

/* ---------------------------------------------------------------- 题型文案 */

export const TYPE_LABEL = {
  single: '单选题',
  multiple: '多选题',
  boolean: '判断题',
  fill: '填空题',
  subjective: '主观解答题',
};

export function difficultyStars(n) {
  const d = Math.max(1, Math.min(5, n || 2));
  return '★'.repeat(d) + '☆'.repeat(Math.max(0, 4 - d));
}
