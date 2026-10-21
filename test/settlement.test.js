import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, computeBalances } from '../src/settle.js';
import { encodeLedger, decodeLedger, pack, unpack } from '../src/share.js';
import { settlementText } from '../src/report.js';
import { buildDemoLedger } from '../src/demo.js';
import LZString from 'lz-string';

const base = () => ({
  id: 'trip1',
  name: '云南行',
  currency: 'CNY',
  members: [{ id: 'a', name: '张三' }, { id: 'b', name: '李四' }, { id: 'c', name: '王五' }],
  expenses: [{ id: 'e1', payer: 'a', amount: 30000, note: '晚饭', date: '2026-10-20', emoji: '🍜', split: { mode: 'equal', participants: ['a', 'b', 'c'] } }],
  payments: [],
});

test('标记已转账：从余额中扣除，剩余方案只含未完成部分', () => {
  const l = base();
  let s = summarize(l);
  assert.equal(s.transfers.length, 2);
  assert.deepEqual(s.progress, { done: 0, count: 2 });
  const t = s.transfers[0];
  l.payments.push({ id: 'p1', from: t.from, to: t.to, amount: t.amount });
  s = summarize(l);
  assert.deepEqual(s.progress, { done: 1, count: 2 });
  assert.deepEqual(s.transfers, [{ from: 'c', to: 'a', amount: 10000 }]);
  const b = computeBalances(l).find((x) => x.id === 'b');
  assert.equal(b.balance, 0);
  assert.equal(b.sent, 10000);
  assert.equal(s.total, 30000, '转账不计入总支出');
  l.payments.push({ id: 'p2', from: 'c', to: 'a', amount: 10000 });
  s = summarize(l);
  assert.deepEqual(s.progress, { done: 2, count: 2 });
  assert.equal(s.transfers.length, 0);
});

test('已转账后又新增账目：方案在已转基础上重新计算', () => {
  const l = base();
  l.payments.push({ id: 'p1', from: 'b', to: 'a', amount: 10000 });
  l.expenses.push({ id: 'e2', payer: 'b', amount: 6000, split: { mode: 'equal', participants: ['a', 'b', 'c'] } });
  const s = summarize(l);
  // 张三 +20000-2000=+18000-10000(收到)；李四 -10000+6000-2000+10000=+4000；王五 -12000
  assert.deepEqual(s.transfers, [{ from: 'c', to: 'a', amount: 8000 }, { from: 'c', to: 'b', amount: 4000 }]);
  assert.deepEqual(s.progress, { done: 1, count: 3 });
});

test('分享链接包含币种、已转账记录与常用参与人', () => {
  const l = base();
  l.currency = 'JPY';
  l.payments.push({ id: 'p1', from: 'b', to: 'a', amount: 10000 });
  l.defaultParticipants = ['a', 'c'];
  const back = decodeLedger(encodeLedger(l));
  assert.equal(back.currency, 'JPY');
  const name = (id) => back.members.find((m) => m.id === id).name;
  assert.deepEqual(back.payments.map((p) => [name(p.from), name(p.to), p.amount]), [['李四', '张三', 10000]]);
  assert.deepEqual(back.defaultParticipants.map(name), ['张三', '王五']);
  assert.deepEqual(summarize(back).progress, { done: 1, count: 2 });
});

test('人民币账本不写入多余字段，旧链接（无新字段）仍可导入', () => {
  const data = pack(base());
  assert.equal(data.c, undefined);
  assert.equal(data.p, undefined);
  assert.equal(data.d, undefined);
  const old = { v: 1, i: 'x1', n: '旧账本', m: ['甲', '乙'], e: [[0, 1000, '', '', '', 0, [0, 1]]] };
  const l = decodeLedger(LZString.compressToEncodedURIComponent(JSON.stringify(old)));
  assert.equal(l.currency, 'CNY');
  assert.deepEqual(l.payments, []);
});

test('非法的币种或转账记录被拒绝', () => {
  const ok = pack(base());
  assert.throws(() => unpack({ ...ok, c: 'BTC' }), /币种/);
  assert.throws(() => unpack({ ...ok, c: 'toString' }), /币种/);
  assert.throws(() => unpack({ ...ok, p: [[0, 0, 100]] }), /转账/);
  assert.throws(() => unpack({ ...ok, p: [[0, 9, 100]] }), /转账/);
  assert.throws(() => unpack({ ...ok, p: [[1, 0, -5]] }), /转账/);
  assert.throws(() => unpack({ ...ok, p: [[1, 0, 1.5]] }), /转账/);
  assert.throws(() => unpack({ ...ok, p: 'x' }), /转账/);
});

test('结算文本：适合粘贴到微信', () => {
  const l = base();
  l.payments.push({ id: 'p1', from: 'b', to: 'a', amount: 10000 });
  const text = settlementText(l, summarize(l));
  const lines = text.split('\n');
  assert.equal(lines[0], '🧾【云南行】AA 结算');
  assert.equal(lines[1], '总支出 ¥300.00 · 1 笔 · 3 人 · 人均 ¥100.00');
  assert.equal(lines[2], '📅 2026年10月20日');
  assert.ok(lines.includes('💸 转账方案（已结清 1/2）'));
  assert.ok(lines.includes('1. 王五 → 张三 ¥100.00'));
  assert.ok(lines.includes('✅ 李四 → 张三 ¥100.00（已转）'));
  assert.ok(lines.includes('张三：付 ¥300.00，摊 ¥100.00，应收 ¥100.00'));
  assert.ok(lines.includes('李四：付 ¥0.00，摊 ¥100.00，已结清'));
});

test('结算文本：外币与两清', () => {
  const l = base();
  l.currency = 'HKD';
  l.expenses[0].split = { mode: 'equal', participants: ['a'] };
  const text = settlementText(l, summarize(l));
  assert.ok(text.includes('总支出 HK$300.00'));
  assert.ok(text.includes('🎉 已经两清啦，无需转账'));
});

test('示例账本：数据有效、可结算、可分享往返', () => {
  const demo = buildDemoLedger('2026-10-21');
  assert.ok(demo.name.includes('示例'));
  assert.ok(demo.members.length >= 3 && demo.expenses.length >= 6);
  assert.ok(new Set(demo.expenses.map((e) => e.split.mode)).size === 3, '三种分摊方式都有');
  assert.deepEqual([...new Set(demo.expenses.map((e) => e.date))].sort(), ['2026-10-19', '2026-10-20', '2026-10-21']);
  const s = summarize(demo);
  assert.equal(s.progress.done, 1);
  assert.ok(s.progress.count > 1);
  assert.equal(s.balances.reduce((a, b) => a + b.balance, 0), 0);
  const back = decodeLedger(encodeLedger(demo));
  assert.deepEqual(summarize(back).progress, s.progress);
  assert.equal(summarize(back).total, s.total);
});
