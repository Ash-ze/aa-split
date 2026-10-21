// 无后端分享：把整个账本压缩编码进 URL hash。
// 格式（v1）：紧凑 JSON -> lz-string compressToEncodedURIComponent（URL 安全）。
// 可选字段：c 币种（缺省为人民币）、p 已完成的转账、d 常用参与人；旧链接没有这些字段也能正常导入。
import LZString from 'lz-string';
import { newId } from './id.js';
import { CURRENCIES, DEFAULT_CURRENCY } from './money.js';

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZString;

const MODES = ['equal', 'shares', 'exact'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = { members: 100, expenses: 5000, payments: 1000, text: 200 };

/** 账本 -> 紧凑结构（成员用下标引用） */
export function pack(ledger) {
  const idx = new Map(ledger.members.map((m, i) => [m.id, i]));
  const e = ledger.expenses
    .filter((x) => idx.has(x.payer))
    .map((x) => {
      const s = x.split;
      let sd;
      if (s.mode === 'exact') sd = Object.entries(s.exact).filter(([id]) => idx.has(id)).map(([id, v]) => [idx.get(id), v]);
      else if (s.mode === 'shares') sd = Object.entries(s.shares).filter(([id]) => idx.has(id)).map(([id, v]) => [idx.get(id), v]);
      else sd = s.participants.filter((id) => idx.has(id)).map((id) => idx.get(id));
      return [idx.get(x.payer), x.amount, x.note || '', x.date || '', x.emoji || '', MODES.indexOf(s.mode), sd];
    });
  const out = { v: 1, i: ledger.id, n: ledger.name, m: ledger.members.map((m) => m.name), e };
  if (ledger.currency && ledger.currency !== DEFAULT_CURRENCY) out.c = ledger.currency;
  const p = (ledger.payments || [])
    .filter((x) => idx.has(x.from) && idx.has(x.to) && x.from !== x.to)
    .map((x) => [idx.get(x.from), idx.get(x.to), x.amount]);
  if (p.length) out.p = p;
  const d = (ledger.defaultParticipants || []).filter((id) => idx.has(id)).map((id) => idx.get(id));
  if (d.length) out.d = d;
  return out;
}

const str = (v, max = LIMITS.text) => (typeof v === 'string' ? v.slice(0, max) : '');
const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
const isCents = (v) => Number.isSafeInteger(v) && v >= 0;

/** 紧凑结构 -> 账本（严格校验，链接内容视为不可信输入） */
export function unpack(data) {
  if (!data || data.v !== 1 || !Array.isArray(data.m) || !Array.isArray(data.e)) throw new Error('格式不支持');
  if (data.m.length < 1 || data.m.length > LIMITS.members || data.e.length > LIMITS.expenses) throw new Error('数据超出限制');
  const members = data.m.map((name) => ({ id: newId(), name: str(name, 40) || '成员' }));
  const n = members.length;
  const mid = (i) => members[i].id;
  const expenses = data.e.map((row) => {
    if (!Array.isArray(row)) throw new Error('账目格式错误');
    const [p, amount, note, date, emoji, mode, sd] = row;
    if (!isIdx(p, n) || !isCents(amount) || amount === 0 || !MODES[mode] || !Array.isArray(sd)) throw new Error('账目数据无效');
    let split;
    if (MODES[mode] === 'equal') {
      if (!sd.every((i) => isIdx(i, n)) || sd.length === 0) throw new Error('分摊成员无效');
      split = { mode: 'equal', participants: [...new Set(sd)].map(mid) };
    } else {
      const obj = {};
      for (const pair of sd) {
        if (!Array.isArray(pair) || !isIdx(pair[0], n) || !isCents(pair[1])) throw new Error('分摊数据无效');
        obj[mid(pair[0])] = pair[1];
      }
      if (MODES[mode] === 'exact') {
        const sum = Object.values(obj).reduce((a, b) => a + b, 0);
        if (sum !== amount) throw new Error('指定金额不一致');
        split = { mode: 'exact', exact: obj };
      } else {
        if (!Object.values(obj).some((w) => w > 0)) throw new Error('份数无效');
        split = { mode: 'shares', shares: obj };
      }
    }
    return {
      id: newId(),
      payer: mid(p),
      amount,
      note: str(note, 100),
      date: DATE_RE.test(date) ? date : '',
      emoji: str(emoji, 8),
      split,
    };
  });
  if (data.c !== undefined && (typeof data.c !== 'string' || !Object.prototype.hasOwnProperty.call(CURRENCIES, data.c))) throw new Error('币种不支持');
  const pays = data.p ?? [];
  if (!Array.isArray(pays) || pays.length > LIMITS.payments) throw new Error('转账记录无效');
  const payments = pays.map((row) => {
    if (!Array.isArray(row) || !isIdx(row[0], n) || !isIdx(row[1], n) || row[0] === row[1] || !isCents(row[2]) || row[2] === 0) {
      throw new Error('转账记录无效');
    }
    return { id: newId(), from: mid(row[0]), to: mid(row[1]), amount: row[2] };
  });
  const defs = Array.isArray(data.d) ? [...new Set(data.d.filter((i) => isIdx(i, n)))].map(mid) : [];
  const now = Date.now();
  return {
    id: typeof data.i === 'string' && /^[\w-]{1,40}$/.test(data.i) ? data.i : newId(),
    name: str(data.n, 60) || '分享的账本',
    members,
    expenses,
    payments,
    currency: data.c || DEFAULT_CURRENCY,
    ...(defs.length ? { defaultParticipants: defs } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function encodeLedger(ledger) {
  return compressToEncodedURIComponent(JSON.stringify(pack(ledger)));
}

export function decodeLedger(encoded) {
  const json = decompressFromEncodedURIComponent(encoded);
  if (!json) throw new Error('链接无效或已损坏');
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('链接无效或已损坏');
  }
  return unpack(data);
}

/** 生成分享链接：当前页面地址 + #s=<数据> */
export function shareUrl(ledger, base = location.href) {
  const url = new URL(base);
  url.hash = 's=' + encodeLedger(ledger);
  return url.toString();
}
