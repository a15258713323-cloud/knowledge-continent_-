/* ============================================================================
 * 内容块渲染器 —— 把结构化内容块渲染成 DOM
 * 对应《03_技术设计文档.md》§4.1 与《04_UI设计规范.md》§6
 * ========================================================================== */

const CODE_COLLAPSE_LINES = 20;   // 代码块超过多少行折叠
const TABLE_COLLAPSE_ROWS = 10;   // 表格超过多少行折叠

/** 创建元素 */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* ---------------------------------------------------------------- 行内公式 */

/**
 * 公式识别的「强信号」。
 *
 * 只靠"含字母数字"会把英文单词也当成公式，所以要求出现真正的数学痕迹：
 * 等号、数学运算符、上下标字符、^ 或 _、以及「字母+半角括号」的函数形态。
 */
const MATH_SIGNAL = new RegExp(
  '[=＝]'                                   // 等号
  + '|[Σ√∂∇∫∏∑±×÷·∞≈≠≤≥→←]'                 // 数学运算符
  + '|[\\^_]'                               // 上标/下标写法
  + '|[\\u2070-\\u209f\\u00b2\\u00b3\\u00b9\\u1d40]'   // ² ³ ᵀ ᵢ ⁽ⁱ⁾ 这类
  + '|[A-Za-z]\\s*\\('                      // f(x) 形态
);

// 中文 + 中文标点 + 全角字符 —— 用它们把文本切成「中文段 / 非中文段」
const SPLIT_CJK = /([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+)/;

/** 这个非中文片段看起来是不是公式 */
function looksLikeMath(piece) {
  const t = String(piece || '').trim();
  if (t.length < 2 || t.length > 80) return false;
  if (!/[A-Za-z0-9\u0370-\u03ff]/.test(t)) return false;
  return MATH_SIGNAL.test(t);
}

/** 把一段纯文本按公式切开，公式部分套上数学字体 */
function appendWithMath(frag, text) {
  const parts = String(text).split(SPLIT_CJK);
  for (const p of parts) {
    if (!p) continue;
    if (looksLikeMath(p)) {
      // 首尾空格放在 span 外面，免得公式和相邻文字粘住
      const m = p.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (m[1]) frag.appendChild(document.createTextNode(m[1]));
      if (m[2]) frag.appendChild(el('span', 'fml', m[2]));
      if (m[3]) frag.appendChild(document.createTextNode(m[3]));
    } else {
      frag.appendChild(document.createTextNode(p));
    }
  }
}

/** 独立的公式片段（来自解析层的 math span） */
function mathSpan(text) {
  return el('span', 'fml', text);
}

/* ---------------------------------------------------------------- 行内 span */

/**
 * 渲染 span 数组。
 * 支持行内标记的**嵌套**：内容块里的 span 可能带 mark 字段（bold+code 组合）。
 */
export function renderSpans(spans) {
  const frag = document.createDocumentFragment();
  (spans || []).forEach((s) => {
    const t = s.t || 'text';
    const text = s.s || '';
    if (!text) return;

    if (t === 'code') {
      frag.appendChild(el('code', 'cb-code-inline', text));
    } else if (t === 'sub') {
      frag.appendChild(el('sub', null, text));
    } else if (t === 'sup') {
      frag.appendChild(el('sup', null, text));
    } else if (t === 'math') {
      frag.appendChild(mathSpan(text));
    } else if (t === 'bold') {
      frag.appendChild(el('b', null, text));
    } else if (t === 'italic') {
      frag.appendChild(el('i', null, text));
    } else if (t === 'underline') {
      frag.appendChild(el('u', null, text));
    } else {
      // 普通文本：先按换行拆，再按公式拆
      const parts = text.split('\n');
      parts.forEach((p, i) => {
        if (i > 0) frag.appendChild(document.createElement('br'));
        if (p) appendWithMath(frag, p);
      });
    }
  });
  return frag;
}

/** 给纯文本字符串用（题干、选项、解析这些没有 span 结构的地方） */
export function renderMathText(text) {
  const frag = document.createDocumentFragment();
  appendWithMath(frag, String(text == null ? '' : text));
  return frag;
}

export function spansText(spans) {
  return (spans || []).map((s) => s.s || '').join('');
}

/* ---------------------------------------------------------------- 公式块 */

/**
 * 公式块（教材的 <div class="fm">）。
 *
 * 每行分两类：
 *   label = 公式的说明文字（小字、灰）
 *   expr  = 表达式本体（数学字体、稍大）
 * 长公式不折行、可横向滑动 —— 折了就看不出结构了。
 */
function renderFormula(block) {
  const box = el('div', 'cb-formula');
  (block.lines || []).forEach((ln) => {
    const isLabel = ln.kind === 'label';
    const text = spansText(ln.spans);
    // 表达式行默认不折行（折了看不出结构），但含中文的说明性行要正常折行
    const hasCJK = /[\u4e00-\u9fff]/.test(text);
    const row = el('div', `fml-row ${isLabel ? 'label' : 'expr'}${hasCJK ? ' cjk' : ''}`);
    row.appendChild(renderSpans(ln.spans));
    box.appendChild(row);
  });
  return box;
}

/* ---------------------------------------------------------------- 代码块 */

function renderCode(block) {
  const wrap = el('div', 'cb-code');
  const pre = el('pre');
  pre.textContent = block.text || '';
  wrap.appendChild(pre);

  const btn = el('button', 'copy', '复制');
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(block.text || '');
      btn.textContent = '已复制';
    } catch (e) {
      btn.textContent = '复制失败';
    }
    setTimeout(() => { btn.textContent = '复制'; }, 1400);
  });
  wrap.appendChild(btn);

  const lines = (block.text || '').split('\n').length;
  if (lines > CODE_COLLAPSE_LINES) {
    wrap.classList.add('cb-collapsed');
    const box = el('div', 'cb-toggle');
    const more = el('button', 'tiny-btn accent', `展开全部 ${lines} 行`);
    more.addEventListener('click', () => {
      const collapsed = wrap.classList.toggle('cb-collapsed');
      more.textContent = collapsed ? `展开全部 ${lines} 行` : '收起';
    });
    box.appendChild(more);
    const holder = el('div');
    holder.appendChild(wrap);
    holder.appendChild(box);
    return holder;
  }
  return wrap;
}

