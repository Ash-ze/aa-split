// 端到端验证：构建产物 + vite preview + Playwright（Chromium）。
// 用法：npm run build && npm run e2e
// 若 Chromium 不在 Playwright 默认位置，可设置 CHROMIUM_PATH 指向可执行文件。
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import jsQR from 'jsqr';
import { summarize } from '../src/settle.js';
import { yuan } from '../src/money.js';
import { todayISO, addDays } from '../src/dates.js';

// 自动选择空闲端口（也可用 E2E_PORT 指定）
const PORT = Number(process.env.E2E_PORT) || (await new Promise((resolve) => {
  const srv = createServer().listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
}));
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite preview 启动超时')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(PORT))) {
      clearTimeout(t);
      resolve();
    }
  });
});

const step = (msg) => console.log('✓', msg);

// 把页面上的二维码 SVG 画到 canvas，取像素后用 jsQR 解码
async function decodeQr(p) {
  const { w, px } = await p.locator('.qr svg').evaluate(async (svg) => {
    const w = 400;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = w;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, w);
    return { w, px: Array.from(g.getImageData(0, 0, w, w).data) };
  });
  return jsQR(new Uint8ClampedArray(px), w, w)?.data;
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const mobile = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  colorScheme: 'light',
  permissions: ['clipboard-read', 'clipboard-write'],
};

