/* 速记卡页（教材第 0 章） */

import { h, topbar, renderNav } from './ui.js';
import { getIndex } from './data.js';
import { renderSpans } from './render.js';
import { stages } from './data.js';

export function viewCheatSheet() {
  const cs = getIndex().cheatSheet;
  if (!cs || !(cs.items || []).length) {
    return { node: h('div', { class: 'empty', text: '当前关卡包没有速记卡' }), nav: renderNav('map') };
  }

  const grid = h('div', { class: 'cb-grid', style: { padding: '0 16px' } });
  cs.items.forEach((it, i) => {
    grid.appendChild(h('div', { class: 'gi' },
      h('span', { class: 'gt' }, `${i + 1}. ${it.title || ''}`),
      renderSpans(it.spans)
    ));
  });

  return {
    header: topbar(cs.title || '速记卡', { onBack: () => { location.hash = '#/map'; } }),
    node: h('div', null,
      h('div', { class: 'pad', style: { paddingBottom: '8px' } },
        h('div', { class: 'tiny faint', text: '这些是最容易记混、也最常考的点。建议反复过几遍。' })
      ),
      grid,
      h('div', { style: { height: '24px' } })
    ),
    nav: renderNav('map'),
    stage: stages()[0],
  };
}
