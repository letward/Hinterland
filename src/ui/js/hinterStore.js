import { el, clear } from './util.js';
import { icon } from './icons.js';
import { t, currentLanguage } from './i18n.js';
import { toast } from './toast.js';
import { openModal, closeModal } from './modal.js';
import { applyTheme } from './theme.js';
import { get } from './store.js';

const api = () => window.hinterland;

const STORE_SERVER_URL = 'https://hinterland-browser.vercel.app/api/store';

/* --------------------------------------------------- server upload helpers */
function getSessionToken() {
  const session = get('account.session');
  return session?.token || null;
}

function isLoggedIn() {
  return Boolean(getSessionToken());
}

async function uploadTheme(theme) {
  const token = getSessionToken();
  if (!token) return { ok: false, error: 'notLoggedIn' };
  const res = await fetch(STORE_SERVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ kind: 'theme', ...theme }),
  });
  return await res.json();
}

async function uploadExtension(ext) {
  const token = getSessionToken();
  if (!token) return { ok: false, error: 'notLoggedIn' };
  const res = await fetch(STORE_SERVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ kind: 'extension', ...ext }),
  });
  return await res.json();
}

function loginRequiredBanner() {
  return el('div', { class: 'storeEmpty storeLoginRequired' }, [
    el('div', { class: 'storeEmptyIcon', html: icon('user') }),
    el('h3', { class: 'storeEmptyTitle', text: 'Konto erforderlich' }),
    el('p', { class: 'storeEmptyText', text: 'Melde dich an, um Designs zu veröffentlichen und Erweiterungen in den Hinter Store hochzuladen.' }),
    el('button', {
      class: 'button primary',
      type: 'button',
      onclick: () => {
        closeModal();
        window.dispatchEvent(new CustomEvent('hinterland:openaccount'));
      },
    }, [el('span', { html: icon('cloud') }), ' Jetzt registrieren']),
  ]);
}

