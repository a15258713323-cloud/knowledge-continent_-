/* A8 错题本页 */

import { h, renderNav, topbar, fmtDate, emptyState } from './ui.js';
import { get } from './store.js';
import { quizById, levelById } from './data.js';
import { TYPE_LABEL } from './judge.js';

export function viewWrong() {
  const s = get();
  const all = Object.keys(s.wrongBook)
    .map((qid) => ({ qid, w: s.wrongBook[qid], q: quizById(qid) }))
    .filter((x) => x.q);

  const pending = all.filter((x) => !x.w.corrected);
  const fixed = all.filter((x) => x.w.corrected);

  let filter = 'all';
  const listBox = h('div', { class: 'pad' });
  const segRow = h('div', { class: 'seg2', style: { paddingTop: '12px' } });

  const segs = [
    { k: 'all', label: `全部 ${all.length}` },
    { k: 'pending', label: `未订正 ${pending.length}` },
    { k: 'fixed', label: `已订正 ${fixed.length}` },
  ];
  segs.forEach((sg) => {
    segRow.appendChild(h('button', {
      class: sg.k === filter ? 'on' : '',
      text: sg.label,
      onclick: () => {
        filter = sg.k;
        [...segRow.children].forEach((b, i) => b.classList.toggle('on', segs[i].k === filter));
        paint();
      },
    }));
  });

  // 按关卡分组用于「批量重刷」
  function rows() {
    if (filter === 'pending') return pending;
    if (filter === 'fixed') return fixed;
    return all;
  }

  function paint() {
    listBox.innerHTML = '';
    const data = rows();
    if (!data.length) {
      if (!all.length) {
        listBox.appendChild(emptyState('📕', '错题本还是空的', '答错的题会自动收进来'));
      } else {
        listBox.appendChild(emptyState('✅', '这一栏没有内容', ''));
      }
      foot.innerHTML = '';
      return;
    }

    data.sort((a, b) => (b.w.updatedAt || 0) - (a.w.updatedAt || 0));

    data.forEach(({ qid, w, q }) => {
      const lv = levelById(w.levelId) || {};
      const wrongAns = fmtAnswer(q, w.lastAnswer);
      const rightAns = fmtTruth(q);

      const card = h('div', { class: `wrongcard ${w.corrected ? 'fixed' : ''}` },
        h('div', { class: 'row', style: { gap: '6px' } },
          h('span', { class: 'tiny', style: { color: 'var(--accent)', fontWeight: '600' },
            text: `${TYPE_LABEL[q.type] || ''} · ${lv.name || ''}` }),
          h('span', { class: 'spacer' }),
          w.corrected ? h('span', { class: 'tag ok', text: '✅ 已订正' }) : null
        ),
        h('div', { style: { fontSize: '14px', lineHeight: '1.6', marginTop: '7px' }, text: q.stem }),
        h('div', { class: 'ans-line' },
          wrongAns ? h('span', { class: 'tag danger', text: `我的答案 ${wrongAns}` }) : null,
          rightAns ? h('span', { class: 'tag ok', text: `正确 ${rightAns}` }) : null
        ),
        h('div', { class: 'row', style: { marginTop: '11px' } },
          h('span', { class: 'tiny faint',
            text: `错 ${w.wrongCount} 次 · ${w.updatedAt ? fmtDate(w.updatedAt) : ''}` }),
          h('span', { class: 'spacer' }),
          h('button', {
            class: 'tiny-btn accent', text: '重做此题 →',
            onclick: (e) => { e.stopPropagation(); startWrongQuiz([qid]); },
          })
        )
      );
      listBox.appendChild(card);
    });
  }

  /* ---------------- 批量重刷 ---------------- */
  const foot = h('div', { class: 'bottombar' });

  function refreshFoot() {
    foot.innerHTML = '';
    const data = rows();
    if (!data.length) return;
    foot.appendChild(h('button', {
      class: 'btn',
      text: `🔥 开始重刷（${data.length} 道）`,
      onclick: () => startWrongQuiz(data.map((x) => x.qid)),
    }));
  }

  function startWrongQuiz(qids) {
    // 单题重做：直接进该题所属关卡的错题模式
    const first = quizById(qids[0]);
    if (!first) return;
    location.hash = `#/quiz/${first.levelId}?wrong=1`;
  }

  paint();
  refreshFoot();

  const header = topbar('📕 错题本', {
    onBack: () => { location.hash = '#/profile'; },
    right: h('span', { class: 'tiny faint', text: `共 ${all.length} 道` }),
  });

  // 批量重刷按钮需与底部导航一起固定在页面底部
  const navWrap = h('div', { style: { flex: '0 0 auto' } }, foot, renderNav('wrong'));

  return {
    header,
    node: h('div', null, segRow, listBox),
    nav: navWrap,
    stage: null,
  };
}

/* ---------------------------------------------------------------- 答案展示 */

function fmtAnswer(q, ans) {
  if (ans == null) return '';
  if (q.type === 'boolean') return ans[0] ? '正确' : '错误';
  if (q.type === 'subjective') return String(ans).slice(0, 30) + (String(ans).length > 30 ? '…' : '');
  if (Array.isArray(ans)) return ans.join('、');
  return String(ans);
}

function fmtTruth(q) {
  if (q.type === 'subjective') return '';
  if (q.type === 'boolean') return q.answer && q.answer[0] ? '正确' : '错误';
  if (q.type === 'fill') {
    return (q.blanks || []).map((b, i) => `${i + 1}) ${(b.accept || [])[0]}`).join('  ');
  }
  return (q.answer || []).join('、');
}
