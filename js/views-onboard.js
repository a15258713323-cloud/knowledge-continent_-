/* A1 启动引导页 */

import { h, toast } from './ui.js';
import { get, set } from './store.js';
import { stages, packSummary, checkUpdate, downloadUpdate } from './data.js';

export function viewOnboard() {
  const sum = packSummary();
  const st = stages()[0] || {};
  const normals = (st.levels || []).filter((l) => (l.role || 'normal') === 'normal');

  const input = h('input', {
    class: 'inp',
    type: 'text',
    maxlength: '12',
    placeholder: '输入你的冒险者昵称',
    value: get().playerName || '',
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });

  function start() {
    const name = input.value.trim() || 'AI冒险者';
    set({ playerName: name });
    location.hash = '#/map';
  }

  const btn = h('button', { class: 'btn', text: '⚔️ 踏入大陆', onclick: start });

  const checkBtn = h('button', {
    class: 'tiny-btn',
    text: '🔄 检查更新',
    onclick: async () => {
      checkBtn.disabled = true;
      checkBtn.textContent = '检查中…';
      const r = await checkUpdate();
      checkBtn.disabled = false;
      checkBtn.textContent = '🔄 检查更新';
      if (!r.ok) { toast('无法连接更新源，当前使用本地关卡包', ''); return; }
      if (!r.hasUpdate) { toast(`已是最新版本 v${r.local}`, 'ok'); return; }
      const s = r.summary || {};
      if (confirm(`发现新版本 v${r.remote}（当前 v${r.local}）\n` +
        `大陆 ${s.stages || '-'} / 关卡 ${s.levels || '-'} / 知识点 ${s.points || '-'} / 题目 ${s.quizzes || '-'}\n\n是否立即更新？`)) {
        try {
          const ns = await downloadUpdate(r.url);
          toast(`更新完成：v${ns.version}`, 'ok');
          setTimeout(() => location.reload(), 900);
        } catch (e) {
          toast(`更新失败：${e.message}`, '');
        }
      }
    },
  });

  const node = h('div', { class: 'onboard' },
    h('div', { class: 'logo', text: '🌌' }),
    h('h1', { text: '知识大陆' }),
    h('p', { class: 'dim small', style: { margin: '0' }, text: '从大纲到掌握，一路闯关' }),
    h('div', { class: 'divider', style: { width: '62%', margin: '24px auto' } }),
    h('p', { class: 'faint tiny', style: { margin: '0 0 12px' }, text: '你即将进入' }),
    h('div', { class: 'card', style: { textAlign: 'left' } },
      h('div', { class: 'row' },
        h('div', { class: 'cont-emoji', text: st.icon || '🏕️' }),
        h('div', { style: { flex: '1', minWidth: '0' } },
          h('div', { style: { fontSize: '15px', fontWeight: '700' }, text: st.name || '未命名大陆' }),
          h('div', { class: 'dim tiny', style: { marginTop: '3px' },
            text: `${normals.length} 关 · ${sum.points} 个知识点 · ${sum.quizzes} 题` })
        )
      )
    ),
    h('div', { style: { height: '22px' } }),
    input,
    h('div', { style: { height: '14px' } }),
    btn,
    h('div', { style: { height: '26px' } }),
    h('div', { class: 'row', style: { justifyContent: 'center', gap: '8px', flexWrap: 'wrap' } },
      h('span', { class: 'tag mute', text: `📦 关卡包 v${sum.version}` }),
      checkBtn
    ),
    h('div', { class: 'tiny faint', style: { marginTop: '18px', lineHeight: '1.7' } },
      '装好后完全离线可用：讲解、答题、进度、错题本全部存在本机。'
    )
  );

  return { node, wide: false };
}