export function renderHinterStore(initialTab = 'all') {
  const container = el('div', { class: 'storeRoot' });
  let currentTab = initialTab;
  let searchQuery = '';
  let sourceFilter = 'all'; // 'all' | 'official' | 'community'
  let sortBy = 'recommended'; // 'recommended' | 'name'
  let catalogData = null;
  let serverCommunity = { themes: [], extensions: [] };

  // Header & Hero
  const hero = el('div', { class: 'storeHero' }, [
    el('div', { class: 'storeHeroHeader' }, [
      el('span', { class: 'storeHeroBadge' }, [
        el('span', { html: icon('sparkles') }),
        'Hinter Store',
      ]),
      el('div', { class: 'storeHeroStats', id: 'storeStats' }, [
        el('span', { class: 'storeStatItem', id: 'statThemes' }, '... Designs'),
        el('span', { class: 'storeStatItem', id: 'statExts' }, '... Erweiterungen'),
      ]),
    ]),
    el('h1', { class: 'storeHeroTitle' }, [
      el('img', { class: 'storeHeroLogo', src: 'hinterland://assets/icon.png', alt: 'Hinterland' }),
      t('store.title'),
    ]),
    el('p', { class: 'storeHeroDesc', text: t('store.subtitle') }),
  ]);

  // Tab Navigation
  const nav = el('nav', { class: 'storeNav' });
  const TABS = [
    { id: 'all', labelKey: 'store.all', iconName: 'sparkles' },
    { id: 'themes', labelKey: 'store.themes', iconName: 'palette' },
    { id: 'extensions', labelKey: 'store.extensions', iconName: 'puzzle' },
    { id: 'installed', labelKey: 'store.installed', iconName: 'check' },
    { id: 'studio', labelKey: 'store.studio', iconName: 'brush' },
  ];

  function renderTabs() {
    clear(nav);
    TABS.forEach((tab) => {
      const btn = el('button', {
        class: `storeTab ${currentTab === tab.id ? 'active' : ''}`,
        type: 'button',
        onclick: () => {
          currentTab = tab.id;
          renderTabs();
          renderContent();
        },
      }, [
        el('span', { html: icon(tab.iconName) }),
        t(tab.labelKey),
      ]);
      nav.append(btn);
    });
  }

  // Filter Bar
  const filterBar = el('div', { class: 'storeFilterBar' });
  const searchInput = el('input', {
    class: 'storeSearchInput',
    type: 'search',
    placeholder: t('store.searchPlaceholder'),
    oninput: (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderContent();
    },
  });

  const searchWrap = el('div', { class: 'storeSearchWrap' }, [
    el('span', { class: 'storeSearchIcon', html: icon('search') }),
    searchInput,
  ]);

  const sourceGroup = el('div', { class: 'storeFilterGroup' }, [
    filterPill('all', 'store.sourceAll', () => setSource('all')),
    filterPill('official', 'store.sourceOfficial', () => setSource('official')),
    filterPill('community', 'store.sourceCommunity', () => setSource('community')),
  ]);

  const sortSelect = el('select', {
    class: 'storeSelect',
    onchange: (e) => {
      sortBy = e.target.value;
      renderContent();
    },
  }, [
    el('option', { value: 'recommended', text: t('store.sortRecommended') }),
    el('option', { value: 'name', text: t('store.sortName') }),
  ]);

  const studioQuickBtn = el('button', {
    class: 'btnSecondary',
    type: 'button',
    onclick: () => {
      currentTab = 'studio';
      renderTabs();
      renderContent();
    },
  }, [
    el('span', { html: icon('brush') }),
    t('store.creatorTitle'),
  ]);

  filterBar.append(searchWrap, sourceGroup, sortSelect, studioQuickBtn);

  function filterPill(id, labelKey, onClick) {
    return el('button', {
      class: `storeFilterPill ${sourceFilter === id ? 'active' : ''}`,
      type: 'button',
      text: t(labelKey),
      onclick: onClick,
    });
  }

  function setSource(src) {
    sourceFilter = src;
    Array.from(sourceGroup.children).forEach((child, i) => {
      const ids = ['all', 'official', 'community'];
      child.className = `storeFilterPill ${sourceFilter === ids[i] ? 'active' : ''}`;
    });
    renderContent();
  }

  // Content Area
  const contentArea = el('div', { class: 'storeContent' });

  async function loadData() {
    try {
      catalogData = await api().store.catalog();
      if (catalogData) {
        const themeCount = catalogData.themes?.length ?? 0;
        const extCount = catalogData.extensions?.length ?? 0;
        const statThemes = container.querySelector('#statThemes');
        const statExts = container.querySelector('#statExts');
        if (statThemes) statThemes.textContent = `${themeCount} Designs`;
        if (statExts) statExts.textContent = `${extCount} Erweiterungen`;
      }
    } catch (e) {
      console.warn('[HinterStore] Could not load catalog', e);
    }
    // Load server community content
    try {
      const res = await fetch(STORE_SERVER_URL, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.themes) serverCommunity.themes = data.themes;
        if (data.extensions) serverCommunity.extensions = data.extensions;
      }
    } catch (e) {
      console.warn('[HinterStore] Could not load server community catalog', e);
    }
    // Merge server community content into catalog
    if (catalogData) {
      if (serverCommunity.themes.length) {
        catalogData.themes = [
          ...catalogData.themes,
          ...serverCommunity.themes.map((t) => ({ ...t, source: 'community' })),
        ];
      }
      if (serverCommunity.extensions.length) {
        catalogData.extensions = [
          ...catalogData.extensions,
          ...serverCommunity.extensions.map((e) => ({ ...e, source: 'community' })),
        ];
      }
    }
  }

  function renderContent() {
    clear(contentArea);
    if (!catalogData) return;

    if (currentTab === 'studio') {
      filterBar.style.display = 'none';
      contentArea.append(renderStudio(catalogData, () => {
        loadData().then(renderContent);
      }));
      return;
    }

    filterBar.style.display = 'flex';

    if (currentTab === 'all') {
      renderAllView();
    } else if (currentTab === 'themes') {
      renderThemesView();
    } else if (currentTab === 'extensions') {
      renderExtensionsView();
    } else if (currentTab === 'installed') {
      renderInstalledView();
    }
  }

  function filterItems(items) {
    return items.filter((item) => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      if (searchQuery) {
        const matchTitle = item.name.toLowerCase().includes(searchQuery);
        const matchAuthor = (item.author || '').toLowerCase().includes(searchQuery);
        const matchDesc = (item.description || '').toLowerCase().includes(searchQuery);
        const matchTags = (item.tags || []).some((t) => t.toLowerCase().includes(searchQuery));
        if (!matchTitle && !matchAuthor && !matchDesc && !matchTags) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0; // recommended preserves curated default order
    });
  }

  function renderWeeklyPickBanner(weeklyPick) {
    if (!weeklyPick || !weeklyPick.item) return null;
    const item = weeklyPick.item;
    const isExtension = weeklyPick.type === 'extension';
    const isTheme = weeklyPick.type === 'theme';
    const isInstalled = isExtension ? item.installed : false;
    const isEnabled = isExtension ? item.enabled : false;
    const isActiveTheme = isTheme ? item.active : false;

    const lang = currentLanguage();
    const badgeText = weeklyPick.badge?.[lang] || weeklyPick.badge?.de || weeklyPick.badge || t('store.weeklyPickBadge');
    const whatText = weeklyPick.whatIsIt?.[lang] || weeklyPick.whatIsIt?.de || weeklyPick.whatIsIt || item.description;
    const reasonText = weeklyPick.focusReason?.[lang] || weeklyPick.focusReason?.de || weeklyPick.focusReason || '';

    const banner = el('div', { class: 'storeWeeklyPick' });

    // Badge Row
    const badgeRow = el('div', { class: 'weeklyPickHeader' }, [
      el('span', { class: 'weeklyPickPill' }, [
        el('span', { html: icon('sparkles') }),
        badgeText,
      ]),
      el('span', { class: 'weeklyPickCategory' }, [
        el('span', { html: icon(isExtension ? (item.iconName || 'puzzle') : 'palette') }),
        isExtension ? t('store.extensions') : t('store.themes'),
      ]),
    ]);

    // Title Row
    const titleRow = el('div', { class: 'weeklyPickTitleRow' }, [
      el('h2', { class: 'weeklyPickTitle', text: item.name }),
      el('span', { class: 'weeklyPickAuthor', text: `von ${item.author} • v${item.version}` }),
    ]);

    // Body: Was es ist & Wieso im Fokus
    const body = el('div', { class: 'weeklyPickBody' }, [
      el('div', { class: 'weeklyPickSection' }, [
        el('div', { class: 'weeklyPickSectionHeader' }, [
          el('span', { html: icon('info') }),
          el('span', { class: 'weeklyPickSectionLabel', text: t('store.whatIsIt') }),
        ]),
        el('p', { class: 'weeklyPickText', text: whatText }),
      ]),
      el('div', { class: 'weeklyPickSection weeklyPickHighlight' }, [
        el('div', { class: 'weeklyPickSectionHeader' }, [
          el('span', { html: icon('eye') }),
          el('span', { class: 'weeklyPickSectionLabel', text: t('store.whyInFocus') }),
        ]),
        el('p', { class: 'weeklyPickHighlightText', text: reasonText }),
      ]),
    ]);

    // Actions
    const actions = el('div', { class: 'weeklyPickActions' });

    if (isExtension) {
      if (!isInstalled) {
        actions.append(
          el('button', {
            class: 'btnPrimary',
            type: 'button',
            onclick: async () => {
              try {
                await api().store.installExtension(item.id);
                toast(t('store.extensionInstalled', { name: item.name }), 'success');
                await loadData();
                renderContent();
              } catch (err) {
                toast(err.message || 'Installation fehlgeschlagen', 'error');
              }
            },
          }, [el('span', { html: icon('download') }), t('store.installExtension')]),
        );
      } else {
        const toggle = el('button', {
          class: 'switch',
          type: 'button',
          role: 'switch',
          'aria-checked': String(isEnabled),
          onclick: async () => {
            toggle.disabled = true;
            await api().extensions.toggle(item.id, !isEnabled);
            await loadData();
            renderContent();
          },
        });
        actions.append(
          toggle,
          el('button', {
            class: 'btnSecondary',
            type: 'button',
            onclick: () => openExtensionConfigurator(item, () => {
              loadData().then(renderContent);
            }),
          }, [el('span', { html: icon('gear') }), t('store.configure')]),
        );
      }
    } else if (isTheme) {
      if (isActiveTheme) {
        actions.append(
          el('span', { class: 'cardBadge badgeActive', style: { padding: '6px 12px', fontSize: '0.85rem' }, text: t('store.activeTheme') }),
          el('button', {
            class: 'btnSecondary',
            type: 'button',
            onclick: () => openThemeCustomizer(item, () => {
              loadData().then(renderContent);
            }),
          }, [el('span', { html: icon('brush') }), t('store.customizeTheme')]),
        );
      } else {
        actions.append(
          el('button', {
            class: 'btnPrimary',
            type: 'button',
            onclick: async () => {
              await api().store.applyTheme(item);
              applyTheme();
              toast(t('store.themeApplied', { name: item.name }), 'success');
              await loadData();
              renderContent();
            },
          }, [el('span', { html: icon('check') }), t('store.applyTheme')]),
          el('button', {
            class: 'btnSecondary',
            type: 'button',
            onclick: () => openThemeCustomizer(item, () => {
              loadData().then(renderContent);
            }),
          }, [el('span', { html: icon('brush') }), t('store.customizeTheme')]),
        );
      }
    }

    banner.append(badgeRow, titleRow, body, actions);
    return banner;
  }

  function renderAllView() {
    if (!searchQuery && sourceFilter === 'all' && catalogData?.weeklyPick) {
      const pickBanner = renderWeeklyPickBanner(catalogData.weeklyPick);
      if (pickBanner) contentArea.append(pickBanner);
    }

    const filteredThemes = filterItems(catalogData.themes);
    const filteredExts = filterItems(catalogData.extensions);

    if (!filteredThemes.length && !filteredExts.length) {
      contentArea.append(renderEmpty());
      return;
    }

    if (filteredThemes.length > 0) {
      contentArea.append(
        el('div', { class: 'actionRow', style: { justifyContent: 'space-between', margin: '8px 0 12px' } }, [
          el('h2', { style: { fontSize: '1.15rem', margin: 0, fontWeight: 700 } }, [
            el('span', { html: icon('palette'), style: { marginRight: '8px' } }),
            t('store.themes'),
          ]),
          el('button', {
            class: 'button small',
            type: 'button',
            onclick: () => {
              currentTab = 'themes';
              renderTabs();
              renderContent();
            },
          }, ['Alle anzeigen →']),
        ]),
      );
      const grid = el('div', { class: 'storeGrid', style: { marginBottom: '28px' } });
      filteredThemes.slice(0, 6).forEach((theme) => grid.append(renderThemeCard(theme)));
      contentArea.append(grid);
    }

    if (filteredExts.length > 0) {
      contentArea.append(
        el('div', { class: 'actionRow', style: { justifyContent: 'space-between', margin: '8px 0 12px' } }, [
          el('h2', { style: { fontSize: '1.15rem', margin: 0, fontWeight: 700 } }, [
            el('span', { html: icon('puzzle'), style: { marginRight: '8px' } }),
            t('store.extensions'),
          ]),
          el('button', {
            class: 'button small',
            type: 'button',
            onclick: () => {
              currentTab = 'extensions';
              renderTabs();
              renderContent();
            },
          }, ['Alle anzeigen →']),
        ]),
      );
      const grid = el('div', { class: 'storeGrid' });
      filteredExts.slice(0, 6).forEach((ext) => grid.append(renderExtensionCard(ext)));
      contentArea.append(grid);
    }
  }

  function renderThemesView() {
    const items = filterItems(catalogData.themes);
    if (!items.length) {
      contentArea.append(renderEmpty());
      return;
    }
    const grid = el('div', { class: 'storeGrid' });
    items.forEach((theme) => grid.append(renderThemeCard(theme)));
    contentArea.append(grid);
  }

  function renderExtensionsView() {
    const items = filterItems(catalogData.extensions);
    if (!items.length) {
      contentArea.append(renderEmpty());
      return;
    }
    const grid = el('div', { class: 'storeGrid' });
    items.forEach((ext) => grid.append(renderExtensionCard(ext)));
    contentArea.append(grid);
  }

  function renderInstalledView() {
    const installedExts = catalogData.extensions.filter((e) => e.installed);
    const activeTheme = catalogData.themes.find((t) => t.active) || catalogData.themes[0];
    const customThemes = catalogData.themes.filter((t) => t.source === 'community');

    contentArea.append(
      el('h2', { style: { fontSize: '1.15rem', margin: '4px 0 12px', fontWeight: 700 } }, [
        el('span', { html: icon('brush'), style: { marginRight: '8px' } }),
        t('store.installedThemes'),
      ]),
    );

    const themeGrid = el('div', { class: 'storeGrid', style: { marginBottom: '28px' } });
    if (activeTheme) themeGrid.append(renderThemeCard(activeTheme));
    customThemes.filter((t) => t.id !== activeTheme?.id).forEach((t) => themeGrid.append(renderThemeCard(t)));
    contentArea.append(themeGrid);

    contentArea.append(
      el('h2', { style: { fontSize: '1.15rem', margin: '4px 0 12px', fontWeight: 700 } }, [
        el('span', { html: icon('puzzle'), style: { marginRight: '8px' } }),
        t('store.installedExtensions'),
      ]),
    );

    if (!installedExts.length) {
      contentArea.append(el('div', { class: 'storeEmpty' }, [
        el('p', { class: 'storeEmptyText', text: t('store.noInstalled') }),
      ]));
      return;
    }

    const extGrid = el('div', { class: 'storeGrid' });
    installedExts.forEach((ext) => extGrid.append(renderExtensionCard(ext)));
    contentArea.append(extGrid);
  }

  function renderThemeCard(theme) {
    const isActive = theme.active;
    const isDark = theme.theme !== 'light';
    const bg = isDark ? (theme.darkBackground || '#12141a') : (theme.lightBackground || '#f2f3f7');
    const surface = isDark ? (theme.darkSurface || '#1a1d26') : (theme.lightSurface || '#ffffff');
    const accent = theme.accent || '#4f7cff';
    const text = isDark ? (theme.darkText || '#e6e9f2') : (theme.lightText || '#161923');

    const card = el('div', { class: `storeCard ${isActive ? 'activeCard' : ''}` });

    // Mini Browser Mockup Preview
    const mockup = el('div', {
      class: 'themeMockup',
      style: { background: bg, '--accentPreview': accent },
    }, [
      el('div', { class: 'mockupTitlebar', style: { background: bg } }, [
        el('div', { class: 'mockupTab mockupTabActive', style: { background: surface } }, [
          el('div', { class: 'mockupTabDot' }),
        ]),
        el('div', { class: 'mockupTab', style: { background: 'rgba(255,255,255,0.04)' } }),
      ]),
      el('div', { class: 'mockupToolbar', style: { background: surface } }, [
        el('div', { class: 'mockupOmni' }),
      ]),
      el('div', { class: 'mockupBody', style: { background: bg } }, [
        el('div', { class: 'mockupLine mockupLinePrimary', style: { background: text } }),
        el('div', { class: 'mockupLine mockupLineSecondary', style: { background: accent } }),
      ]),
    ]);

    // Top Header
    const badgeClass = theme.source === 'official' ? 'badgeOfficial' : 'badgeCommunity';
    const badgeText = theme.source === 'official' ? t('store.officialBadge') : t('store.communityBadge');

    const header = el('div', { class: 'cardTop' }, [
      el('div', { class: 'cardHeaderInfo' }, [
        el('div', { class: 'cardTitle' }, [
          theme.name,
          isActive ? el('span', { class: 'cardBadge badgeActive', text: t('store.activeTheme') }) : null,
        ]),
        el('div', { class: 'cardAuthor', text: `von ${theme.author} • v${theme.version}` }),
      ]),
      el('span', { class: `cardBadge ${badgeClass}`, text: badgeText }),
    ]);

    // Description
    const desc = el('p', { class: 'cardDesc', text: theme.description });

    // Palette Dots
    const palette = el('div', { class: 'paletteDots' }, [
      el('span', { class: 'paletteDot', style: { background: accent }, title: `Akzent: ${accent}` }),
      el('span', { class: 'paletteDot', style: { background: bg }, title: `Hintergrund: ${bg}` }),
      el('span', { class: 'paletteDot', style: { background: surface }, title: `Oberfläche: ${surface}` }),
      el('span', { class: 'paletteDot', style: { background: text }, title: `Text: ${text}` }),
    ]);

    // Meta (Palette & Style Tag)
    const meta = el('div', { class: 'cardMeta' }, [
      palette,
      el('span', { class: 'cardTag', text: isDark ? 'Dark Theme' : 'Light Theme' }),
    ]);

    // Actions
    const actions = el('div', { class: 'cardActions' });

    if (isActive) {
      actions.append(
        el('button', {
          class: 'btnSecondary',
          type: 'button',
          onclick: () => openThemeCustomizer(theme, () => {
            loadData().then(renderContent);
          }),
        }, [el('span', { html: icon('brush') }), t('store.customizeTheme')]),
      );
    } else {
      actions.append(
        el('button', {
          class: 'btnPrimary',
          type: 'button',
          onclick: async () => {
            await api().store.applyTheme(theme);
            applyTheme();
            toast(t('store.themeApplied', { name: theme.name }), 'success');
            await loadData();
            renderContent();
          },
        }, [el('span', { html: icon('check') }), t('store.applyTheme')]),
        el('button', {
          class: 'btnSecondary',
          type: 'button',
          onclick: () => openThemeCustomizer(theme, () => {
            loadData().then(renderContent);
          }),
        }, [el('span', { html: icon('brush') }), t('store.customizeTheme')]),
      );
    }

    actions.append(
      el('button', {
        class: 'btnIcon',
        type: 'button',
        title: t('store.exportJson'),
        onclick: async () => {
          const res = await api().store.exportTheme(theme);
          if (res?.ok) toast('Design erfolgreich exportiert.', 'success');
        },
      }, [el('span', { html: icon('upload') })]),
    );

    if (theme.source === 'community') {
      actions.append(
        el('button', {
          class: 'btnIcon btnDanger',
          type: 'button',
          title: t('store.uninstall'),
          onclick: async () => {
            await api().store.uninstallTheme(theme.id);
            applyTheme();
            toast('Community-Design entfernt.', 'info');
            await loadData();
            renderContent();
          },
        }, [el('span', { html: icon('trash') })]),
      );
    }

    card.append(mockup, header, desc, meta, actions);
    return card;
  }

  function renderExtensionCard(ext) {
    const isInstalled = ext.installed;
    const isEnabled = ext.enabled;
    const card = el('div', { class: `storeCard ${isEnabled ? 'activeCard' : ''}` });

    const badgeClass = ext.source === 'official' ? 'badgeOfficial' : 'badgeCommunity';
    const badgeText = ext.source === 'official' ? t('store.officialBadge') : t('store.communityBadge');

    const header = el('div', { class: 'cardTop' }, [
      el('div', { class: 'cardIconWrap' }, [
        el('span', { html: icon(ext.iconName || 'puzzle') }),
      ]),
      el('div', { class: 'cardHeaderInfo' }, [
        el('div', { class: 'cardTitle' }, [
          ext.name,
          isEnabled ? el('span', { class: 'cardBadge badgeActive', text: t('store.enabled') }) : null,
        ]),
        el('div', { class: 'cardAuthor', text: `von ${ext.author} • v${ext.version}` }),
      ]),
      el('span', { class: `cardBadge ${badgeClass}`, text: badgeText }),
    ]);

    const desc = el('p', { class: 'cardDesc', text: ext.description });

    const meta = el('div', { class: 'cardMeta' }, [
      el('div', { class: 'cardTags' }, [
        el('span', { class: 'cardTag', style: { textTransform: 'capitalize' }, text: ext.category || 'Erweiterung' }),
        ...(ext.permissions || []).slice(0, 2).map((p) => el('span', { class: 'cardTag', text: p })),
      ]),
    ]);

    const actions = el('div', { class: 'cardActions' });

    if (!isInstalled) {
      actions.append(
        el('button', {
          class: 'btnPrimary',
          type: 'button',
          onclick: async () => {
            const btn = actions.querySelector('button');
            if (btn) btn.disabled = true;
            try {
              await api().store.installExtension(ext.id);
              toast(t('store.extensionInstalled', { name: ext.name }), 'success');
              await loadData();
              renderContent();
            } catch (err) {
              toast(err.message || 'Installation fehlgeschlagen', 'error');
            }
          },
        }, [el('span', { html: icon('download') }), t('store.installExtension')]),
      );
    } else {
      // Toggle Switch
      const toggle = el('button', {
        class: `switch`,
        type: 'button',
        role: 'switch',
        'aria-checked': String(isEnabled),
        onclick: async () => {
          toggle.disabled = true;
          await api().extensions.toggle(ext.id, !isEnabled);
          await loadData();
          renderContent();
        },
      });

      actions.append(
        toggle,
        el('button', {
          class: 'btnSecondary',
          type: 'button',
          onclick: () => openExtensionConfigurator(ext, () => {
            loadData().then(renderContent);
          }),
        }, [el('span', { html: icon('gear') }), t('store.configure')]),
      );

      // Launch Action / Popup if available
      actions.append(
        el('button', {
          class: 'btnIcon',
          type: 'button',
          title: t('store.openPopup'),
          onclick: () => api().extensions.action(ext.id),
        }, [el('span', { html: icon('external') })]),
      );

      // Uninstall if not bundled
      if (!ext.bundled) {
        actions.append(
          el('button', {
            class: 'btnIcon btnDanger',
            type: 'button',
            title: t('store.uninstall'),
            onclick: async () => {
              await api().store.uninstallExtension(ext.id);
              toast(t('store.extensionUninstalled', { name: ext.name }), 'info');
              await loadData();
              renderContent();
            },
          }, [el('span', { html: icon('trash') })]),
        );
      }
    }

    card.append(header, desc, meta, actions);
    return card;
  }

  function renderEmpty() {
    return el('div', { class: 'storeEmpty' }, [
      el('div', { class: 'storeEmptyIcon', html: icon('search') }),
      el('h3', { class: 'storeEmptyTitle', text: t('store.noResults') }),
      el('p', { class: 'storeEmptyText', text: t('store.noResultsDesc') }),
      el('button', {
        class: 'button',
        type: 'button',
        onclick: () => {
          searchQuery = '';
          sourceFilter = 'all';
          searchInput.value = '';
          setSource('all');
        },
      }, [t('store.resetFilters')]),
    ]);
  }

  // Initial render
  renderTabs();
  container.append(hero, nav, filterBar, contentArea);
  loadData().then(renderContent);

  return container;
}

