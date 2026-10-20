import { get, settings } from './store.js';

const FONT_STACKS = {
  system: 'system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  humanist: '"Optima", Candara, "Gill Sans", "Trebuchet MS", sans-serif',
  geometric: 'Avenir, Futura, "Century Gothic", "URW Gothic", sans-serif',
  mono: 'ui, "Cascadia Code", "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace',
};

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

export function resolvedTheme() {
  const choice = get('appearance.theme', 'system');
  if (choice === 'light' || choice === 'dark') return choice;
  return systemDark.matches ? 'dark' : 'light';
}

function setVar(name, value) {
  document.documentElement.style.setProperty(name, value);
}

function safeColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : fallback;
}

export function applyTheme() {
  const root = document.documentElement;
  const theme = resolvedTheme();
  root.dataset.theme = theme;

  const prefix = theme === 'light' ? 'light' : 'dark';
  const background = safeColor(get(`appearance.${prefix}Background`), theme === 'light' ? '#f2f3f7' : '#12141a');
  const surface = safeColor(get(`appearance.${prefix}Surface`), theme === 'light' ? '#ffffff' : '#1a1d26');
  const text = safeColor(get(`appearance.${prefix}Text`), theme === 'light' ? '#161923' : '#e6e9f2');

  setVar('--accent', safeColor(get('appearance.accent'), '#4f7cff'));
  setVar('--onAccent', safeColor(get('appearance.accentContrast'), '#ffffff'));
  setVar('--bg', background);
  setVar('--surface', surface);
  setVar('--text', text);

  const luminance = relativeLuminance(get('appearance.accent'));
  setVar('--onAccent', luminance > 0.55 ? '#111318' : safeColor(get('appearance.accentContrast'), '#ffffff'));

  const radius = Math.max(0, Math.min(24, Number(get('appearance.radius', 10))));
  setVar('--radius', `${radius}px`);

  const fontSize = Math.max(10, Math.min(20, Number(get('appearance.fontSize', 14))));
  setVar('--fontSize', `${fontSize}px`);

  const blur = Math.max(0, Math.min(40, Number(get('appearance.blur', 18))));
  setVar('--blur', `${blur}px`);
  if (blur > 0) setVar('--shadow', `0 12px 34px rgb(0 0 0 / ${Math.round(16 + blur * 1.1)}%)`);

  const custom = String(get('appearance.customFont', '')).trim();
  const stack = FONT_STACKS[get('appearance.fontStack', 'system')] ?? FONT_STACKS.system;
  setVar('--font', custom ? `${custom}, ${stack}` : stack);

  root.dataset.density = get('appearance.density', 'cosy');
  root.dataset.animations = get('appearance.animations', true) ? 'on' : 'off';
  root.dataset.compact = get('appearance.compactTitlebar') ? 'true' : 'false';
  root.dataset.tabbar = get('tabs.position', 'top');
  root.dataset.closeButton = get('tabs.hoverClose', true) ? 'hover' : 'always';

  setVar('--tabWidth', `${Math.max(90, Math.min(420, Number(get('tabs.width', 210))))}px`);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) setVar('--anim', '0ms');

  document.body.style.background = 'transparent';
  const current = settings();
  if (current) document.title = 'Hinterland';
}

function relativeLuminance(color) {
  const value = String(color ?? '').trim();
  if (!value.startsWith('#')) return 0;
  let hex = value.slice(1);
  if (hex.length === 3) hex = hex.split('').map((part) => part + part).join('');
  if (hex.length < 6) return 0;
  const channels = [0, 2, 4].map((index) => {
    const part = parseInt(hex.slice(index, index + 2), 16) / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function accentPresets() {
  return ['#4f7cff', '#7a5cff', '#c04cff', '#ff4c8b', '#ff6b4a', '#ffb020', '#22c08a', '#12b8b0', '#5b8def', '#8b93a8'];
}

export function watchSystemTheme(callback) {
  systemDark.addEventListener('change', () => {
    if (get('appearance.theme', 'system') === 'system') {
      applyTheme();
      callback?.();
    }
  });
}