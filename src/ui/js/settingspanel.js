import { el, clear, uid, clamp } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { get, settings as store } from './store.js';
import { accentPresets } from './theme.js';
import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';

const api = () => window.hinterland;

let schema = null;
let sections = [];

export function setSchema(payload) {
  schema = payload;
  sections = payload?.sections ?? [];
}

function valueAt(key) {
  return get(key);
}

async function write(key, value) {
  await api().settings.set(key, value);
}

function optionRow(definition, control) {
  const hint = t(definition.descKey);
  return el('div', { class: 'option' }, [
    el('div', { class: 'optionText' }, [
      el('div', { class: 'optionLabel', text: t(definition.labelKey) }),
      hint ? el('div', { class: 'optionHint', text: hint }) : null,
    ]),
    el('div', { class: 'optionControl' }, control ? [].concat(control) : []),
  ]);
}

/* ------------------------------------------------------------------ controls */

function boolControl(definition) {
  const key = definition.key;
  const button = el('button', {
    class: 'switch',
    type: 'button',
    role: 'switch',
    'aria-checked': String(Boolean(valueAt(key))),
  });
  button.addEventListener('click', async () => {
    const next = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(next));
    await write(key, next);
  });
  return button;
}

function numberControl(definition) {
  const key = definition.key;
  const input = el('input', {
    class: 'numberInput',
    type: 'number',
    min: definition.min,
    max: definition.max,
    step: definition.step ?? 1,
    value: String(valueAt(key)),
  });
  input.addEventListener('change', () => {
    const value = clamp(Number(input.value), definition.min ?? -Infinity, definition.max ?? Infinity);
    input.value = String(value);
    write(key, value);
  });

  const wrap = el('div', { class: 'numberWrap' }, [input]);
  if (definition.unit) wrap.append(el('span', { class: 'optionHint', text: definition.unit }));

  const max = definition.max ?? 100;
  const min = definition.min ?? 0;
  if (max - min <= 200) {
    const slider = el('input', { class: 'sliderInput', type: 'range', min, max, step: definition.step ?? 1, value: String(valueAt(key)) });
    slider.addEventListener('input', () => {
      input.value = slider.value;
    });
    slider.addEventListener('change', () => write(key, Number(slider.value)));
    wrap.append(slider);
  }
  return wrap;
}

function textControl(definition) {
  const key = definition.key;
  const input = el('input', { class: 'textInput wide', type: 'text', placeholder: definition.placeholder ?? '', value: valueAt(key) ?? '' });
  input.addEventListener('change', () => write(key, input.value));
  return input;
}

function areaControl(definition) {
  const key = definition.key;
  const area = el('textarea', {
    class: 'areaInput',
    rows: definition.rows ?? 8,
    placeholder: definition.placeholder ?? '',
    spellcheck: 'false',
  });
  area.value = valueAt(key) ?? '';
  let timer = null;
  area.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => write(key, area.value), 350);
  });
  return area;
}

function selectControl(definition) {
  const key = definition.key;
  const select = el('select', { class: 'selectInput' });
  for (const option of definition.options ?? []) {
    select.append(el('option', { value: option.value, selected: option.value === valueAt(key) }, [t(option.labelKey)]));
  }
  select.addEventListener('change', () => write(key, select.value));
  return select;
}

function colorControl(definition) {
  const key = definition.key;
  const picker = el('input', { class: 'colorInput', type: 'color', value: normalise(valueAt(key)) });
  const hex = el('input', { class: 'colorHex', type: 'text', spellcheck: 'false', value: valueAt(key) });

  const push = async (value) => {
    picker.value = normalise(value);
    hex.value = value;
    await write(key, value);
  };

  picker.addEventListener('input', () => push(picker.value));
  hex.addEventListener('change', () => {
    const value = hex.value.trim();
    if (!/^#[0-9a-f]{3,8}$/i.test(value)) {
      hex.value = valueAt(key);
      return;
    }
    push(value);
  });

  const chips = el(
    'div',
    { class: 'chips' },
    accentPresets().map((value) => {
      const chip = el('button', {
        class: `chip${value.toLowerCase() === String(valueAt(key)).toLowerCase() ? ' active' : ''}`,
        type: 'button',
        style: { background: value },
        title: value,
      });
      chip.addEventListener('click', () => {
        for (const other of chips.children) other.classList.remove('active');
        chip.classList.add('active');
        push(value);
      });
      return chip;
    }),
  );

  return el('div', { class: 'numberWrap' }, [picker, hex, chips]);
}

function normalise(value) {
  const text = String(value ?? '#000000');
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toLowerCase();
  }
  return '#000000';
}

