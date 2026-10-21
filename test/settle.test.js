import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, splitExpense, computeBalances, settle, summarize } from '../src/settle.js';
import { parseAmount, formatCents, yuan, parseWeight } from '../src/money.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('parseAmount: 各种输入转为整数分', () => {
  assert.equal(parseAmount('12'), 1200);
  assert.equal(parseAmount('12.5'), 1250);
  assert.equal(parseAmount('12.05'), 1205);
  assert.equal(parseAmount('0.1'), 10);
  assert.equal(parseAmount('¥1,234.56'), 123456);
  assert.equal(parseAmount('￥ 8.'), 800);
  assert.equal(parseAmount('0.29'), 29); // 0.29*100 在浮点下是 28.999…，这里必须精确
  assert.equal(parseAmount('1.005'), null);
  assert.equal(parseAmount('-3'), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
});

test('formatCents / yuan', () => {
  assert.equal(formatCents(2350), '23.50');
  assert.equal(formatCents(5), '0.05');
  assert.equal(formatCents(123456789), '1,234,567.89');
  assert.equal(yuan(-2350), '-¥23.50');
  assert.equal(yuan(0), '¥0.00');
});

test('parseWeight', () => {
  assert.equal(parseWeight('1'), 100);
  assert.equal(parseWeight('1.5'), 150);
  assert.equal(parseWeight('0'), 0);
  assert.equal(parseWeight('-1'), null);
  assert.equal(parseWeight('x'), null);
});

test('allocate: 均分余数按顺序分配给前面的人', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(200, [1, 1, 1]), [67, 67, 66]);
  assert.deepEqual(allocate(1, [1, 1, 1]), [1, 0, 0]);
  assert.deepEqual(allocate(0, [1, 1]), [0, 0]);
});

test('allocate: 按权重使用最大余数法', () => {
  // 1000 按 1:2 => 333.33 / 666.67 -> 小数部分大的第二人得到余下的 1 分
  assert.deepEqual(allocate(1000, [1, 2]), [333, 667]);
  assert.deepEqual(allocate(1000, [0, 1]), [0, 1000]);
  assert.deepEqual(allocate(10001, [150, 100, 100]), [4286, 2858, 2857]);
});

test('allocate: 总和恒等于原金额（随机测试）', () => {
  let seed = 42;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
  for (let k = 0; k < 2000; k++) {
    const total = rnd(1_000_000);
    const weights = Array.from({ length: 1 + rnd(12) }, () => rnd(500));
    if (sum(weights) === 0) weights[0] = 1;
    const r = allocate(total, weights);
    assert.equal(sum(r), total);
    r.forEach((v, i) => {
      const exact = (total * weights[i]) / sum(weights);
      assert.ok(Math.abs(v - exact) < 1, '每份与理论值相差不足 1 分');
    });
  }
});

test('allocate: 非法输入抛错', () => {
  assert.throws(() => allocate(100, [0, 0]));
  assert.throws(() => allocate(-1, [1]));
  assert.throws(() => allocate(1.5, [1]));
});

const order = ['a', 'b', 'c', 'd'];

test('splitExpense: 均分只在参与者间分摊，顺序按成员顺序', () => {
  const m = splitExpense({ amount: 100, split: { mode: 'equal', participants: ['c', 'a', 'b'] } }, order);
  assert.deepEqual(Object.fromEntries(m), { a: 34, b: 33, c: 33 });
});

test('splitExpense: 按份数', () => {
  const m = splitExpense({ amount: 9000, split: { mode: 'shares', shares: { a: 200, b: 100, c: 0 } } }, order);
  assert.deepEqual(Object.fromEntries(m), { a: 6000, b: 3000 });
});

test('splitExpense: 指定金额，合计必须一致', () => {
  const m = splitExpense({ amount: 1000, split: { mode: 'exact', exact: { a: 300, b: 700, c: 0 } } }, order);
  assert.deepEqual(Object.fromEntries(m), { a: 300, b: 700 });
  assert.throws(() => splitExpense({ amount: 1000, split: { mode: 'exact', exact: { a: 300 } } }, order));
  assert.throws(() => splitExpense({ amount: 1000, split: { mode: 'equal', participants: [] } }, order));
});