/* ------------------------------------------------------------- Theme Customizer */

export function openThemeCustomizer(theme, onUpdate) {
  const current = structuredClone(theme);

  const preview = el('div', {
    class: 'themeMockup',
    style: {
      height: '110px',
      background: current.darkBackground || '#12141a',
      '--accentPreview': current.accent || '#4f7cff',
      marginBottom: '16px',
    },
  }, [
    el('div', { class: 'mockupTitlebar' }, [
      el('div', { class: 'mockupTab mockupTabActive', style: { background: current.darkSurface || '#1a1d26' } }, [
        el('div', { class: 'mockupTabDot' }),
      ]),
      el('div', { class: 'mockupTab' }),
    ]),
    el('div', { class: 'mockupToolbar', style: { background: current.darkSurface || '#1a1d26' } }, [
      el('div', { class: 'mockupOmni' }),
    ]),
    el('div', { class: 'mockupBody' }, [
      el('div', { class: 'mockupLine mockupLinePrimary', style: { background: current.darkText || '#fff' } }),
      el('div', { class: 'mockupLine mockupLineSecondary', style: { background: current.accent || '#4f7cff' } }),
    ]),
  ]);

  function updateMockup() {
    preview.style.background = current.darkBackground || '#12141a';
    preview.style.setProperty('--accentPreview', current.accent || '#4f7cff');
    const tabs = preview.querySelectorAll('.mockupTabActive, .mockupToolbar');
    tabs.forEach((n) => n.style.background = current.darkSurface || '#1a1d26');
    const lineP = preview.querySelector('.mockupLinePrimary');
    const lineS = preview.querySelector('.mockupLineSecondary');
    if (lineP) lineP.style.background = current.darkText || '#fff';
    if (lineS) lineS.style.background = current.accent || '#4f7cff';
  }

  // Controls
  const sheet = el('div', { class: 'configSheet' });

  // Accent Color
  const accentInput = el('input', {
    class: 'colorPickerBox',
    type: 'color',
    value: current.accent || '#4f7cff',
    oninput: (e) => {
      current.accent = e.target.value;
      updateMockup();
    },
  });

  const swatches = ['#4f7cff', '#7a5cff', '#bd93f9', '#ff4c8b', '#ff6b4a', '#fee801', '#22c08a', '#00e5ff', '#ff79c6', '#fe8019'];
  const swatchRow = el('div', { class: 'paletteDots', style: { marginTop: '8px' } }, [
    accentInput,
    ...swatches.map((color) => el('button', {
      class: 'paletteDot',
      type: 'button',
      style: { background: color, cursor: 'pointer', width: '22px', height: '22px' },
      onclick: () => {
        current.accent = color;
        accentInput.value = color;
        updateMockup();
      },
    })),
  ]);

  sheet.append(
    preview,
    el('div', { class: 'configRow' }, [
      el('div', {}, [
        el('div', { class: 'configRowLabel', text: t('store.accentColor') }),
        el('div', { class: 'configRowDesc', text: 'Hauptfarbe für aktive Tabs, Buttons und Fokus-Ringe.' }),
      ]),
      swatchRow,
    ]),
  );

  // Radius Slider
  const radiusVal = el('span', { class: 'configValueBadge', text: `${current.radius ?? 10}px` });
  sheet.append(
    el('div', { class: 'configRow' }, [
      el('div', {}, [
        el('div', { class: 'configRowLabel', text: t('store.borderRadius') }),
        el('div', { class: 'configRowDesc', text: 'Rundung von Fensterecken, Adressleiste und Tabs.' }),
      ]),
      el('div', { class: 'configSliderWrap' }, [
        el('input', {
          class: 'configSlider',
          type: 'range',
          min: '0',
          max: '24',
          value: String(current.radius ?? 10),
          oninput: (e) => {
            current.radius = Number(e.target.value);
            radiusVal.textContent = `${current.radius}px`;
          },
        }),
        radiusVal,
      ]),
    ]),
  );

  // Density Selector
  const densitySelect = el('select', {
    class: 'storeSelect',
    value: current.density || 'cosy',
    onchange: (e) => { current.density = e.target.value; },
  }, [
    el('option', { value: 'compact', text: 'Kompakt (Platzsparend)' }),
    el('option', { value: 'cosy', text: 'Gemütlich (Standard)' }),
    el('option', { value: 'roomy', text: 'Großzügig (Weite Abstände)' }),
  ]);
  densitySelect.value = current.density || 'cosy';

  sheet.append(
    el('div', { class: 'configRow' }, [
      el('div', {}, [
        el('div', { class: 'configRowLabel', text: t('store.density') }),
        el('div', { class: 'configRowDesc', text: 'Höhe und Zeilenabstand der Toolbar und Tableiste.' }),
      ]),
      densitySelect,
    ]),
  );

  // Font Stack
  const fontSelect = el('select', {
    class: 'storeSelect',
    onchange: (e) => { current.fontStack = e.target.value; },
  }, [
    el('option', { value: 'system', text: 'System (Standard OS Schrift)' }),
    el('option', { value: 'humanist', text: 'Humanist (Optima, Gill Sans)' }),
    el('option', { value: 'geometric', text: 'Geometric (Futura, Avenir)' }),
    el('option', { value: 'mono', text: 'Monospace (Cascadia, Consolas)' }),
  ]);
  fontSelect.value = current.fontStack || 'system';

  sheet.append(
    el('div', { class: 'configRow' }, [
      el('div', {}, [
        el('div', { class: 'configRowLabel', text: t('store.font') }),
        el('div', { class: 'configRowDesc', text: 'Schriftarten-Familie für die gesamte Browseroberfläche.' }),
      ]),
      fontSelect,
    ]),
  );

  // Action Buttons
  const footer = el('div', { class: 'actionRow', style: { marginTop: '16px', justifyContent: 'flex-end' } }, [
    el('button', {
      class: 'button',
      type: 'button',
      text: t('action.cancel'),
      onclick: () => closeModal(),
    }),
    el('button', {
      class: 'button primary',
      type: 'button',
      onclick: async () => {
        await api().store.applyTheme(current);
        applyTheme();
        toast(t('store.themeApplied', { name: current.name }), 'success');
        closeModal();
        onUpdate?.();
      },
    }, [el('span', { html: icon('check') }), t('store.saveAndApply')]),
  ]);

  sheet.append(footer);

  openModal({
    title: t('store.themeCustomizerTitle', { name: theme.name }),
    iconName: 'brush',
    nav: [{ id: 'customizer', labelKey: 'store.customizeTheme', icon: 'brush', render: () => sheet }],
  });
}

