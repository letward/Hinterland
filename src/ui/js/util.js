export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value !== null && value !== undefined && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node?.firstChild) node.firstChild.remove();
  return node;
}

export function debounce(fn, wait = 120) {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  wrapped.flush = (...args) => {
    wrapped.cancel();
    fn(...args);
  };
  return wrapped;
}

export function throttle(fn, wait = 100) {
  let last = 0;
  let pending = null;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
      return;
    }
    if (!pending) {
      pending = setTimeout(() => {
        pending = null;
        last = Date.now();
        fn(...args);
      }, wait - (now - last));
    }
  };
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let size = value;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(milliseconds) {
  const total = Math.max(0, Math.round(Number(milliseconds) || 0) / 1000);
  if (total < 60) return `${Math.round(total)} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function formatTime(timestamp, language) {
  const value = Number(timestamp);
  if (!value) return '';
  const date = new Date(value);
  const now = Date.now();
  if (now - value < 86_400_000) {
    return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
}

export function relativeTime(timestamp, language) {
  const value = Number(timestamp);
  if (!value) return '';
  const seconds = Math.round((value - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const steps = [
    [60, 'second', 1],
    [3600, 'minute', 60],
    [86_400, 'hour', 3600],
    [2_592_000, 'day', 86_400],
    [31_536_000, 'month', 2_592_000],
    [Infinity, 'year', 31_536_000],
  ];
  for (const [limit, unit, divisor] of steps) {
    if (Math.abs(seconds) < limit) return formatter.format(Math.round(seconds / divisor), unit);
  }
  return formatTime(value, language);
}

export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return String(url ?? '').replace(/^https?:\/\//, '').split('/')[0];
  }
}

export function isInternal(url) {
  return typeof url === 'string' && url.startsWith('hinterland://');
}

export function isSecure(url) {
  return typeof url === 'string' && url.startsWith('https://');
}

export function prettyUrl(url) {
  const value = String(url ?? '');
  if (isInternal(value)) return value;
  try {
    const parsed = new URL(value);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.hostname.replace(/^www\./, '')}${path}${parsed.search}`;
  } catch {
    return value;
  }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export async function copyToClipboard(text, autoClearSeconds = 0) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (autoClearSeconds > 0) {
      setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText();
          if (current === text) {
            await navigator.clipboard.writeText('');
          }
        } catch {
          // Ignore read permissions or blur errors
        }
      }, autoClearSeconds * 1000);
    }
  } catch (e) {
    console.warn('[Hinterland] Clipboard write failed:', e);
  }
}