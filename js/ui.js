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

/* ---------------------------------------------------------------- 错误翻译 */

/**
 * 把技术错误翻译成中文人话。
 *
 * 原则：
 *   1. 信息里已经有中文的，说明是我们自己写的面向用户的提示 → 原样返回
 *   2. 英文 / 技术性错误 → 翻译成人话，绝不把错误码、堆栈、英文异常直接甩给用户
 *   3. 翻译不了的 → 用 fallback，同样说人话
 */
export function friendlyError(err, fallback = '操作没能完成，请稍后再试') {
  const raw = (err && (err.message || err.reason)) ? (err.message || err.reason) : err;
  const msg = String(raw == null ? '' : raw).trim();
  if (!msg) return fallback;

  // 已经是给用户看的中文，直接用
  if (/[\u4e00-\u9fff]/.test(msg)) return msg;

  const t = msg.toLowerCase();
  if (t.includes('unexpected token') || t.includes('json') || t.includes('parse')) {
    return '文件内容不是有效的 JSON，请确认选的是关卡包文件';
  }
  if (t.includes('failed to fetch') || t.includes('networkerror')
      || t.includes('load failed') || t.includes('network request failed')) {
    return '连不上服务器：可能没联网，或者本地服务没有启动';
  }
  if (t.includes('timeout') || t.includes('timed out')) {
    return '请求超时了，检查一下网络再试一次';
  }
  if (t.includes('quota') || t.includes('exceeded')) {
    return '本机存储空间不够了，清理一下浏览器数据再试';
  }
  if (t.includes('securityerror') || t.includes('cors') || t.includes('cross-origin')) {
    return '浏览器安全策略拦住了。请通过本地服务或线上地址打开，不要直接双击网页文件';
  }
  if (t.includes('notallowederror') || t.includes('permission')) {
    return '浏览器没有给这个权限，换个方式再试一次';
  }
  if (t.includes('aborterror')) {
    return '操作被取消了';
  }
  if (t.includes('401') || t.includes('unauthorized') || t.includes('invalid api key')) {
    return 'API Key 不对或已失效，去「设置 → AI 批改」重新填一次';
  }
  if (t.includes('402') || t.includes('insufficient') || t.includes('balance')) {
    return 'API 账户余额不足了，充值后再试';
  }
  if (t.includes('429') || t.includes('rate limit')) {
    return '调用太频繁了，等一会儿再试';
  }
  if (t.includes('50') && /\b5\d\d\b/.test(t)) {
    return '服务端出了点问题，等一会儿再试';
  }
  return fallback;
}

/** 技术细节（只用于折叠展示，不做主要提示） */
export function errorDetail(err) {
  const raw = (err && (err.message || err.reason)) ? (err.message || err.reason) : err;
  return String(raw == null ? '' : raw).trim();
}

/* ---------------------------------------------------------------- Toast */

const TOAST_ICON = { ok: '✅', bad: '❌', warn: '⚠️' };

/**
 * 轻提示。
 * cls: '' 普通 | 'ok' 成功 | 'bad' 失败 | 'warn' 警告
 * 失败/警告会带抖动的图标反馈，并多停留一会儿。
 */
export function toast(msg, cls = '') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(box);
  }
  // 最多同时 3 条，多了先清掉最旧的，避免刷屏
  while (box.children.length >= 3) box.removeChild(box.firstChild);

  const icon = TOAST_ICON[cls];
  const t = h('div', { class: `toast ${cls}` },
    icon ? h('span', { class: 'ti', text: icon }) : null,
    h('span', { class: 'tm', html: msg })
  );
  box.appendChild(t);

  const life = (cls === 'bad' || cls === 'warn') ? 4800 : 2400;
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, life);
  return t;
}

/** 成功提示 */
export function toastOk(msg) { return toast(msg, 'ok'); }

/** 失败提示：自动把技术错误翻成中文 */
export function toastError(err, fallback) {
  return toast(friendlyError(err, fallback), 'bad');
}

/* ---------------------------------------------------------------- 选文件（手机兼容） */

/**
 * 打开系统文件选择器，返回用户选中的 File（取消则返回 null）。
 *
 * 两个手机上的坑，都写在这里免得各处再踩：
 *   1) accept 不要卡太死。iOS 的文件选择器认不出 .json 这种扩展名时，
 *      会把所有文件都置灰，用户根本点不动 —— 所以这里默认放开。
 *   2) 输入框不要用 display:none。部分 iOS 版本对隐藏元素不弹选择器，
 *      改成移到屏幕外，兼容性最好。
 */
export function pickFile(opts = {}) {
  return new Promise((resolve) => {
    const input = h('input', {
      type: 'file',
      accept: opts.accept || '*/*',
      style: {
        position: 'fixed', left: '-9999px', top: '0',
        width: '1px', height: '1px', opacity: '0',
      },
    });
    if (opts.multiple) input.multiple = true;
    document.body.appendChild(input);

    let done = false;
    const finish = (file) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => {
      finish((input.files && input.files[0]) || null);
    });
    // 用户点了取消：现代浏览器不一定给事件，交给下面的兜底
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener('focus', () => {
      setTimeout(() => { if (!input.files || !input.files.length) finish(null); }, 800);
    }, { once: true });

    input.click();
  });
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
    // 换行要保留：这些提示大多是多行的（合并明细、错误原因），
    // 挤成一坨看着很糟
    h('p', { class: 'dim', style: { whiteSpace: 'pre-line', lineHeight: '1.75' }, text: message }),
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
