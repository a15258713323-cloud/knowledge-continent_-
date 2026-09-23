/* ============================================================================
 * 应用入口 —— 启动、路由、页面装配
 * ========================================================================== */

import { load, get, subscribe } from './store.js';
import { loadPack, applyStageColors, stages, levelById, getIndex } from './data.js';
import { startThemeWatcher, applyTheme } from './theme.js';
import { friendlyError, errorDetail } from './ui.js';

import { viewOnboard } from './views-onboard.js';
import { viewMap } from './views-map.js';
import { viewStage } from './views-stage.js';
import { viewStudy } from './views-study.js';
import { viewQuiz } from './views-quiz.js';
import { viewResult } from './views-result.js';
import { viewGraph } from './views-graph.js';
import { viewWrong } from './views-wrong.js';
import { viewProfile } from './views-profile.js';
import { viewAchievements } from './views-achievements.js';
import { viewSettings } from './views-settings.js';
import { viewCheatSheet } from './views-cheatsheet.js';

const root = document.getElementById('root');

/* ---------------------------------------------------------------- 路由表 */

const ROUTES = [
  { p: ['onboard'], fn: viewOnboard },
  { p: ['map'], fn: viewMap },
  { p: ['stage', ':stageId'], fn: viewStage },
  { p: ['study', ':levelId', ':pointIndex'], fn: viewStudy },
  { p: ['quiz', ':levelId'], fn: viewQuiz },
  { p: ['result', ':levelId'], fn: viewResult },
  { p: ['graph'], fn: viewGraph },
  { p: ['wrong'], fn: viewWrong },
  { p: ['profile'], fn: viewProfile },
  { p: ['achievements'], fn: viewAchievements },
  { p: ['settings'], fn: viewSettings },
  { p: ['cheatsheet'], fn: viewCheatSheet },
];

function matchRoute(seg) {
  for (const r of ROUTES) {
    if (r.p.length !== seg.length) continue;
    const params = {};
    let ok = true;
    r.p.forEach((key, i) => {
      if (key.startsWith(':')) params[key.slice(1)] = decodeURIComponent(seg[i]);
      else if (key !== seg[i]) ok = false;
    });
    if (ok) return { fn: r.fn, params };
  }
  return null;
}

/* ---------------------------------------------------------------- 渲染 */

let currentCleanup = null;

/**
 * 错误页。
 *
 * 主要位置给人话，技术细节折叠起来（用户不需要看堆栈，
 * 但真出问题时又得有地方能翻出来）。
 */
function renderError(err, hint) {
  root.innerHTML = '';

  const friendly = friendlyError(err, '页面出了点问题，刷新一下再试');
  const detail = errorDetail(err);

  const retry = el('button', 'btn', '重新加载');
  retry.onclick = () => location.reload();

  const kids = [
    el('div', 'e', '😵'),
    el('div', null, '出了点问题'),
    el('div', 'tiny', friendly),
  ];
  if (hint) kids.push(el('div', 'tiny faint', hint));

  if (detail && detail !== friendly) {
    const box = el('div', 'err-detail');
    box.style.display = 'none';
    box.textContent = detail;

    const toggle = el('button', 'link-btn', '查看技术细节');
    toggle.onclick = () => {
      const show = box.style.display === 'none';
      box.style.display = show ? 'block' : 'none';
      toggle.textContent = show ? '收起技术细节' : '查看技术细节';
    };
    const actions = div('err-actions', {}, retry, toggle);
    kids.push(actions, box);
  } else {
    kids.push(div('err-actions', {}, retry));
  }

  root.appendChild(div('empty', {}, kids));
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function div(cls, _p, ...kids) {
  const n = el('div', cls);
  kids.flat().filter(Boolean).forEach((k) => n.appendChild(k));
  return n;
}

function render() {
  const raw = location.hash.replace(/^#/, '') || '/map';
  const qi = raw.indexOf('?');
  const path = qi >= 0 ? raw.slice(0, qi) : raw;
  const query = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
  const seg = path.split('/').filter(Boolean);

  // 未设置昵称 → 强制引导页
  if (!get().playerName && seg[0] !== 'onboard') {
    location.replace('#/onboard');
    return;
  }

  const hit = matchRoute(seg);
  if (!hit) { location.replace('#/map'); return; }
  hit.params.query = query;

  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (e) { /* ignore */ }
    currentCleanup = null;
  }

  let out;
  try {
    out = hit.fn(hit.params) || {};
  } catch (e) {
    console.error(e);
    renderError(e, '可以返回地图页继续，或点下面的按钮重新加载。');
    return;
  }

  if (out.cleanup) currentCleanup = out.cleanup;

  // 切换大陆主题色
  if (out.stage) applyStageColors(out.stage);
  else {
    const first = stages()[0];
    if (first) applyStageColors(first);
  }

  root.innerHTML = '';
  root.style.maxWidth = out.wide ? '100%' : '720px';
  if (out.fragments) {
    out.fragments.forEach((f) => root.appendChild(f));
  } else {
    if (out.header) root.appendChild(out.header);
    const main = el('div', 'main');
    main.appendChild(out.node);
    root.appendChild(main);
    if (out.nav) root.appendChild(out.nav);
  }

  // 滚动到主内容区顶部
  const main = root.querySelector('.main');
  if (main) main.scrollTop = 0;
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------- 启动 */

async function boot() {
  load();
  applyTheme();

  root.innerHTML = '';
  const loading = div('empty', {}, el('div', 'e', '🌌'), el('div', null, '正在加载关卡包…'));
  root.appendChild(loading);

  try {
    await loadPack();
  } catch (e) {
    console.error(e);
    renderError(e, '浏览器可玩版要通过本地服务或线上地址打开，不要直接双击 index.html'
      + '（见 启动游戏.bat）。');
    return;
  }

  const ix = getIndex();
  console.log('[知识大陆] 关卡包已加载：',
    ix.stages.length, '块大陆 /', ix.levels.length, '关 /',
    ix.levels.reduce((n, l) => n + l.stats.quizzes, 0), '题');

  startThemeWatcher(() => { /* 主题变化时 CSS 变量自动生效 */ });

  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/map';
  render();
}

boot();

/* ---------------------------------------------------------------- 全局错误兜底 */

window.addEventListener('error', (e) => {
  console.error('[知识大陆] 运行时错误', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[知识大陆] Promise 错误', e.reason);
});
