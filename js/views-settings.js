/* A11 设置页 */

import {
  h, topbar, toast, openSheet, closeSheet, confirmDialog, tapable,
} from './ui.js';
import { get, set, setSetting, reset, getPackOverride } from './store.js';
import {
  packSummary, checkUpdate, downloadUpdate, importPack,
  revertToBuiltin, stages,
} from './data.js';
import { applyTheme, resolveTheme, themeLabel } from './theme.js';

export function viewSettings() {
  const s = get();
  const sum = packSummary();
  const usingImport = !!getPackOverride();

  const node = h('div', { class: 'pad', style: { paddingTop: '16px' } });

  /* ================= 关卡包 ================= */
  node.appendChild(h('div', { class: 'sec-title', style: { paddingTop: '0' } }, '📦 关卡包'));
  node.appendChild(h('div', { class: 'groupcard' },
    row('🏷️', '当前版本', `v${sum.version}${usingImport ? '（已导入）' : ''}`),
    row('🗺️', '大陆 / 关卡', `${sum.stages} / ${sum.levels}`),
    row('📚', '知识点 / 题目', `${sum.points} / ${sum.quizzes}`),
    tapRow('🔄', '检查更新', '', async (el) => {
      el.querySelector('.v').textContent = '检查中…';
      const r = await checkUpdate();
      if (!r.ok) {
        el.querySelector('.v').textContent = '';
        toast('无法连接更新源（未联网或未部署），当前使用本地关卡包', '');
        return;
      }
      el.querySelector('.v').textContent = `v${r.remote}`;
      if (!r.hasUpdate) { toast(`已是最新版本 v${r.local}`, 'ok'); return; }
      const sm = r.summary || {};
      confirmDialog('发现新版本',
        `远端 v${r.remote}（当前 v${r.local}）\n` +
        `关卡 ${sm.levels || '-'} · 知识点 ${sm.points || '-'} · 题目 ${sm.quizzes || '-'}\n\n是否更新？`,
        async () => {
          try {
            const ns = await downloadUpdate(r.url);
            toast(`更新完成：v${ns.version}`, 'ok');
            setTimeout(() => location.reload(), 900);
          } catch (e) { toast(`更新失败：${e.message}`, ''); }
        }, '立即更新');
    }),
    tapRow('📂', '从文件导入关卡包', '', () => pickFile()),
    usingImport ? tapRow('↩️', '恢复内置关卡包', '', (el) => {
      confirmDialog('恢复内置关卡包',
        '将丢弃已导入的关卡包，回到应用自带的版本。学习进度不受影响。',
        () => { revertToBuiltin(); toast('已恢复内置关卡包', 'ok'); setTimeout(() => location.reload(), 700); },
        '恢复');
    }, 'danger') : null
  ));

  /* ================= 显示 ================= */
  node.appendChild(h('div', { class: 'sec-title' }, '🌗 显示'));
  const themeGroup = h('div', { class: 'groupcard' });
  themeGroup.appendChild(tapRow('🌓', '显示模式', themeLabel(s.settings.themeMode), (el) => {
    openSheet({
      title: '显示模式',
      body: h('div', null,
        h('div', { class: 'tiny faint', style: { marginBottom: '12px' } },
          `当前生效：${resolveTheme() === 'light' ? '☀️ 白天护眼' : '🌙 黑夜护眼'}`),
        ['auto', 'light', 'dark', 'system'].map((k) => tapable(h('div', {
          class: 'setrow tap',
          style: { borderBottom: '1px solid var(--line)' },
        },
          h('span', { style: { flex: '1' }, text: themeLabel(k) }),
          s.settings.themeMode === k ? h('span', { style: { color: 'var(--ok)' }, text: '✓' }) : null
        ), () => {
          setSetting('themeMode', k);
          applyTheme();
          closeSheet();
          const v = el.querySelector('.v');
          if (v) v.textContent = themeLabel(k);
          toast(`已切换到「${themeLabel(k)}」`, 'ok');
        }, themeLabel(k)))
      ),
    });
  }));
  themeGroup.appendChild(row('🕐', '自动切换时间',
    `${s.settings.dayStart} / ${s.settings.nightStart}`, null, timeEditor()));
  themeGroup.appendChild(switchRow('🌤️', '暖色护眼', s.settings.warm, (on) => {
    setSetting('warm', on);
    applyTheme();
    toast(on ? '已开启暖色护眼（白天模式生效）' : '已关闭暖色护眼', '');
  }));
  themeGroup.appendChild(switchRow('🎬', '减少动效', s.settings.motion === false, (on) => {
    setSetting('motion', !on);   // on = 减少动效开启 → motion = false
    applyTheme();
  }));
  themeGroup.appendChild(switchRow('⏩', '答对自动下一题', s.settings.autoNext, (on) => {
    setSetting('autoNext', on);
  }));
  node.appendChild(themeGroup);

  /* ================= AI 批改 ================= */
  const hasKey = !!(s.settings.apiKey || '').trim();
  node.appendChild(h('div', { class: 'sec-title' }, '🤖 AI 批改（主观题）'));
  node.appendChild(h('div', { class: 'groupcard' },
    row('☁️', '服务商', 'DeepSeek'),
    tapRow('🔑', 'API Key', hasKey ? maskKey(s.settings.apiKey) : '未配置', (el) => {
      editApiKey(el);
    }),
    row('📶', '状态', hasKey ? '✅ 已配置' : '○ 未配置',
      hasKey ? 'var(--ok)' : null)
  ));
  node.appendChild(h('div', { class: 'tiny faint', style: { padding: '8px 2px 0', lineHeight: '1.7' } },
    '不填也能用：主观题会降级为本地关键词评分，且主观题本就不计入通关分数。',
    h('br'),
    'Key 只存在本机浏览器里，不会上传到任何服务器。'
  ));

  /* ================= 其他 ================= */
  node.appendChild(h('div', { class: 'sec-title' }, '⚙️ 其他'));
  node.appendChild(h('div', { class: 'groupcard' },
    switchRow('🔔', '音效 / 震动', s.settings.sfx, (on) => { setSetting('sfx', on); }),
    tapRow('✏️', '修改昵称', get().playerName || '', () => editName()),
    tapRow('⚠️', '清除全部进度', '', () => {
      confirmDialog('清除全部进度',
        '将清空等级、经验、星星、通关记录、错题本、成就与打卡。此操作不可恢复！',
        () => { reset(); toast('已清空，正在重开…', ''); setTimeout(() => location.replace('#/onboard'), 700); },
        '确定清空');
    }, 'danger'),
    tapRow('🔄', '重开冒险（保留进度）', '', () => { location.replace('#/onboard'); })
  ));

  node.appendChild(h('div', { class: 'tiny faint', style: { textAlign: 'center', padding: '20px 0 8px', lineHeight: '1.8' } },
    `知识大陆 · 浏览器可玩版`,
    h('br'),
    `关卡包 v${sum.version} · 结构版本 v${sum.schemaVersion}`
  ));

  /* ---------------- 局部组件 ---------------- */

  function row(ic, label, value, color) {
    return h('div', { class: 'setrow' },
      h('span', { class: 'ic', text: ic }),
      h('span', { style: { flex: '1' }, text: label }),
      h('span', { class: 'v', style: color ? { color } : {}, text: value })
    );
  }

  function tapRow(ic, label, value, onclick, danger) {
    const el = h('div', { class: `setrow tap ${danger ? 'danger' : ''}` },
      h('span', { class: 'ic', text: ic }),
      h('span', { style: { flex: '1' }, text: label }),
      h('span', { class: 'v', text: value }),
      h('span', { class: 'arw', text: '›' })
    );
    return tapable(el, () => onclick(el), label);
  }

  function switchRow(ic, label, value, onchange) {
    const sw = h('span', { class: `sw ${value ? 'on' : ''}` });
    const el = h('div', { class: 'setrow tap' },
      h('span', { class: 'ic', text: ic }),
      h('span', { style: { flex: '1' }, text: label }),
      sw
    );
    return tapable(el, () => {
      const on = !sw.classList.contains('on');
      sw.classList.toggle('on', on);
      onchange(on);
    }, label);
  }

  function timeEditor() {
    const dayIn = h('input', {
      type: 'time', value: s.settings.dayStart,
      style: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '6px', width: '110px' },
    });
    const nightIn = h('input', {
      type: 'time', value: s.settings.nightStart,
      style: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '6px', width: '110px' },
    });
    const apply = () => {
      setSetting('dayStart', dayIn.value);
      setSetting('nightStart', nightIn.value);
      applyTheme();
    };
    dayIn.addEventListener('change', apply);
    nightIn.addEventListener('change', apply);
    return h('div', { class: 'row', style: { gap: '8px' } }, dayIn, nightIn);
  }

  function editApiKey(el) {
    const inp = h('input', {
      class: 'blank-input', type: 'password',
      placeholder: 'sk-...',
      value: s.settings.apiKey || '',
    });
    const baseInp = h('input', {
      class: 'blank-input', type: 'text',
      value: s.settings.apiBase || 'https://api.deepseek.com',
    });
    const body = h('div', null,
      h('div', { class: 'lb', text: 'DeepSeek API Key' }),
      inp,
      h('div', { class: 'lb', style: { marginTop: '12px' }, text: '接口地址' }),
      baseInp,
      h('div', { class: 'tiny faint', style: { marginTop: '12px', lineHeight: '1.7' } },
        '只保存在本机浏览器，用于主观解答题的 AI 批改。留空则使用本地关键词评分。'),
      h('div', { style: { height: '16px' } }),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn ghost', text: '清空',
          onclick: () => {
            setSetting('apiKey', '');
            closeSheet();
            const v = el.querySelector('.v');
            if (v) v.textContent = '未配置';
            toast('已清空 API Key', '');
            location.reload();
          },
        }),
        h('button', {
          class: 'btn', text: '保存',
          onclick: () => {
            setSetting('apiKey', inp.value.trim());
            setSetting('apiBase', baseInp.value.trim() || 'https://api.deepseek.com');
            closeSheet();
            const v = el.querySelector('.v');
            if (v) v.textContent = inp.value.trim() ? maskKey(inp.value.trim()) : '未配置';
            toast('已保存', 'ok');
            setTimeout(() => location.reload(), 500);
          },
        })
      )
    );
    openSheet({ title: 'AI 批改设置', body });
  }

  function editName() {
    const inp = h('input', { class: 'blank-input', type: 'text', maxlength: '12', value: get().playerName || '' });
    const body = h('div', null,
      inp,
      h('div', { style: { height: '16px' } }),
      h('button', {
        class: 'btn', text: '保存',
        onclick: () => {
          set({ playerName: inp.value.trim() || 'AI冒险者' });
          closeSheet();
          toast('已修改昵称', 'ok');
          location.reload();
        },
      })
    );
    openSheet({ title: '修改昵称', body });
  }

  function pickFile() {
    const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    document.body.appendChild(file);
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.remove();
      if (!f) return;
      try {
        await importPack(f);
        toast('关卡包导入成功，正在重新加载…', 'ok');
        setTimeout(() => location.reload(), 900);
      } catch (e) {
        toast(`导入失败：${e.message}`, '');
      }
    });
    file.click();
  }

  return {
    header: topbar('⚙️ 设置', { onBack: () => { location.hash = '#/profile'; } }),
    node,
    nav: null,
    stage: stages()[0],
  };
}

function maskKey(k) {
  const t = String(k || '');
  if (t.length <= 8) return 'sk-****';
  return `${t.slice(0, 5)}****${t.slice(-4)}`;
}
