// 分账核心算法：拆分每笔支出 -> 汇总每人余额 -> 生成最少转账方案。
// 所有金额均为整数「分」。

/**
 * 按整数权重把 total 分拆，结果之和严格等于 total。
 * 采用最大余数法：先向下取整，剩余的分按小数部分从大到小依次 +1，
 * 小数部分相同则按传入顺序（即成员顺序）优先，结果确定可复现。
 * @param {number} total 整数分，>= 0
 * @param {number[]} weights 非负整数权重
 * @returns {number[]}
 */
export function allocate(total, weights) {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('total 必须是非负整数');
  const W = weights.reduce((a, b) => a + b, 0);
  if (!(W > 0)) throw new Error('权重之和必须大于 0');
  if (!Number.isSafeInteger(total * Math.max(...weights))) throw new Error('数值过大');
  const result = weights.map((w) => Math.floor((total * w) / W));
  let rem = total - result.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, frac: (total * w) % W }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rem > 0; k++, rem--) result[order[k].i] += 1;
  return result;
}

/**
 * 计算一笔支出中每个成员应承担的金额。
 * expense.split:
 *   { mode: 'equal',  participants: [memberId...] }
 *   { mode: 'shares', shares: { memberId: 整数权重(份数*100) } }
 *   { mode: 'exact',  exact:  { memberId: 分 } }   // 之和必须等于 amount
 * @param {object} expense
 * @param {string[]} memberOrder 账本成员 id 顺序，用于确定余数分配顺序
 * @returns {Map<string, number>}
 */
export function splitExpense(expense, memberOrder) {
  const { amount, split } = expense;
  const out = new Map();
  if (!split) throw new Error('缺少分摊方式');
  const rank = new Map(memberOrder.map((id, i) => [id, i]));
  const byOrder = (ids) =>
    ids.filter((id) => rank.has(id)).sort((a, b) => rank.get(a) - rank.get(b));

  if (split.mode === 'exact') {
    const ids = byOrder(Object.keys(split.exact || {}));
    let sum = 0;
    for (const id of ids) {
      const v = split.exact[id];
      if (!Number.isSafeInteger(v) || v < 0) throw new Error('指定金额无效');
      if (v > 0) out.set(id, v);
      sum += v;
    }
    if (sum !== amount) throw new Error('指定金额之和与总额不一致');
    return out;
  }

  let ids, weights;
  if (split.mode === 'shares') {
    ids = byOrder(Object.keys(split.shares || {})).filter((id) => split.shares[id] > 0);
    weights = ids.map((id) => split.shares[id]);
    if (weights.some((w) => !Number.isSafeInteger(w))) throw new Error('份数无效');
  } else {
    ids = byOrder([...new Set(split.participants || [])]);
    weights = ids.map(() => 1);
  }
  if (ids.length === 0) throw new Error('至少需要一位分摊成员');
  allocate(amount, weights).forEach((v, i) => {
    if (v > 0) out.set(ids[i], v);
  });
  return out;
}

/**
 * 汇总每个成员的已付、应摊与余额（余额 > 0 表示应收，< 0 表示应付）。
 * ledger.payments 为已标记完成的转账 { from, to, amount }：转出方余额增加、收款方余额减少，
 * 因此后续生成的转账方案只包含尚未完成的部分。
 * @returns {{id:string,name:string,paid:number,owed:number,sent:number,received:number,balance:number}[]}
 */
export function computeBalances(ledger) {
  const order = ledger.members.map((m) => m.id);
  const rows = new Map(
    ledger.members.map((m) => [m.id, { id: m.id, name: m.name, paid: 0, owed: 0, sent: 0, received: 0, balance: 0 }]),
  );
  for (const e of ledger.expenses) {
    const payer = rows.get(e.payer);
    if (!payer) continue;
    payer.paid += e.amount;
    for (const [id, v] of splitExpense(e, order)) rows.get(id).owed += v;
  }
  for (const p of ledger.payments || []) {
    const from = rows.get(p.from);
    const to = rows.get(p.to);
    if (!from || !to || from === to) continue;
    from.sent += p.amount;
    to.received += p.amount;
  }
  for (const r of rows.values()) r.balance = r.paid - r.owed + r.sent - r.received;
  return [...rows.values()];
}

/**
 * 贪心生成转账方案：每次让「欠得最多的人」转给「应收最多的人」，
 * 金额取两者绝对值较小者。相同金额时按成员顺序优先，结果确定。
 * 至多产生 n-1 笔转账。
 * @param {{id:string,balance:number}[]} balances
 * @returns {{from:string,to:string,amount:number}[]}
 */
export function settle(balances) {
  const total = balances.reduce((a, b) => a + b.balance, 0);
  if (total !== 0) throw new Error('余额之和必须为 0');
  const people = balances.map((b, i) => ({ id: b.id, i, v: b.balance }));
  const transfers = [];
  const pick = (pred, cmp) => {
    let best = null;
    for (const p of people) if (pred(p) && (!best || cmp(p, best))) best = p;
    return best;
  };
  for (;;) {
    const cred = pick((p) => p.v > 0, (a, b) => a.v > b.v);
    const debt = pick((p) => p.v < 0, (a, b) => a.v < b.v);
    if (!cred || !debt) break;
    const amt = Math.min(cred.v, -debt.v);
    transfers.push({ from: debt.id, to: cred.id, amount: amt });
    cred.v -= amt;
    debt.v += amt;
  }
  return transfers;
}

/**
 * 便捷函数：账本 -> { balances, transfers, total, payments, progress }
 * transfers 为尚未完成的转账；progress.done / progress.count 用于显示「已结清 2/3」。
 */
export function summarize(ledger) {
  const balances = computeBalances(ledger);
  const transfers = settle(balances);
  const total = ledger.expenses.reduce((a, e) => a + e.amount, 0);
  const ids = new Set(ledger.members.map((m) => m.id));
  const payments = (ledger.payments || []).filter((p) => ids.has(p.from) && ids.has(p.to) && p.from !== p.to);
  const progress = { done: payments.length, count: payments.length + transfers.length };
  return { balances, transfers, total, payments, progress };
}
