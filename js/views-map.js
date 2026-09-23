/* A2 世界地图页（主界面） */

import { h, renderHud, renderNav, openSheet, emptyState, tapable } from './ui.js';
import { get } from './store.js';
import { stages, colorsOf, getIndex } from './data.js';
import { isLevelUnlocked, nodeState } from './engine.js';
import { renderSpans } from './render.js';

export function viewMap() {
  const s = get();
  const ix = getIndex();
  const wrap = h('div', { class: 'pad', style: { paddingTop: '16px' } });

  // 冒险指引：推荐下一个可挑战且未通关的正课关卡
  const tip = h('div', { class: 'quest' },
    h('span', { text: '📜' }),
    h('span', { html: buildQuest() })
  );

  // 速记卡入口
  if (ix.cheatSheet && (ix.cheatSheet.items || []).length) {
    wrap.appendChild(tapable(h('div', {
      class: 'cont-card tap',
      style: { marginBottom: '12px' },
    },
      h('div', { class: 'row' },
        h('div', { class: 'cont-emoji', style: { background: 'linear-gradient(135deg, var(--gold), var(--note))' }, text: '⚡' }),
        h('div', { style: { flex: '1', minWidth: '0' } },
          h('div', { style: { fontSize: '15.5px', fontWeight: '700' }, text: ix.cheatSheet.title || '速记卡' }),
          h('div', { class: 'dim tiny', style: { marginTop: '4px' },
            text: `${ix.cheatSheet.items.length} 条 · 进考场前最后一眼` })
        ),
        h('span', { style: { color: 'var(--gold)', fontSize: '18px' }, text: '›' })
      )
    ), () => { location.hash = '#/cheatsheet'; }, '打开速记卡'));
  }

  // 大陆列表
  stages().forEach((st) => {
    wrap.appendChild(stageCard(st));
  });

  // 关卡包未提供的大陆（迷雾态）
  wrap.appendChild(h('div', { class: 'cont-card fog' },
    h('div', { class: 'row' },
      h('div', { class: 'cont-emoji', style: { background: 'var(--line)', fontSize: '20px' }, text: '🌫️' }),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { style: { fontSize: '15.5px', fontWeight: '700' }, text: '更多大陆' }),
        h('div', { class: 'dim tiny', style: { marginTop: '4px' }, text: '迷雾笼罩 · 在电脑端出题工作台生成后再导入' })
      )
    )
  ));

  wrap.appendChild(h('div', {
    class: 'tiny faint',
    style: { textAlign: 'center', padding: '14px 0 8px' },
    text: '—— 大陆尽头 · 迷雾之外还有星辰大海 ——'
  }));

  return {
    header: renderHud(),
    node: h('div', null, tip, wrap),
    nav: renderNav('map'),
    stage: stages()[0],
  };
}

function buildQuest() {
  const list = getIndex().levels.filter((l) => (l.role || 'normal') === 'normal');
  for (const lv of list) {
    const st = nodeState(lv);
    if (st === 'open') {
      return `继续挑战「<b>${lv.name}</b>」 · ${lv.stats.points} 个知识点 / ${lv.stats.quizzes} 题`;
    }
  }
  const cleared = list.filter((l) => get().cleared[l.id] && get().cleared[l.id].passed).length;
  if (cleared === list.length && list.length) {
    return '全部关卡已通关 🎉 去「押题必刷」冲满星吧';
  }
  return '点击大陆卡片开始你的冒险';
}

function stageCard(stage) {
  const normals = (stage.levels || []).filter((l) => (l.role || 'normal') === 'normal');
  const cleared = normals.filter((l) => {
    const r = get().cleared[l.id];
    return r && r.passed;
  }).length;
  const totalStars = normals.reduce((n, l) => {
    const r = get().cleared[l.id];
    return n + (r ? r.stars : 0);
  }, 0);
  const maxStars = normals.length * 3;
  const pct = normals.length ? Math.round(cleared / normals.length * 100) : 0;
  const [c1] = colorsOf(stage);

  return tapable(h('div', { class: 'cont-card tap live' },
    h('div', { class: 'row', style: { alignItems: 'flex-start' } },
      h('div', { class: 'cont-emoji', text: stage.icon || '🏕️' }),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { style: { fontSize: '16px', fontWeight: '700' }, text: stage.name }),
        h('div', { class: 'dim tiny', style: { margin: '4px 0 9px' },
          text: `${normals.length} 关 · 已通 ${cleared} 关 · ⭐${totalStars}/${maxStars}` }),
        h('div', { class: 'bar' }, h('i', { style: { width: `${pct}%` } })),
        stage.desc ? h('div', { class: 'faint tiny', style: { marginTop: '8px' }, text: stage.desc }) : null
      ),
      h('span', { style: { color: c1, fontSize: '20px' }, text: '›' })
    )
  ), () => { location.hash = `#/stage/${stage.id}`; }, `进入大陆：${stage.name}`);
}
