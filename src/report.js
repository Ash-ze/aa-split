// 结算文本：排版成适合直接粘贴到微信群的纯文本。
import { money } from './money.js';
import { dateRange } from './dates.js';

/**
 * @param {object} ledger
 * @param {ReturnType<import('./settle.js').summarize>} s
 */
export function settlementText(ledger, s) {
  const fmt = (v) => money(v, ledger.currency);
  const name = (id) => ledger.members.find((m) => m.id === id)?.name ?? '已删除成员';
  const n = ledger.members.length;
  const range = dateRange(ledger.expenses.map((e) => e.date));
  const lines = [
    `🧾【${ledger.name}】AA 结算`,
    `总支出 ${fmt(s.total)} · ${ledger.expenses.length} 笔 · ${n} 人 · 人均 ${fmt(n ? Math.round(s.total / n) : 0)}`,
  ];
  if (range) lines.push(`📅 ${range}`);
  lines.push('');

  const { done, count } = s.progress;
  if (!count) {
    lines.push('🎉 已经两清啦，无需转账');
  } else {
    lines.push(done === count ? `💸 转账方案（已全部结清 ${done}/${count}）` : done ? `💸 转账方案（已结清 ${done}/${count}）` : `💸 转账方案（共 ${count} 笔）`);
    s.transfers.forEach((t, i) => lines.push(`${i + 1}. ${name(t.from)} → ${name(t.to)} ${fmt(t.amount)}`));
    for (const p of s.payments) lines.push(`✅ ${name(p.from)} → ${name(p.to)} ${fmt(p.amount)}（已转）`);
  }

  lines.push('', '📋 每人明细');
  for (const b of s.balances) {
    const state = b.balance > 0 ? `应收 ${fmt(b.balance)}` : b.balance < 0 ? `应付 ${fmt(-b.balance)}` : '已结清';
    lines.push(`${b.name}：付 ${fmt(b.paid)}，摊 ${fmt(b.owed)}，${state}`);
  }
  lines.push('', '—— 由「AA 分账」生成');
  return lines.join('\n');
}
