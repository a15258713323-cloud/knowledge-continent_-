/* A9 学习档案页（同时作为「我的」Tab） */

import { h, renderNav, fmtPct, emptyState, tapable } from './ui.js';
import { get } from './store.js';
import { getIndex, stages, levelById } from './data.js';
import { levelInfo, overallAccuracy, masteredCount, weakPoints, pointMastery } from './engine.js';
import { themeLabel } from './theme.js';

export function viewProfile() {
  const s = get();
  const li = levelInfo();
  const acc = overallAccuracy();
  const mastered = masteredCount();
  const ix = getIndex();
  const totalPoints = ix.levels.reduce((n, l) => n + l.stats.points, 0);
  const normals = ix.levels.filter((l) => (l.role || 'normal') === 'normal');
  const cleared = normals.filter((l) => { const r = s.cleared[l.id]; return r && r.passed; }).length;

  /* ---------------- 个人卡 ---------------- */
  const person = h('div', { class: 'card', style: {
    background: 'linear-gradient(135deg, color-mix(in srgb, var(--c1) 18%, var(--panel)), var(--panel))',
  } },
    h('div', { class: 'row' },
      h('div', { class: 'avatar', style: { width: '48px', height: '48px', fontSize: '24px' }, text: '🧙' }),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { class: 'row', style: { gap: '6px' } },
          h('span', { style: { fontSize: '16px', fontWeight: '700' }, text: s.playerName || 'AI冒险者' }),
          h('span', { class: 'lvb', text: `Lv.${li.lv}` })
        ),
        h('div', { class: 'dim tiny', style: { marginTop: '3px' }, text: li.title }),
        h('div', { class: 'bar', style: { marginTop: '8px' } }, h('i', { style: { width: `${li.pct}%` } })),
        h('div', { class: 'tiny faint', style: { marginTop: '4px' },
          text: `${li.inLv} / ${li.need} EXP  ·  累计 ${s.totalXp}` })
      )
    )
  );

  /* ---------------- 数据总览 ---------------- */
  const grid = h('div', { class: 'stat-grid', style: { marginTop: '14px' } },
    cell(fmtPct(acc.accuracy), '总正确率', acc.accuracy >= 0.8 ? 'var(--ok)' : null),
    cell(`${mastered}/${totalPoints}`, '已掌握知识点', 'var(--accent)'),
    cell(String(acc.answered), '总答题数', null),
    cell(`${s.streak} 天`, '连续打卡', 'var(--combo)')
  );

  /* ---------------- 正确率趋势（近 7 天） ---------------- */
  const trend = buildTrend(s.attempts);

  /* ---------------- 各大陆掌握度 ---------------- */
  const stageRows = h('div');
  stages().forEach((st) => {
    const lvList = (st.levels || []).filter((l) => (l.role || 'normal') === 'normal');
    const pts = [];
    lvList.forEach((l) => (ix.pointsByLevel.get(l.id) || []).forEach((p) => pts.push(p)));
    const m = pts.filter((p) => pointMastery(p.id).mastered).length;
    const pct = pts.length ? Math.round(m / pts.length * 100) : 0;
    stageRows.appendChild(h('div', { style: { marginBottom: '12px' } },
      h('div', { class: 'row', style: { marginBottom: '6px' } },
        h('span', { class: 'small', style: { flex: '1' }, text: `${st.icon || ''} ${st.name}` }),
        h('span', { class: 'tiny dim', text: `${pct}%` })
      ),
      h('div', { class: 'bar' }, h('i', { style: { width: `${pct}%` } }))
    ));
  });

  /* ---------------- 薄弱知识点 ---------------- */
  const weak = weakPoints(5);
  const weakBox = h('div');
  if (!weak.length) {
    weakBox.appendChild(emptyState('📊', '还没有答题记录', '去闯几关就能看到薄弱点了'));
  } else {
    const card = h('div', { class: 'groupcard' });
    weak.forEach((w, i) => {
      const p = ix.pointById.get(w.pointId) || { name: '未知知识点' };
      const lv = levelById(p.levelId);
      const row = h('div', { class: 'setrow tap' },
        h('span', { class: 'v', style: { width: '18px' }, text: String(i + 1) }),
        h('span', { style: { flex: '1', minWidth: '0' } },
          h('div', { style: { fontSize: '14.5px' }, text: p.name }),
          h('div', { class: 'tiny faint', text: lv ? lv.name : '' })
        ),
        h('span', {
          class: 'bold',
          style: { fontSize: '13.5px', color: w.accuracy < 0.5 ? 'var(--danger)' : 'var(--warn)' },
          text: fmtPct(w.accuracy),
        }),
        h('span', { class: 'arw', text: '›' })
      );
      card.appendChild(tapable(row, () => {
        const pts = ix.pointsByLevel.get(p.levelId) || [];
        const idx = pts.findIndex((x) => x.id === p.pointId);
        location.hash = `#/study/${p.levelId}/${Math.max(0, idx)}`;
      }, `薄弱知识点：${p.name}`));
    });
    weakBox.appendChild(card);
  }

  /* ---------------- 功能入口 ---------------- */
  const entries = h('div', { class: 'groupcard' },
    entryRow('🎖️', '成就殿堂', `${s.achievements.length}/${ix.achievements.length}`, () => { location.hash = '#/achievements'; }),
    entryRow('⚙️', '设置', themeLabel(s.settings.themeMode), () => { location.hash = '#/settings'; }),
    entryRow('⚡', '速记卡', `${(ix.cheatSheet && ix.cheatSheet.items || []).length} 条`, () => { location.hash = '#/cheatsheet'; })
  );

  const node = h('div', { class: 'pad', style: { paddingTop: '16px' } },
    person,
    grid,
    h('div', { class: 'sec-title' }, '📈 正确率趋势（近 7 天）'),
    h('div', { class: 'card' }, trend),
    h('div', { class: 'sec-title' }, '🗺️ 各大陆掌握度'),
    h('div', { class: 'card' }, stageRows),
    h('div', { class: 'sec-title' }, '⚠️ 薄弱知识点 Top 5'),
    weakBox,
    h('div', { class: 'sec-title' }, '更多'),
    entries,
    h('div', { class: 'tiny faint', style: { textAlign: 'center', padding: '22px 0 8px' },
      text: `知识大陆 · 浏览器可玩版 · 关卡包 v${ix.meta.version || '1.0.0'}` })
  );

  return { node, nav: renderNav('me'), stage: stages()[0] };
}

