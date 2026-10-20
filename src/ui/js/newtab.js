import { el, clear } from '../js/util.js';
import { icon } from '../js/icons.js';

const page = window.hinterlandPage;

const settings = {};
let strings = {};
let engine = null;

function t(key, values) {
  let text = strings[key];
  if (text === undefined) text = key.split('.').at(-1);
  if (!values) return text;
  return String(text).replaceAll(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

function value(path, fallback) {
  const found = settings[path];
  return found === undefined ? fallback : found;
}

function looksLikeUrl(text) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return true;
  if (/\s/.test(text)) return false;
  const host = text.split('/')[0];
  if (host.startsWith('localhost') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return /^[^.]+\.[^.]{2,}$/.test(host);
}

async function loadSettings() {
  const payload = (await page?.settings?.get()) ?? {};
  Object.assign(settings, payload);
}

async function saveSettings() {
  await page?.settings?.set?.({
    'start.layout': settings['start.layout'],
    'start.background': settings['start.background'],
    'start.backgroundOverlay': settings['start.backgroundOverlay'],
    'start.showClock': settings['start.showClock'],
    'start.showSearch': settings['start.showSearch'],
    'start.showGreeting': settings['start.showGreeting'],
    'start.searchTarget': settings['start.searchTarget'],
    'start.links': settings['start.links'],
  });
  paintLinks();
}

function applyTheme() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const prefix = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';

  const root = document.documentElement.style;
  root.setProperty('--accent', value('appearance.accent', '#4f7cff'));
  root.setProperty('--onAccent', value('appearance.accentContrast', '#ffffff'));
  root.setProperty('--bg', value(`appearance.${prefix}Background`, '#12141a'));
  root.setProperty('--surface', value(`appearance.${prefix}Surface`, '#1a1d26'));
  root.setProperty('--text', value(`appearance.${prefix}Text`, '#e6e9f2'));
  root.setProperty('--textDim', dark ? '#9aa2b5' : '#5d6577');
  root.setProperty('--border', value(`appearance.${prefix}Surface`, '#1a1d26'));
  root.setProperty('--borderSoft', value(`appearance.${prefix}Background`, '#12141a'));
  root.setProperty('--radius', `${Number(value('appearance.radius', 10))}px`);
  root.setProperty('--fontSize', `${Number(value('appearance.fontSize', 14))}px`);
  root.setProperty('--blur', `${Number(value('appearance.blur', 18))}px`);
  root.setProperty('--font', String(value('appearance.customFont', '')).trim() || 'system, sans-serif');
}

function paintBackdrop() {
  const backdrop = document.getElementById('backdrop');
  const source = String(value('start.background', '') ?? '').trim();
  if (!source) {
    backdrop.classList.remove('active');
    backdrop.style.backgroundImage = '';
    return;
  }
  backdrop.style.backgroundImage = `url("${source.replaceAll('"', '')}")`;
  backdrop.style.opacity = String(Number(value('start.backgroundOverlay', 0.25)));
  backdrop.classList.add('active');
}

function paintGreeting() {
  const node = document.getElementById('greeting');
  if (!value('start.showGreeting', true)) {
    node.textContent = '';
    return;
  }
  const hour = new Date().getHours();
  const key = hour < 5 ? 'night' : hour < 11 ? 'morning' : hour < 18 ? 'day' : hour < 22 ? 'evening' : 'night';
  node.textContent = t(`greeting.${key}`);
}

function paintClock() {
  const node = document.getElementById('clock');
  if (!value('start.showClock', true)) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  const code = document.documentElement.lang;
  const tick = () => {
    const now = new Date();
    clear(node);
    node.append(
      document.createTextNode(new Intl.DateTimeFormat(code, { hour: '2-digit', minute: '2-digit' }).format(now)),
      el('span', { text: new Intl.DateTimeFormat(code, { weekday: 'long', day: 'numeric', month: 'long' }).format(now) }),
    );
  };
  tick();
  setInterval(tick, 10_000);
}

function paintSearch() {
  const box = document.getElementById('searchBox');
  const input = document.getElementById('searchInput');
  const hasEngine = Boolean(engine?.url);
  box.hidden = !value('start.showSearch', true);
  if (box.hidden) return;

  document.getElementById('searchIcon').innerHTML = icon('search');
  document.getElementById('searchGo').innerHTML = icon('forward');
  input.placeholder = hasEngine ? t('start.searchPlaceholder') : t('start.noEngine');

  box.onsubmit = (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    if (looksLikeUrl(query)) {
      location.assign(looksLikeScheme(query) ? query : `https://${query}`);
      return;
    }
    if (!hasEngine) return;
    const target = engine.url.includes('{q}') ? engine.url.replaceAll('{q}', encodeURIComponent(query)) : `${engine.url}${encodeURIComponent(query)}`;
    location.assign(target);
  };

  input.focus();
}

function looksLikeScheme(text) {
  return /^(https?|hinterland|file|data|about|view-source):/i.test(text);
}

function linkNode(entry) {
  const node = el('a', { class: 'link', href: entry.url || '#', title: entry.url || '' });
  node.append(
    el('div', { class: 'linkIcon', text: (entry.title || entry.url || '?').slice(0, 1) }),
    el('div', { class: 'linkLabel', text: entry.title || entry.url || '' }),
  );
  node.addEventListener('click', (event) => {
    if (!entry.url) event.preventDefault();
  });
  return node;
}

function paintLinks() {
  const host = document.getElementById('links');
  const entries = Array.isArray(value('start.links', [])) ? value('start.links', []) : [];
  const layout = value('start.layout', 'grid');

  host.dataset.layout = layout === 'minimal' ? 'list' : layout;
  host.hidden = entries.length === 0;
  if (host.hidden) return;

  clear(host);
  for (const entry of entries) host.append(linkNode(entry));
}

function paintFoot() {
  const foot = document.getElementById('foot');
  clear(foot);
  foot.append(el('button', { type: 'button', text: t('start.editLinks'), onclick: openEditor }));
}

function openEditor() {
  const sheet = document.getElementById('editSheet');
  const editor = document.getElementById('linkEditor');

  document.getElementById('editTitle').textContent = t('start.title');
  document.getElementById('editHint').textContent = t('start.hint');
  document.getElementById('linkAdd').textContent = t('start.addLink');
  document.getElementById('linkClose').textContent = t('start.done');

  function render() {
    clear(editor);
    const entries = [...(value('start.links', []) ?? [])];
    entries.forEach((entry, index) => {
      const title = el('input', { type: 'text', value: entry.title ?? '', placeholder: 'Titel' });
      const url = el('input', { type: 'text', value: entry.url ?? '', placeholder: 'https://' });
      const commit = () => {
        entries[index] = { title: title.value, url: url.value };
        settings['start.links'] = entries;
        saveSettings();
      };
      title.addEventListener('change', commit);
      url.addEventListener('change', commit);
      editor.append(
        el('div', { class: 'listItem' }, [
          title,
          url,
          el('button', {
            class: 'iconButton',
            type: 'button',
            html: icon('trash'),
            title: strings.start.done,
            onclick: () => {
              entries.splice(index, 1);
              settings['start.links'] = entries;
              saveSettings();
              render();
            },
          }),
        ]),
      );
    });
  }

  render();
  sheet.hidden = false;

  document.getElementById('linkAdd').onclick = () => {
    settings['start.links'] = [...(settings['start.links'] ?? []), { title: '', url: '' }];
    render();
  };
  document.getElementById('linkClose').onclick = async () => {
    await saveSettings();
    sheet.hidden = true;
  };
}

function flatten(source, prefix = '', target = {}) {
  for (const [key, value] of Object.entries(source ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, target);
    else target[path] = String(value);
  }
  return target;
}

async function loadStrings() {
  const code = String(navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
  document.documentElement.lang = code;
  try {
    const response = await fetch(`locales/${code}.json`);
    if (response.ok) return flatten(await response.json());
    const fallback = await fetch('locales/en.json');
    return fallback.ok ? flatten(await fallback.json()) : {};
  } catch {
    return {};
  }
}

async function boot() {
  strings = await loadStrings();
  await loadSettings();
  const engines = (await page?.search?.engines?.()) ?? [];
  engine = engines[0] ?? null;

  applyTheme();
  paintBackdrop();
  paintGreeting();
  paintClock();
  paintSearch();
  paintLinks();
  paintFoot();
}

boot();