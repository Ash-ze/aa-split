import './style.css';
import { parseAmount, money, parseWeight, toInput, currencyOf, CURRENCIES, DEFAULT_CURRENCY } from './money.js';
import { splitExpense, summarize } from './settle.js';
import { shareUrl, decodeLedger } from './share.js';
import { loadLedgers, saveLedgers, loadTheme, saveTheme } from './store.js';
import { renderSettlementImage } from './image.js';
import { settlementText } from './report.js';
import { todayISO, cnDate, dayLabel, groupByDay } from './dates.js';
import { CATEGORIES, categoryLabel } from './categories.js';
import { buildDemoLedger } from './demo.js';
import { newId } from './id.js';
import { esc, icon, openSheet, ask, confirmDanger, promptText, toast, copyText } from './ui.js';

const MODE_LABEL = { equal: '均分', shares: '按份数', exact: '指定金额' };
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };
const LONG_LINK = 1800; // 超过此长度提示：部分聊天软件可能截断，二维码也会很密

const state = {
  ledgers: loadLedgers(),
  theme: loadTheme(),
};

const app = document.getElementById('app');

/* ---------- 工具 ---------- */

function persist() {
  if (!saveLedgers(state.ledgers)) toast('保存失败：浏览器存储不可用');
}

function getLedger(id) {
  return state.ledgers.find((l) => l.id === id);
}

function touch(ledger) {
  ledger.updatedAt = Date.now();
  state.ledgers.sort((a, b) => b.updatedAt - a.updatedAt);
  persist();
}

function memberName(ledger, id) {
  return ledger.members.find((m) => m.id === id)?.name ?? '已删除成员';
}

/** 按账本币种格式化金额 */
function fmt(l, minor) {
  return money(minor, l.currency);
}

function relTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function splitNames(text) {
  return text
    .split(/[\s,，、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeSummary(ledger) {
  try {
    return summarize(ledger);
  } catch {
    const total = ledger.expenses.reduce((a, e) => a + e.amount, 0);
    return { balances: [], transfers: [], payments: [], progress: { done: 0, count: 0 }, total, error: true };
  }
}

/* ---------- 主题 ---------- */

function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = state.theme;
  const dark = state.theme === 'dark' || (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#101216' : '#f5f6f8'));
}

function themeIcon() {
  return icon(state.theme === 'auto' ? 'auto' : state.theme === 'light' ? 'sun' : 'moon');
}

/* ---------- 路由 ---------- */

function parseRoute() {
  const h = location.hash.slice(1);
  if (h.startsWith('s=')) return { view: 'import', data: h.slice(2) };
  const m = /^\/l\/([\w-]+)(?:\/(settle|members))?$/.exec(h);
  if (m) return { view: 'ledger', id: m[1], tab: m[2] || 'expenses' };
  return { view: 'home' };
}

function go(hash, replace = false) {
  if (replace) {
    history.replaceState(null, '', hash);
    render();
  } else if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  const r = parseRoute();
  if (r.view === 'import') return handleImport(r.data);
  if (r.view === 'ledger') {
    const l = getLedger(r.id);
    if (!l) {
      toast('账本不存在');
      return go('#/', true);
    }
    app.innerHTML = renderLedger(l, r.tab);
    document.title = `${l.name} · AA 分账 · AA Split`;
  } else {
    app.innerHTML = renderHome();
    document.title = 'AA 分账 · AA Split';
  }
  window.scrollTo(0, 0);
}

/* ---------- 首页 ---------- */

function renderHome() {
  const list = state.ledgers
    .map((l) => {
      const total = l.expenses.reduce((a, e) => a + e.amount, 0);
      return `
      <a class="card ledger-card" href="#/l/${l.id}">
        <div class="ledger-card-main">
          <div class="ledger-card-name">${esc(l.name)}</div>
          <div class="ledger-card-meta">${l.members.length} 人 · ${l.expenses.length} 笔 · ${relTime(l.updatedAt)}</div>
          <div class="avatars">${l.members.slice(0, 6).map((m) => avatar(m.name)).join('')}${l.members.length > 6 ? `<span class="avatar more">+${l.members.length - 6}</span>` : ''}</div>
        </div>
        <div class="ledger-card-total"><small>总支出</small><strong>${fmt(l, total)}</strong></div>
      </a>`;
    })
    .join('');

  return `
    <header class="topbar">
      <div class="brand"><img src="./icon.svg" alt="" width="28" height="28" /> AA 分账 · AA Split</div>
      <button class="icon-btn" data-action="theme" aria-label="主题：${THEME_LABEL[state.theme]}" title="主题：${THEME_LABEL[state.theme]}">${themeIcon()}</button>
    </header>
    <main class="page">
      ${
        state.ledgers.length
          ? `<h2 class="section-title">我的账本</h2><div class="stack">${list}</div>
             <button class="btn primary block lg" data-action="new-ledger">${icon('plus', 20)} 新建账本</button>`
          : `<section class="hero">
              <div class="hero-emoji">🍲 🚄 🏠</div>
              <h1>一起花的钱，轻松算清</h1>
              <p>聚餐、旅行、合租都适用。记下谁付了多少，自动算出最少的转账方案，一键生成结算图发到群里。</p>
              <ul class="hero-points">
                <li>${icon('check', 18)} 无需注册，数据只存在本机浏览器</li>
                <li>${icon('check', 18)} 均分、按份数、指定金额都支持</li>
                <li>${icon('check', 18)} 链接或二维码即可分享整个账本</li>
              </ul>
            </section>
            <button class="btn primary block lg" data-action="new-ledger">${icon('plus', 20)} 新建账本</button>
            <button class="btn block lg demo-btn" data-action="demo">${icon('book', 20)} 先看看示例账本</button>`
      }
      <p class="foot-note">数据仅保存在当前浏览器中，清除浏览器数据会丢失账本；可用分享链接备份。</p>
    </main>`;
}

const AVATAR_COLORS = ['#12a37f', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
function avatar(name, cls = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const c = AVATAR_COLORS[h % AVATAR_COLORS.length];
  // 中文名取最后一个字（如「张三」->「三」），英文名取首字母
  const chars = [...name.trim()];
  const ch = /^[a-z]/i.test(chars[0] || '') ? chars[0].toUpperCase() : chars.at(-1) || '?';
  return `<span class="avatar ${cls}" style="--c:${c}" aria-hidden="true">${esc(ch)}</span>`;
}

/* ---------- 账本页 ---------- */

function renderLedger(l, tab) {
  const total = l.expenses.reduce((a, e) => a + e.amount, 0);
  const tabs = [
    ['expenses', '账目', `#/l/${l.id}`],
    ['settle', '结算', `#/l/${l.id}/settle`],
    ['members', '成员', `#/l/${l.id}/members`],
  ];
  const body = tab === 'settle' ? renderSettle(l) : tab === 'members' ? renderMembers(l) : renderExpenses(l);
  const cur = l.currency && l.currency !== DEFAULT_CURRENCY ? ` · ${currencyOf(l.currency).name}` : '';
  return `
    <header class="topbar">
      <a class="icon-btn" href="#/" aria-label="返回">${icon('back')}</a>
      <h1 class="topbar-title">${esc(l.name)}</h1>
      <button class="icon-btn" data-action="ledger-menu" aria-label="更多操作">${icon('more')}</button>
    </header>
    <main class="page ${tab === 'expenses' ? 'has-fab' : ''}">
      <section class="summary">
        <div class="summary-main">
          <div class="summary-label">总支出${cur}</div>
          <div class="summary-total" data-testid="total">${fmt(l, total)}</div>
        </div>
        <div class="summary-meta">
          <span>${l.expenses.length} 笔 · ${l.members.length} 人</span>
          <span>人均 ${fmt(l, l.members.length ? Math.round(total / l.members.length) : 0)}</span>
        </div>
      </section>
      <nav class="tabs" role="tablist">
        ${tabs.map(([k, label, href]) => `<a role="tab" href="${href}" class="${tab === k ? 'active' : ''}" aria-selected="${tab === k}">${label}</a>`).join('')}
      </nav>
      ${body}
    </main>
    ${tab === 'expenses' ? `<button class="fab" data-action="add-expense">${icon('plus', 22)} 记一笔</button>` : ''}`;
}

function renderExpenses(l) {
  if (!l.expenses.length) {
    return `<div class="empty"><div class="empty-emoji">🧾</div><p>还没有账目</p><small>谁先付了钱，就记一笔吧</small>
      <button class="btn primary empty-cta" data-action="add-expense">${icon('plus', 18)} 记第一笔</button></div>`;
  }
  const today = todayISO();
  return groupByDay(l.expenses)
    .map(
      (g) => `
      <div class="group-head" data-testid="day"><span>${dayLabel(g.date, today)}</span><span>${g.items.length} 笔 · <b>${fmt(l, g.total)}</b></span></div>
      <div class="card list">
        ${g.items.map((e) => expenseRow(l, e)).join('')}
      </div>`,
    )
    .join('');
}

function expenseRow(l, e) {
  let n = 0;
  try {
    n = splitExpense(e, l.members.map((m) => m.id)).size;
  } catch {}
  const how = e.split.mode === 'equal' ? (n === l.members.length ? '全员均分' : `${n} 人均分`) : `${n} 人${MODE_LABEL[e.split.mode]}`;
  return `
    <button class="row expense-row" data-action="edit-expense" data-id="${e.id}">
      <span class="emoji-badge">${esc(e.emoji || '💰')}</span>
      <span class="row-main">
        <span class="row-title">${esc(expenseTitle(e))}</span>
        <span class="row-sub">${esc(memberName(l, e.payer))} 付款 · ${how}</span>
      </span>
      <span class="row-amount">${fmt(l, e.amount)}</span>
    </button>`;
}

function expenseTitle(e) {
  return e.note || categoryLabel(e.emoji) || '未备注';
}

function renderSettle(l) {
  if (!l.expenses.length) {
    return `<div class="empty"><div class="empty-emoji">🧮</div><p>记账后这里会显示结算方案</p>
      <a class="btn empty-cta" href="#/l/${l.id}">去记账</a></div>`;
  }
  const s = safeSummary(l);
  if (s.error) return `<div class="empty"><p>账目数据有误，无法结算</p></div>`;
  const { done, count } = s.progress;
  const who = (id) => `<span class="transfer-who">${avatar(memberName(l, id), 'sm')}<b>${esc(memberName(l, id))}</b></span>`;
  const pairs = (from, to) => `<span class="transfer-pair">${who(from)}<span class="transfer-arrow" aria-label="转给">${icon('arrow', 16)}</span>${who(to)}</span>`;
  const pending = s.transfers.map(
    (t, i) => `
        <div class="row transfer" data-testid="transfer" aria-label="${esc(memberName(l, t.from))} → ${esc(memberName(l, t.to))} ${fmt(l, t.amount)}">
          ${pairs(t.from, t.to)}
          <span class="transfer-side">
            <span class="row-amount neg">${fmt(l, t.amount)}</span>
            <button class="mark-btn" data-action="mark-paid" data-i="${i}">标记已转</button>
          </span>
        </div>`,
  );
  const paid = s.payments.map(
    (p) => `
        <div class="row transfer done" data-testid="transfer-done" aria-label="已转账：${esc(memberName(l, p.from))} → ${esc(memberName(l, p.to))} ${fmt(l, p.amount)}">
          ${pairs(p.from, p.to)}
          <span class="transfer-side">
            <span class="row-amount">${fmt(l, p.amount)}</span>
            <button class="mark-btn undo" data-action="unmark-paid" data-id="${p.id}">${icon('check', 14)} 已转 · 撤销</button>
          </span>
        </div>`,
  );
  const transfers = count
    ? [...pending, ...paid].join('')
    : `<div class="settled">🎉 已经两清啦，无需转账</div>`;
  const pct = count ? Math.round((done / count) * 100) : 100;
  const progress = count
    ? `<div class="progress" data-testid="progress">
        <div class="progress-text"><span>${done === count ? '🎉 全部结清' : '结算进度'}</span><b>已结清 ${done}/${count}</b></div>
        <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${count}" aria-valuenow="${done}"><i style="width:${pct}%"></i></div>
      </div>`
    : '';

  const rows = s.balances
    .map((b) => {
      const extra = [b.sent ? `<span class="nb">已转出 ${fmt(l, b.sent)}</span>` : '', b.received ? `<span class="nb">已收到 ${fmt(l, b.received)}</span>` : ''].filter(Boolean).join(' · ');
      return `
      <div class="row balance-row">
        ${avatar(b.name)}
        <span class="row-main">
          <span class="row-title">${esc(b.name)}</span>
          <span class="row-sub wrap">${paidOwed(l, b)}${extra ? `<br>${extra}` : ''}</span>
        </span>
        <span class="balance ${b.balance > 0 ? 'pos' : b.balance < 0 ? 'neg' : ''}">
          <small>${b.balance > 0 ? '应收' : b.balance < 0 ? '应付' : '已结清'}</small>
          ${b.balance === 0 ? '' : fmt(l, Math.abs(b.balance))}
        </span>
      </div>`;
    })
    .join('');

  return `
    <h2 class="section-title">转账方案 <small>${s.transfers.length ? `还需 ${s.transfers.length} 笔` : ''}</small></h2>
    <div class="card list">${progress}${transfers}</div>
    <div class="action-grid">
      <button class="btn" data-action="share-image">${icon('image', 18)} 生成结算图</button>
      <button class="btn" data-action="copy-text">${icon('copy', 18)} 复制结算文本</button>
      <button class="btn primary span2" data-action="share-link">${icon('link', 18)} 复制分享链接</button>
    </div>
    <h2 class="section-title">每人明细</h2>
    <div class="card list">${rows}</div>`;
}

function renderMembers(l) {
  const s = safeSummary(l);
  const used = usedMembers(l);
  const defs = new Set(l.defaultParticipants || []);
  return `
    <div class="card list">
      ${l.members
        .map((m) => {
          const b = s.balances.find((x) => x.id === m.id);
          return `
          <div class="row member-row">
            ${avatar(m.name)}
            <span class="row-main">
              <span class="row-title">${esc(m.name)}${defs.size && defs.has(m.id) ? ' <span class="tag">常用</span>' : ''}</span>
              <span class="row-sub wrap">${b ? paidOwed(l, b) : ''}</span>
            </span>
            <button class="btn sm ghost" data-action="rename-member" data-id="${m.id}">改名</button>
            <button class="btn sm ghost danger-text" data-action="remove-member" data-id="${m.id}" ${used.has(m.id) ? 'aria-disabled="true"' : ''}>移除</button>
          </div>`;
        })
        .join('')}
    </div>
    <form class="add-member" data-form="add-member">
      <input class="input" name="name" placeholder="新成员名字，空格分隔多个" maxlength="80" autocomplete="off" enterkeyhint="done" />
      <button class="btn primary" type="submit">添加</button>
    </form>
    <p class="foot-note">已有账目的成员无法移除；新成员不会自动加入已有账目的分摊。${defs.size ? '<br>标有「常用」的成员会默认勾选为新账目的分摊人，可在「记一笔」里修改。' : ''}</p>`;
}

function paidOwed(l, b) {
  return `<span class="nb">已付 ${fmt(l, b.paid)}</span> · <span class="nb">应摊 ${fmt(l, b.owed)}</span>`;
}

function usedMembers(l) {
  const used = new Set();
  for (const e of l.expenses) {
    used.add(e.payer);
    const s = e.split;
    if (s.mode === 'equal') s.participants.forEach((id) => used.add(id));
    else Object.entries(s.mode === 'exact' ? s.exact : s.shares).forEach(([id, v]) => v > 0 && used.add(id));
  }
  for (const p of l.payments || []) {
    used.add(p.from);
    used.add(p.to);
  }
  return used;
}

/* ---------- 新建账本 ---------- */

function openNewLedger() {
  const members = [];
  const { el, close } = openSheet({
    title: '新建账本',
    body: `
      <form class="form" id="new-ledger-form">
        <label class="field"><span>账本名称</span>
          <input class="input" name="name" placeholder="例如：周末火锅、云南五日游、601 合租" maxlength="60" autocomplete="off" />
        </label>
        <div class="field"><span>成员</span>
          <div class="chips" id="chips"></div>
          <div class="inline">
            <input class="input" name="member" placeholder="输入名字，回车添加（空格分隔可批量）" maxlength="200" autocomplete="off" enterkeyhint="enter" />
            <button type="button" class="btn" data-add>添加</button>
          </div>
        </div>
        <label class="field"><span>币种</span>
          <select class="input" name="currency" aria-label="币种">${currencyOptions(DEFAULT_CURRENCY)}</select>
        </label>
        <p class="form-error" role="alert"></p>
      </form>`,
    footer: `<button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" data-create>创建</button>`,
  });
  const form = el.querySelector('form');
  const input = form.elements.member;
  const err = el.querySelector('.form-error');
  const drawChips = () => {
    el.querySelector('#chips').innerHTML =
      members.map((n, i) => `<span class="chip">${esc(n)}<button type="button" data-rm="${i}" aria-label="移除 ${esc(n)}">×</button></span>`).join('') ||
      '<span class="chips-empty">还没有成员</span>';
  };
  const addFromInput = () => {
    for (const n of splitNames(input.value)) {
      const name = n.slice(0, 40);
      if (!members.includes(name)) members.push(name);
    }
    input.value = '';
    drawChips();
  };
  drawChips();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      addFromInput();
    }
  });
  el.querySelector('[data-add]').addEventListener('click', () => {
    addFromInput();
    input.focus();
  });
  el.querySelector('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (b) {
      members.splice(Number(b.dataset.rm), 1);
      drawChips();
    }
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  el.querySelector('[data-create]').addEventListener('click', () => {
    addFromInput();
    const name = form.elements.name.value.trim() || '未命名账本';
    if (members.length < 2) {
      err.textContent = '至少添加两位成员';
      return;
    }
    const now = Date.now();
    const currency = CURRENCIES[form.elements.currency.value] ? form.elements.currency.value : DEFAULT_CURRENCY;
    const ledger = { id: newId(), name, currency, members: members.map((n) => ({ id: newId(), name: n })), expenses: [], payments: [], createdAt: now, updatedAt: now };
    state.ledgers.unshift(ledger);
    persist();
    close();
    go(`#/l/${ledger.id}`);
  });
  setTimeout(() => el.contains(document.activeElement) || form.elements.name.focus(), 50);
}

function currencyOptions(selected, disabled = () => false) {
  return Object.entries(CURRENCIES)
    .map(([code, c]) => `<option value="${code}" ${code === selected ? 'selected' : ''} ${disabled(code) ? 'disabled' : ''}>${c.name} ${code} ${esc(c.symbol)}</option>`)
    .join('');
}

/* ---------- 记一笔 / 编辑 ---------- */

function openExpense(l, expense) {
  const ids = l.members.map((m) => m.id);
  const cur = currencyOf(l.currency);
  const parse = (v) => parseAmount(v, cur.digits);
  const s = expense?.split;
  const defaults = (l.defaultParticipants || []).filter((id) => ids.includes(id));
  const f = {
    amount: expense ? toInput(expense.amount, l.currency) : '',
    note: expense?.note || '',
    date: expense?.date || todayISO(),
    emoji: expense?.emoji || '',
    payer: expense?.payer || (ids.includes(l.lastPayer) ? l.lastPayer : ids[0]),
    mode: s?.mode || 'equal',
    participants: new Set(s?.mode === 'equal' ? s.participants : defaults.length ? defaults : ids),
    shares: Object.fromEntries(ids.map((id) => [id, s?.mode === 'shares' ? String((s.shares[id] || 0) / 100) : '1'])),
    exact: Object.fromEntries(ids.map((id) => [id, s?.mode === 'exact' && s.exact[id] ? toInput(s.exact[id], l.currency) : ''])),
  };
  // 旧版本的分类表情不在快捷分类里时，仍保留显示
  const cats = [...CATEGORIES];
  if (f.emoji && !cats.some((c) => c.emoji === f.emoji)) cats.unshift({ emoji: f.emoji, label: categoryLabel(f.emoji) || '原分类' });
  const zeroHint = cur.digits ? '0.' + '0'.repeat(cur.digits) : '0';

  const { el, close } = openSheet({
    title: expense ? '编辑账目' : '记一笔',
    className: 'tall',
    body: `
      <form class="form" id="expense-form" novalidate>
        <label class="amount-field">
          <span class="currency">${esc(cur.symbol)}</span>
          <input name="amount" type="text" inputmode="${cur.digits ? 'decimal' : 'numeric'}" enterkeyhint="next" placeholder="${zeroHint}" value="${esc(f.amount)}" autocomplete="off" aria-label="金额" />
        </label>
        <div class="cat-row" id="cats" role="group" aria-label="分类">
          ${cats.map((c) => `<button type="button" class="cat ${f.emoji === c.emoji ? 'on' : ''}" data-emoji="${c.emoji}" aria-pressed="${f.emoji === c.emoji}"><span aria-hidden="true">${c.emoji}</span>${esc(c.label)}</button>`).join('')}
        </div>
        <div class="inline">
          <input class="input" name="note" placeholder="备注（选填）" maxlength="100" value="${esc(f.note)}" autocomplete="off" enterkeyhint="done" aria-label="备注" />
          <label class="date-pick input" title="日期">
            <span class="date-text" data-testid="date-text">${esc(f.date ? cnDate(f.date) : '选择日期')}</span>
            <input type="date" name="date" value="${esc(f.date)}" aria-label="日期" />
          </label>
        </div>
        <div class="field"><span>谁付的钱</span>
          <div class="pills" id="payer">
            ${l.members.map((m) => `<button type="button" class="pill ${f.payer === m.id ? 'on' : ''}" data-payer="${m.id}">${esc(m.name)}</button>`).join('')}
          </div>
        </div>
        <div class="field"><span>怎么分</span>
          <div class="segmented" id="mode">
            ${Object.entries(MODE_LABEL).map(([k, v]) => `<button type="button" data-mode="${k}" class="${f.mode === k ? 'on' : ''}">${v}</button>`).join('')}
          </div>
          <div id="split"></div>
        </div>
        <p class="form-error" role="alert"></p>
      </form>`,
    footer: `${expense ? '<button type="button" class="btn danger-text" data-delete>删除</button>' : '<button type="button" class="btn" data-close>取消</button>'}<button type="button" class="btn primary" data-save>保存</button>`,
  });

  const form = el.querySelector('form');
  const err = el.querySelector('.form-error');
  const splitBox = el.querySelector('#split');
  const dateInput = form.elements.date;

  function hint() {
    const amount = parse(form.elements.amount.value) ?? 0;
    const box = el.querySelector('#split-hint');
    if (!box) return;
    if (f.mode === 'equal') {
      const n = f.participants.size;
      box.textContent = n ? `${n} 人，每人约 ${fmt(l, Math.floor(amount / n))}${amount % n ? ' 起' : ''}` : '请选择分摊成员';
    } else if (f.mode === 'shares') {
      const ws = ids.map((id) => parseWeight(f.shares[id]) ?? 0);
      const W = ws.reduce((a, b) => a + b, 0);
      box.textContent = W ? `共 ${W / 100} 份，每份约 ${fmt(l, Math.round((amount * 100) / W))}` : '请至少给一人设置份数';
    } else {
      const sum = ids.reduce((a, id) => a + (parse(f.exact[id] || '0') ?? 0), 0);
      const left = amount - sum;
      box.textContent = left === 0 ? '✓ 已分配完毕' : left > 0 ? `还剩 ${fmt(l, left)} 未分配` : `超出 ${fmt(l, -left)}`;
      box.classList.toggle('bad', left !== 0);
    }
  }

  // 「常用参与人」：保存后新账目默认勾选这些人
  function defaultButton() {
    const eff = defaults.length ? defaults : ids;
    const same = f.participants.size === eff.length && eff.every((id) => f.participants.has(id));
    if (same) return defaults.length ? '<span class="pill-note">✓ 常用参与人</span>' : '';
    return f.participants.size ? '<button type="button" class="pill ghost" data-save-default>设为常用</button>' : '';
  }

  function drawSplit() {
    let html = '';
    if (f.mode === 'equal') {
      const all = f.participants.size === ids.length;
      html = `
        <div class="pills">
          <button type="button" class="pill ghost" data-all>${all ? '全不选' : '全选'}</button>
          ${l.members.map((m) => `<button type="button" class="pill check ${f.participants.has(m.id) ? 'on' : ''}" data-part="${m.id}">${esc(m.name)}</button>`).join('')}
          ${defaultButton()}
        </div>`;
    } else {
      const key = f.mode;
      html = `<div class="split-grid">${l.members
        .map(
          (m) => `
          <label class="split-item"><span>${esc(m.name)}</span>
            <input class="input" inputmode="${key === 'exact' && !cur.digits ? 'numeric' : 'decimal'}" data-${key}="${m.id}" value="${esc(f[key][m.id])}" placeholder="${key === 'shares' ? '0' : zeroHint}" aria-label="${esc(m.name)} ${key === 'shares' ? '份数' : '金额'}" />
            <em>${key === 'shares' ? '份' : esc(cur.unit)}</em>
          </label>`,
        )
        .join('')}</div>`;
    }
    splitBox.innerHTML = html + '<p class="split-hint" id="split-hint"></p>';
    hint();
  }
  drawSplit();

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !el.contains(t)) return;
    if (t.dataset.emoji !== undefined) {
      f.emoji = f.emoji === t.dataset.emoji ? '' : t.dataset.emoji; // 再点一次取消
      el.querySelectorAll('[data-emoji]').forEach((b) => {
        b.classList.toggle('on', b.dataset.emoji === f.emoji);
        b.setAttribute('aria-pressed', b.dataset.emoji === f.emoji);
      });
    } else if (t.dataset.payer) {
      f.payer = t.dataset.payer;
      el.querySelectorAll('[data-payer]').forEach((b) => b.classList.toggle('on', b === t));
    } else if (t.dataset.mode) {
      f.mode = t.dataset.mode;
      el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b === t));
      drawSplit();
    } else if (t.dataset.part) {
      const id = t.dataset.part;
      f.participants.has(id) ? f.participants.delete(id) : f.participants.add(id);
      drawSplit();
    } else if (t.hasAttribute('data-all')) {
      f.participants = f.participants.size === ids.length ? new Set() : new Set(ids);
      drawSplit();
    } else if (t.hasAttribute('data-save-default')) {
      const sel = ids.filter((id) => f.participants.has(id));
      defaults.splice(0, defaults.length, ...(sel.length === ids.length ? [] : sel));
      if (defaults.length) l.defaultParticipants = [...defaults];
      else delete l.defaultParticipants;
      touch(l);
      drawSplit();
      toast(defaults.length ? '已设为常用参与人，新账目会默认勾选' : '已恢复为默认全员参与');
    }
  });
  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.shares) f.shares[t.dataset.shares] = t.value;
    if (t.dataset.exact) f.exact[t.dataset.exact] = t.value;
    hint();
  });
  // 日期：用中文显示所选日期，原生选择器负责选择（不受浏览器语言影响）
  dateInput.addEventListener('change', () => {
    el.querySelector('.date-text').textContent = dateInput.value ? cnDate(dateInput.value) : '选择日期';
  });
  dateInput.addEventListener('click', () => {
    try {
      dateInput.showPicker?.();
    } catch {}
  });
  form.elements.amount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      form.elements.note.focus();
    }
  });
  form.elements.note.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      save();
    }
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  function save() {
    err.textContent = '';
    const amount = parse(form.elements.amount.value);
    if (!amount) {
      err.textContent = cur.digits ? `请输入正确的金额（最多 ${cur.digits} 位小数）` : `请输入正确的金额（${cur.name}不带小数）`;
      form.elements.amount.focus();
      return;
    }
    let split;
    if (f.mode === 'equal') {
      if (!f.participants.size) return void (err.textContent = '请至少选择一位分摊成员');
      split = { mode: 'equal', participants: ids.filter((id) => f.participants.has(id)) };
    } else if (f.mode === 'shares') {
      const shares = {};
      for (const id of ids) {
        const w = parseWeight(f.shares[id] || '0');
        if (w === null) return void (err.textContent = `「${memberName(l, id)}」的份数无效`);
        if (w > 0) shares[id] = w;
      }
      if (!Object.keys(shares).length) return void (err.textContent = '请至少给一人设置份数');
      split = { mode: 'shares', shares };
    } else {
      const exact = {};
      let sum = 0;
      for (const id of ids) {
        const raw = (f.exact[id] || '').trim();
        const v = raw ? parse(raw) : 0;
        if (v === null) return void (err.textContent = `「${memberName(l, id)}」的金额无效`);
        if (v > 0) exact[id] = v;
        sum += v;
      }
      if (sum !== amount) return void (err.textContent = `各人金额合计 ${fmt(l, sum)}，与总额 ${fmt(l, amount)} 不一致`);
      split = { mode: 'exact', exact };
    }
    const data = {
      amount,
      note: form.elements.note.value.trim(),
      date: dateInput.value || todayISO(),
      emoji: f.emoji,
      payer: f.payer,
      split,
    };
    if (expense) Object.assign(expense, data);
    else l.expenses.push({ id: newId(), createdAt: Date.now(), ...data });
    l.lastPayer = f.payer;
    touch(l);
    close();
    render();
    toast(expense ? '已保存' : '已记一笔');
  }
  el.querySelector('[data-save]').addEventListener('click', save);

  el.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (await confirmDanger('删除这笔账目？', `${esc(expenseTitle(expense))} · ${fmt(l, expense.amount)}`)) {
      l.expenses = l.expenses.filter((x) => x.id !== expense.id);
      touch(l);
      close();
      render();
      toast('已删除');
    }
  });

  if (!expense) setTimeout(() => el.contains(document.activeElement) || form.elements.amount.focus(), 80);
}

