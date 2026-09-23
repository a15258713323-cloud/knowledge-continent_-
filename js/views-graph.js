/* A7 知识图谱页 —— 依赖关系可视化 */

import { h, renderNav, topbar, fmtPct, emptyState, tapable } from './ui.js';
import { getIndex, stages, pointById } from './data.js';
import { pointMastery, masteryRate } from './engine.js';

const STATE_ICON = { mastered: '✓', shaky: '△', weak: '✕', none: '○' };
const STATE_CLASS = { mastered: 'm', shaky: 's', weak: 'n', none: 'l' };

export function viewGraph() {
  const ix = getIndex();
  const allPoints = [];
  ix.levels.forEach((lv) => {
    (ix.pointsByLevel.get(lv.id) || []).forEach((p) => allPoints.push(p));
  });

  const total = allPoints.length;
  const mastered = allPoints.filter((p) => pointMastery(p.id).mastered).length;
  const touched = allPoints.filter((p) => pointMastery(p.id).answered > 0).length;

  let filter = 'all';   // all | weak | untouched

  const listBox = h('div', { class: 'pad' });
  const segRow = h('div', { class: 'seg2', style: { paddingTop: '12px' } });

  const segs = [
    { k: 'all', label: '全部' },
    { k: 'weak', label: '★ 薄弱' },
    { k: 'untouched', label: '未掌握' },
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

  function paint() {
    listBox.innerHTML = '';

    if (filter === 'weak') {
      // 薄弱排行
      const rows = allPoints
        .map((p) => ({ p, m: pointMastery(p.id) }))
        .filter((x) => x.m.answered > 0 && !x.m.mastered)
        .sort((a, b) => a.m.accuracy - b.m.accuracy);
      if (!rows.length) { listBox.appendChild(emptyState('🎉', '没有薄弱知识点', '继续保持')); return; }
      listBox.appendChild(h('div', { class: 'tiny faint', style: { marginBottom: '10px' },
        text: '按正确率从低到高排列，点击可直达重刷' }));
      rows.forEach(({ p, m }) => {
        const lv = ix.levelById.get(p.levelId);
        const card = h('div', { class: 'card', style: { marginBottom: '10px' } },
          h('div', { class: 'row' },
            h('div', { style: { flex: '1', minWidth: '0' } },
              h('div', { style: { fontSize: '14.5px', fontWeight: '600' }, text: p.name }),
              h('div', { class: 'tiny dim', style: { marginTop: '4px' },
                text: `${lv ? lv.name : ''} · 正确率 ${fmtPct(m.accuracy)} · 答过 ${m.answered} 次` })
            ),
            h('span', { class: `tag ${m.accuracy < 0.5 ? 'danger' : 'warn'}`, text: fmtPct(m.accuracy) })
          )
        );
        listBox.appendChild(tapable(card, () => {
          const pts = ix.pointsByLevel.get(p.levelId) || [];
          const i = pts.findIndex((x) => x.id === p.id);
          location.hash = `#/study/${p.levelId}/${Math.max(0, i)}`;
        }, `薄弱知识点：${p.name}`));
      });
      return;
    }

    // 全部 / 未掌握：按关卡分组的依赖树
    ix.levels.forEach((lv) => {
      const pts = ix.pointsByLevel.get(lv.id) || [];
      const visible = pts.filter((p) => {
        if (filter === 'all') return true;
        return !pointMastery(p.id).mastered;
      });
      if (!visible.length) return;

      const card = h('div', { class: 'card', style: { marginBottom: '12px' } },
        h('div', { class: 'row', style: { marginBottom: '10px' } },
          h('span', { style: { fontSize: '14px', fontWeight: '700' }, text: `${lv.icon || '📘'} ${lv.name}` }),
          h('span', { class: 'spacer' }),
          h('span', { class: 'tiny faint',
            text: `${pts.filter((p) => pointMastery(p.id).mastered).length}/${pts.length}` })
        )
      );

      const tree = h('div', { class: 'tree' });
      // 只展示依赖深度（简化版树：按 order 顺序 + 缩进表示依赖层级）
      const depth = computeDepths(pts);
      visible.forEach((p) => {
        const m = pointMastery(p.id);
        const d = depth.get(p.id) || 0;
        const node = tapable(h('div', {
          class: 'tnode',
          style: { paddingLeft: `${Math.min(d, 4) * 18}px` },
        },
          h('span', { class: `st ${STATE_CLASS[m.level]}`, text: m.answered ? STATE_ICON[m.level] : '○' }),
          h('span', { class: 'nm', text: p.name }),
          m.answered
            ? h('span', { class: 'tiny', style: { color: m.mastered ? 'var(--ok)' : 'var(--warn)' }, text: fmtPct(m.accuracy) })
            : h('span', { class: 'tiny faint', text: '未作答' }),
          d > 0 && visible.indexOf(p) < visible.length - 1 ? h('span', { class: 'tline' }) : null
        ), () => {
          const i = pts.findIndex((x) => x.id === p.id);
          location.hash = `#/study/${lv.id}/${i}`;
        }, `知识点：${p.name}`);
        tree.appendChild(node);

        // 依赖提示
        if ((p.prerequisites || []).length) {
          const pres = p.prerequisites.map((pid) => {
            const pp = pointById(pid);
            return pp ? pp.name : pid;
          });
          tree.appendChild(h('div', {
            class: 'tiny faint',
            style: { paddingLeft: `${Math.min(d, 4) * 18 + 25}px`, marginTop: '-4px', marginBottom: '4px' },
            text: `↳ 依赖：${pres.join('、')}`,
          }));
        }
      });
      card.appendChild(tree);
      listBox.appendChild(card);
    });
  }

  const header = topbar('🕸️ 知识图谱', {
    onBack: () => { location.hash = '#/map'; },
    right: h('span', { class: 'tiny faint', text: `${mastered}/${total} 已掌握` }),
  });

  paint();

  return {
    header,
    node: h('div', null,
      h('div', { class: 'pad', style: { paddingBottom: '0' } },
        h('div', { class: 'card' },
          h('div', { class: 'row', style: { marginBottom: '8px' } },
            h('span', { class: 'small', text: '掌握进度' }),
            h('span', { class: 'spacer' }),
            h('span', { class: 'tiny dim', text: `${mastered} / ${total}` })
          ),
          h('div', { class: 'bar' }, h('i', { style: { width: `${total ? mastered / total * 100 : 0}%` } })),
          h('div', { class: 'tiny faint', style: { marginTop: '8px' },
            text: `已作答 ${touched} 个知识点 · 掌握线 ${fmtPct(masteryRate())}` })
        )
      ),
      segRow,
      listBox
    ),
    nav: renderNav('graph'),
    stage: stages()[0],
  };
}

/** 简易依赖深度：有前置的层级 = 前置深度 + 1（同关卡内） */
function computeDepths(points) {
  const byId = new Map(points.map((p) => [p.id, p]));
  const memo = new Map();
  const visiting = new Set();

  function depth(id) {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return 0;         // 防环
    const p = byId.get(id);
    if (!p) return 0;
    visiting.add(id);
    let d = 0;
    (p.prerequisites || []).forEach((pid) => {
      if (byId.has(pid)) d = Math.max(d, depth(pid) + 1);
    });
    visiting.delete(id);
    memo.set(id, Math.min(d, 4));
    return memo.get(id);
  }

  points.forEach((p) => depth(p.id));
  return memo;
}
