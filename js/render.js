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
    } else if (t === 'bold') {
      frag.appendChild(el('b', null, text));
    } else if (t === 'italic') {
      frag.appendChild(el('i', null, text));
    } else if (t === 'underline') {
      frag.appendChild(el('u', null, text));
    } else {
      // 普通文本里的换行
      const parts = text.split('\n');
      parts.forEach((p, i) => {
        if (i > 0) frag.appendChild(document.createElement('br'));
        if (p) frag.appendChild(document.createTextNode(p));
      });
    }
  });
  return frag;
}

export function spansText(spans) {
  return (spans || []).map((s) => s.s || '').join('');
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
