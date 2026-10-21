// 账目分类：快捷选择用的 6 个分类，存储时只保存表情。
export const CATEGORIES = [
  { emoji: '🍜', label: '餐饮' },
  { emoji: '🚕', label: '交通' },
  { emoji: '🏨', label: '住宿' },
  { emoji: '🎫', label: '门票' },
  { emoji: '🛍️', label: '购物' },
  { emoji: '📦', label: '其他' },
];

// 旧版本可选的表情，仍能显示对应分类名
const LEGACY = { '🍲': '餐饮', '🍺': '餐饮', '☕': '餐饮', '🛒': '购物', '🚄': '交通', '✈️': '交通', '🎤': '娱乐', '🏠': '房租', '💡': '水电', '🎁': '礼物', '💊': '医药' };

/** 表情 -> 分类名；未知返回空字符串 */
export function categoryLabel(emoji) {
  return CATEGORIES.find((c) => c.emoji === emoji)?.label || LEGACY[emoji] || '';
}