function listControl(definition) {
  const key = definition.key;
  const editor = el('div', { class: 'listEditor' });
  const fields = Object.keys(definition.itemSchema ?? { value: 'text' });

  const commit = async (items) => {
    await write(key, items);
    render();
  };

  function render() {
    clear(editor);
    const items = structuredClone(valueAt(key) ?? []);

    items.forEach((item, index) => {
      const row = el('div', { class: 'listItem' }, [
        el(
          'div',
          { class: 'listItemFields' },
          fields.map((field) => {
            const type = definition.itemSchema[field];
            if (type === 'bool') {
              const button = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(item[field] !== false) });
              button.addEventListener('click', () => {
                items[index][field] = button.getAttribute('aria-checked') !== 'true';
                commit(items);
              });
              return el('div', { class: 'numberWrap' }, [
                button,
                el('span', { class: 'optionHint', text: field }),
              ]);
            }
            const input = el('input', { class: 'textInput', type: 'text', value: item[field] ?? '', placeholder: field });
            input.addEventListener('change', () => {
              items[index][field] = input.value;
              commit(items);
            });
            return input;
          }),
        ),
        moveButton(items, index, -1, key),
        moveButton(items, index, 1, key),
        iconButton('trash', t('action.remove'), () => {
          items.splice(index, 1);
          commit(items);
        }),
      ]);
      editor.append(row);
    });

    const add = el('button', { class: 'button', type: 'button', onclick: () => {
      const item = { id: uid() };
      for (const field of fields) item[field] = definition.itemSchema[field] === 'bool' ? true : '';
      items.push(item);
      commit(items);
    } }, [
      el('span', { html: icon('plus') }),
      ` ${t('action.add')}`,
    ]);
    editor.append(el('div', { class: 'actionRow' }, [add]));
  }

  render();
  return editor;
}

function moveButton(items, index, delta, key) {
  const target = index + delta;
  return iconButton(delta < 0 ? 'back' : 'forward', delta < 0 ? t('action.up') : t('action.down'), () => {
    if (target < 0 || target >= items.length) return;
    const [item] = items.splice(index, 1);
    items.splice(target, 0, item);
    write(key, items);
  });
}

function pairControl(definition) {
  const key = definition.key;
  const editor = el('div', { class: 'listEditor' });

  function render() {
    clear(editor);
    const pairs = Object.entries(valueAt(key) ?? {});

    pairs.forEach(([name, value], index) => {
      const nameInput = el('input', { class: 'textInput', type: 'text', value: name, placeholder: t('settings.pair.key') });
      const valueInput = el('input', { class: 'textInput', type: 'text', value, placeholder: t('settings.pair.value') });
      const update = async () => {
        const next = {};
        for (const [entryName, entryValue] of Object.entries(valueAt(key) ?? {})) {
          if (entryName === name) next[nameInput.value.trim()] = valueInput.value;
          else next[entryName] = entryValue;
        }
        await write(key, next);
        render();
      };
      nameInput.addEventListener('change', update);
      valueInput.addEventListener('change', update);
      editor.append(
        el('div', { class: 'listItem' }, [
          el('div', { class: 'listItemFields' }, [nameInput, valueInput]),
          iconButton('trash', t('action.remove'), () => {
            const next = { ...(valueAt(key) ?? {}) };
            delete next[name];
            write(key, next).then(render);
          }),
        ]),
      );
    });

    editor.append(
      el('button', { class: 'button', type: 'button', onclick: () => {
        const next = { ...(valueAt(key) ?? {}) };
        next[`${t('settings.pair.newKey')}${Object.keys(next).length + 1}`] = '';
        write(key, next).then(render);
      } }, [
        el('span', { html: icon('plus') }),
        ` ${t('action.add')}`,
      ]),
    );
  }

  render();
  return editor;
}

function shortcutControl(definition) {
  const key = definition.key;
  const editor = el('div', { class: 'listEditor' });
  const defaults = shortcutDefaults();

  function render() {
    clear(editor);
    const custom = valueAt(key) ?? {};
    const names = [...new Set([...Object.keys(defaults), ...Object.keys(custom)])].sort();

    for (const action of names) {
      const display = el('button', { class: 'button', type: 'button', style: { minWidth: '170px', justifyContent: 'center' } });
      display.textContent = custom[action] || defaults[action] || t('shortcuts.unset');
      display.addEventListener('click', () => {
        display.textContent = t('shortcuts.press');
        const listener = (event) => {
          event.preventDefault();
          event.stopPropagation();
          window.removeEventListener('keydown', listener, true);
          const combo = comboFrom(event);
          const next = { ...(valueAt(key) ?? {}) };
          if (combo) next[action] = combo;
          else delete next[action];
          write(key, next).then(render);
        };
        window.addEventListener('keydown', listener, true);
      });

      editor.append(
        el('div', { class: 'listItem' }, [
          el('div', { class: 'optionText' }, [el('div', { class: 'optionLabel', text: t(`shortcuts.action.${action}`) })]),
          display,
          iconButton('refresh', t('action.reset'), () => {
            const next = { ...(valueAt(key) ?? {}) };
            delete next[action];
            write(key, next).then(render);
          }),
        ]),
      );
    }
  }

  render();
  return editor;
}