/* -------------------------------------------------------- Extension Configurator */

export function openExtensionConfigurator(ext, onUpdate) {
  const currentConfig = structuredClone(ext.config || {});
  const sheet = el('div', { class: 'configSheet' });

  const head = el('div', { class: 'configHead' }, [
    el('div', { class: 'configHeadIcon', html: icon(ext.iconName || 'puzzle') }),
    el('div', {}, [
      el('h2', { style: { margin: 0, fontSize: '1.15rem' }, text: ext.name }),
      el('div', { style: { fontSize: '0.8rem', color: 'var(--textDim)' }, text: `von ${ext.author} • v${ext.version}` }),
    ]),
  ]);
  sheet.append(head);

  const options = ext.configOptions || [];
  if (!options.length) {
    sheet.append(el('p', { class: 'optionHint', text: 'Diese Erweiterung hat keine zusätzlichen Optionen.' }));
  } else {
    options.forEach((opt) => {
      const val = currentConfig[opt.key] !== undefined ? currentConfig[opt.key] : opt.default;

      if (opt.type === 'bool') {
        const toggle = el('button', {
          class: 'switch',
          type: 'button',
          role: 'switch',
          'aria-checked': String(Boolean(val)),
          onclick: () => {
            currentConfig[opt.key] = !Boolean(currentConfig[opt.key] !== undefined ? currentConfig[opt.key] : opt.default);
            toggle.setAttribute('aria-checked', String(currentConfig[opt.key]));
          },
        });
        sheet.append(
          el('div', { class: 'configRow' }, [
            el('div', { class: 'configRowLabel', text: opt.label }),
            toggle,
          ]),
        );
      } else if (opt.type === 'number') {
        const badge = el('span', { class: 'configValueBadge', text: `${val}${opt.unit || ''}` });
        const slider = el('input', {
          class: 'configSlider',
          type: 'range',
          min: String(opt.min || 0),
          max: String(opt.max || 100),
          value: String(val),
          oninput: (e) => {
            currentConfig[opt.key] = Number(e.target.value);
            badge.textContent = `${currentConfig[opt.key]}${opt.unit || ''}`;
          },
        });
        sheet.append(
          el('div', { class: 'configRow' }, [
            el('div', { class: 'configRowLabel', text: opt.label }),
            el('div', { class: 'configSliderWrap' }, [slider, badge]),
          ]),
        );
      } else if (opt.type === 'select') {
        const select = el('select', {
          class: 'storeSelect',
          onchange: (e) => { currentConfig[opt.key] = e.target.value; },
        }, (opt.options || []).map((o) => el('option', { value: o.value, text: o.label })));
        select.value = val;
        sheet.append(
          el('div', { class: 'configRow' }, [
            el('div', { class: 'configRowLabel', text: opt.label }),
            select,
          ]),
        );
      }
    });
  }

  // Quick Action Buttons
  const extraActions = el('div', { class: 'actionRow', style: { marginTop: '8px' } }, [
    el('button', {
      class: 'button small',
      type: 'button',
      onclick: () => api().extensions.action(ext.id),
    }, [el('span', { html: icon('external') }), ` ${t('store.openPopup')}`]),
    el('button', {
      class: 'button small',
      type: 'button',
      onclick: () => api().extensions.reveal(ext.id),
    }, [el('span', { html: icon('archive') }), ` ${t('store.showFolder')}`]),
  ]);
  sheet.append(extraActions);

  // Footer
  const footer = el('div', { class: 'actionRow', style: { marginTop: '18px', justifyContent: 'flex-end' } }, [
    el('button', {
      class: 'button',
      type: 'button',
      text: t('action.cancel'),
      onclick: () => closeModal(),
    }),
    el('button', {
      class: 'button primary',
      type: 'button',
      onclick: async () => {
        await api().store.saveConfig(ext.id, currentConfig);
        toast(t('store.configSaved', { name: ext.name }), 'success');
        closeModal();
        onUpdate?.();
      },
    }, [el('span', { html: icon('save') }), t('store.saveConfig')]),
  ]);
  sheet.append(footer);

  openModal({
    title: t('store.extensionConfigTitle', { name: ext.name }),
    iconName: 'gear',
    nav: [{ id: 'config', labelKey: 'store.configure', icon: 'gear', render: () => sheet }],
  });
}

