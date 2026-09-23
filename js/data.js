/* ============================================================================
 * 关卡包加载与索引
 * 对应《03_技术设计文档.md》§4.4 数据契约
 * ========================================================================== */

import { getPackOverride, setPackOverride, clearPackOverride } from './store.js';

/**
 * 关卡包所在目录的候选路径。
 *
 * 为什么要两个候选：
 *   本地开发时目录是  knowledge_continent_app/game/  +  /packs/
 *     → 从 game/ 看，关卡包在  ../packs/
 *   部署到 GitHub Pages 时会把 game/ 里的文件摊到仓库根目录
 *     → 从根目录看，关卡包在  ./packs/
 * 同一份代码要在这两种布局下都能跑，所以启动时依次探测，谁通用谁。
 */
const PACK_BASE_CANDIDATES = ['../packs/', './packs/'];

let packBase = null;

/** 探测关卡包目录，结果缓存在内存里 */
export async function resolvePackBase() {
  if (packBase) return packBase;
  for (const base of PACK_BASE_CANDIDATES) {
    try {
      const res = await fetch(`${base}manifest.json`, { method: 'GET', cache: 'no-cache' });
      if (res.ok) { packBase = base; return base; }
    } catch (e) {
      // 探测失败就试下一个
    }
  }
  // 都探测不到时用第一个（后续 fetch 会给出明确报错）
  packBase = PACK_BASE_CANDIDATES[0];
  return packBase;
}

export const THEME_COLORS = {
  green:  ['#34D399', '#0EA5E9'],
  blue:   ['#38BDF8', '#6366F1'],
  orange: ['#FB923C', '#EF4444'],
  purple: ['#A78BFA', '#EC4899'],
  cyan:   ['#22D3EE', '#3B82F6'],
  teal:   ['#2DD4BF', '#14B8A6'],
  indigo: ['#818CF8', '#8B5CF6'],
  red:    ['#F87171', '#F43F5E'],
  gold:   ['#FBBF24', '#F59E0B'],
  pink:   ['#F472B6', '#A855F7'],
  violet: ['#C084FC', '#8B5CF6'],
  slate:  ['#94A3B8', '#64748B'],
  ember:  ['#F87171', '#B91C1C'],
};

export const SCHEMA_VERSION = 1;

let pack = null;
let index = null;

/* ---------------------------------------------------------------- 索引 */

function buildIndex(p) {
  const levels = [];
  const levelById = new Map();
  const pointById = new Map();
  const quizById = new Map();
  const pointsByLevel = new Map();

  (p.stages || []).forEach((stage) => {
    (stage.levels || []).forEach((lv, i) => {
      const lvRef = { ...lv, stage, orderInStage: i, stageId: stage.id };
      levels.push(lvRef);
      levelById.set(lv.id, lvRef);

      const pts = [];
      (lv.points || []).forEach((pt, pi) => {
        const ptRef = { ...pt, levelId: lv.id, stageId: stage.id, orderInLevel: pi, level: lvRef };
        pts.push(ptRef);
        pointById.set(pt.id, ptRef);
        (pt.quizzes || []).forEach((q) => quizById.set(q.id, { ...q, pointId: pt.id, levelId: lv.id }));
      });
      pointsByLevel.set(lv.id, pts);
    });
  });

  // 统计每关的题目数
  levels.forEach((lv) => {
    const pts = pointsByLevel.get(lv.id) || [];
    lv.stats = {
      points: pts.length,
      quizzes: pts.reduce((n, p) => n + (p.quizzes || []).length, 0),
    };
  });

  return {
    levels, levelById, pointById, quizById, pointsByLevel,
    stages: p.stages || [],
    config: p.config || {},
    achievements: p.achievements || [],
    cheatSheet: p.cheatSheet || null,
    meta: p.meta || {},
  };
}

/* ---------------------------------------------------------------- 加载 */

export async function loadPack() {
  // 1) 优先用本地导入的关卡包（手动导入优先级最高，避免被联网版本覆盖）
  const override = getPackOverride();
  if (override) {
    pack = override;
    index = buildIndex(pack);
    return { pack, source: 'imported' };
  }

  // 2) 拉取内置关卡包
  const base = await resolvePackBase();
  const url = `${base}levels.json`;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pack = await res.json();
    index = buildIndex(pack);
    return { pack, source: 'builtin', url };
  } catch (e) {
    throw new Error(`关卡包加载失败（${url}）：${e.message}`);
  }
}

/**
 * 从用户选择的文件导入关卡包。
 *
 * 关卡包只能是 JSON —— 因为它就是这个应用的数据格式（结构见《技术设计文档》§4.4）。
 * 学习资料（HTML / Markdown / PDF 等）不是在这里导入的：
 * 那些要先在电脑端的「出题工作台」里投料、出题、生成关卡包，再把生成的 JSON 拿过来。
 *
 * 这里把校验拆成几步，每一步都给一句正常人看得懂的中文，
 * 而不是把 JSON.parse 的英文报错直接甩给用户。
 */
