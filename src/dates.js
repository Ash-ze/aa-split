// 日期工具：账目日期统一存为 "YYYY-MM-DD"，显示时固定用中文格式，不受浏览器语言影响。

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = '日一二三四五六';

function parts(date) {
  const m = DATE_RE.exec(date || '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** 本地时区的今天："2026-10-21" */
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-10-21" 加减天数 */
export function addDays(date, n) {
  const p = parts(date);
  if (!p) return date;
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

/** "2026-10-21" -> "周三" */
export function weekday(date) {
  const p = parts(date);
  return p ? '周' + WEEKDAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] : '';
}

/**
 * 中文短日期："10月21日 周三"；不在今年时带年份："2025年10月21日 周二"。
 * @param {string} date YYYY-MM-DD
 * @param {string} [today] YYYY-MM-DD，用于判断年份
 */
export function cnDate(date, today = todayISO()) {
  const p = parts(date);
  if (!p) return '未填日期';
  const year = today.slice(0, 4) === String(p[0]) ? '' : `${p[0]}年`;
  return `${year}${p[1]}月${p[2]}日 ${weekday(date)}`;
}

/** 分组标题：今天、昨天会额外标出，例如 "10月21日 周三 · 今天" */
export function dayLabel(date, today = todayISO()) {
  const base = cnDate(date, today);
  if (date === today) return `${base} · 今天`;
  if (date === addDays(today, -1)) return `${base} · 昨天`;
  return base;
}

/** 日期范围："2026年10月1日 – 10月3日"，同一天只显示一次 */
export function dateRange(dates) {
  const ds = dates.filter((d) => parts(d)).sort();
  if (!ds.length) return '';
  const f = (d) => {
    const [y, m, day] = parts(d);
    return `${y}年${m}月${day}日`;
  };
  const a = ds[0];
  const b = ds.at(-1);
  if (a === b) return f(a);
  return `${f(a)} – ${a.slice(0, 4) === b.slice(0, 4) ? f(b).slice(5) : f(b)}`;
}

/**
 * 按天分组（日期倒序，同一天内后记的在前，未填日期排最后），附带每天小计。
 * @returns {{date:string,items:object[],total:number}[]}
 */
export function groupByDay(expenses) {
  const sorted = [...expenses].sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0),
  );
  const groups = new Map();
  for (const e of sorted) {
    const k = e.date || '';
    if (!groups.has(k)) groups.set(k, { date: k, items: [], total: 0 });
    const g = groups.get(k);
    g.items.push(e);
    g.total += e.amount;
  }
  return [...groups.values()];
}