/* -------------------------------------------------------- Community Studio */

function renderStudio(catalogData, onRefresh) {
  const container = el('div', { class: 'configSheet' });

  container.append(
    el('div', {}, [
      el('h2', { style: { margin: 0, fontSize: '1.25rem', fontWeight: 800 } }, [
        el('span', { html: icon('brush'), style: { marginRight: '8px' } }),
        t('store.creatorTitle'),
      ]),
      el('p', { class: 'pageDesc', text: t('store.creatorDesc') }),
    ]),
  );

  const grid = el('div', { class: 'studioGrid' });

  // Creation State
  const themeState = {
    id: `custom-${Date.now()}`,
    name: 'Mein Community Design',
    author: 'Community Gestalter',
    description: 'Selbst erstelltes individuelles Hinterland-Farbschema.',
    theme: 'dark',
    accent: '#4f7cff',
    accentContrast: '#ffffff',
    darkBackground: '#13151c',
    darkSurface: '#1c1f2b',
    darkText: '#f0f3fa',
    lightBackground: '#f4f6fa',
    lightSurface: '#ffffff',
    lightText: '#181b24',
    radius: 10,
    density: 'cosy',
    fontStack: 'system',
    blur: 16,
    tags: ['community', 'custom'],
  };

  // Preview Box
  const preview = el('div', {
    class: 'themeMockup',
    style: {
      height: '140px',
      background: themeState.darkBackground,
      '--accentPreview': themeState.accent,
    },
  }, [
    el('div', { class: 'mockupTitlebar' }, [
      el('div', { class: 'mockupTab mockupTabActive', style: { background: themeState.darkSurface } }, [
        el('div', { class: 'mockupTabDot' }),
      ]),
      el('div', { class: 'mockupTab' }),
    ]),
    el('div', { class: 'mockupToolbar', style: { background: themeState.darkSurface } }, [
      el('div', { class: 'mockupOmni' }),
    ]),
    el('div', { class: 'mockupBody' }, [
      el('div', { class: 'mockupLine mockupLinePrimary', style: { background: themeState.darkText } }),
      el('div', { class: 'mockupLine mockupLineSecondary', style: { background: themeState.accent } }),
    ]),
  ]);

  function syncStudioPreview() {
    preview.style.background = themeState.darkBackground;
    preview.style.setProperty('--accentPreview', themeState.accent);
    preview.querySelectorAll('.mockupTabActive, .mockupToolbar').forEach((n) => n.style.background = themeState.darkSurface);
    const lineP = preview.querySelector('.mockupLinePrimary');
    const lineS = preview.querySelector('.mockupLineSecondary');
    if (lineP) lineP.style.background = themeState.darkText;
    if (lineS) lineS.style.background = themeState.accent;
  }

  // Form Controls
  const form = el('div', { class: 'studioForm' }, [
    el('div', { class: 'formField' }, [
      el('label', { class: 'formLabel', text: t('store.designName') }),
      el('input', {
        class: 'formInput',
        type: 'text',
        value: themeState.name,
        oninput: (e) => {
          themeState.name = e.target.value;
          themeState.id = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        },
      }),
    ]),
    el('div', { class: 'formField' }, [
      el('label', { class: 'formLabel', text: t('store.authorName') }),
      el('input', {
        class: 'formInput',
        type: 'text',
        value: themeState.author,
        oninput: (e) => { themeState.author = e.target.value; },
      }),
    ]),
    el('div', { class: 'formField' }, [
      el('label', { class: 'formLabel', text: t('store.description') }),
      el('input', {
        class: 'formInput',
        type: 'text',
        value: themeState.description,
        oninput: (e) => { themeState.description = e.target.value; },
      }),
    ]),
    el('div', { class: 'configRow' }, [
      el('div', { class: 'configRowLabel', text: 'Akzentfarbe' }),
      el('input', {
        class: 'colorPickerBox',
        type: 'color',
        value: themeState.accent,
        oninput: (e) => {
          themeState.accent = e.target.value;
          syncStudioPreview();
        },
      }),
    ]),
    el('div', { class: 'configRow' }, [
      el('div', { class: 'configRowLabel', text: 'Hintergrundfarbe (Dunkel)' }),
      el('input', {
        class: 'colorPickerBox',
        type: 'color',
        value: themeState.darkBackground,
        oninput: (e) => {
          themeState.darkBackground = e.target.value;
          syncStudioPreview();
        },
      }),
    ]),
    el('div', { class: 'configRow' }, [
      el('div', { class: 'configRowLabel', text: 'Oberflächenfarbe (Dunkel)' }),
      el('input', {
        class: 'colorPickerBox',
        type: 'color',
        value: themeState.darkSurface,
        oninput: (e) => {
          themeState.darkSurface = e.target.value;
          syncStudioPreview();
        },
      }),
    ]),
  ]);

  // Preview & Actions Sidebar
  const previewBox = el('div', { class: 'studioPreviewBox' }, [
    el('h3', { style: { margin: 0, fontSize: '0.95rem', fontWeight: 700 } }, 'Live-Vorschau'),
    preview,
    el('button', {
      class: 'btnPrimary',
      type: 'button',
      onclick: async () => {
        await api().store.installTheme(themeState, true);
        applyTheme();
        toast(t('store.themeApplied', { name: themeState.name }), 'success');
        onRefresh?.();
      },
    }, [el('span', { html: icon('check') }), t('store.createAndSave')]),
    isLoggedIn() ? el('button', {
      class: 'btnSecondary',
      type: 'button',
      onclick: async () => {
        const res = await uploadTheme(themeState);
        if (res?.ok) {
          toast('Design an den Hinter Store veröffentlicht.', 'success');
          onRefresh?.();
        } else if (res?.error === 'notLoggedIn') {
          toast('Bitte zuerst anmelden.', 'error');
          closeModal();
          window.dispatchEvent(new CustomEvent('hinterland:openaccount'));
        } else {
          toast(res?.error || 'Veröffentlichung fehlgeschlagen', 'error');
        }
      },
    }, [el('span', { html: icon('cloud') }), ' Im Store veröffentlichen']) : null,
    el('button', {
      class: 'btnSecondary',
      type: 'button',
      onclick: async () => {
        await api().store.exportTheme(themeState);
        toast('Theme JSON exportiert.', 'success');
      },
    }, [el('span', { html: icon('upload') }), t('store.exportJson')]),
  ].filter(Boolean));

  grid.append(form, previewBox);

  // Import Section
  const importSection = el('div', {
    class: 'studioForm',
    style: { marginTop: '20px' },
  }, [
    el('h3', { style: { margin: 0, fontSize: '1rem', fontWeight: 700 } }, [
      el('span', { html: icon('download'), style: { marginRight: '8px' } }),
      t('store.importTheme'),
    ]),
    el('p', { class: 'optionHint', text: 'Importiere ein Community-Design direkt als JSON oder wähle eine Datei von deinem Computer.' }),
    el('div', { class: 'actionRow' }, [
      el('button', {
        class: 'button',
        type: 'button',
        onclick: async () => {
          const res = await api().store.importThemeFile();
          if (res?.ok) {
            applyTheme();
            toast(t('store.importSuccess'), 'success');
            onRefresh?.();
          } else if (res?.error) {
            toast(res.error, 'error');
          }
        },
      }, [el('span', { html: icon('archive') }), ' Aus Datei (*.json) importieren']),
    ]),
  ]);

  container.append(grid, importSection);

  // Extension Upload Section (login-gated)
  if (isLoggedIn()) {
    const extUploadSection = el('div', {
      class: 'studioForm',
      style: { marginTop: '20px' },
    }, [
      el('h3', { style: { margin: 0, fontSize: '1rem', fontWeight: 700 } }, [
        el('span', { html: icon('puzzle'), style: { marginRight: '8px' } }),
        'Erweiterung hochladen',
      ]),
      el('p', { class: 'optionHint', text: 'Lade deine eigene Erweiterung in den Hinter Store hoch. Ein Konto ist erforderlich.' }),
      el('div', { class: 'formField' }, [
        el('label', { class: 'formLabel', text: 'Erweiterungs-ID' }),
        el('input', { class: 'formInput', type: 'text', placeholder: 'z. B. meine-erweiterung' }),
      ]),
      el('div', { class: 'formField' }, [
        el('label', { class: 'formLabel', text: 'Name' }),
        el('input', { class: 'formInput', type: 'text', placeholder: 'z. B. Meine Erweiterung' }),
      ]),
      el('div', { class: 'formField' }, [
        el('label', { class: 'formLabel', text: 'Autor' }),
        el('input', { class: 'formInput', type: 'text', placeholder: 'Dein Name' }),
      ]),
      el('div', { class: 'formField' }, [
        el('label', { class: 'formLabel', text: 'Beschreibung' }),
        el('textarea', { class: 'formInput', rows: 3, placeholder: 'Was macht diese Erweiterung?' }),
      ]),
      el('div', { class: 'formField' }, [
        el('label', { class: 'formLabel', text: 'Kategorie' }),
        el('select', { class: 'storeSelect' }, [
          el('option', { value: 'utilities', text: 'Dienstprogramme' }),
          el('option', { value: 'productivity', text: 'Produktivität' }),
          el('option', { value: 'security', text: 'Sicherheit' }),
          el('option', { value: 'appearance', text: 'Erscheinungsbild' }),
          el('option', { value: 'developer', text: 'Entwicklung' }),
        ]),
      ]),
      el('div', { class: 'actionRow' }, [
        el('button', {
          class: 'button primary',
          type: 'button',
          onclick: async () => {
            toast('Extension-Upload über Dateiauswahl demnächst verfügbar. Nutze derzeit den Theme-Store für Designs.', 'info');
          },
        }, [el('span', { html: icon('cloud') }), ' Hochladen']),
      ]),
    ]);
    container.append(extUploadSection);
  } else {
    container.append(loginRequiredBanner());
  }

  return container;
}