/* ---------- 分享 / 导出 ---------- */

async function shareLink(l) {
  const url = shareUrl(l);
  const ok = await copyText(url);
  const long = url.length > LONG_LINK;
  const canShare = typeof navigator.share === 'function';
  const { el } = openSheet({
    title: '分享账本',
    className: 'share-sheet',
    body: `
      <p class="dialog-msg">${ok ? `${icon('check', 16)} 链接已复制，发到群里，对方打开即可导入整个账本。` : '自动复制失败，请手动复制下面的链接。'}</p>
      ${long ? `<p class="warn" data-testid="long-link">链接较长（${url.length} 字符），部分聊天软件可能截断，二维码也会比较密。建议同时发一张结算图。</p>` : ''}
      <figure class="qr-box">
        <div class="qr" id="qr" aria-busy="true"><span class="qr-loading">正在生成二维码…</span></div>
        <figcaption>同桌的朋友用微信或相机扫码即可导入</figcaption>
      </figure>
      <textarea class="input share-url" readonly rows="3" aria-label="分享链接">${esc(url)}</textarea>
      <p class="share-note">链接里包含账本全部内容，请只发给相关的人。</p>`,
    footer: `
      <button type="button" class="btn" data-copy>${icon('copy', 18)} 复制链接</button>
      ${canShare ? `<button type="button" class="btn primary" data-share>分享…</button>` : ''}`,
  });
  const ta = el.querySelector('textarea');
  if (!ok) {
    ta.focus();
    ta.select();
  }
  ta.addEventListener('focus', () => ta.select());
  el.querySelector('[data-copy]').addEventListener('click', async () => toast((await copyText(url)) ? '分享链接已复制' : '复制失败，请长按链接手动复制'));
  el.querySelector('[data-share]')?.addEventListener('click', () => navigator.share({ title: `${l.name} · AA 分账`, url }).catch(() => {}));

  const box = el.querySelector('#qr');
  try {
    const { qrSvg } = await import('./qr.js');
    box.innerHTML = qrSvg(url, { label: `${l.name} 的分享二维码` });
  } catch (e) {
    box.innerHTML = `<span class="qr-loading">${esc(e.message?.includes('太长') ? e.message : '二维码生成失败')}，请使用复制链接或结算图</span>`;
    box.classList.add('failed');
  }
  box.removeAttribute('aria-busy');
}