function cell(value, label, color) {
  return h('div', { class: 'stat-cell' },
    h('div', { class: 'v', style: color ? { color } : {}, text: value }),
    h('div', { class: 'l', text: label })
  );
}

function entryRow(ic, label, value, onclick) {
  const el = h('div', { class: 'setrow tap' },
    h('span', { class: 'ic', text: ic }),
    h('span', { style: { flex: '1' }, text: label }),
    value ? h('span', { class: 'v', text: value }) : null,
    h('span', { class: 'arw', text: '›' })
  );
  return tapable(el, onclick, label);
}

/** 近 7 天正确率趋势柱状图 */
function buildTrend(attempts) {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('sv-SE'));
  }

  const byDay = new Map(days.map((d) => [d, { a: 0, c: 0 }]));
  (attempts || []).forEach((x) => {
    if (x.correct === null || x.correct === undefined) return;
    const d = new Date(x.at).toLocaleDateString('sv-SE');
    const rec = byDay.get(d);
    if (!rec) return;
    rec.a += 1;
    if (x.correct) rec.c += 1;
  });

  const any = [...byDay.values()].some((v) => v.a > 0);
  if (!any) {
    return emptyState('📈', '最近 7 天还没有答题记录', '');
  }

  const chart = h('div', { class: 'chart' });
  days.forEach((d) => {
    const rec = byDay.get(d);
    const pct = rec.a ? rec.c / rec.a : 0;
    const col = h('div', { class: 'col' },
      h('i', { style: { height: `${Math.max(2, pct * 100)}%`, opacity: rec.a ? '1' : '.25' } }),
      h('span', { text: d.slice(5).replace('-', '/') })
    );
    col.title = rec.a ? `${d}：${rec.c}/${rec.a}（${fmtPct(pct)}）` : `${d}：无记录`;
    chart.appendChild(col);
  });
  return chart;
}
