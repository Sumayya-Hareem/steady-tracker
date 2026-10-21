// Tiny DOM toolkit. Elements are built with h()/svg() — never from HTML
// strings — so user-typed text can't be interpreted as markup (no XSS by
// construction), and views update the nodes they own instead of rebuilding pages.

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROPERTY_KEYS = new Set(['value', 'checked', 'disabled', 'hidden', 'htmlFor', 'type', 'min', 'max', 'step', 'id', 'tabIndex', 'selected', 'open', 'name', 'rows', 'placeholder', 'autocomplete']);

function setProps(el, props, isSvg) {
  for (const [key, val] of Object.entries(props || {})) {
    if (val == null || val === false) continue;
    if (key === 'class') el.setAttribute('class', Array.isArray(val) ? val.filter(Boolean).join(' ') : val);
    else if (key === 'style' && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) (k.startsWith('--') ? el.style.setProperty(k, v) : (el.style[k] = v));
    } else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    else if (!isSvg && PROPERTY_KEYS.has(key)) el[key] = val;
    else el.setAttribute(key, val === true ? '' : String(val));
  }
}

export function append(parent, children) {
  for (const child of children) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/** Replace an element's children, skipping null/false and flattening arrays (unlike replaceChildren). */
export function fill(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  setProps(el, props, false);
  return append(el, children);
}

export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  setProps(el, props, true);
  return append(el, children);
}

/** Minimal inline formatting for static copy: **bold** and *italic*, as DOM nodes. */
export function rich(text) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean).map((part) => {
    if (part.startsWith('**')) return h('strong', null, part.slice(2, -2));
    if (part.startsWith('*')) return h('em', null, part.slice(1, -1));
    return part;
  });
}

/* ---------- toast ---------- */

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ---------- sheets & confirmations (native <dialog>: focus trap + Esc for free) ---------- */

// Drawn here (not imported from icons.js) so dom.js has no dependency cycle.
const closeIcon = () => svg('svg', { class: 'icon', width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'aria-hidden': 'true' }, svg('path', { d: 'M18 6 6 18M6 6l12 12' }));

export function openSheet({ title, body }) {
  const dialog = h('dialog', { class: 'sheet', 'aria-label': title });
  const close = () => dialog.close();
  const header = h('div', { class: 'sheet-head' },
    h('h2', null, title),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, closeIcon()));
  dialog.append(header, h('div', { class: 'sheet-body' }, body));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return { close, el: dialog };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const sheet = openSheet({
      title,
      body: [
        h('p', { class: 'muted' }, message),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => sheet.close() }, 'Cancel'),
          h('button', { class: ['btn', danger && 'danger-solid'], type: 'button', onclick: () => { answer = true; sheet.close(); } }, confirmLabel)),
      ],
    });
    sheet.el.addEventListener('close', () => resolve(answer));
  });
}

/** Offer a text/JSON file to the user as a download. */
export function download(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
}
