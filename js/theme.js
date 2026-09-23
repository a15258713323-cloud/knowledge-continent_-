/* ============================================================================
 * 主题控制 —— 白天 / 黑夜 双主题 + 自定义时间自动切换 + 暖色护眼
 * 对应《04_UI设计规范.md》§2.5
 * ========================================================================== */

import { get, setSetting } from './store.js';

/** 把 "HH:MM" 转成当天分钟数 */
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm || '');
  if (!m) return 0;
  return (+m[1]) * 60 + (+m[2]);
}

/** 按当前时间与自定义时间段判断应该用白天还是黑夜 */
export function resolveTheme() {
  const s = get().settings;
  const mode = s.themeMode || 'auto';

  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // auto：按自定义时间段判断，支持跨零点
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const dayStart = toMinutes(s.dayStart || '07:00');
  const nightStart = toMinutes(s.nightStart || '19:00');

  const isDay = dayStart <= nightStart
    ? (cur >= dayStart && cur < nightStart)
    : (cur >= dayStart || cur < nightStart);

  return isDay ? 'light' : 'dark';
}

/**
 * 应用主题到 <html>。
 *
 * 关键处理：切换期间临时加 .theme-switching 禁用过渡。
 * 原因是 Chromium 下「CSS 变量驱动的属性 + transition」会卡在旧值
 * （详见 css/style.css 的 .theme-switching 注释）。加了这个保护，
 * 背景/卡片/文字才会立即跟随主题变化。
 */
export function applyTheme() {
  const s = get().settings;
  const theme = resolveTheme();
  const root = document.documentElement;

  const prevTheme = root.getAttribute('data-theme');
  const prevWarm = root.getAttribute('data-warm');
  const nextWarm = theme === 'light' && s.warm ? '1' : '0';
  const changing = prevTheme !== theme || prevWarm !== nextWarm;

  if (changing) root.classList.add('theme-switching');

  root.setAttribute('data-theme', theme);
  root.setAttribute('data-warm', nextWarm);
  root.setAttribute('data-motion', s.motion === false ? 'off' : 'on');

  // 让浏览器地址栏 / 状态栏配色跟随
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F7F8FC' : '#0A0E1F');

  if (changing) {
    // 强制一次样式重算，确保新值落地，再恢复过渡
    void root.offsetHeight;
    const restore = () => root.classList.remove('theme-switching');
    requestAnimationFrame(restore);
    // 兜底：页面隐藏时 rAF 可能被节流，用定时器保证一定能恢复
    setTimeout(restore, 150);
  }

  return theme;
}

/** 当前主题的中文名，供设置页展示 */
export function themeLabel(mode) {
  return ({
    auto: '按时间自动',
    light: '白天护眼',
    dark: '黑夜护眼',
    system: '跟随系统',
  })[mode] || '按时间自动';
}

let timer = null;

/** 启动定时复查：App 启动时 + 切到前台时 + 停留每 60 秒 */
export function startThemeWatcher(onChange) {
  const tick = () => {
    const before = document.documentElement.getAttribute('data-theme');
    const after = applyTheme();
    if (before !== after && onChange) onChange(after);
  };

  tick();
  if (timer) clearInterval(timer);
  timer = setInterval(tick, 60 * 1000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });

  // 跟随系统模式时，监听系统主题变化
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', tick);
}

export function setThemeMode(mode) {
  setSetting('themeMode', mode);
  applyTheme();
}

export function setTimes(dayStart, nightStart) {
  get().settings.dayStart = dayStart;
  get().settings.nightStart = nightStart;
  applyTheme();
  import('./store.js').then((m) => m.save());
}

export function setWarm(on) {
  setSetting('warm', !!on);
  applyTheme();
}
