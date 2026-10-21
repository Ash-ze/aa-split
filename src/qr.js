// 分享链接二维码：编码使用 uqr（MIT，基于 Nayuki 的 QR Code generator），这里只负责输出 SVG。
// 由 main.js 按需动态加载，不影响首屏体积。
import { encode } from 'uqr';

/** 二维码最多能容纳的链接长度（字节模式、纠错等级 L、版本 40） */
export const QR_MAX_LENGTH = 2953;

/**
 * 编码为模块矩阵（含 4 格静区）。过长时抛错。
 * @returns {{size:number,data:boolean[][]}}
 */
export function qrMatrix(text) {
  if (text.length > QR_MAX_LENGTH) throw new Error('链接太长，无法生成二维码');
  const { size, data } = encode(text, { ecc: 'L', boostEcc: true, border: 4 });
  return { size, data };
}

/** 生成 SVG 字符串；颜色固定为白底黑码，保证任何主题下都能被扫描 */
export function qrSvg(text, { label = '分享链接二维码' } = {}) {
  const { size, data } = qrMatrix(text);
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y][x]) continue;
      let w = 1;
      while (x + w < size && data[y][x + w]) w++;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w - 1;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${label}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