function ledger(expenses, names = ['张三', '李四', '王五', '赵六']) {
  return { id: 't', name: 't', members: names.map((n, i) => ({ id: order[i], name: n })), expenses };
}

test('computeBalances: 余额之和为 0', () => {
  const l = ledger([
    { payer: 'a', amount: 10000, split: { mode: 'equal', participants: ['a', 'b', 'c'] } },
    { payer: 'b', amount: 3333, split: { mode: 'equal', participants: ['a', 'b', 'c', 'd'] } },
  ]);
  const b = computeBalances(l);
  assert.equal(sum(b.map((x) => x.balance)), 0);
  const a = b.find((x) => x.id === 'a');
  assert.equal(a.paid, 10000);
  assert.equal(a.owed, 3334 + 834);
});

test('settle: 经典例子', () => {
  // 张三付 300 三人均分 -> 李四、王五各欠张三 100
  const l = ledger(
    [{ payer: 'a', amount: 30000, split: { mode: 'equal', participants: ['a', 'b', 'c'] } }],
    ['张三', '李四', '王五'],
  );
  l.members = l.members.slice(0, 3);
  const { transfers, total } = summarize(l);
  assert.equal(total, 30000);
  assert.deepEqual(transfers, [
    { from: 'b', to: 'a', amount: 10000 },
    { from: 'c', to: 'a', amount: 10000 },
  ]);
});

test('settle: 最大债务人优先配对最大债权人', () => {
  const t = settle([
    { id: 'a', balance: 5000 },
    { id: 'b', balance: 2000 },
    { id: 'c', balance: -6000 },
    { id: 'd', balance: -1000 },
  ]);
  assert.deepEqual(t, [
    { from: 'c', to: 'a', amount: 5000 },
    { from: 'c', to: 'b', amount: 1000 },
    { from: 'd', to: 'b', amount: 1000 },
  ]);
});

test('settle: 全部结清时无需转账；余额不平抛错', () => {
  assert.deepEqual(settle([{ id: 'a', balance: 0 }, { id: 'b', balance: 0 }]), []);
  assert.deepEqual(settle([]), []);
  assert.throws(() => settle([{ id: 'a', balance: 1 }]));
});

test('settle: 随机账本转账后所有人归零，且笔数 <= n-1', () => {
  let seed = 7;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
  for (let k = 0; k < 300; k++) {
    const n = 2 + rnd(8);
    const ids = Array.from({ length: n }, (_, i) => 'm' + i);
    const expenses = Array.from({ length: rnd(20) }, () => {
      const parts = ids.filter(() => rnd(2));
      return {
        payer: ids[rnd(n)],
        amount: 1 + rnd(100000),
        split: { mode: 'equal', participants: parts.length ? parts : [ids[0]] },
      };
    });
    const l = { members: ids.map((id) => ({ id, name: id })), expenses };
    const { balances, transfers } = summarize(l);
    const left = new Map(balances.map((b) => [b.id, b.balance]));
    for (const t of transfers) {
      assert.ok(t.amount > 0);
      left.set(t.from, left.get(t.from) + t.amount);
      left.set(t.to, left.get(t.to) - t.amount);
    }
    for (const v of left.values()) assert.equal(v, 0);
    assert.ok(transfers.length <= Math.max(0, n - 1));
  }
});

test('浮点陷阱：0.1 + 0.2 元三人均分仍精确', () => {
  const l = ledger([
    { payer: 'a', amount: parseAmount('0.1'), split: { mode: 'equal', participants: ['a', 'b', 'c'] } },
    { payer: 'b', amount: parseAmount('0.2'), split: { mode: 'equal', participants: ['a', 'b', 'c'] } },
  ]);
  l.members = l.members.slice(0, 3);
  const { balances, total } = summarize(l);
  assert.equal(total, 30);
  assert.deepEqual(balances.map((b) => b.balance), [10 - 4 - 7, 20 - 3 - 7, -3 - 6]);
});
