import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatCents, money, toInput, currencyOf, CURRENCIES } from '../src/money.js';
import { allocate } from '../src/settle.js';

test('money：各币种符号与小数位', () => {
  assert.equal(money(2350), '¥23.50');
  assert.equal(money(2350, 'CNY'), '¥23.50');
  assert.equal(money(-100, 'HKD'), '-HK$1.00');
  assert.equal(money(1200, 'JPY'), 'JP¥1,200');
  assert.equal(money(1234567, 'KRW'), '₩1,234,567');
  assert.equal(money(999, 'USD'), '$9.99');
  assert.equal(money(5, 'EUR'), '€0.05');
  assert.equal(money(100, 'XXX'), '¥1.00', '未知币种回退为人民币');
});

test('formatCents 支持 0 位小数', () => {
  assert.equal(formatCents(0, 0), '0');
  assert.equal(formatCents(1234, 0), '1,234');
  assert.equal(formatCents(-1234, 0), '-1,234');
});

test('parseAmount：按币种小数位解析为整数最小单位', () => {
  assert.equal(parseAmount('1200', 0), 1200);
  assert.equal(parseAmount('1,200', 0), 1200);
  assert.equal(parseAmount('JP¥1200', 0), 1200);
  assert.equal(parseAmount('1200.', 0), 1200);
  assert.equal(parseAmount('12.5', 0), null, '日元不允许小数');
  assert.equal(parseAmount('HK$ 30.5'), 3050);
  assert.equal(parseAmount('$9.99'), 999);
  assert.equal(parseAmount('€0.1'), 10);
  assert.equal(parseAmount('USD 3'), 300);
  assert.equal(parseAmount('x12'), null);
  assert.equal(parseAmount('12.345'), null);
});

test('toInput：编辑回填不带千分位', () => {
  assert.equal(toInput(123456), '1234.56');
  assert.equal(toInput(123456, 'JPY'), '123456');
});

test('所有币种定义完整', () => {
  for (const [code, c] of Object.entries(CURRENCIES)) {
    assert.match(code, /^[A-Z]{3}$/);
    assert.ok(c.name && c.symbol && c.unit, code);
    assert.ok(c.digits === 0 || c.digits === 2, code);
    assert.equal(currencyOf(code), c);
  }
});

test('日元：整数单位均分，总额不变', () => {
  const jpy = parseAmount('10000', 0);
  assert.deepEqual(allocate(jpy, [1, 1, 1]), [3334, 3333, 3333]);
});
