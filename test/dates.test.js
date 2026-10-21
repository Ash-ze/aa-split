import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekday, cnDate, dayLabel, addDays, dateRange, groupByDay, todayISO } from '../src/dates.js';

test('weekday / cnDate：固定中文格式，与运行环境语言无关', () => {
  assert.equal(weekday('2026-10-21'), '周三');
  assert.equal(weekday('2026-10-25'), '周日');
  assert.equal(cnDate('2026-10-21', '2026-10-21'), '10月21日 周三');
  assert.equal(cnDate('2026-01-05', '2026-10-21'), '1月5日 周一');
  assert.equal(cnDate('2025-12-31', '2026-10-21'), '2025年12月31日 周三');
  assert.equal(cnDate('', '2026-10-21'), '未填日期');
  assert.equal(cnDate('bad', '2026-10-21'), '未填日期');
});

test('dayLabel：今天、昨天额外标注', () => {
  assert.equal(dayLabel('2026-10-21', '2026-10-21'), '10月21日 周三 · 今天');
  assert.equal(dayLabel('2026-10-20', '2026-10-21'), '10月20日 周二 · 昨天');
  assert.equal(dayLabel('2026-10-19', '2026-10-21'), '10月19日 周一');
  assert.equal(dayLabel('2025-12-31', '2026-01-01'), '2025年12月31日 周三 · 昨天');
});

test('addDays 跨月跨年', () => {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('todayISO 使用本地日期', () => {
  assert.equal(todayISO(new Date(2026, 9, 1, 23, 59)), '2026-10-01');
});

test('dateRange', () => {
  assert.equal(dateRange([]), '');
  assert.equal(dateRange(['', '2026-10-01']), '2026年10月1日');
  assert.equal(dateRange(['2026-10-03', '2026-10-01', '2026-10-02']), '2026年10月1日 – 10月3日');
  assert.equal(dateRange(['2025-12-30', '2026-01-02']), '2025年12月30日 – 2026年1月2日');
});

test('groupByDay：按天倒序分组并计算每日小计，未填日期排最后', () => {
  const ex = [
    { id: 'a', date: '2026-10-20', amount: 100, createdAt: 1 },
    { id: 'b', date: '2026-10-21', amount: 250, createdAt: 2 },
    { id: 'c', date: '2026-10-20', amount: 300, createdAt: 3 },
    { id: 'd', date: '', amount: 7, createdAt: 4 },
  ];
  const g = groupByDay(ex);
  assert.deepEqual(
    g.map((x) => [x.date, x.items.map((e) => e.id), x.total]),
    [
      ['2026-10-21', ['b'], 250],
      ['2026-10-20', ['c', 'a'], 400],
      ['', ['d'], 7],
    ],
  );
  assert.equal(g.reduce((a, x) => a + x.total, 0), 657);
});