try {
  const ctx = await browser.newContext(mobile);
  ctx.setDefaultTimeout(15000);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(BASE);
  await page.getByText('一起花的钱，轻松算清').waitFor();
  await page.screenshot({ path: SHOTS + '01-home-empty.png' });
  step('首页空状态');

  // 新建账本
  await page.getByRole('button', { name: '新建账本' }).click();
  await page.getByPlaceholder('例如：周末火锅').fill('周末火锅');
  const memberInput = page.getByPlaceholder('输入名字，回车添加');
  await memberInput.fill('张三 李四 王五');
  await memberInput.press('Enter');
  await memberInput.fill('赵六');
  await page.locator('.sheet').getByRole('button', { name: '添加' }).click();
  await page.locator('.chip').nth(3).waitFor({ timeout: 3000 }).catch(() => {});
  const chips = (await page.locator('.chip').allInnerTexts()).map((t) => t.replace('×', '').trim());
  assert.deepEqual(chips, ['张三', '李四', '王五', '赵六']);
  await page.getByRole('button', { name: '创建' }).click();
  await page.locator('.topbar-title', { hasText: '周末火锅' }).waitFor();
  step('创建账本「周末火锅」，4 位成员');

  async function addExpense({ amount, note, emoji, payer, mode, setup, expectPayer }) {
    await page.locator('.fab').click();
    const sheet = page.locator('.sheet');
    if (expectPayer) assert.equal(await sheet.locator('#payer .pill.on').innerText(), expectPayer, '应记住上次的付款人');
    await sheet.getByLabel('金额', { exact: true }).fill(amount);
    await sheet.getByLabel('备注').fill(note);
    if (emoji) await sheet.locator(`[data-emoji="${emoji}"]`).click();
    if (payer) await sheet.locator('#payer').getByRole('button', { name: payer, exact: true }).click();
    if (mode) await sheet.locator('#mode').getByRole('button', { name: mode }).click();
    if (setup) await setup(sheet);
    await sheet.getByRole('button', { name: '保存' }).click();
    await page.locator('.sheet-backdrop').waitFor({ state: 'detached' });
  }

  // 金额输入框弹出数字键盘
  await page.locator('.fab').click();
  assert.equal(await page.locator('.sheet').getByLabel('金额', { exact: true }).getAttribute('inputmode'), 'decimal');
  assert.match(await page.getByTestId('date-text').innerText(), /^\d{1,2}月\d{1,2}日 周[一二三四五六日]$/);
  assert.deepEqual(await page.locator('#cats .cat').allInnerTexts().then((a) => a.map((t) => t.replace(/\s+/g, ''))), ['🍜餐饮', '🚕交通', '🏨住宿', '🎫门票', '🛍️购物', '📦其他']);
  await page.keyboard.press('Escape');
  await page.locator('.sheet-backdrop').waitFor({ state: 'detached' });

  await addExpense({ amount: '358', note: '海底捞', emoji: '🍜' });
  await addExpense({
    amount: '90',
    note: '打车',
    emoji: '🚕',
    payer: '李四',
    mode: '按份数',
    setup: async (s) => {
      await s.getByLabel('张三 份数').fill('2');
      await s.getByLabel('李四 份数').fill('1');
      await s.getByLabel('王五 份数').fill('1.5');
      await s.getByLabel('赵六 份数').fill('0');
    },
  });
  await addExpense({
    amount: '100',
    note: '奶茶',
    emoji: '🍜',
    payer: '王五',
    expectPayer: '李四',
    mode: '指定金额',
    setup: async (s) => {
      await s.getByLabel('张三 金额').fill('30');
      await s.getByLabel('李四 金额').fill('20');
      await s.getByLabel('王五 金额').fill('25');
      // 故意先不填赵六，验证校验提示
      await s.getByRole('button', { name: '保存' }).click();
      await s.locator('.form-error', { hasText: '不一致' }).waitFor();
      await s.getByLabel('赵六 金额').fill('25');
    },
  });
  await addExpense({
    amount: '100',
    note: 'KTV',
    emoji: '🎫',
    payer: '赵六',
    expectPayer: '王五',
    setup: async (s) => {
      await s.locator('[data-part]', { hasText: '赵六' }).click(); // 赵六不参与
      await s.getByRole('button', { name: '设为常用' }).click(); // 存为常用参与人
      await s.getByText('✓ 常用参与人').waitFor();
      await s.getByLabel('日期').fill(addDays(todayISO(), -1)); // 记在昨天
      await s.locator('[data-testid="date-text"]', { hasText: '周' }).waitFor();
    },
  });
  assert.equal(await page.locator('.expense-row').count(), 4);
  assert.equal(await page.getByTestId('total').innerText(), '¥648.00');
  // 按天分组 + 每日小计
  const days = await page.getByTestId('day').allInnerTexts();
  assert.equal(days.length, 2);
  assert.match(days[0], /今天[\s\S]*3 笔 · ¥548\.00/);
  assert.match(days[1], /昨天[\s\S]*1 笔 · ¥100\.00/);
  // 常用参与人：新账目默认不勾选赵六
  await page.locator('.fab').click();
  assert.deepEqual(await page.locator('[data-part].on').allInnerTexts().then((a) => a.map((t) => t.trim())), ['张三', '李四', '王五']);
  await page.keyboard.press('Escape');
  await page.locator('.sheet-backdrop').waitFor({ state: 'detached' });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: SHOTS + '02-expenses.png', fullPage: true });
  step('添加 4 笔账目（均分 / 按份数 / 指定金额 / 部分成员均分），总支出 ¥648.00');
  step('快速记账：记住付款人、分类快捷选择、常用参与人、中文日期与按天小计');

  // 用同一算法独立计算期望结果
  const ids = { 张三: 'a', 李四: 'b', 王五: 'c', 赵六: 'd' };
  const expectLedger = {
    members: Object.entries(ids).map(([name, id]) => ({ id, name })),
    expenses: [
      { payer: 'a', amount: 35800, split: { mode: 'equal', participants: ['a', 'b', 'c', 'd'] } },
      { payer: 'b', amount: 9000, split: { mode: 'shares', shares: { a: 200, b: 100, c: 150 } } },
      { payer: 'c', amount: 10000, split: { mode: 'exact', exact: { a: 3000, b: 2000, c: 2500, d: 2500 } } },
      { payer: 'd', amount: 10000, split: { mode: 'equal', participants: ['a', 'b', 'c'] } },
    ],
  };
  const exp = summarize(expectLedger);
  const nameOf = (id) => Object.keys(ids).find((k) => ids[k] === id);
  const expectedTransfers = exp.transfers.map((t) => `${nameOf(t.from)} → ${nameOf(t.to)} ${yuan(t.amount)}`);

  await page.getByRole('tab', { name: '结算' }).click();
  await page.getByTestId('transfer').first().waitFor();
  const readTransfers = (p) =>
    p.getByTestId('transfer').evaluateAll((rows) => rows.map((r) => r.getAttribute('aria-label')));
  const uiTransfers = await readTransfers(page);
  console.log('  转账方案：', uiTransfers.join('  '));
  assert.deepEqual(uiTransfers, expectedTransfers);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: SHOTS + '03-settlement.png', fullPage: true });
  step(`结算页与独立计算一致（${uiTransfers.length} 笔转账）`);

  // 标记已转账
  await page.getByTestId('transfer').first().getByRole('button', { name: '标记已转' }).click();
  await page.getByTestId('transfer-done').waitFor();
  assert.match(await page.getByTestId('progress').innerText(), /已结清 1\/3/);
  const first = exp.transfers[0];
  const exp2 = summarize({ ...expectLedger, payments: [{ from: first.from, to: first.to, amount: first.amount }] });
  const expectedPending = exp2.transfers.map((t) => `${nameOf(t.from)} → ${nameOf(t.to)} ${yuan(t.amount)}`);
  assert.deepEqual(await readTransfers(page), expectedPending);
  // 撤销再标记，确认可逆
  await page.getByRole('button', { name: '已转 · 撤销' }).click();
  await page.getByTestId('transfer-done').waitFor({ state: 'detached' });
  assert.deepEqual(await readTransfers(page), expectedTransfers);
  await page.getByTestId('transfer').first().getByRole('button', { name: '标记已转' }).click();
  await page.getByTestId('transfer-done').waitFor();
  step('标记已转账：进度「已结清 1/3」，可撤销');

  // 复制结算文本
  await page.getByRole('button', { name: '复制结算文本' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(text.includes('【周末火锅】AA 结算'));
  assert.ok(text.includes('已结清 1/3'));
  assert.ok(text.includes(`✅ ${nameOf(first.from)} → ${nameOf(first.to)} ${yuan(first.amount)}（已转）`));
  for (const t of exp2.transfers) assert.ok(text.includes(`${nameOf(t.from)} → ${nameOf(t.to)} ${yuan(t.amount)}`));
  console.log('  结算文本：\n' + text.replace(/^/gm, '    '));
  step('复制结算文本');

  // 结算图
  await page.getByRole('button', { name: '生成结算图' }).click();
  const img = page.locator('.result-img');
  await img.waitFor();
  await page.waitForFunction(() => document.querySelector('.result-img')?.naturalWidth > 0);
  const { w, h, b64 } = await img.evaluate(async (el) => {
    const blob = await (await fetch(el.src)).blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const x of buf) s += String.fromCharCode(x);
    return { w: el.naturalWidth, h: el.naturalHeight, b64: btoa(s) };
  });
  assert.equal(w, 1125);
  writeFileSync(SHOTS + 'settlement-image.png', Buffer.from(b64, 'base64'));
  await page.screenshot({ path: SHOTS + '04-image-sheet.png' });
  step(`生成结算图 PNG ${w}×${h}`);
  await page.keyboard.press('Escape');
  await page.locator('.sheet-backdrop').waitFor({ state: 'detached' });

  // 分享链接往返 + 二维码
  await page.getByRole('button', { name: '复制分享链接' }).click();
  await page.locator('.qr svg').waitFor();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(link.startsWith(BASE) && link.includes('#s='), link);
  assert.equal(await page.getByLabel('分享链接', { exact: true }).inputValue(), link);
  assert.equal(await page.getByTestId('long-link').count(), 0);
  console.log(`  分享链接长度：${link.length} 字符`);
  assert.equal(await decodeQr(page), link, '二维码内容应与分享链接一致');
  await page.screenshot({ path: SHOTS + '09-share-qr.png' });
  await page.keyboard.press('Escape');
  await page.locator('.sheet-backdrop').waitFor({ state: 'detached' });
  step('分享弹层：自动复制链接，二维码可解码为同一链接');

  const ctx2 = await browser.newContext(mobile); // 全新浏览器环境，无本地数据
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(link);
  await p2.getByText('导入分享的账本').waitFor();
  await p2.screenshot({ path: SHOTS + '05-import.png' });
  await p2.getByRole('button', { name: '导入', exact: true }).click();
  await p2.locator('.topbar-title', { hasText: '周末火锅' }).waitFor();
  assert.equal(await p2.getByTestId('total').innerText(), '¥648.00');
  assert.equal(await p2.locator('.expense-row').count(), 4);
  await p2.getByRole('tab', { name: '结算' }).click();
  assert.deepEqual(await readTransfers(p2), expectedPending);
  assert.match(await p2.getByTestId('progress').innerText(), /已结清 1\/3/);
  step('分享链接在全新环境导入，账目、结算与已转账标记完全一致');

  // 很长的链接：给出提示（随机备注，压缩不掉）
  await p2.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('aa-split:ledgers:v1'));
    const l = ls[0];
    const rnd = () => Math.random().toString(36).slice(2);
    for (let i = 0; i < 40; i++) l.expenses.push({ ...l.expenses[0], id: 'x' + i, note: rnd() + rnd() + rnd() });
    localStorage.setItem('aa-split:ledgers:v1', JSON.stringify(ls));
  });
  await p2.reload();
  await p2.getByRole('button', { name: '复制分享链接' }).click();
  await p2.getByTestId('long-link').waitFor();
  await p2.locator('.qr svg, .qr.failed').first().waitFor();
  console.log('  ' + (await p2.getByTestId('long-link').innerText()));
  await p2.keyboard.press('Escape');
  step('超长链接给出提示');

  // 同一浏览器再次打开同一链接 -> 提示覆盖/另存副本
  await page.goto(link);
  await page.getByText('本地已有同一账本').waitFor();
  await page.getByRole('button', { name: '另存副本' }).click();
  await page.locator('.topbar-title', { hasText: '周末火锅（副本）' }).waitFor();
  await page.goto(BASE);
  assert.equal(await page.locator('.ledger-card').count(), 2);
  await page.screenshot({ path: SHOTS + '06-home-list.png' });
  step('重复导入可另存副本，首页显示多个账本（localStorage）');

  // 损坏链接
  await page.goto(BASE + '#s=garbage!!');
  await page.getByText('链接无效或已损坏').waitFor();
  step('损坏的分享链接给出提示');

  // 编辑 & 持久化
  await page.reload();
  assert.equal(await page.locator('.ledger-card').count(), 2);
  step('刷新后数据仍在');

  // 深色模式截图（同时用英文浏览器语言验证日期仍显示为中文格式）
  const ctx3 = await browser.newContext({ ...mobile, colorScheme: 'dark', locale: 'en-US' });
  const p3 = await ctx3.newPage();
  await p3.goto(link);
  await p3.getByRole('button', { name: '导入', exact: true }).click();
  await p3.getByRole('tab', { name: '结算' }).click();
  await p3.getByTestId('transfer').first().waitFor();
  await p3.waitForTimeout(2600);
  await p3.screenshot({ path: SHOTS + '07-settlement-dark.png', fullPage: true });
  await p3.getByRole('tab', { name: '账目' }).click();
  await p3.locator('.fab').click();
  await p3.locator('.sheet-backdrop.open').waitFor();
  await p3.locator('.sheet').getByLabel('金额', { exact: true }).fill('128');
  await p3.locator('.sheet').getByLabel('备注').fill('晚饭');
  await p3.locator('.sheet [data-emoji="🍜"]').click();
  assert.match(await p3.getByTestId('date-text').innerText(), /^\d{1,2}月\d{1,2}日 周[一二三四五六日]$/);
  await p3.waitForTimeout(300);
  await p3.screenshot({ path: SHOTS + '08-add-expense-dark.png' });
  step('深色模式；英文浏览器下日期仍为中文格式');

  // 示例账本 + 外币账本 + 小屏布局（360px）
  const ctx4 = await browser.newContext({ ...mobile, viewport: { width: 360, height: 700 } });
  const p4 = await ctx4.newPage();
  p4.on('pageerror', (e) => errors.push(e.message));
  await p4.goto(BASE);
  const noHScroll = async (where) =>
    assert.ok(await p4.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${where} 出现横向滚动`);
  await noHScroll('首页空状态');
  await p4.getByRole('button', { name: '先看看示例账本' }).click();
  await p4.locator('.topbar-title', { hasText: '示例' }).waitFor();
  assert.equal(await p4.locator('.expense-row').count(), 8);
  assert.equal(await p4.getByTestId('day').count(), 3);
  await noHScroll('示例账目');
  await p4.waitForTimeout(2400);
  await p4.screenshot({ path: SHOTS + '10-demo-expenses.png' });
  // 记一笔按钮不遮挡最后一条账目
  await p4.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const overlap = await p4.evaluate(() => {
    const last = [...document.querySelectorAll('.expense-row')].at(-1).getBoundingClientRect();
    const fab = document.querySelector('.fab').getBoundingClientRect();
    return last.bottom > fab.top && last.right > fab.left;
  });
  assert.ok(!overlap, '「记一笔」按钮遮挡了最后一条账目');
  await p4.getByRole('tab', { name: '结算' }).click();
  await p4.getByTestId('progress').waitFor();
  assert.match(await p4.getByTestId('progress').innerText(), /已结清 1\/\d/);
  assert.equal(await p4.locator('.fab').count(), 0, '结算页不显示「记一笔」');
  await noHScroll('示例结算');
  await p4.screenshot({ path: SHOTS + '11-demo-settle.png' });
  await p4.getByRole('button', { name: '复制分享链接' }).click();
  await p4.locator('.qr svg').waitFor();
  assert.equal(await decodeQr(p4), await p4.evaluate(() => navigator.clipboard.readText()));
  await p4.waitForTimeout(400);
  await p4.screenshot({ path: SHOTS + '12-demo-share.png' });
  await p4.keyboard.press('Escape');
  await p4.locator('.sheet-backdrop').waitFor({ state: 'detached' });
  await p4.getByRole('tab', { name: '成员' }).click();
  await noHScroll('示例成员');
  step('示例账本：8 笔账目、3 天分组、已结清进度；360px 下无横向滚动，悬浮按钮不遮挡内容');

  await p4.goto(BASE);
  await p4.getByRole('button', { name: '新建账本' }).click();
  await p4.getByPlaceholder('例如：周末火锅').fill('东京之旅');
  await p4.getByPlaceholder('输入名字，回车添加').fill('A B');
  await p4.getByLabel('币种').selectOption('JPY');
  await p4.getByRole('button', { name: '创建' }).click();
  await p4.locator('.topbar-title', { hasText: '东京之旅' }).waitFor();
  await p4.locator('.fab').click();
  const amt = p4.locator('.sheet').getByLabel('金额', { exact: true });
  assert.equal(await amt.getAttribute('inputmode'), 'numeric');
  await amt.fill('12.5');
  await p4.locator('.sheet').getByRole('button', { name: '保存' }).click();
  await p4.locator('.form-error', { hasText: '不带小数' }).waitFor();
  await amt.fill('1201');
  await p4.locator('.sheet').getByRole('button', { name: '保存' }).click();
  await p4.locator('.sheet-backdrop').waitFor({ state: 'detached' });
  assert.equal(await p4.getByTestId('total').innerText(), 'JP¥1,201');
  await p4.getByRole('tab', { name: '结算' }).click();
  assert.deepEqual(await readTransfers(p4), ['B → A JP¥600']);
  step('外币账本（日元，无小数）：JP¥1,201 两人均分 -> B → A JP¥600');

  // PWA：manifest + service worker + 离线
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  assert.equal(manifest.display, 'standalone');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  assert.ok(controlled, 'service worker 未接管页面');
  await ctx.setOffline(true);
  await page.reload();
  await page.locator('.ledger-card').first().waitFor();
  await page.locator('.ledger-card').first().click();
  await page.getByRole('tab', { name: '结算' }).click();
  await page.getByTestId('transfer').first().waitFor();
  await ctx.setOffline(false);
  step('PWA：manifest 有效，service worker 接管，离线刷新可用');

  assert.deepEqual(errors, [], '页面不应有报错：\n' + errors.join('\n'));
  step('无页面报错');
  console.log('\n全部通过。截图位于 screenshots/');
} finally {
  await browser.close();
  server.kill();
}
