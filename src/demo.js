// 示例账本：首次打开时一键体验完整流程（日期以今天为基准往前排）。
import { newId } from './id.js';
import { todayISO, addDays } from './dates.js';
import { summarize } from './settle.js';

export function buildDemoLedger(today = todayISO()) {
  const names = ['小王', '小李', '阿珍', '大刘'];
  const members = names.map((name) => ({ id: newId(), name }));
  const [w, l, z, d] = members.map((m) => m.id);
  const all = [w, l, z, d];
  const day = (n) => addDays(today, n - 2);
  let t = Date.now() - 1000;
  const e = (date, payer, amount, note, emoji, split) => ({ id: newId(), createdAt: t++, payer, amount, note, date, emoji, split });
  const expenses = [
    e(day(0), w, 29200, '高铁票', '🚕', { mode: 'equal', participants: all }),
    e(day(0), l, 26800, '午饭 · 知味观', '🍜', { mode: 'equal', participants: all }),
    e(day(0), z, 98000, '民宿两晚（大刘只住一晚）', '🏨', { mode: 'shares', shares: { [w]: 200, [l]: 200, [z]: 200, [d]: 100 } }),
    e(day(1), d, 22000, '西湖游船', '🎫', { mode: 'equal', participants: all }),
    e(day(1), w, 61200, '晚饭 · 楼外楼', '🍜', { mode: 'equal', participants: all }),
    e(day(1), z, 7600, '奶茶', '🍜', { mode: 'equal', participants: [w, l, z] }),
    e(day(2), l, 4350, '打车回民宿', '🚕', { mode: 'equal', participants: all }),
    e(day(2), d, 30000, '伴手礼', '🛍️', { mode: 'exact', exact: { [w]: 8000, [l]: 12000, [d]: 10000 } }),
  ];
  const now = Date.now();
  const ledger = { id: newId(), name: '杭州周末游（示例）', currency: 'CNY', members, expenses, payments: [], createdAt: now, updatedAt: now };
  // 演示「标记已转账」：第一笔转账已完成
  const first = summarize(ledger).transfers[0];
  if (first) ledger.payments.push({ id: newId(), from: first.from, to: first.to, amount: first.amount, at: now });
  return ledger;
}
