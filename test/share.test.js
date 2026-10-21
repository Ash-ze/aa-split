import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeLedger, decodeLedger } from '../src/share.js';
import { summarize } from '../src/settle.js';

const ledger = {
  id: 'abc123',
  name: '周末火锅',
  members: [{ id: 'x', name: '张三' }, { id: 'y', name: '李四' }, { id: 'z', name: '王五' }],
  expenses: [
    { id: 'e1', payer: 'x', amount: 35800, note: '海底捞', date: '2026-10-01', emoji: '🍲', split: { mode: 'equal', participants: ['x', 'y', 'z'] } },
    { id: 'e2', payer: 'y', amount: 9000, note: '打车', date: '2026-10-01', emoji: '🚕', split: { mode: 'shares', shares: { x: 100, y: 200 } } },
    { id: 'e3', payer: 'z', amount: 5000, note: '奶茶', date: '2026-10-02', emoji: '', split: { mode: 'exact', exact: { x: 1500, y: 2000, z: 1500 } } },
  ],
};

test('分享编码往返后结算结果一致', () => {
  const code = encodeLedger(ledger);
  assert.match(code, /^[A-Za-z0-9+\-$]+$/);
  const back = decodeLedger(code);
  assert.equal(back.id, 'abc123');
  assert.equal(back.name, '周末火锅');
  assert.deepEqual(back.members.map((m) => m.name), ['张三', '李四', '王五']);
  assert.deepEqual(back.expenses.map((e) => [e.amount, e.note, e.date, e.emoji, e.split.mode]), ledger.expenses.map((e) => [e.amount, e.note, e.date, e.emoji, e.split.mode]));
  const name = (l, id) => l.members.find((m) => m.id === id).name;
  const t1 = summarize(ledger).transfers.map((t) => [name(ledger, t.from), name(ledger, t.to), t.amount]);
  const t2 = summarize(back).transfers.map((t) => [name(back, t.from), name(back, t.to), t.amount]);
  assert.deepEqual(t2, t1);
});

test('损坏或恶意的数据被拒绝', () => {
  assert.throws(() => decodeLedger('not-valid'));
  assert.throws(() => decodeLedger(''));
});
