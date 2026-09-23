/* A3 大陆详情页 */

import { h, renderNav, toast, openSheet, fmtPct, tapable } from './ui.js';
import { get } from './store.js';
import { stages, pointsOfLevel, colorsOf, getIndex } from './data.js';
import { nodeState, lockedReason } from './engine.js';

export function viewStage({ stageId }) {
  const stage = stages().find((s) => s.id === stageId) || stages()[0];
  if (!stage) return { node: h('div', { class: 'empty', text: '找不到该大陆' }) };

  // 必须用带索引的关卡对象（含 stats 统计），不能用原始 stage.levels
  const levels = getIndex().levels.filter((l) => l.stageId === stage.id);
  const normals = levels.filter((l) => (l.role || 'normal') === 'normal');
  const cleared = normals.filter((l) => { const r = get().cleared[l.id]; return r && r.passed; }).length;
  const stars = normals.reduce((n, l) => { const r = get().cleared[l.id]; return n + (r ? r.stars : 0); }, 0);

  /* ---------------- 关卡节点链路 ---------------- */
  const chain = h('div', { class: 'nodechain' });
  levels.forEach((lv, i) => {
    if ((lv.role || 'normal') === 'reference') return;
    const st = nodeState(lv);
    const cls = ['node'];
    if (st === 'cleared') cls.push('done');
    else if (st === 'full') cls.push('done', 'full');
    else if (st === 'open') cls.push('open');
    else cls.push('lock');
    if (lv.boss) cls.push('boss');

    const label = (lv.role === 'exam') ? '刷题' : (i + 1);
    const dot = h('span', { class: 'dot' },
      h('span', { text: st === 'locked' ? '🔒' : (lv.boss && lv.icon ? lv.icon : String(label)) })
    );
    chain.appendChild(tapable(h('div', { class: cls.join(' ') },
      dot,
      h('span', { class: 'nm', text: shortName(lv.name) })
    ), () => onPick(lv), `第 ${label} 关：${lv.name}`));
  });

  /* ---------------- 关卡列表 ---------------- */
  const list = h('div', { class: 'pad', style: { paddingTop: '14px' } },
    h('div', { class: 'row', style: { marginBottom: '10px' } },
      h('span', { style: { fontSize: '14px', fontWeight: '700' }, text: '关卡列表' }),
      h('span', { class: 'spacer' }),
      h('span', { class: 'faint tiny', text: `${cleared}/${normals.length} 已通关` })
    )
  );
  levels.forEach((lv) => list.appendChild(levelCard(lv)));

  const header = h('div', { class: 'topbar' },
    h('button', { class: 'icon-btn', text: '←', onclick: () => { location.hash = '#/map'; } }),
    h('div', { class: 'tb-title', text: `${stage.icon || ''} ${stage.name}` }),
    h('span', { class: 'tiny faint', text: `⭐${stars}` })
  );

  return {
    node: h('div', null, chain, list),
    header,
    nav: renderNav('map'),
    stage,
  };
}

function shortName(name) {
  const n = String(name || '');
  // 节点下方文字最多显示两行，长名字做缩写
  if (n.length <= 8) return n;
  return n.slice(0, 7) + '…';
}

