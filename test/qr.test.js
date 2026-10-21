import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { qrMatrix, qrSvg, QR_MAX_LENGTH } from '../src/qr.js';

// 把模块矩阵画成 RGBA 位图，再用 jsQR 解码，验证二维码内容可被扫描
function decode({ size, data }, scale = 4) {
  const w = size * scale;
  const px = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[Math.floor(y / scale)][Math.floor(x / scale)] ? 0 : 255;
      px.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return jsQR(px, w, w)?.data;
}

test('分享链接二维码可被正确解码', () => {
  const url = 'https://ash-ze.github.io/aa-split/#s=N4IgbiBcCMA0IEsogE4FMZRPAdswv2qBheollyg6sqApcoKemgHHaC' + 'x'.repeat(300);
  assert.equal(decode(qrMatrix(url)), url);
});

test('较长链接（约 1500 字符）也能解码', () => {
  let s = '';
  for (let i = 0; s.length < 1500; i++) s += 'AbC-$+' + i;
  const url = 'https://example.com/#s=' + s;
  assert.equal(decode(qrMatrix(url), 3), url);
});

test('超过容量时抛出友好错误；SVG 输出', () => {
  assert.throws(() => qrMatrix('x'.repeat(QR_MAX_LENGTH + 1)), /太长/);
  const svg = qrSvg('hello');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
  assert.ok(svg.includes('fill="#fff"') && svg.includes('<path d="M'));
});
