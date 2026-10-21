// 用 canvas 把结算结果画成 PNG，方便直接发到微信群。
import { money } from './money.js';
import { dateRange } from './dates.js';

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Zen Hei",system-ui,sans-serif';
const W = 375; // 逻辑宽度（CSS 像素）
const SCALE = 3; // 输出 1125px 宽，聊天里看也清晰
const PAD = 20;

const C = {
  bg: '#f3f5f7',
  card: '#ffffff',
  text: '#16181d',
  sub: '#6b7280',
  line: '#e8ebef',
  accent: '#12a37f',
  accent2: '#0c7d61',
  pos: '#0f9a76',
  neg: '#e5553b',
};

function font(size, weight = 400) {
  return `${weight} ${size}px ${FONT}`;
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @returns {Promise<Blob>}
 */
export function renderSettlementImage(ledger, summary) {
  const { balances, transfers, total } = summary;
  const payments = summary.payments || [];
  const progress = summary.progress || { done: 0, count: transfers.length };
  const name = (id) => ledger.members.find((m) => m.id === id)?.name ?? '?';
  const yuan = (v) => money(v, ledger.currency);
  const rowsT = [...transfers.map((t) => ({ ...t, done: false })), ...payments.map((p) => ({ ...p, done: true }))];

  const HEADER = 150;
  const ROW_T = 52;
  const ROW_B = 46;
  const transfersH = 48 + (rowsT.length ? rowsT.length * ROW_T : 56) + 12;
  const balancesH = 48 + 26 + balances.length * ROW_B + 12;
  const H = HEADER + 16 + transfersH + 14 + balancesH + 60;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // 头部
  const g = ctx.createLinearGradient(0, 0, W, HEADER);
  g.addColorStop(0, '#1cbf93');
  g.addColorStop(1, C.accent2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HEADER);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath();
  ctx.arc(W - 30, 20, 90, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.font = font(13, 500);
  ctx.fillText('AA 结算单', PAD, 30);
  ctx.fillStyle = '#fff';
  ctx.font = font(24, 700);
  ctx.fillText(fit(ctx, ledger.name, W - PAD * 2), PAD, 62);
  ctx.font = font(13);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  const meta = [dateRange(ledger.expenses.map((e) => e.date)), `${ledger.expenses.length} 笔 · ${ledger.members.length} 人`].filter(Boolean).join('  ·  ');
  ctx.fillText(fit(ctx, meta, W - PAD * 2), PAD, 90);
  ctx.font = font(13);
  ctx.fillText('总支出', PAD, 122);
  ctx.font = font(22, 700);
  ctx.fillStyle = '#fff';
  ctx.fillText(yuan(total), PAD + 48, 121);

  let y = HEADER + 16;

  // 转账方案
  ctx.fillStyle = C.card;
  rrect(ctx, 12, y, W - 24, transfersH, 14);
  ctx.fill();
  ctx.fillStyle = C.text;
  ctx.font = font(16, 700);
  ctx.fillText('转账方案', PAD + 8, y + 26);
  ctx.fillStyle = C.sub;
  ctx.font = font(12);
  ctx.textAlign = 'right';
  const right = !progress.count ? '' : progress.done ? `已结清 ${progress.done}/${progress.count}` : `共 ${progress.count} 笔`;
  if (progress.done) ctx.fillStyle = C.pos;
  ctx.fillText(right, W - PAD - 8, y + 26);
  ctx.textAlign = 'left';
  let ry = y + 48;
  if (!rowsT.length) {
    ctx.fillStyle = C.sub;
    ctx.font = font(15);
    ctx.textAlign = 'center';
    ctx.fillText('已经两清啦，无需转账', W / 2, ry + 26);
    ctx.textAlign = 'left';
  }
  rowsT.forEach((t, i) => {
    if (i > 0) {
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD + 8, ry, W - PAD * 2 - 16, 1);
    }
    const cy = ry + ROW_T / 2;
    ctx.font = font(16, 600);
    ctx.fillStyle = t.done ? C.sub : C.text;
    const from = fit(ctx, name(t.from), 84);
    ctx.fillText(from, PAD + 8, cy);
    let x = PAD + 8 + ctx.measureText(from).width + 10;
    ctx.strokeStyle = t.done ? C.sub : C.accent;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + 22, cy);
    ctx.moveTo(x + 16, cy - 5);
    ctx.lineTo(x + 22, cy);
    ctx.lineTo(x + 16, cy + 5);
    ctx.stroke();
    x += 32;
    ctx.fillText(fit(ctx, name(t.to), 84), x, cy);
    ctx.textAlign = 'right';
    ctx.font = font(17, 700);
    const amt = yuan(t.amount);
    if (t.done) {
      ctx.fillStyle = C.sub;
      ctx.font = font(15, 600);
      ctx.fillText(amt, W - PAD - 8, cy - 7);
      const aw = ctx.measureText(amt).width;
      ctx.fillRect(W - PAD - 8 - aw, cy - 7, aw, 1.2);
      ctx.fillStyle = C.pos;
      ctx.font = font(11, 600);
      ctx.fillText('✓ 已转账', W - PAD - 8, cy + 11);
    } else {
      ctx.fillStyle = C.neg;
      ctx.fillText(amt, W - PAD - 8, cy);
    }
    ctx.textAlign = 'left';
    ry += ROW_T;
  });

  y += transfersH + 14;

  // 每人明细
  ctx.fillStyle = C.card;
  rrect(ctx, 12, y, W - 24, balancesH, 14);
  ctx.fill();
  ctx.fillStyle = C.text;
  ctx.font = font(16, 700);
  ctx.fillText('每人明细', PAD + 8, y + 26);
  const cols = [W - PAD - 8 - 170, W - PAD - 8 - 88, W - PAD - 8];
  ctx.font = font(12);
  ctx.fillStyle = C.sub;
  ctx.textAlign = 'right';
  ['已付', '应摊', '余额'].forEach((h, i) => ctx.fillText(h, cols[i], y + 58));
  ctx.textAlign = 'left';
  ry = y + 74;
  balances.forEach((b, i) => {
    if (i > 0) {
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD + 8, ry, W - PAD * 2 - 16, 1);
    }
    const cy = ry + ROW_B / 2;
    ctx.font = font(15, 600);
    ctx.fillStyle = C.text;
    ctx.fillText(fit(ctx, b.name, cols[0] - PAD - 8 - 70), PAD + 8, cy);
    ctx.textAlign = 'right';
    ctx.font = font(13);
    ctx.fillStyle = C.sub;
    ctx.fillText(yuan(b.paid), cols[0], cy);
    ctx.fillText(yuan(b.owed), cols[1], cy);
    ctx.font = font(14, 700);
    ctx.fillStyle = b.balance > 0 ? C.pos : b.balance < 0 ? C.neg : C.sub;
    ctx.fillText(b.balance > 0 ? '+' + yuan(b.balance) : b.balance < 0 ? yuan(b.balance) : '已结清', cols[2], cy);
    ctx.textAlign = 'left';
    ry += ROW_B;
  });

  // 页脚
  ctx.fillStyle = '#9aa1ab';
  ctx.font = font(11);
  ctx.textAlign = 'center';
  const d = new Date();
  ctx.fillText(`由「AA 分账」生成 · ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`, W / 2, H - 28);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('生成图片失败'))), 'image/png'),
  );
}