async function shareImage(l) {
  let blob;
  try {
    blob = await renderSettlementImage(l, summarize(l));
  } catch (e) {
    return toast(e.message || '生成图片失败');
  }
  const url = URL.createObjectURL(blob);
  const canCopy = typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write;
  const file = new File([blob], `${l.name}-结算.png`, { type: 'image/png' });
  const canShare = navigator.canShare?.({ files: [file] });
  const { el } = openSheet({
    title: '结算图',
    className: 'tall',
    body: `<p class="dialog-msg">手机上长按图片即可保存或发送给微信好友。</p><img class="result-img" src="${url}" alt="${esc(l.name)} 结算图" />`,
    footer: `
      <a class="btn" href="${url}" download="${esc(l.name)}-结算.png">${icon('download', 18)} 下载</a>
      ${canCopy ? `<button type="button" class="btn" data-copy>${icon('copy', 18)} 复制图片</button>` : ''}
      ${canShare ? `<button type="button" class="btn primary" data-share>分享</button>` : ''}`,
    onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
  });
  el.querySelector('[data-copy]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('图片已复制，可直接粘贴到聊天');
    } catch {
      toast('复制失败，请长按或下载图片');
    }
  });
  el.querySelector('[data-share]')?.addEventListener('click', () => {
    navigator.share({ files: [file], title: `${l.name} 结算` }).catch(() => {});
  });
}

