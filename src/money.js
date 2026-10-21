// 金额统一以「最小货币单位」（整数）存储与计算，避免浮点误差。
// 人民币等两位小数的币种为「分」，日元、韩元等无小数的币种即为「元」本身。

const MAX_MINOR = 99_999_999_99; // 单笔上限（远小于 2^53）

/** 支持的币种：symbol 显示符号，digits 小数位数，unit 用于「元 / 港元」等单位文字 */
export const CURRENCIES = {
  CNY: { name: '人民币', symbol: '¥', digits: 2, unit: '元' },
  HKD: { name: '港币', symbol: 'HK$', digits: 2, unit: '港元' },
  MOP: { name: '澳门元', symbol: 'MOP$', digits: 2, unit: '澳门元' },
  TWD: { name: '新台币', symbol: 'NT$', digits: 0, unit: '元' },
  JPY: { name: '日元', symbol: 'JP¥', digits: 0, unit: '日元' },
  KRW: { name: '韩元', symbol: '₩', digits: 0, unit: '韩元' },
  USD: { name: '美元', symbol: '$', digits: 2, unit: '美元' },
  EUR: { name: '欧元', symbol: '€', digits: 2, unit: '欧元' },
  GBP: { name: '英镑', symbol: '£', digits: 2, unit: '英镑' },
  THB: { name: '泰铢', symbol: '฿', digits: 2, unit: '泰铢' },
  SGD: { name: '新加坡元', symbol: 'S$', digits: 2, unit: '新元' },
  MYR: { name: '马来西亚林吉特', symbol: 'RM', digits: 2, unit: '林吉特' },
  AUD: { name: '澳元', symbol: 'A$', digits: 2, unit: '澳元' },
};

export const DEFAULT_CURRENCY = 'CNY';

/** 取币种信息，未知代码回退为人民币 */
export function currencyOf(code) {
  return CURRENCIES[code] || CURRENCIES[DEFAULT_CURRENCY];
}

const escRe = (s) => s.replace(/[$.*+?^()[\]{}|\\]/g, '\\$&');
// 允许输入时带上币种符号或代码，例如 "¥12"、"HK$ 30"、"JPY 1200"
const PREFIX = new RegExp(
  '^(?:' +
    [...new Set(['￥', '¥', '$', ...Object.keys(CURRENCIES), ...Object.values(CURRENCIES).map((c) => c.symbol)])]
      .sort((a, b) => b.length - a.length)
      .map(escRe)
      .join('|') +
    ')',
  'i',
);

/**
 * 把用户输入的金额字符串解析为整数最小单位。
 * digits=2（默认）："12" -> 1200、"12.5" -> 1250、"¥1,234.5" -> 123450；
 * digits=0："1200" -> 1200，"12.5" 无效。无效输入返回 null。
 */
export function parseAmount(input, digits = 2) {
  if (typeof input === 'number') input = String(input);
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(PREFIX, '').replace(/[,，\s]/g, '');
  const m = new RegExp(`^(\\d+)(?:\\.(\\d{0,${digits}}))?$`).exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = digits ? Number((m[2] || '').padEnd(digits, '0')) : 0;
  const minor = whole * 10 ** digits + frac;
  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) return null;
  return minor;
}

/** 2350 -> "23.50"，-2350 -> "-23.50"；digits=0 时 2350 -> "2,350" */
export function formatCents(cents, digits = 2) {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const base = 10 ** digits;
  const whole = String(Math.floor(abs / base)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = digits ? '.' + String(abs % base).padStart(digits, '0') : '';
  return `${neg ? '-' : ''}${whole}${frac}`;
}

/** 按币种格式化：money(2350) -> "¥23.50"，money(-100, 'HKD') -> "-HK$1.00"，money(1200, 'JPY') -> "JP¥1,200" */
export function money(minor, code = DEFAULT_CURRENCY) {
  const c = currencyOf(code);
  return minor < 0 ? `-${c.symbol}${formatCents(-minor, c.digits)}` : `${c.symbol}${formatCents(minor, c.digits)}`;
}

/** 人民币格式化：2350 -> "¥23.50" */
export function yuan(cents) {
  return money(cents, 'CNY');
}

/** 编辑时回填输入框用：不带千分位 */
export function toInput(minor, code = DEFAULT_CURRENCY) {
  return formatCents(minor, currencyOf(code).digits).replace(/,/g, '');
}

/** 份数（支持最多两位小数）转为整数权重：1.5 -> 150 */
export function parseWeight(input) {
  const s = String(input ?? '').trim();
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const w = Math.round(Number(s) * 100);
  return Number.isSafeInteger(w) && w <= 1_000_000 ? w : null;
}
