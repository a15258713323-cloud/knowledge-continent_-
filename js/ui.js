/* ============================================================================
 * 共享 UI 组件与工具
 * ========================================================================== */

import { get } from './store.js';
import { levelInfo, checkin } from './engine.js';
import { stages, colorsOf } from './data.js';

/* ---------------------------------------------------------------- 元素构造 */

export function h(tag, props, ...children) {
  const n = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach((k) => {
      const v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else n.setAttribute(k, v === true ? '' : v);
    });
  }
  children.flat(3).forEach((c) => {
    if (c == null || c === false) return;
    n.appendChild(typeof c === 'string' || typeof c === 'number'
      ? document.createTextNode(String(c)) : c);
  });
  return n;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

/* ---------------------------------------------------------------- 可点击容器 */

/**
 * 让一个非 button 元素可点击且可被辅助技术识别。
 *
 * 为什么需要：卡片、列表项用 div 实现视觉更自由，但 div 不会进入无障碍树、
 * 也无法用键盘操作。这里统一补上 role / tabindex / 键盘事件，
 * 满足《04_UI设计规范.md》§9 的无障碍要求。
 */
export function tapable(el, onclick, ariaLabel) {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  const fire = (ev) => onclick(el, ev);
  el.addEventListener('click', fire);
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fire(ev); }
  });
  return el;
}

/* ---------------------------------------------------------------- Toast */

export function toast(msg, cls = '') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div', { id: 'toasts' });
    document.body.appendChild(box);
  }
  const t = h('div', { class: `toast ${cls}`, html: msg });
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, 2400);
}

/* ---------------------------------------------------------------- 底部弹层 */

let currentSheet = null;

export function openSheet({ title, body, actions }) {
  closeSheet();
  const sh = h('div', { class: 'sheet' },
    h('div', { class: 'grab' }),
    h('div', { class: 'sh-head' },
      h('h3', { text: title || '' }),
      h('button', { class: 'icon-btn', text: '✕', onclick: closeSheet })
    ),
    h('div', { class: 'sh-body' }, body),
    actions ? h('div', { class: 'pad' }, actions) : null
  );
  const mask = h('div', { class: 'mask', onclick: (e) => { if (e.target === mask) closeSheet(); } }, sh);
  document.body.appendChild(mask);
  currentSheet = mask;
  return mask;
}

export function closeSheet() {
  if (currentSheet) { currentSheet.remove(); currentSheet = null; }
}

/** 确认对话框 */
export function confirmDialog(title, message, onYes, yesText = '确定') {
  const body = h('div', null,
    h('p', { class: 'dim', text: message }),
    h('div', { style: { height: '18px' } }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn ghost', text: '取消', onclick: closeSheet }),
      h('button', {
        class: 'btn', text: yesText,
        onclick: () => { closeSheet(); onYes && onYes(); },
      })
    )
  );
  openSheet({ title, body });
}

/* ---------------------------------------------------------------- HUD */

export function renderHud() {
  const s = get();
  const li = levelInfo();

  const checkinBtn = h('button', {
    class: 'tiny-btn', text: '📅 打卡',
    onclick: () => {
      const r = checkin();
      if (r.ok) toast(`打卡成功！连续 <b>${r.streak}</b> 天 🔥`, 'gold');
      else toast('今天已经打过卡啦', '');
    },
  });

  return h('header', { class: 'hud' },
    h('div', { class: 'row' },
      h('div', { class: 'avatar', text: '🧙' }),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { class: 'row', style: { gap: '6px' } },
          h('span', { class: 'pname', text: s.playerName || 'AI冒险者' }),
          h('span', { class: 'lvb', text: `Lv.${li.lv}` }),
          h('span', { class: 'title-b', text: li.title })
        ),
        h('div', { style: { marginTop: '7px' } },
          h('div', { class: 'bar' }, h('i', { style: { width: `${li.pct}%` } })),
          h('div', {
            class: 'tiny faint',
            style: { marginTop: '4px' },
            text: `${li.inLv} / ${li.need} EXP  ·  累计 ${s.totalXp}`,
          })
        )
      )
    ),
    h('div', { class: 'stats' },
      h('span', { class: 'stat', html: `⭐ ${s.stars}` }),
      h('span', { class: 'stat', html: `🔥 ${s.streak}天` }),
      h('span', { class: 'stat', html: `🏆 ${Object.values(s.cleared).filter((r) => r.passed).length}关` }),
      h('span', { class: 'spacer' }),
      checkinBtn
    )
  );
}

/* ---------------------------------------------------------------- 底部导航 */

const NAV_ITEMS = [
  { key: 'map', ic: '🗺️', label: '地图', route: '#/map' },
  { key: 'graph', ic: '🕸️', label: '图谱', route: '#/graph' },
  { key: 'wrong', ic: '📕', label: '错题本', route: '#/wrong' },
  { key: 'me', ic: '👤', label: '我的', route: '#/profile' },
];

export function renderNav(activeKey) {
  return h('nav', { class: 'nav' },
    NAV_ITEMS.map((it) => h('button', {
      class: activeKey === it.key ? 'on' : '',
      onclick: () => { location.hash = it.route; },
    },
      h('span', { class: 'ic', text: it.ic }),
      h('span', { text: it.label })
    ))
  );
}

/* ---------------------------------------------------------------- 工具 */

export function fmtDuration(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m} 分 ${r} 秒` : `${r} 秒`;
}

export function fmtPct(x) { return `${Math.round((x || 0) * 100)}%`; }

/** 大陆主题色 */
export function stageColors(stage) { return colorsOf(stage); }

/** 空态 */
export function emptyState(emoji, title, hint) {
  return h('div', { class: 'empty' },
    h('div', { class: 'e', text: emoji }),
    h('div', { style: { fontSize: '15px', fontWeight: '600', color: 'var(--text-dim)' }, text: title }),
    hint ? h('div', { class: 'tiny', style: { marginTop: '6px' }, text: hint }) : null
  );
}

/** 顶栏 */
export function topbar(title, { onBack, right } = {}) {
  return h('div', { class: 'topbar' },
    onBack ? h('button', { class: 'icon-btn', text: '←', onclick: onBack }) : null,
    h('div', { class: 'tb-title', text: title }),
    right || null
  );
}

/** 时间戳 → 相对日期 */
export function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