function openCurrency(l) {
  const locked = l.expenses.length > 0 || (l.payments || []).length > 0;
  const digits = currencyOf(l.currency).digits;
  const { el, close } = openSheet({
    title: '账本币种',
    className: 'dialog',
    body: `
      <label class="field"><span>币种</span>
        <select class="input" name="currency" aria-label="币种">${currencyOptions(l.currency || DEFAULT_CURRENCY, (c) => locked && CURRENCIES[c].digits !== digits)}</select>
      </label>
      <p class="dialog-msg"><small>只改变显示的货币符号，不做汇率换算。${locked ? '已有账目时，只能切换到小数位数相同的币种。' : ''}</small></p>`,
    footer: `<button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" data-ok>保存</button>`,
  });
  el.querySelector('[data-ok]').addEventListener('click', () => {
    const code = el.querySelector('select').value;
    if (!CURRENCIES[code] || (locked && CURRENCIES[code].digits !== digits)) return toast('不能切换到该币种');
    l.currency = code;
    touch(l);
    close();
    render();
    toast(`币种：${CURRENCIES[code].name}`);
  });
}

/* ---------- 导入 ---------- */

async function handleImport(data) {
  let incoming;
  try {
    incoming = decodeLedger(data);
  } catch (e) {
    toast(e.message || '链接无效或已损坏');
    return go('#/', true);
  }
  // 先展示首页作为背景
  history.replaceState(null, '', '#/');
  app.innerHTML = renderHome();
  const existing = getLedger(incoming.id);
  const total = incoming.expenses.reduce((a, e) => a + e.amount, 0);
  const desc = `「${esc(incoming.name)}」<br><small>${incoming.members.length} 人 · ${incoming.expenses.length} 笔 · 总支出 ${fmt(incoming, total)}</small>`;
  const choice = await ask({
    title: '导入分享的账本',
    message: existing ? `${desc}<br><br>本地已有同一账本，要用链接中的版本覆盖吗？` : desc,
    buttons: existing
      ? [
          { label: '另存副本', value: 'copy' },
          { label: '覆盖本地', value: 'replace', kind: 'primary' },
        ]
      : [
          { label: '取消', value: null },
          { label: '导入', value: 'new', kind: 'primary' },
        ],
  });
  if (!choice) return;
  if (choice === 'replace') {
    incoming.createdAt = existing.createdAt;
    state.ledgers = state.ledgers.filter((x) => x.id !== existing.id);
  } else if (choice === 'copy') {
    incoming.id = newId();
    incoming.name += '（副本）';
  }
  state.ledgers.unshift(incoming);
  persist();
  toast('已导入');
  go(`#/l/${incoming.id}`, true);
}

