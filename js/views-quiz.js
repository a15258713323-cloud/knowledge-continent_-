/* A5 答题页（核心）—— 逐题作答、实时判定、即时反馈 */

import { h, toast, toastError, confirmDialog, tapable } from './ui.js';
import { get, set } from './store.js';
import { levelById, pointsOfLevel, quizById, getConfig } from './data.js';
import { judge, aiGrade, localGrade, TYPE_LABEL, difficultyStars } from './judge.js';
import { buildSession, recordAttempt, pointMastery } from './engine.js';

/* 上一次结算结果，供 A6 结算页读取 */
export const lastResult = { current: null };

/* 当前会话（模块级，用于中途退出后保留） */
let liveSession = null;

export function viewQuiz({ levelId, query }) {
  const level = levelById(levelId);
  if (!level) return { node: h('div', { class: 'empty', text: '找不到该关卡' }) };

  const wrongOnly = query && query.get('wrong') === '1';
  const points = pointsOfLevel(levelId);

  /* ---------------- 组装题目序列 ---------------- */
  let items;
  if (wrongOnly) {
    const wb = get().wrongBook;
    items = Object.keys(wb)
      .filter((qid) => wb[qid].levelId === levelId)
      .map((qid) => {
        const q = quizById(qid);
        if (!q) return null;
        const pt = points.find((p) => p.id === q.pointId) || {};
        return {
          quizId: qid, pointId: q.pointId, levelId, stageId: level.stageId,
          quiz: q, pointName: pt.name || '',
        };
      })
      .filter(Boolean);
    if (!items.length) {
      return {
        node: h('div', { class: 'empty' },
          h('div', { class: 'e', text: '🎉' }),
          h('div', { text: '本关没有待订正的错题' })),
        header: simpleHeader(level),
        nav: null,
        stage: level.stage,
      };
    }
  } else {
    // 断点续做：从上次未完成的知识点开始
    const saved = get().levelProgress[levelId];
    const all = buildSession(level, points, {
      shuffleQuizzes: get().settings.autoNext !== undefined ? false : false,
    });
    if (saved && saved.pointIndex > 0) {
      const startPoint = points[saved.pointIndex];
      const at = startPoint ? all.findIndex((it) => it.pointId === startPoint.id) : 0;
      items = at > 0 ? all.slice(at) : all;
    } else {
      items = all;
    }
    if (!items.length) {
      return {
        node: h('div', { class: 'empty' },
          h('div', { class: 'e', text: '📭' }),
          h('div', { text: '本关还没有题目' }),
          h('div', { class: 'tiny', style: { marginTop: '8px' }, text: '可以用「只看讲解」先阅读知识点' })),
        header: simpleHeader(level),
        nav: null,
        stage: level.stage,
      };
    }
  }

  /* ---------------- 会话状态 ---------------- */
  const session = {
    levelId,
    mode: wrongOnly ? 'wrongbook' : 'level',
    items: [],
    index: 0,
    startedAt: Date.now(),
    combo: 0,
    maxCombo: 0,
    stage: level.stage,
  };
  liveSession = session;

  /* ---------------- 顶栏 ---------------- */
  const comboEl = h('span', { class: 'combo' });
  const counterEl = h('span', { class: 'tiny faint' });
  const header = h('div', { class: 'topbar' },
    h('button', { class: 'icon-btn', text: '✕', onclick: onExit }),
    h('div', { class: 'tb-title', text: `${level.name}` }),
    counterEl,
    comboEl
  );

  const dots = h('div', { class: 'quiz-progress' });
  const body = h('div', { style: { padding: '18px 16px 0' } });
  const foot = h('div', { class: 'bottombar' });

  const node = h('div', null, dots, body);

  let phase = 'answering';     // answering | answered | grading
  let answer = null;
  let lastJudge = null;
  let currentArea = null;      // 当前题型的作答区容器
  let autoNextTimer = null;

  /* ---------------- 顶部进度点 ---------------- */
  function paintDots() {
    dots.innerHTML = '';
    items.forEach((_, i) => {
      const d = h('i');
      const rec = session.items[i];
      if (rec) d.className = rec.correct === false ? 'bad'
        : (rec.correct === true ? 'ok' : '');
      else if (i === session.index) d.className = 'cur';
      dots.appendChild(d);
    });
  }

  /* ---------------- 渲染当前题 ---------------- */
  function renderQuestion() {
    const it = items[session.index];
    if (!it) { return; }
    const q = it.quiz;

    phase = 'answering';
    answer = null;
    lastJudge = null;

    counterEl.textContent = `${session.index + 1} / ${items.length}`;
    comboEl.textContent = session.combo >= 2 ? `❤️${session.combo} 连击` : '';

    paintDots();

    body.innerHTML = '';

    // 元信息
    body.appendChild(h('div', { class: 'qmeta' },
      h('span', { class: 'tag theme', text: TYPE_LABEL[q.type] || '题目' }),
      h('span', { class: 'tag mute', text: `难度 ${difficultyStars(q.difficulty)}` }),
      q.mustKnow ? h('span', { class: 'tag danger', text: '★ 必考' }) : null,
      h('span', { class: 'spacer' }),
      it.pointName ? h('span', { class: 'tiny faint', text: it.pointName }) : null
    ));

    body.appendChild(h('div', { class: 'stem', text: q.stem }));

    // 按题型渲染作答区
    const area = h('div');
    currentArea = area;
    body.appendChild(area);

    if (q.type === 'single' || q.type === 'multiple') {
      renderChoice(area, q);
    } else if (q.type === 'boolean') {
      renderBoolean(area, q);
    } else if (q.type === 'fill') {
      renderFill(area, q);
    } else {
      renderSubjective(area, q);
    }

    // 底部按钮
    foot.innerHTML = '';
    if (q.type === 'subjective') {
      foot.appendChild(h('button', {
        class: 'btn', text: '提交批改', onclick: () => submitSubjective(area),
      }));
    } else {
      foot.appendChild(h('button', {
        class: 'btn', text: '提交答案', onclick: submitObjective,
      }));
    }

    const main = document.querySelector('.main');
    if (main) main.scrollTop = 0;
  }

  /* ---------------- 单选 / 多选 ---------------- */
  function renderChoice(area, q) {
    const multi = q.type === 'multiple';
    const picked = new Set();
    if (multi) {
      area.appendChild(h('div', { class: 'tiny faint', style: { marginBottom: '10px' }, text: '可多选，选完后点「提交答案」' }));
    }
    const opts = [];
    (q.options || []).forEach((o) => {
      const node_ = tapable(h('div', { class: 'opt', dataset: { key: o.key } },
        h('span', { class: 'k', text: o.key }),
        h('span', { class: 'body' }, h('span', { text: o.text })),
        h('span', { class: 'mark' })
      ), () => {
        if (phase !== 'answering') return;
        if (multi) {
          if (picked.has(o.key)) { picked.delete(o.key); node_.classList.remove('sel'); }
          else { picked.add(o.key); node_.classList.add('sel'); }
        } else {
          picked.clear();
          picked.add(o.key);
          opts.forEach((x) => x.classList.remove('sel'));
          node_.classList.add('sel');
        }
        answer = [...picked];
      }, `${o.key}：${o.text}`);
      opts.push(node_);
      area.appendChild(node_);
    });
    area._opts = opts;
  }

  /* ---------------- 判断题 ---------------- */
  function renderBoolean(area, q) {
    const row = h('div', { class: 'boolean-row' });

    const mk = (val, ico, label) => {
      const el = h('div', { class: 'opt', dataset: { val: String(val) } },
        h('span', { class: 'k', text: ico }),
        h('span', { text: label }),
        h('span', { class: 'mark' })
      );
      return tapable(el, () => {
        if (phase !== 'answering') return;
        row.querySelectorAll('.opt').forEach((x) => x.classList.remove('sel'));
        el.classList.add('sel');
        answer = [val];
      }, `判断：${label}`);
    };

    row.appendChild(mk(true, '✅', '正确'));
    row.appendChild(mk(false, '❌', '错误'));
    area.appendChild(row);
    area._opts = [...row.children];
  }

  /* ---------------- 填空题 ---------------- */
  function renderFill(area, q) {
    const inputs = [];
    (q.blanks || []).forEach((b, i) => {
      const inp = h('input', {
        class: 'blank-input',
        type: 'text',
        placeholder: b.prompt || `第 ${i + 1} 空`,
      });
      inputs.push(inp);
      area.appendChild(h('div', { class: 'blank-row' },
        h('div', { class: 'lb', text: b.prompt || `第 ${i + 1} 空` }),
        inp
      ));
    });
    area._inputs = inputs;
    // 回车提交
    inputs.forEach((inp) => inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && phase === 'answering') submitObjective();
    }));
  }

  /* ---------------- 主观题 ---------------- */
  function renderSubjective(area, q) {
    const ta = h('textarea', {
      class: 'ta',
      placeholder: '写出你的答案，尽量覆盖关键得分点…',
    });
    const counter = h('span', { class: 'tiny faint', text: '0 字' });
    ta.addEventListener('input', () => { counter.textContent = `${ta.value.length} 字`; });

    const hasKey = !!(get().settings.apiKey || '').trim();
    area.appendChild(ta);
    area.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } },
      h('span', { class: 'tiny faint', text: hasKey ? '将调用 DeepSeek 批改' : '未配置 API Key，将使用本地关键词评分' }),
      h('span', { class: 'spacer' }),
      counter
    ));
    area.appendChild(h('div', { class: 'tiny', style: { marginTop: '10px', color: 'var(--warn)' },
      html: '⚠ 主观题<b>不计入通关分数</b>，只作为薄弱点参考' }));
    area._ta = ta;
  }

  /* ---------------- 提交（客观题） ---------------- */
  function submitObjective() {
    if (phase !== 'answering') return;
    const it = items[session.index];
    const q = it.quiz;

    // 收集并校验作答
    if (q.type === 'fill') {
      const inputs = (currentArea && currentArea._inputs) || [];
      answer = inputs.map((i) => i.value);
      if (!answer.some((v) => String(v).trim())) { toast('请先填写答案', ''); return; }
    } else if (!Array.isArray(answer) || answer.length === 0) {
      toast('请先选择答案', '');
      return;
    }

    const r = judge(q, answer, { multiChoicePartial: getConfig('multiChoicePartial', false) });
    phase = 'answered';
    lastJudge = r;

    // 记录
    const rec = {
      quizId: it.quizId, pointId: it.pointId, levelId, stageId: level.stageId,
      correct: r.correct, score: r.score, answer,
    };
    session.items[session.index] = rec;
    recordAttempt(rec, session.mode);

    if (r.correct) { session.combo += 1; session.maxCombo = Math.max(session.maxCombo, session.combo); }
    else session.combo = 0;

    // 立即刷新顶部进度点与连击显示
    paintDots();
    comboEl.textContent = session.combo >= 2 ? `❤️${session.combo} 连击` : '';

    paintObjective(r, q);
    savePointProgress(it);
  }

  function paintObjective(r, q) {
    const area = currentArea;
    const opts = area._opts || [];
    const inputs = area._inputs || [];

    if (q.type === 'single' || q.type === 'multiple') {
      const truth = q.answer || [];
      opts.forEach((o) => {
        o.classList.add('locked', 'dim');
        const key = o.dataset.key;
        const mark = o.querySelector('.mark');
        if (truth.includes(key)) {
          o.classList.remove('dim');
          o.classList.add('right');
          mark.textContent = '✓'; mark.style.color = 'var(--ok)';
        } else if (Array.isArray(answer) && answer.includes(key)) {
          o.classList.remove('dim');
          o.classList.add('wrong');
          mark.textContent = '✕'; mark.style.color = 'var(--danger)';
        }
      });
    } else if (q.type === 'boolean') {
      opts.forEach((o) => {
        o.classList.add('locked', 'dim');
        const val = o.dataset.val === 'true';
        const mark = o.querySelector('.mark');
        if (val === (q.answer || [])[0]) {
          o.classList.remove('dim');
          o.classList.add('right');
          mark.textContent = '✓'; mark.style.color = 'var(--ok)';
        } else if (Array.isArray(answer) && answer[0] === val) {
          o.classList.remove('dim');
          o.classList.add('wrong');
          mark.textContent = '✕'; mark.style.color = 'var(--danger)';
        }
      });
    } else if (q.type === 'fill') {
      const marks = (r.detail && r.detail.marks) || [];
      inputs.forEach((inp, i) => {
        inp.disabled = true;
        inp.classList.add(marks[i] ? 'right' : 'wrong');
      });
    }

    // 反馈面板
    const exact = r.score >= 1;
    const fb = h('div', { class: `feedback ${r.correct ? 'ok' : 'bad'}` });
    fb.appendChild(h('div', { class: 'row', style: { gap: '8px' } },
      h('span', { style: { fontSize: '16px' }, text: r.correct ? '✅' : '❌' }),
      h('span', {
        style: { fontWeight: '700', color: r.correct ? 'var(--ok)' : 'var(--danger)' },
        text: r.correct ? '回答正确！' : '答错了',
      }),
      h('span', { class: 'spacer' }),
      r.correct && session.combo >= 2
        ? h('span', { class: 'combo', text: `❤️${session.combo} 连击` }) : null
    ));

    if (!r.correct) {
      const truth = (q.answer || []).join('、');
      if (q.type === 'fill') {
        const marks = (r.detail && r.detail.marks) || [];
        const wrongIdx = marks.map((m, i) => (m ? null : i + 1)).filter(Boolean);
        fb.appendChild(h('div', { class: 'small', style: { marginTop: '6px' } },
          h('span', { class: 'dim', text: `第 ${wrongIdx.join('、')} 空答错` })));
        fb.appendChild(h('div', { class: 'small', style: { marginTop: '4px' } },
          h('span', { class: 'dim' }, '可接受答案：'),
          h('span', { style: { color: 'var(--ok)' },
            text: (q.blanks || []).map((b, i) => `${i + 1}) ${(b.accept || []).slice(0, 3).join(' / ')}`).join('  ') })));
      } else {
        fb.appendChild(h('div', { class: 'small', style: { marginTop: '6px' } },
          h('span', { class: 'dim' }, '正确答案：'),
          h('b', { style: { color: 'var(--ok)' }, text: truth })));
      }
    }

    if (q.explanation) {
      fb.appendChild(h('div', { class: 'explain' },
        h('b', { text: '💡 解析' }),
        h('br'),
        h('span', { text: q.explanation })
      ));
    }

    if (!r.correct) {
      fb.appendChild(h('div', { class: 'row', style: { marginTop: '10px', gap: '6px' } },
        h('span', { class: 'tag danger', text: '已加入错题本' })));
    }

    body.appendChild(fb);

    // 下一题按钮
    foot.innerHTML = '';
    const isLast = session.index === items.length - 1;
    const nextBtn = h('button', {
      class: 'btn',
      text: isLast ? '完成本关 →' : '下一题 →',
      onclick: next,
    });
    foot.appendChild(nextBtn);

    // 答对自动跳转（默认关闭）
    if (r.correct && get().settings.autoNext) {
      const tip = h('div', { class: 'tiny faint', style: { textAlign: 'center', marginTop: '8px' }, text: '答对啦，1.2 秒后自动下一题…' });
      foot.appendChild(tip);
      autoNextTimer = setTimeout(next, 1200);
    }
  }

  /* ---------------- 提交（主观题） ---------------- */
  async function submitSubjective(area) {
    if (phase !== 'answering') return;
    const it = items[session.index];
    const q = it.quiz;
    const text = (area._ta.value || '').trim();
    if (!text) { toast('请先写下你的答案', ''); return; }

    phase = 'grading';
    area._ta.disabled = true;
    foot.innerHTML = '';
    foot.appendChild(h('button', { class: 'btn', text: '批改中…', disabled: true }));

    let graded;
    const settings = get().settings;
    if ((settings.apiKey || '').trim()) {
      try {
        graded = await aiGrade(q, text, settings);
      } catch (e) {
        graded = null;
        toastError(e, 'AI 批改暂时用不了，已改用本地评分');
      }
    }
    if (!graded) {
      graded = localGrade(q, text);
    }

    phase = 'answered';
    lastJudge = graded;

    const rec = {
      quizId: it.quizId, pointId: it.pointId, levelId, stageId: level.stageId,
      correct: null, score: graded.score, answer: text,
    };
    session.items[session.index] = rec;
    recordAttempt(rec, session.mode);
    savePointProgress(it);

    paintSubjective(q, text, graded);
  }

  function paintSubjective(q, text, graded) {
    const pct = Math.round(graded.score * 100);
    const color = pct >= 80 ? 'var(--ok)' : (pct >= 50 ? 'var(--warn)' : 'var(--danger)');
    const method = graded.method === 'ai' ? `🤖 ${(get().settings.apiBase || '').includes('deepseek') ? 'DeepSeek' : 'AI'} 批改` : '📐 本地关键词评分';

    const fb = h('div', { class: 'feedback ok' },
      h('div', { class: 'row', style: { gap: '14px', alignItems: 'center', marginBottom: '14px' } },
        h('div', {
          class: 'score-ring',
          style: { background: `conic-gradient(${color} 0 ${pct}%, var(--line) ${pct}% 100%)` },
        }, h('span', { style: { color }, text: String(pct) })),
        h('div', { style: { flex: '1' } },
          h('div', { style: { fontSize: '14px', fontWeight: '700', color }, text: method }),
          h('div', { class: 'dim small', style: { marginTop: '5px', lineHeight: '1.6' }, text: graded.comment || '' })
        )
      )
    );

    // 逐评分点
    const box = h('div', { style: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '12px', padding: '4px 13px' } });
    (graded.points || []).forEach((p) => {
      box.appendChild(h('div', { class: 'rubric' },
        h('span', { class: `rd ${p.hit ? 'hit' : 'miss'}`, text: p.hit ? '✓' : '⚪' }),
        h('span', { style: { flex: '1' } },
          h('b', { text: p.point }),
          p.comment ? h('div', { class: 'dim', style: { fontSize: '12.5px' }, text: p.comment }) : null
        ),
        h('span', { class: `tag ${p.hit ? 'ok' : 'warn'}`, text: String(p.weight) })
      ));
    });
    fb.appendChild(box);

    // 参考答案（可折叠）
    if (q.reference) {
      const det = h('details', { style: { marginTop: '12px' } },
        h('summary', { class: 'small', style: { cursor: 'pointer', color: 'var(--accent)' }, text: '查看参考答案' }),
        h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.7', marginTop: '8px', color: 'var(--text-dim)' }, text: q.reference })
      );
      fb.appendChild(det);
    }

    fb.appendChild(h('div', { class: 'tiny faint', style: { marginTop: '10px' }, text: '本题不计入通关分数，仅作为薄弱点参考' }));

    body.appendChild(fb);

    foot.innerHTML = '';
    const isLast = session.index === items.length - 1;
    foot.appendChild(h('button', {
      class: 'btn',
      text: isLast ? '完成本关 →' : '下一题 →',
      onclick: next,
    }));
  }

  /* ---------------- 下一题 / 结算 ---------------- */
  function next() {
    session.index += 1;
    if (session.index >= items.length) { finish(); return; }
    renderQuestion();
  }

  function savePointProgress(it) {
    const pi = points.findIndex((p) => p.id === it.pointId);
    if (pi >= 0) {
      const s = get();
      s.levelProgress[levelId] = { pointIndex: pi };
      set({ levelProgress: s.levelProgress });
    }
  }

  function finish() {
    session.durationMs = Date.now() - session.startedAt;
    liveSession = null;

    if (session.mode === 'wrongbook') {
      lastResult.current = { level, session, wrongMode: true };
      location.hash = `#/result/${levelId}`;
      return;
    }
    lastResult.current = { level, session, wrongMode: false };
    location.hash = `#/result/${levelId}`;
  }

  function onExit() {
    const answered = session.items.filter(Boolean).length;
    if (!answered) { location.hash = `#/stage/${level.stageId}`; return; }
    confirmDialog('退出本关？',
      `你已经答了 ${answered} 题，进度会按知识点保存，下次进入可以接着答。`,
      () => { location.hash = `#/stage/${level.stageId}`; },
      '退出');
  }

  function simpleHeader(lv) {
    return h('div', { class: 'topbar' },
      h('button', { class: 'icon-btn', text: '←', onclick: () => { location.hash = `#/stage/${lv.stageId}`; } }),
      h('div', { class: 'tb-title', text: lv.name })
    );
  }

  renderQuestion();

  return {
    node,
    header,
    nav: foot,
    stage: level.stage,
    cleanup: () => { if (autoNextTimer) clearTimeout(autoNextTimer); },
  };
}
