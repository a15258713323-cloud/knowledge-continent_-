/* A6 关卡结算页 */

import { h, fmtDuration, fmtPct } from './ui.js';
import { levelById } from './data.js';
import { finishLevel, passRate } from './engine.js';
import { lastResult } from './views-quiz.js';

export function viewResult({ levelId }) {
  const ctx = lastResult.current;

  // 刷新页面 / 直接访问 → 回地图
  if (!ctx || !ctx.session || ctx.session.levelId !== levelId) {
    location.replace('#/map');
    return { node: h('div') };
  }

  const { level, session, wrongMode } = ctx;
  lastResult.current = null;   // 用过即清，避免重复结算

  if (wrongMode) return wrongResult(level, session);

  const r = finishLevel(level, session);
  const nextLevel = r.unlockedNext;

  /* ---------------- 顶部 ---------------- */
  const starsRow = h('div', { class: 'stars-row' });
  for (let i = 0; i < 3; i++) {
    const s = h('span', { class: `star ${i < r.stars ? 'on' : ''}`, text: '⭐' });
    s.style.animationDelay = `${0.05 + i * 0.15}s`;
    starsRow.appendChild(s);
  }

  const top = h('div', { class: 'result-top' },
    h('h1', { text: r.passed ? '🎉 关卡通过！' : '❌ 差一点就过了' }),
    starsRow
  );

  /* ---------------- 成绩 ---------------- */
  const grid = h('div', { class: 'stat-grid' },
    cell(fmtPct(r.accuracy), `正确率（${r.correct}/${r.total}）`, r.passed ? 'var(--ok)' : 'var(--danger)'),
    cell(`+${r.xp}`, '获得经验 EXP', 'var(--gold)'),
    cell(`×${session.maxCombo || 0}`, '最高连击', 'var(--combo)'),
    cell(fmtDuration(session.durationMs), '用时', null)
  );

  const pad = h('div', { class: 'pad' }, grid);

  if (!r.passed) {
    pad.appendChild(h('div', { style: { height: '14px' } }));
    pad.appendChild(h('div', { class: 'card', style: {
      borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)',
      background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
    } },
      h('div', { class: 'row' },
        h('span', { text: '📉' }),
        h('div', { style: { flex: '1' } },
          h('div', { style: { fontSize: '13.5px' } },
            `通关线是 ${fmtPct(passRate())}，你还差 `,
            h('b', { text: fmtPct(passRate() - r.accuracy) })),
          h('div', { class: 'tiny dim', style: { marginTop: '3px' }, text: '本关未解锁下一关，可以重刷或先看讲解' })
        )
      )
    ));
  }

  // 新成就
  (r.newAchievements || []).forEach((a) => {
    pad.appendChild(h('div', { style: { height: '10px' } }));
    pad.appendChild(h('div', { class: 'card', style: {
      borderColor: 'color-mix(in srgb, var(--gold) 32%, transparent)',
      background: 'color-mix(in srgb, var(--gold) 9%, transparent)',
    } },
      h('div', { class: 'row' },
        h('span', { style: { fontSize: '22px' }, text: a.icon }),
        h('div', { style: { flex: '1' } },
          h('div', { style: { fontSize: '14px', fontWeight: '700', color: 'var(--gold)' }, text: `解锁新成就：${a.name}` }),
          h('div', { class: 'tiny dim', style: { marginTop: '3px' }, text: a.desc })
        )
      )
    ));
  });

  // 错题
  const wrongs = session.items.filter((x) => x && x.correct === false);
  if (wrongs.length) {
    pad.appendChild(h('div', { style: { height: '10px' } }));
    const box = h('div', { class: 'card', style: {
      borderColor: 'color-mix(in srgb, var(--danger) 26%, transparent)',
      background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
    } },
      h('div', { class: 'row', style: { fontSize: '13.5px' } },
        h('span', { text: '📕' }),
        h('span', { style: { flex: '1' }, html: `本关错题 <b>${wrongs.length} 道</b>，已自动加入错题本` }),
        h('button', {
          class: 'tiny-btn accent', text: '去看看 →',
          onclick: () => { location.hash = '#/wrong'; },
        })
      )
    );
    pad.appendChild(box);
  }

  // 解锁提示
  if (r.passed && nextLevel) {
    pad.appendChild(h('div', { style: { height: '10px' } }));
    pad.appendChild(h('div', { class: 'card', style: {
      borderColor: 'color-mix(in srgb, var(--ok) 26%, transparent)',
      background: 'color-mix(in srgb, var(--ok) 8%, transparent)',
    } },
      h('div', { class: 'row', style: { fontSize: '13.5px' } },
        h('span', { text: '🔓' }),
        h('span', { style: { flex: '1' }, html: `已解锁下一关：<b>${nextLevel.name}</b>` })
      )
    ));
  }

  // 按钮组
  pad.appendChild(h('div', { style: { height: '18px' } }));
  if (r.passed && nextLevel) {
    pad.appendChild(h('button', {
      class: 'btn', text: '挑战下一关 →',
      onclick: () => { location.hash = `#/study/${nextLevel.id}/0`; },
    }));
    pad.appendChild(h('div', { style: { height: '10px' } }));
  } else {
    pad.appendChild(h('button', {
      class: 'btn', text: '🔁 再来一次',
      onclick: () => { location.hash = `#/quiz/${level.id}`; },
    }));
    pad.appendChild(h('div', { style: { height: '10px' } }));
  }
  pad.appendChild(h('div', { class: 'btn-row' },
    h('button', { class: 'btn ghost', text: '重刷本关', onclick: () => { location.hash = `#/quiz/${level.id}`; } }),
    h('button', { class: 'btn ghost', text: '返回大陆', onclick: () => { location.hash = `#/stage/${level.stageId}`; } })
  ));
  pad.appendChild(h('div', { style: { height: '14px' } }));

  return {
    node: h('div', null, top, pad),
    header: null,
    nav: null,
    stage: level.stage,
  };
}

function cell(value, label, color) {
  return h('div', { class: 'stat-cell' },
    h('div', { class: 'v', style: color ? { color } : {}, text: value }),
    h('div', { class: 'l', text: label })
  );
}

/* ---------------------------------------------------------------- 错题模式结算 */

function wrongResult(level, session) {
  const total = session.items.filter(Boolean).length;
  const fixed = session.items.filter((x) => x && x.correct === true).length;

  const node = h('div', null,
    h('div', { class: 'result-top' },
      h('h1', { text: '📕 错题重刷完成' }),
      h('div', { style: { fontSize: '15px', color: 'var(--text-dim)' },
        html: `订正 <b style="color:var(--ok)">${fixed}</b> / ${total} 道` })
    ),
    h('div', { class: 'pad' },
      h('div', { class: 'stat-grid' },
        cell(String(fixed), '已订正', 'var(--ok)'),
        cell(String(total - fixed), '仍待订正', 'var(--danger)')
      ),
      h('div', { style: { height: '18px' } }),
      h('button', { class: 'btn', text: '返回错题本', onclick: () => { location.hash = '#/wrong'; } }),
      h('div', { style: { height: '10px' } }),
      h('button', { class: 'btn ghost', text: '继续刷本关其他错题', onclick: () => { location.hash = `#/quiz/${level.id}?wrong=1`; } }),
      h('div', { style: { height: '14px' } })
    )
  );

  return { node, header: null, nav: null, stage: level.stage };
}