export async function importPack(file) {
  if (!file) throw new Error('没有选中文件，请重新选一次');

  const name = String(file.name || '');
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';

  if (ext && ext !== '.json') {
    const isMaterial = ['.html', '.htm', '.md', '.markdown', '.txt', '.pdf', '.docx'].includes(ext);
    throw new Error(
      `你选的是「${ext}」文件，这里只能导入 .json 关卡包。\n`
      + (isMaterial
        ? '学习资料不是在这里导入的 —— 请到电脑端用「出题工作台」投料生成关卡包，再拿生成的 .json 来导入。'
        : '请确认选的是关卡包文件。')
    );
  }

  let text;
  try {
    text = await file.text();
  } catch (e) {
    throw new Error('读不到这个文件，可能已损坏或没有访问权限');
  }

  if (!text.trim()) throw new Error('这个文件是空的');

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(
      '这个文件不是有效的 JSON，无法解析。\n'
      + '常见原因：选错了文件、下载没完成、或者被编辑器改坏了。'
    );
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('关卡包应该是一个 JSON 对象，这个文件不是');
  }
  if (!Array.isArray(data.stages)) {
    throw new Error(
      '这是一个 JSON 文件，但不像是关卡包（缺少 stages 字段）。\n'
      + '如果你是从工作台导出的，请选 packs 目录下的 levels.json。'
    );
  }
  if (!data.stages.length) {
    throw new Error('这个关卡包里一块大陆都没有，可能是生成失败了');
  }
  for (const st of data.stages) {
    if (!st || !Array.isArray(st.levels)) {
      throw new Error(`关卡包结构不对：大陆「${(st && st.name) || '未命名'}」缺少 levels 字段`);
    }
  }
  const ver = Number((data.meta && data.meta.schemaVersion) || 0);
  if (ver > SCHEMA_VERSION) {
    throw new Error(
      `这个关卡包的结构版本是 v${ver}，比当前应用支持的 v${SCHEMA_VERSION} 更新。\n`
      + '请先更新应用（在「关卡包」里点检查更新）。'
    );
  }

  setPackOverride(data);
  pack = data;
  index = buildIndex(pack);
  return index;
}

export function useBuiltinPack() {
  clearPackOverride();
}

export function getIndex() {
  if (!index) throw new Error('关卡包尚未加载');
  return index;
}

export function getPack() { return pack; }

export function getConfig(key, fallback) {
  const c = index ? index.config : {};
  return key in c ? c[key] : fallback;
}

/* ---------------------------------------------------------------- 便捷访问 */

export function stages() { return getIndex().stages; }
export function allLevels() { return getIndex().levels; }
export function levelById(id) { return getIndex().levelById.get(id); }
export function pointById(id) { return getIndex().pointById.get(id); }
export function quizById(id) { return getIndex().quizById.get(id); }
export function pointsOfLevel(levelId) { return getIndex().pointsByLevel.get(levelId) || []; }

/** 关卡主题色 */
export function colorsOf(stage) {
  const t = (stage && stage.theme) || 'blue';
  return THEME_COLORS[t] || THEME_COLORS.blue;
}

/** 应用某个大陆的主题色到 CSS 变量 */
export function applyStageColors(stage) {
  const [c1, c2] = colorsOf(stage);
  document.documentElement.style.setProperty('--c1', c1);
  document.documentElement.style.setProperty('--c2', c2);
}

/** 找某关卡在所属大陆里的顺序 */
export function levelOrderInStage(level) {
  const st = level.stage || stages().find((s) => s.id === level.stageId);
  if (!st) return 0;
  return (st.levels || []).findIndex((l) => l.id === level.id);
}

/** 统计信息（用于设置页展示） */
export function packSummary() {
  const ix = getIndex();
  return {
    version: (ix.meta.version || '1.0.0'),
    stages: ix.stages.length,
    levels: ix.levels.length,
    points: ix.levels.reduce((n, l) => n + l.stats.points, 0),
    quizzes: ix.levels.reduce((n, l) => n + l.stats.quizzes, 0),
    schemaVersion: ix.meta.schemaVersion || SCHEMA_VERSION,
  };
}

/* ---------------------------------------------------------------- 检查更新 */

function isNewer(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/**
 * 检查更新。返回 { ok, hasUpdate, remote, local, summary, url }
 * 网络不可用时返回 { ok:false, error }，不抛错（原型文档 A1 的友好降级要求）。
 */
export async function checkUpdate() {
  const local = packSummary().version;
  const base = await resolvePackBase();
  const manifestUrl = `${base}manifest.json`;
  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const mf = await res.json();
    return {
      ok: true,
      hasUpdate: isNewer(mf.version, local),
      remote: mf.version,
      local,
      summary: mf.summary || null,
      url: new URL(mf.levelsUrl || 'levels.json', new URL(manifestUrl, location.href)).href,
    };
  } catch (e) {
    return { ok: false, error: e.message, local };
  }
}

/** 下载远端关卡包并保存为本地覆盖 */
export async function downloadUpdate(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const data = await res.json();
  setPackOverride(data);
  pack = data;
  index = buildIndex(pack);
  return packSummary();
}

/** 取消本地覆盖，回到内置关卡包 */
export function revertToBuiltin() {
  clearPackOverride();
  pack = null;
  index = null;
}