/* ---------------------------------------------------------------- 表格 */

function renderTable(block) {
  const wrap = el('div', 'cb-table-wrap');
  const tbl = el('table', 'cb-table');

  if (block.head && block.head.length) {
    const thead = el('thead');
    const tr = el('tr');
    block.head.forEach((cell) => {
      const th = el('th');
      th.appendChild(renderSpans(cell));
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    tbl.appendChild(thead);
  }

  const tbody = el('tbody');
  const rows = block.rows || [];
  rows.forEach((r) => {
    const tr = el('tr');
    r.forEach((cell) => {
      const td = el('td');
      td.appendChild(renderSpans(cell));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);

  if (rows.length > TABLE_COLLAPSE_ROWS) {
    const holder = el('div');
    holder.appendChild(wrap);
    wrap.style.maxHeight = '420px';
    wrap.style.overflowY = 'hidden';

    const box = el('div', 'cb-toggle');
    const more = el('button', 'tiny-btn accent', `展开全部 ${rows.length} 行`);
    let open = false;
    more.addEventListener('click', () => {
      open = !open;
      wrap.style.maxHeight = open ? 'none' : '420px';
      more.textContent = open ? '收起' : `展开全部 ${rows.length} 行`;
    });
    box.appendChild(more);
    holder.appendChild(box);
    return holder;
  }
  return wrap;
}

/* ---------------------------------------------------------------- 主入口 */

/** 把单个内容块渲染成 DOM 节点 */
export function renderBlock(block) {
  const t = block.type;

  if (t === 'heading') {
    const lv = Math.min(4, Math.max(2, block.level || 3));
    const h = el(`h${lv}`, null, block.text || '');
    return h;
  }

  if (t === 'paragraph') {
    const p = el('p');
    p.appendChild(renderSpans(block.spans));
    return p;
  }

  if (t === 'list') {
    const list = el(block.ordered ? 'ol' : 'ul');
    (block.items || []).forEach((item) => {
      const li = el('li');
      li.appendChild(renderSpans(item));
      list.appendChild(li);
    });
    return list;
  }

  if (t === 'table') return renderTable(block);

  if (t === 'code') return renderCode(block);

  if (t === 'callout') {
    const tone = block.tone || 'note';
    const box = el('div', `cb-callout ${tone}`);
    const ico = el('span', 'ico', block.icon || '📝');
    box.appendChild(ico);
    const body = el('span');
    if (block.title) {
      body.appendChild(el('span', 'ttl', block.title));
    }
    body.appendChild(renderSpans(block.spans));
    box.appendChild(body);
    return box;
  }

  if (t === 'grid') {
    const g = el('div', 'cb-grid');
    (block.items || []).forEach((it) => {
      const card = el('div', 'gi');
      if (it.title) card.appendChild(el('span', 'gt', it.title));
      card.appendChild(renderSpans(it.spans));
      g.appendChild(card);
    });
    return g;
  }

  if (t === 'quote') {
    const q = el('div', 'cb-quote');
    q.appendChild(renderSpans(block.spans));
    return q;
  }

  if (t === 'formula') return renderFormula(block);

  if (t === 'divider') return el('div', 'cb-divider');

  // 未知块类型：降级为纯文本，保证不丢内容
  const fallback = el('p', 'dim');
  fallback.textContent = spansText(block.spans) || JSON.stringify(block);
  return fallback;
}

/** 渲染一组内容块 */
export function renderBlocks(blocks) {
  const frag = document.createDocumentFragment();
  (blocks || []).forEach((b) => frag.appendChild(renderBlock(b)));
  return frag;
}

/** 生成内容块的纯文本（用于摘要、搜索） */
export function blocksToText(blocks) {
  const out = [];
  (blocks || []).forEach((b) => {
    const t = b.type;
    if (t === 'heading') out.push(b.text);
    else if (t === 'paragraph' || t === 'callout' || t === 'quote') out.push(spansText(b.spans));
    else if (t === 'list') (b.items || []).forEach((i) => out.push(spansText(i)));
    else if (t === 'table') {
      (b.head || []).forEach((h) => out.push(spansText(h)));
      (b.rows || []).forEach((r) => r.forEach((c) => out.push(spansText(c))));
    } else if (t === 'code') out.push(b.text);
    else if (t === 'grid') (b.items || []).forEach((i) => out.push(`${i.title} ${spansText(i.spans)}`));
  });
  return out.join('\n');
}