/* ---------- 事件 ---------- */

const actions = {
  theme() {
    state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
    saveTheme(state.theme);
    applyTheme();
    render();
    toast(`主题：${THEME_LABEL[state.theme]}`);
  },
  'new-ledger': openNewLedger,
  demo() {
    const l = buildDemoLedger();
    state.ledgers.unshift(l);
    persist();
    go(`#/l/${l.id}`);
    toast('已加载示例账本，可随意改动');
  },
  'mark-paid'(el, l) {
    const t = summarize(l).transfers[Number(el.dataset.i)];
    if (!t) return;
    (l.payments ||= []).push({ id: newId(), from: t.from, to: t.to, amount: t.amount, at: Date.now() });
    touch(l);
    render();
    const { progress } = summarize(l);
    toast(progress.done === progress.count ? '🎉 全部结清！' : `已标记：${memberName(l, t.from)} → ${memberName(l, t.to)}`);
  },
  'unmark-paid'(el, l) {
    l.payments = (l.payments || []).filter((p) => p.id !== el.dataset.id);
    touch(l);
    render();
    toast('已撤销转账标记');
  },
  'add-expense': (_el, l) => openExpense(l),
  'edit-expense': (el, l) => {
    const e = l.expenses.find((x) => x.id === el.dataset.id);
    if (e) openExpense(l, e);
  },
  'share-link': (_el, l) => shareLink(l),
  'share-image': (_el, l) => shareImage(l),
  async 'copy-text'(_el, l) {
    toast((await copyText(settlementText(l, summarize(l)))) ? '结算文本已复制，可直接粘贴到微信' : '复制失败');
  },
  async 'rename-member'(el, l) {
    const m = l.members.find((x) => x.id === el.dataset.id);
    const name = await promptText({ title: '修改成员名字', value: m.name });
    if (!name || name === m.name) return;
    if (l.members.some((x) => x.name === name)) return toast('已有同名成员');
    m.name = name.slice(0, 40);
    touch(l);
    render();
  },
  async 'remove-member'(el, l) {
    const m = l.members.find((x) => x.id === el.dataset.id);
    if (usedMembers(l).has(m.id)) return toast('该成员已有相关账目，无法移除');
    if (l.members.length <= 1) return toast('至少保留一位成员');
    if (!(await confirmDanger(`移除「${m.name}」？`, '', '移除'))) return;
    l.members = l.members.filter((x) => x.id !== m.id);
    if (l.defaultParticipants) l.defaultParticipants = l.defaultParticipants.filter((id) => id !== m.id);
    touch(l);
    render();
  },
  async 'ledger-menu'(_el, l) {
    const choice = await ask({
      title: l.name,
      buttons: [
        { label: '重命名账本', value: 'rename' },
        { label: '分享链接 / 二维码', value: 'share' },
        { label: `币种：${currencyOf(l.currency).name}`, value: 'currency' },
        { label: '删除账本', value: 'delete', kind: 'danger' },
      ],
    });
    if (choice === 'rename') {
      const name = await promptText({ title: '重命名账本', value: l.name, maxLength: 60 });
      if (name) {
        l.name = name;
        touch(l);
        render();
      }
    } else if (choice === 'share') shareLink(l);
    else if (choice === 'currency') openCurrency(l);
    else if (choice === 'delete') {
      if (await confirmDanger('删除整个账本？', `「${esc(l.name)}」及其全部 ${l.expenses.length} 笔账目将从本机删除，无法恢复。`)) {
        state.ledgers = state.ledgers.filter((x) => x.id !== l.id);
        persist();
        go('#/');
        toast('账本已删除');
      }
    }
  },
};

function currentLedger() {
  const r = parseRoute();
  return r.view === 'ledger' ? getLedger(r.id) : null;
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el, currentLedger());
  }
});

app.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="add-member"]');
  if (!form) return;
  e.preventDefault();
  const l = currentLedger();
  const names = splitNames(form.elements.name.value).map((n) => n.slice(0, 40));
  let added = 0;
  for (const n of names) {
    if (l.members.some((m) => m.name === n)) continue;
    const id = newId();
    l.members.push({ id, name: n });
    l.defaultParticipants?.push(id); // 设置了常用参与人时，新成员默认也算在内
    added++;
  }
  if (!added) return toast(names.length ? '成员已存在' : '请输入名字');
  touch(l);
  render();
  toast(`已添加 ${added} 位成员`);
});

window.addEventListener('hashchange', render);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('aa-split:ledgers')) {
    state.ledgers = loadLedgers();
    if (!document.querySelector('.sheet-backdrop')) render();
  }
});

applyTheme();
state.ledgers.sort((a, b) => b.updatedAt - a.updatedAt);
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
