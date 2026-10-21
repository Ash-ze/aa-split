// 本地存储：多个账本保存在 localStorage。所有读写都容错（隐私模式等可能抛错）。
const KEY = 'aa-split:ledgers:v1';
const THEME_KEY = 'aa-split:theme';

export function loadLedgers() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr.filter((l) => l && l.id && Array.isArray(l.members)).map(normalize) : [];
  } catch {
    return [];
  }
}

// 兼容旧版本保存的数据：补齐后来新增的字段
function normalize(l) {
  if (!Array.isArray(l.expenses)) l.expenses = [];
  if (!Array.isArray(l.payments)) l.payments = [];
  if (!l.currency) l.currency = 'CNY';
  return l;
}

export function saveLedgers(ledgers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ledgers));
    return true;
  } catch {
    return false;
  }
}

export function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

export function saveTheme(t) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {}
}