function levelCard(lv) {
  const st = nodeState(lv);
  const rec = get().cleared[lv.id];
  const cls = ['lvcard'];
  if (st === 'cleared' || st === 'full') cls.push('done');
  if (st === 'open') cls.push('open', 'tap');
  if (st === 'locked') cls.push('lock');
  if (lv.boss) cls.push('boss');

  const idxText = lv.boss && lv.icon ? lv.icon : (lv.role === 'exam' ? '🎯' : '·');

  const meta = [];
  if (st === 'cleared' || st === 'full') meta.push(`⭐${rec.stars}`);
  meta.push(`${lv.stats.points} 知识点`);
  meta.push(`${lv.stats.quizzes} 题`);

  const statusRow = h('div', { class: 'row', style: { marginTop: '7px', flexWrap: 'wrap', gap: '6px' } });
  if (st === 'cleared' || st === 'full') {
    statusRow.appendChild(h('span', { class: 'tag ok', text: '✅ 已通关' }));
    statusRow.appendChild(h('span', { class: 'tiny dim', text: `正确率 ${fmtPct(rec.accuracy)}` }));
    const fullStars = (rec.stars >= 3);
    if (fullStars) statusRow.appendChild(h('span', { class: 'tag gold', text: '满星' }));
  } else if (st === 'open') {
    statusRow.appendChild(h('span', { class: 'tag theme', text: lv.role === 'exam' ? '随时可刷' : '可挑战' }));
  } else {
    statusRow.appendChild(h('span', { class: 'tag mute', text: '🔒 未解锁' }));
  }
  if (lv.role === 'reference') statusRow.appendChild(h('span', { class: 'tag mute', text: '参考资料' }));
  if (lv.role === 'exam') statusRow.appendChild(h('span', { class: 'tag gold', text: '刷题关' }));

  const body = h('div', { style: { flex: '1', minWidth: '0' } },
    h('div', { class: 'row', style: { gap: '6px' } },
      h('span', { class: 'lvname', text: lv.name }),
      lv.boss ? h('span', { class: 'tag gold', text: 'BOSS' }) : null
    ),
    h('div', { class: 'dim tiny', style: { marginTop: '5px' }, text: meta.join(' · ') }),
    lv.goal ? h('div', { class: 'dim tiny', style: { marginTop: '6px', lineHeight: '1.5' }, text: `🎯 ${lv.goal}` }) : null,
    statusRow,
    st === 'locked' ? h('div', { class: 'tiny', style: { marginTop: '7px', color: 'var(--warn)' },
      text: `🔒 ${lockedReason(lv)}` }) : null
  );

  const card = tapable(h('div', { class: cls.join(' ') },
    h('span', { class: 'idx', text: idxText }),
    body
  ), () => onPick(lv), lv.name);

  if (st === 'locked') card.style.opacity = '.55';
  return card;
}

/* ---------------------------------------------------------------- 选择关卡 */

export function onPick(lv) {
  const st = nodeState(lv);
  const role = lv.role || 'normal';

  if (st === 'locked') {
    toast(`🔒 ${lockedReason(lv)}`, '');
    return;
  }

  // 参考资料：只给看讲解
  if (role === 'reference') {
    location.hash = `#/study/${lv.id}/0`;
    return;
  }

  if (st === 'open') {
    // 先看讲解，再答题（讲解页有「开始答题」与「跳过讲解」）
    location.hash = `#/study/${lv.id}/0`;
    return;
  }

  // 已通关 → 弹层选择
  const rec = get().cleared[lv.id];
  const points = pointsOfLevel(lv.id);
  const quizCount = points.reduce((n, p) => n + (p.quizzes || []).length, 0);

  const body = h('div', null,
    h('div', { class: 'row', style: { gap: '10px', marginBottom: '14px' } },
      h('span', { class: 'tag ok', text: '✅ 已通关' }),
      h('span', { class: 'tag gold', text: `⭐${rec.stars}` }),
      h('span', { class: 'tiny dim', text: `正确率 ${fmtPct(rec.accuracy)}` })
    ),
    h('div', { class: 'tiny dim', style: { lineHeight: '1.8' } },
      `${lv.stats.points} 个知识点 · ${quizCount} 道题`,
      h('br'),
      rec.finishedAt ? `上次通关：${new Date(rec.finishedAt).toLocaleString('zh-CN')}` : ''
    ),
    h('div', { style: { height: '18px' } }),
    h('div', { class: 'btn-row', style: { flexDirection: 'column', gap: '10px' } },
      h('button', { class: 'btn', text: '🔁 重新挑战本关', onclick: () => { closeSheet(); location.hash = `#/quiz/${lv.id}`; } }),
      h('button', { class: 'btn ghost', text: '📖 只看讲解', onclick: () => { closeSheet(); location.hash = `#/study/${lv.id}/0`; } }),
      wrongCountOfLevel(lv.id) > 0
        ? h('button', { class: 'btn ghost', text: `📕 只刷本关错题（${wrongCountOfLevel(lv.id)} 道）`, onclick: () => { closeSheet(); location.hash = `#/quiz/${lv.id}?wrong=1`; } })
        : null
    )
  );

  openSheet({ title: lv.name, body });
}

function wrongCountOfLevel(levelId) {
  const wb = get().wrongBook;
  return Object.values(wb).filter((w) => w.levelId === levelId && !w.corrected).length;
}
