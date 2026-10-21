// 从 public/icon.svg 生成 PWA 所需的 PNG 图标和社交分享预览图 og.png（需要 Playwright 的 Chromium）。
// 用法：npm run icons
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
async function shot(file, size, { maskable = false, rounded = true } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const inner = maskable ? Math.round(size * 0.8) : size;
  let s = svg;
  if (!rounded) s = s.replace(/rx="112"/, 'rx="0"');
  await page.setContent(
    `<html><body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:${maskable ? '#12a37f' : 'transparent'}">
      <div style="width:${inner}px;height:${inner}px">${s.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: new URL(file, out).pathname, omitBackground: !maskable && rounded });
}
await shot('icon-192.png', 192);
await shot('icon-512.png', 512);
await shot('maskable-512.png', 512, { maskable: true, rounded: false });
await shot('apple-touch-icon.png', 180, { rounded: false });

// Open Graph 预览图（1200×630），微信 / Telegram / Twitter 等分享链接时显示
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;display:flex;align-items:center;gap:64px;padding:0 96px;box-sizing:border-box;
  background:linear-gradient(135deg,#1cbf93,#0c7d61);color:#fff;font-family:'PingFang SC','Noto Sans CJK SC','Source Han Sans SC','WenQuanYi Zen Hei',sans-serif">
  <div style="flex:none;width:260px;height:260px;filter:drop-shadow(0 18px 40px rgba(0,0,0,.25))">${svg.replace('<svg ', '<svg width="260" height="260" ')}</div>
  <div><div style="font-size:96px;font-weight:800;letter-spacing:2px">AA 分账</div>
  <div style="margin-top:18px;font-size:44px;opacity:.95">一起花的钱，轻松算清</div>
  <div style="margin-top:30px;font-size:30px;opacity:.8">聚餐 · 旅行 · 合租 · 无需注册 · 扫码分享</div></div></body></html>`);
await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname });
await browser.close();
console.log('icons + og.png generated');
