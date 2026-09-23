/* A4 知识点讲解页 */

import { h, toast } from './ui.js';
import { get, set } from './store.js';
import { levelById, pointsOfLevel } from './data.js';
import { renderBlocks } from './render.js';
import { pointMastery, addSkippedStudy } from './engine.js';

export function viewStudy({ levelId, pointIndex }) {
  const level = levelById(levelId);
  if (!level) return { node: h('div', { class: 'empty', text: '找不到该关卡' }) };

  const points = pointsOfLevel(levelId);
  if (!points.length) return { node: h('div', { class: 'empty', text: '该关卡没有知识点' }) };

  let idx = Math.max(0, Math.min(points.length - 1, parseInt(pointIndex, 10) || 0));
  const point = points[idx];
  const quizCount = (point.quizzes || []).length;

  /* ---------------- 顶栏 ---------------- */
  const header = h('div', { class: 'topbar' },
    h('button', { class: 'icon-btn', text: '←', onclick: onBack }),
    h('div', { class: 'tb-title', text: `${level.icon || ''} ${level.name}  ·  ${idx + 1}/${points.length}` }),
    h('button', {
      class: 'tiny-btn',
      text: '⏭ 跳过讲解',
      onclick: () => {
        addSkippedStudy(1);
        goQuiz(idx);
      },
    })
  );

  /* ---------------- 知识点标签 ---------------- */
  const navRow = h('div', { class: 'point-nav' });
  points.forEach((p, i) => {
    const m = pointMastery(p.id);
    const cls = [];
    if (i === idx) cls.push('on');
    else if (m.mastered) cls.push('done');
    navRow.appendChild(h('button', {
      class: cls.join(' '),
      text: `${m.mastered && i !== idx ? '✅ ' : ''}${i + 1}`,
      title: p.name,
      onclick: () => { location.hash = `#/study/${levelId}/${i}`; },
    }));
  });

  /* ---------------- 前置知识 ---------------- */
  const pres = point.prerequisites || [];
  const prebar = h('div', { class: 'prebar' },
    h('span', { class: 'tag theme', text: '🔗 前置知识' }),
    pres.length
      ? h('span', { style: { flex: '1' } },
        pres.map((pid) => {
          const m = pointMastery(pid);
          const name = (points.find((p) => p.id === pid) || { name: '（跨关卡知识点）' }).name;
          const icon = m.mastered ? '✅' : (m.answered ? '⚠️' : '○');
          return h('span', {
            style: { marginRight: '10px', whiteSpace: 'nowrap' },
            text: `${icon} ${name}`,
          });
        })
      )
      : h('span', { class: 'dim small', text: '无（本关起点）' })
  );

  /* ---------------- 内容区 ---------------- */
  const content = h('div', { class: 'cblock', style: { padding: '18px 16px 0' } },
    h('h3', { text: point.name }),
    point.summary ? h('p', { class: 'dim small', style: { marginTop: '-4px' }, text: point.summary }) : null,
    renderBlocks(point.content)
  );

  /* ---------------- 底部 ---------------- */
  const last = idx === points.length - 1;
  const bottombar = h('div', { class: 'bottombar' },
    h('div', { class: 'row', style: { marginBottom: '10px' } },
      idx > 0 ? h('button', {
        class: 'tiny-btn', text: '← 上一个知识点',
        onclick: () => { location.hash = `#/study/${levelId}/${idx - 1}`; },
      }) : h('span'),
      h('span', { class: 'spacer' }),
      !last ? h('button', {
        class: 'tiny-btn', text: '下一个知识点 →',
        onclick: () => { location.hash = `#/study/${levelId}/${idx + 1}`; },
      }) : null
    ),
    h('button', {
      class: 'btn',
      text: last ? '开始答题 →' : '看完了，开始答题 →',
      onclick: () => goQuiz(idx),
    })
  );

  function goQuiz(fromIdx) {
    const s = get();
    s.levelProgress[levelId] = { pointIndex: fromIdx };
    set({ levelProgress: s.levelProgress });
    location.hash = `#/quiz/${levelId}`;
  }

  function onBack() {
    const st = level.stageId;
    location.hash = st ? `#/stage/${st}` : '#/map';
  }

  return {
    node: h('div', null,
      h('div', { class: 'progress-line', style: { height: '2px', background: 'var(--line)' } },
        h('i', { style: { display: 'block', height: '100%', width: `${(idx + 1) / points.length * 100}%`, background: 'linear-gradient(90deg, var(--c1), var(--c2))' } })
      ),
      navRow,
      prebar,
      content,
      h('div', { style: { height: '20px' } })
    ),
    header,
    fragments: null,
    nav: bottombar,
    stage: level.stage,
    cleanup: null,
  };
}
