// 通用 UI 小工具：转义、图标、底部弹层、对话框、提示。

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2.5z"/><path d="M4 19.5A2 2 0 0 0 6 21h14v-4"/><path d="M9 7.5h7M9 11h5"/>',
};

export function icon(name, size = 22) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

/** 打开底部弹层。返回 { el, close }。 */
export function openSheet({ title, body, footer = '', onClose, className = '' }) {
  const root = document.createElement('div');
  root.className = 'sheet-backdrop';
  root.innerHTML = `
    <div class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="关闭">${icon('close')}</button>
      </div>
      <div class="sheet-body">${body}</div>
      ${footer ? `<div class="sheet-foot">${footer}</div>` : ''}
    </div>`;
  document.body.append(root);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => root.classList.add('open'));
  let closed = false;
  const onKey = (e) => {
    if (e.key === 'Escape' && [...document.querySelectorAll('.sheet-backdrop')].at(-1) === root) close();
  };
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    root.classList.remove('open');
    root.classList.add('closing');
    setTimeout(() => {
      root.remove();
      if (!document.querySelector('.sheet-backdrop')) document.body.classList.remove('no-scroll');
    }, 200);
    onClose?.(result);
  }
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  return { el: root, close };
}

/** 确认对话框：buttons = [{ label, value, kind }]，返回所选 value（取消为 null） */
export function ask({ title, message = '', buttons }) {
  return new Promise((resolve) => {
    let value = null;
    const { el, close } = openSheet({
      title,
      className: buttons.length > 2 ? 'dialog menu' : 'dialog',
      body: message ? `<p class="dialog-msg">${message}</p>` : '',
      footer: buttons
        .map((b, i) => `<button type="button" class="btn ${b.kind || ''}" data-i="${i}">${esc(b.label)}</button>`)
        .join(''),
      onClose: () => resolve(value),
    });
    el.querySelectorAll('[data-i]').forEach((btn) =>
      btn.addEventListener('click', () => {
        value = buttons[Number(btn.dataset.i)].value;
        close();
      }),
    );
  });
}

export function confirmDanger(title, message, label = '删除') {
  return ask({ title, message, buttons: [{ label: '取消', value: false }, { label, value: true, kind: 'danger' }] }).then(Boolean);
}

/** 文本输入对话框，返回字符串或 null */
export function promptText({ title, value = '', placeholder = '', maxLength = 40, okLabel = '确定' }) {
  return new Promise((resolve) => {
    let result = null;
    const { el, close } = openSheet({
      title,
      className: 'dialog',
      body: `<form class="prompt-form"><input class="input" name="v" maxlength="${maxLength}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" required /></form>`,
      footer: `<button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" data-ok>${esc(okLabel)}</button>`,
      onClose: () => resolve(result),
    });
    const input = el.querySelector('input');
    const submit = () => {
      const v = input.value.trim();
      if (!v) return input.focus();
      result = v;
      close();
    };
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });
    el.querySelector('[data-ok]').addEventListener('click', submit);
    setTimeout(() => input.focus(), 50);
  });
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}
