/* A10 成就殿堂页 */

import { h, topbar, openSheet, tapable } from './ui.js';
import { get } from './store.js';
import { getIndex } from './data.js';
import { achievementProgress } from './engine.js';

export function viewAchievements() {
  const s = get();
  const list = getIndex().achievements || [];
  const unlocked = list.filter((a) => s.achievements.includes(a.id));

  const grid = h('div', { class: 'ach-grid' });
  list.forEach((a) => {
    const got = s.achievements.includes(a.id);
    const pr = achievementProgress(a);
    const cell = tapable(h('div', { class: `ach ${got ? '' : 'locked'}` },
      h('span', { class: 'ae', text: a.icon || '🎖️' }),
      h('div', { class: 'an', text: a.name }),
      h('div', { class: 'ap', text: got ? '已达成' : progressText(pr) })
    ), () => showDetail(a, got, pr), `成就：${a.name}`);
    grid.appendChild(cell);
  });

  const header = topbar('🎖️ 成就殿堂', {
    onBack: () => { location.hash = '#/profile'; },
    right: h('span', { class: 'tag gold', text: `${unlocked.length} / ${list.length}` }),
  });

  // 进度条
  const pct = list.length ? unlocked.length / list.length * 100 : 0;

  return {
    header,
    node: h('div', { class: 'pad', style: { paddingTop: '16px' } },
      h('div', { class: 'card', style: { marginBottom: '16px' } },
        h('div', { class: 'row', style: { marginBottom: '8px' } },
          h('span', { class: 'small', text: '成就收集进度' }),
          h('span', { class: 'spacer' }),
          h('span', { class: 'tiny dim', text: `${unlocked.length} / ${list.length}` })
        ),
        h('div', { class: 'bar' }, h('i', { style: { width: `${pct}%` } })),
        h('div', { class: 'tiny faint', style: { marginTop: '8px' },
          text: '成就由关卡包数据定义，新增成就无需更新应用' })
      ),
      grid,
      h('div', { style: { height: '18px' } })
    ),
    nav: null,
    stage: null,
  };
}

function progressText(pr) {
  if (pr.cur === undefined || pr.max === undefined) return '未达成';
  return `${pr.cur} / ${pr.max}`;
}

function showDetail(a, got, pr) {
  const body = h('div', null,
    h('div', { style: { textAlign: 'center', marginBottom: '16px' } },
      h('div', { style: { fontSize: '52px', filter: got ? 'none' : 'grayscale(1)', opacity: got ? '1' : '.5' },
        text: a.icon || '🎖️' }),
      h('div', { style: { fontSize: '17px', fontWeight: '700', marginTop: '10px' }, text: a.name }),
      h('div', { class: 'dim small', style: { marginTop: '6px' }, text: a.desc })
    ),
    h('div', { class: 'card' },
      h('div', { class: 'row', style: { marginBottom: '8px' } },
        h('span', { class: 'small', text: got ? '✅ 已达成' : '达成进度' }),
        h('span', { class: 'spacer' }),
        h('span', { class: 'tiny dim', text: progressText(pr) })
      ),
      pr.max ? h('div', { class: 'bar' },
        h('i', { style: { width: `${Math.min(100, (pr.cur / pr.max) * 100)}%` } })) : null
    )
  );
  openSheet({ title: '成就详情', body });
}