let cachedShortcuts = {};

export function setShortcutDefaults(defaults) {
  cachedShortcuts = defaults ?? {};
}

function shortcutDefaults() {
  return cachedShortcuts;
}

function comboFrom(event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const key = event.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join('+');
}

const CONTROLS = {
  bool: boolControl,
  number: numberControl,
  text: textControl,
  textarea: areaControl,
  select: selectControl,
  color: colorControl,
  list: listControl,
  keyvalue: pairControl,
};

function buildControl(definition) {
  if (definition.key === 'shortcuts') return shortcutControl(definition);
  if (definition.key === 'extensions.enabled') {
    return el('button', { class: 'button', type: 'button', onclick: () => {
      closeModal();
      window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'extensions' } }));
    } }, [t('extensions.manage')]);
  }
  const factory = CONTROLS[definition.type];
  if (!factory) return el('span', { class: 'optionHint', text: definition.type });
  if (definition.type === 'list' || definition.type === 'keyvalue' || definition.type === 'textarea') {
    const holder = el('div', { class: 'optionControl stacked', style: { flex: '1' } });
    holder.append(factory(definition));
    return holder;
  }
  return factory(definition);
}

/* ------------------------------------------------------------------- layout */

function page(definition, group) {
  const fragment = document.createDocumentFragment();
  fragment.append(el('h1', { class: 'pageHead', text: t(definition.titleKey) }));
  const description = t(definition.descKey);
  if (description) fragment.append(el('p', { class: 'pageDesc', text: description }));

  for (const key of group) {
    const item = schema.options.find((option) => option.key === key);
    if (!item) continue;
    const control = buildControl(item);
    const row = optionRow(item, control);
    if (item.type === 'list' || item.type === 'keyvalue' || item.type === 'textarea') row.classList.add('optionStack');
    fragment.append(el('div', { class: 'card' }, [row]));
  }

  fragment.append(sectionFooter(definition));
  return fragment;
}

function sectionFooter(definition) {
  const wrapper = el('div', { class: 'actionRow', style: { marginTop: '18px' } });
  wrapper.append(
    el('button', { class: 'button', type: 'button', onclick: async () => {
      for (const key of schema.options.filter((option) => option.section === definition.id).map((option) => option.key)) {
        await api().settings.reset(key);
      }
      location.reload();
    } }, [t('action.resetSection')]),
  );
  if (definition.id === 'data') {
    wrapper.append(
      el('button', { class: 'button', type: 'button', onclick: exportSettings }, [t('action.export')]),
      el('button', { class: 'button', type: 'button', onclick: importSettings }, [t('action.import')]),
      el('button', { class: 'button', type: 'button', onclick: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'about' } })) }, [t('action.about')]),
    );
  }
  if (definition.id === 'appearance') {
    wrapper.append(
      el('button', { class: 'button primary', type: 'button', onclick: () => {
        closeModal();
        window.dispatchEvent(new CustomEvent('hinterland:openstore', { detail: { tab: 'themes' } }));
      } }, [t('menu.store')]),
    );
  }
  if (definition.id === 'extensions') {
    wrapper.append(
      el('button', { class: 'button primary', type: 'button', onclick: () => {
        closeModal();
        window.dispatchEvent(new CustomEvent('hinterland:openstore', { detail: { tab: 'extensions' } }));
      } }, [t('menu.store')]),
      el('button', { class: 'button', type: 'button', onclick: () => {
        closeModal();
        window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'extensions' } }));
      } }, [t('extensions.manage')]),
    );
  }
  return el('div', { class: 'group' }, [wrapper]);
}

async function exportSettings() {
  const content = await api().settings.export();
  const result = await api().settings.saveFile('hinterland.settings.json', content);
  if (result?.ok) toast(t('exported', { path: result.path }), 'success');
}

async function importSettings() {
  const result = await api().settings.loadFile();
  if (result?.ok) location.reload();
  else if (result && result.ok === false) toast(t('importFailed'), 'error');
}

export function openSettings(initialSection = 'general') {
  const nav = sections.map((section) => ({
    id: section.id,
    icon: section.icon,
    labelKey: section.titleKey,
    render: () => page(section, schema.options.filter((option) => option.section === section.id).map((option) => option.key)),
  }));

  const start = Math.max(0, nav.findIndex((item) => item.id === initialSection));
  if (start > 0) {
    const [item] = nav.splice(start, 1);
    nav.unshift(item);
  }

  openModal({ title: t('menu.settings'), iconName: 'gear', nav });
}

export function settingsSnapshot() {
  return store();
}