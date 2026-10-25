import { SCHEME_VERSION } from './constants.js';

/**
 * Every option the user may change. The settings window renders itself from
 * this list, so adding an option here is all it takes to expose it.
 */

const themes = [
  { value: 'system', labelKey: 'settings.theme.system' },
  { value: 'light', labelKey: 'settings.theme.light' },
  { value: 'dark', labelKey: 'settings.theme.dark' },
];

const densities = [
  { value: 'compact', labelKey: 'settings.density.compact' },
  { value: 'cosy', labelKey: 'settings.density.cosy' },
  { value: 'roomy', labelKey: 'settings.density.roomy' },
];

const tabPositions = [
  { value: 'top', labelKey: 'settings.tabPosition.top' },
  { value: 'bottom', labelKey: 'settings.tabPosition.bottom' },
  { value: 'hidden', labelKey: 'settings.tabPosition.hidden' },
];

const startModes = [
  { value: 'newtab', labelKey: 'settings.start.newtab' },
  { value: 'restore', labelKey: 'settings.start.restore' },
  { value: 'blank', labelKey: 'settings.start.blank' },
  { value: 'custom', labelKey: 'settings.start.custom' },
];

const languages = [
  { value: 'system', labelKey: 'settings.language.system' },
  { value: 'de', labelKey: 'settings.language.de' },
  { value: 'en', labelKey: 'settings.language.en' },
];

const fontStacks = [
  { value: 'system', labelKey: 'settings.font.system' },
  { value: 'humanist', labelKey: 'settings.font.humanist' },
  { value: 'geometric', labelKey: 'settings.font.geometric' },
  { value: 'mono', labelKey: 'settings.font.mono' },
];

const smoothValues = [
  { value: 'always', labelKey: 'settings.scroll.always' },
  { value: 'system', labelKey: 'settings.scroll.system' },
  { value: 'never', labelKey: 'settings.scroll.never' },
];

export const SCHEMA_VERSION_NUMBER = SCHEME_VERSION;

export const SECTIONS = [
  { id: 'general', titleKey: 'settings.section.general', descKey: 'settings.general.languageDesc', icon: 'gear' },
  { id: 'appearance', titleKey: 'settings.section.appearance', descKey: 'settings.appearance.themeDesc', icon: 'brush' },
  { id: 'tabs', titleKey: 'settings.section.tabs', descKey: 'settings.tabs.positionDesc', icon: 'tabs' },
  { id: 'start', titleKey: 'settings.section.start', descKey: 'settings.newtab.layoutDesc', icon: 'compass' },
  { id: 'privacy', titleKey: 'settings.section.privacy', descKey: 'settings.privacy.blockTrackersDesc', icon: 'shield' },
  { id: 'content', titleKey: 'settings.section.content', descKey: 'settings.content.javascriptDesc', icon: 'page' },
  { id: 'network', titleKey: 'settings.section.network', descKey: 'settings.network.proxyModeDesc', icon: 'globe' },
  { id: 'extensions', titleKey: 'settings.section.extensions', descKey: 'extensions.description', icon: 'puzzle' },
  { id: 'shortcuts', titleKey: 'settings.section.shortcuts', descKey: 'settings.shortcuts.desc', icon: 'keyboard' },
  { id: 'advanced', titleKey: 'settings.section.advanced', descKey: 'settings.advanced.hardwareAccelerationDesc', icon: 'sliders' },
  { id: 'data', titleKey: 'settings.section.data', descKey: 'settings.data.bookmarksDesc', icon: 'archive' },
];

const option = (key, type, fallback, extra = {}) => ({
  key,
  type,
  default: fallback,
  ...extra,
});

export const SCHEMA = [
  /* ---------------------------------------------------------------- general */
  option('general.language', 'select', 'system', {
    labelKey: 'settings.general.language',
    descKey: 'settings.general.languageDesc',
    section: 'general',
    options: languages,
  }),
  option('general.startMode', 'select', 'newtab', {
    labelKey: 'settings.general.startMode',
    descKey: 'settings.general.startModeDesc',
    section: 'general',
    options: startModes,
  }),
  option('general.startPages', 'list', [], {
    labelKey: 'settings.general.startPages',
    descKey: 'settings.general.startPagesDesc',
    section: 'general',
    itemSchema: { name: 'text', url: 'text' },
    itemLabelKey: 'settings.general.startPagesItem',
  }),
  option('general.restoreOnStart', 'bool', true, {
    labelKey: 'settings.general.restoreOnStart',
    descKey: 'settings.general.restoreOnStartDesc',
    section: 'general',
  }),
  option('general.askWhereToSave', 'bool', true, {
    labelKey: 'settings.general.askWhereToSave',
    descKey: 'settings.general.askWhereToSaveDesc',
    section: 'general',
  }),
  option('general.confirmCloseMultiple', 'bool', true, {
    labelKey: 'settings.general.confirmCloseMultiple',
    descKey: 'settings.general.confirmCloseMultipleDesc',
    section: 'general',
  }),
  option('general.homepage', 'text', '', {
    labelKey: 'settings.general.homepage',
    descKey: 'settings.general.homepageDesc',
    section: 'general',
    placeholder: 'hinterland://newtab',
  }),
  option('general.showHomeButton', 'bool', false, {
    labelKey: 'settings.general.showHomeButton',
    descKey: 'settings.general.showHomeButtonDesc',
    section: 'general',
  }),
  option('general.showBookmarksBar', 'bool', false, {
    labelKey: 'settings.general.showBookmarksBar',
    descKey: 'settings.general.showBookmarksBarDesc',
    section: 'general',
  }),

  /* ------------------------------------------------------------- appearance */
  option('appearance.theme', 'select', 'system', {
    labelKey: 'settings.appearance.theme',
    descKey: 'settings.appearance.themeDesc',
    section: 'appearance',
    options: themes,
  }),
  option('appearance.accent', 'color', '#4f7cff', {
    labelKey: 'settings.appearance.accent',
    descKey: 'settings.appearance.accentDesc',
    section: 'appearance',
  }),
  option('appearance.accentContrast', 'color', '#ffffff', {
    labelKey: 'settings.appearance.accentContrast',
    descKey: 'settings.appearance.accentContrastDesc',
    section: 'appearance',
  }),
  option('appearance.darkBackground', 'color', '#12141a', {
    labelKey: 'settings.appearance.darkBackground',
    descKey: 'settings.appearance.darkBackgroundDesc',
    section: 'appearance',
  }),
  option('appearance.darkSurface', 'color', '#1a1d26', {
    labelKey: 'settings.appearance.darkSurface',
    descKey: 'settings.appearance.darkSurfaceDesc',
    section: 'appearance',
  }),
  option('appearance.darkText', 'color', '#e6e9f2', {
    labelKey: 'settings.appearance.darkText',
    descKey: 'settings.appearance.darkTextDesc',
    section: 'appearance',
  }),
  option('appearance.lightBackground', 'color', '#f2f3f7', {
    labelKey: 'settings.appearance.lightBackground',
    descKey: 'settings.appearance.lightBackgroundDesc',
    section: 'appearance',
  }),
  option('appearance.lightSurface', 'color', '#ffffff', {
    labelKey: 'settings.appearance.lightSurface',
    descKey: 'settings.appearance.lightSurfaceDesc',
    section: 'appearance',
  }),
  option('appearance.lightText', 'color', '#161923', {
    labelKey: 'settings.appearance.lightText',
    descKey: 'settings.appearance.lightTextDesc',
    section: 'appearance',
  }),
  option('appearance.radius', 'number', 10, {
    labelKey: 'settings.appearance.radius',
    descKey: 'settings.appearance.radiusDesc',
    section: 'appearance',
    min: 0,
    max: 24,
    step: 1,
    unit: 'px',
  }),
  option('appearance.density', 'select', 'cosy', {
    labelKey: 'settings.appearance.density',
    descKey: 'settings.appearance.densityDesc',
    section: 'appearance',
    options: densities,
  }),
  option('appearance.fontStack', 'select', 'system', {
    labelKey: 'settings.appearance.font',
    descKey: 'settings.appearance.fontDesc',
    section: 'appearance',
    options: fontStacks,
  }),
  option('appearance.fontSize', 'number', 14, {
    labelKey: 'settings.appearance.fontSize',
    descKey: 'settings.appearance.fontSizeDesc',
    section: 'appearance',
    min: 10,
    max: 20,
    step: 1,
    unit: 'px',
  }),
  option('appearance.customFont', 'text', '', {
    labelKey: 'settings.appearance.customFont',
    descKey: 'settings.appearance.customFontDesc',
    section: 'appearance',
    placeholder: 'Inter, sans serif',
  }),
  option('appearance.blur', 'number', 18, {
    labelKey: 'settings.appearance.blur',
    descKey: 'settings.appearance.blurDesc',
    section: 'appearance',
    min: 0,
    max: 40,
    step: 1,
    unit: 'px',
  }),
  option('appearance.animations', 'bool', true, {
    labelKey: 'settings.appearance.animations',
    descKey: 'settings.appearance.animationsDesc',
    section: 'appearance',
  }),
  option('appearance.compactTitlebar', 'bool', false, {
    labelKey: 'settings.appearance.compactTitlebar',
    descKey: 'settings.appearance.compactTitlebarDesc',
    section: 'appearance',
  }),

  /* ------------------------------------------------------------------ reader */
  option('reader.theme', 'select', 'sepia', {
    labelKey: 'settings.reader.theme',
    descKey: 'settings.reader.themeDesc',
    section: 'appearance',
    options: [
      { value: 'light', labelKey: 'settings.reader.themeLight' },
      { value: 'sepia', labelKey: 'settings.reader.themeSepia' },
      { value: 'dark', labelKey: 'settings.reader.themeDark' },
      { value: 'pitch', labelKey: 'settings.reader.themePitch' },
    ],
  }),
  option('reader.fontFamily', 'select', 'serif', {
    labelKey: 'settings.reader.fontFamily',
    descKey: 'settings.reader.fontFamilyDesc',
    section: 'appearance',
    options: [
      { value: 'serif', labelKey: 'settings.reader.fontSerif' },
      { value: 'sans', labelKey: 'settings.reader.fontSans' },
      { value: 'mono', labelKey: 'settings.reader.fontMono' },
    ],
  }),
  option('reader.fontSize', 'number', 18, {
    labelKey: 'settings.reader.fontSize',
    descKey: 'settings.reader.fontSizeDesc',
    section: 'appearance',
    min: 14,
    max: 26,
    step: 1,
    unit: 'px',
  }),
  option('reader.contentWidth', 'select', 'standard', {
    labelKey: 'settings.reader.contentWidth',
    descKey: 'settings.reader.contentWidthDesc',
    section: 'appearance',
    options: [
      { value: 'compact', labelKey: 'settings.reader.widthCompact' },
      { value: 'standard', labelKey: 'settings.reader.widthStandard' },
      { value: 'wide', labelKey: 'settings.reader.widthWide' },
    ],
  }),

  /* ------------------------------------------------------------------- tabs */
  option('tabs.position', 'select', 'top', {
    labelKey: 'settings.tabs.position',
    descKey: 'settings.tabs.positionDesc',
    section: 'tabs',
    options: tabPositions,
  }),
  option('tabs.width', 'number', 210, {
    labelKey: 'settings.tabs.width',
    descKey: 'settings.tabs.widthDesc',
    section: 'tabs',
    min: 90,
    max: 420,
    step: 10,
    unit: 'px',
  }),
  option('tabs.showFavicons', 'bool', true, {
    labelKey: 'settings.tabs.showFavicons',
    descKey: 'settings.tabs.showFaviconsDesc',
    section: 'tabs',
  }),
  option('tabs.showCloseButton', 'bool', true, {
    labelKey: 'settings.tabs.showCloseButton',
    descKey: 'settings.tabs.showCloseButtonDesc',
    section: 'tabs',
  }),
  option('tabs.hoverClose', 'bool', true, {
    labelKey: 'settings.tabs.hoverClose',
    descKey: 'settings.tabs.hoverCloseDesc',
    section: 'tabs',
  }),
  option('tabs.previewOnHover', 'bool', true, {
    labelKey: 'settings.tabs.previewOnHover',
    descKey: 'settings.tabs.previewOnHoverDesc',
    section: 'tabs',
  }),
  option('tabs.openInBackground', 'bool', false, {
    labelKey: 'settings.tabs.openInBackground',
    descKey: 'settings.tabs.openInBackgroundDesc',
    section: 'tabs',
  }),
  option('tabs.confirmBeforeClose', 'bool', false, {
    labelKey: 'settings.tabs.confirmBeforeClose',
    descKey: 'settings.tabs.confirmBeforeCloseDesc',
    section: 'tabs',
  }),
  option('tabs.newTabPosition', 'select', 'last', {
    labelKey: 'settings.tabs.newTabPosition',
    descKey: 'settings.tabs.newTabPositionDesc',
    section: 'tabs',
    options: [
      { value: 'last', labelKey: 'settings.newTabPosition.last' },
      { value: 'before', labelKey: 'settings.newTabPosition.before' },
    ],
  }),
  option('tabs.restoreClosed', 'bool', true, {
    labelKey: 'settings.tabs.restoreClosed',
    descKey: 'settings.tabs.restoreClosedDesc',
    section: 'tabs',
  }),
  option('tabs.maxUndo', 'number', 10, {
    labelKey: 'settings.tabs.maxUndo',
    descKey: 'settings.tabs.maxUndoDesc',
    section: 'tabs',
    min: 0,
    max: 50,
    step: 1,
  }),

  option('tabs.groups', 'list', [], {
    labelKey: 'settings.tabs.groups',
    descKey: 'settings.tabs.groupsDesc',
    section: 'tabs',
    itemSchema: { id: 'text', name: 'text', color: 'text', collapsed: 'bool' },
    itemLabelKey: 'settings.tabs.groupItem',
  }),

  /* ------------------------------------------------------------- new tab page */
  option('start.layout', 'select', 'grid', {
    labelKey: 'settings.newtab.layout',
    descKey: 'settings.newtab.layoutDesc',
    section: 'start',
    options: [
      { value: 'grid', labelKey: 'settings.newtab.layoutGrid' },
      { value: 'list', labelKey: 'settings.newtab.layoutList' },
      { value: 'minimal', labelKey: 'settings.newtab.layoutMinimal' },
    ],
  }),
  option('start.background', 'text', '', {
    labelKey: 'settings.newtab.background',
    descKey: 'settings.newtab.backgroundDesc',
    section: 'start',
    placeholder: 'hinterland://assets/background.jpg',
  }),
  option('start.backgroundOverlay', 'number', 0.25, {
    labelKey: 'settings.newtab.backgroundOverlay',
    descKey: 'settings.newtab.backgroundOverlayDesc',
    section: 'start',
    min: 0,
    max: 1,
    step: 0.05,
  }),
  option('start.showClock', 'bool', true, {
    labelKey: 'settings.newtab.showClock',
    descKey: 'settings.newtab.showClockDesc',
    section: 'start',
  }),
  option('start.showSearch', 'bool', true, {
    labelKey: 'settings.newtab.showSearch',
    descKey: 'settings.newtab.showSearchDesc',
    section: 'start',
  }),
  option('start.showGreeting', 'bool', true, {
    labelKey: 'settings.newtab.showGreeting',
    descKey: 'settings.newtab.showGreetingDesc',
    section: 'start',
  }),
  option('start.searchTarget', 'text', '', {
    labelKey: 'settings.newtab.searchTarget',
    descKey: 'settings.newtab.searchTargetDesc',
    section: 'start',
    placeholder: 'https://example.org/search?q={q}',
  }),
  option('start.links', 'list', [], {
    labelKey: 'settings.newtab.links',
    descKey: 'settings.newtab.linksDesc',
    section: 'start',
    itemSchema: { title: 'text', url: 'text' },
    itemLabelKey: 'settings.newtab.linksItem',
  }),

  /* ----------------------------------------------------------------- privacy */
  option('privacy.blockTrackers', 'bool', true, {
    labelKey: 'settings.privacy.blockTrackers',
    descKey: 'settings.privacy.blockTrackersDesc',
    section: 'privacy',
  }),
  option('privacy.blockThirdPartyCookies', 'bool', true, {
    labelKey: 'settings.privacy.blockThirdPartyCookies',
    descKey: 'settings.privacy.blockThirdPartyCookiesDesc',
    section: 'privacy',
  }),
  option('privacy.blockThirdPartyMedia', 'bool', false, {
    labelKey: 'settings.privacy.blockThirdPartyMedia',
    descKey: 'settings.privacy.blockThirdPartyMediaDesc',
    section: 'privacy',
  }),
  option('privacy.httpsOnly', 'bool', true, {
    labelKey: 'settings.privacy.httpsOnly',
    descKey: 'settings.privacy.httpsOnlyDesc',
    section: 'privacy',
  }),
  option('privacy.httpsFirst', 'bool', true, {
    labelKey: 'settings.privacy.httpsFirst',
    descKey: 'settings.privacy.httpsFirstDesc',
    section: 'privacy',
  }),
  option('privacy.doNotTrack', 'bool', true, {
    labelKey: 'settings.privacy.doNotTrack',
    descKey: 'settings.privacy.doNotTrackDesc',
    section: 'privacy',
  }),
  option('privacy.stripReferrer', 'bool', true, {
    labelKey: 'settings.privacy.stripReferrer',
    descKey: 'settings.privacy.stripReferrerDesc',
    section: 'privacy',
  }),
  option('privacy.disableHyperlinkAudit', 'bool', true, {
    labelKey: 'settings.privacy.disableHyperlinkAudit',
    descKey: 'settings.privacy.disableHyperlinkAuditDesc',
    section: 'privacy',
  }),
  option('privacy.clearOnExit', 'bool', false, {
    labelKey: 'settings.privacy.clearOnExit',
    descKey: 'settings.privacy.clearOnExitDesc',
    section: 'privacy',
  }),
  option('privacy.permissionsRemember', 'bool', true, {
    labelKey: 'settings.privacy.permissionsRemember',
    descKey: 'settings.privacy.permissionsRememberDesc',
    section: 'privacy',
  }),
  option('privacy.geolocation', 'select', 'ask', {
    labelKey: 'settings.privacy.geolocation',
    descKey: 'settings.privacy.geolocationDesc',
    section: 'privacy',
    options: [
      { value: 'ask', labelKey: 'settings.choice.ask' },
      { value: 'allow', labelKey: 'settings.choice.allow' },
      { value: 'deny', labelKey: 'settings.choice.deny' },
    ],
  }),
  option('privacy.notifications', 'select', 'ask', {
    labelKey: 'settings.privacy.notifications',
    descKey: 'settings.privacy.notificationsDesc',
    section: 'privacy',
    options: [
      { value: 'ask', labelKey: 'settings.choice.ask' },
      { value: 'allow', labelKey: 'settings.choice.allow' },
      { value: 'deny', labelKey: 'settings.choice.deny' },
    ],
  }),
  option('privacy.media', 'select', 'ask', {
    labelKey: 'settings.privacy.media',
    descKey: 'settings.privacy.mediaDesc',
    section: 'privacy',
    options: [
      { value: 'ask', labelKey: 'settings.choice.ask' },
      { value: 'allow', labelKey: 'settings.choice.allow' },
      { value: 'deny', labelKey: 'settings.choice.deny' },
    ],
  }),
  option('privacy.clipboard', 'select', 'ask', {
    labelKey: 'settings.privacy.clipboard',
    descKey: 'settings.privacy.clipboardDesc',
    section: 'privacy',
    options: [
      { value: 'ask', labelKey: 'settings.choice.ask' },
      { value: 'allow', labelKey: 'settings.choice.allow' },
      { value: 'deny', labelKey: 'settings.choice.deny' },
    ],
  }),
  option('privacy.camera', 'select', 'ask', {
    labelKey: 'settings.privacy.camera',
    descKey: 'settings.privacy.cameraDesc',
    section: 'privacy',
    options: [
      { value: 'ask', labelKey: 'settings.choice.ask' },
      { value: 'allow', labelKey: 'settings.choice.allow' },
      { value: 'deny', labelKey: 'settings.choice.deny' },
    ],
  }),
  option('privacy.microphone', 'select', 'ask', {
    labelKey: 'settings.privacy.microphone',
    descKey: 'settings.privacy.microphoneDesc',
    section: 'privacy',
    options: [
      { value: 'ask', labelKey: 'settings.choice.ask' },
      { value: 'allow', labelKey: 'settings.choice.allow' },
      { value: 'deny', labelKey: 'settings.choice.deny' },
    ],
  }),
  option('privacy.midi', 'select', 'deny', {
    labelKey: 'settings.privacy.midi',
    descKey: 'settings.privacy.midiDesc',
    section: 'privacy',
    options: [
      { value: 'ask', labelKey: 'settings.choice.ask' },
      { value: 'allow', labelKey: 'settings.choice.allow' },
      { value: 'deny', labelKey: 'settings.choice.deny' },
    ],
  }),
  option('privacy.popups', 'bool', false, {
    labelKey: 'settings.privacy.popups',
    descKey: 'settings.privacy.popupsDesc',
    section: 'privacy',
  }),
  option('privacy.allowedSites', 'keyvalue', {}, {
    labelKey: 'settings.privacy.allowedSites',
    descKey: 'settings.privacy.allowedSitesDesc',
    section: 'privacy',
  }),
  option('privacy.sitePermissions', 'object', {}, {
    labelKey: 'settings.privacy.sitePermissions',
    descKey: 'settings.privacy.sitePermissionsDesc',
    section: 'privacy',
  }),
  option('privacy.blockRules', 'textarea', '', {
    labelKey: 'settings.privacy.blockRules',
    descKey: 'settings.privacy.blockRulesDesc',
    section: 'privacy',
    rows: 6,
  }),

  /* ----------------------------------------------------------------- content */
  option('content.javascript', 'bool', true, {
    labelKey: 'settings.content.javascript',
    descKey: 'settings.content.javascriptDesc',
    section: 'content',
  }),
  option('content.images', 'bool', true, {
    labelKey: 'settings.content.images',
    descKey: 'settings.content.imagesDesc',
    section: 'content',
  }),
  option('content.stylesheets', 'bool', true, {
    labelKey: 'settings.content.stylesheets',
    descKey: 'settings.content.stylesheetsDesc',
    section: 'content',
  }),
  option('content.spellcheck', 'bool', true, {
    labelKey: 'settings.content.spellcheck',
    descKey: 'settings.content.spellcheckDesc',
    section: 'content',
  }),
  option('content.defaultZoom', 'number', 0, {
    labelKey: 'settings.content.defaultZoom',
    descKey: 'settings.content.defaultZoomDesc',
    section: 'content',
    min: -3,
    max: 5,
    step: 0.1,
    unit: 'x',
  }),
  option('site.zoomLevels', 'object', {}, {
    labelKey: 'settings.content.zoomLevels',
    descKey: 'settings.content.zoomLevelsDesc',
    section: 'content',
  }),
  option('content.defaultFontSize', 'number', 16, {
    labelKey: 'settings.content.defaultFontSize',
    descKey: 'settings.content.defaultFontSizeDesc',
    section: 'content',
    min: 8,
    max: 32,
    step: 1,
    unit: 'px',
  }),
  option('content.defaultFontFamily', 'text', '', {
    labelKey: 'settings.content.defaultFontFamily',
    descKey: 'settings.content.defaultFontFamilyDesc',
    section: 'content',
  }),
  option('content.lazyImages', 'bool', true, {
    labelKey: 'settings.content.lazyImages',
    descKey: 'settings.content.lazyImagesDesc',
    section: 'content',
  }),
  option('content.openLinksInNewTab', 'bool', true, {
    labelKey: 'settings.content.openLinksInNewTab',
    descKey: 'settings.content.openLinksInNewTabDesc',
    section: 'content',
  }),
  option('content.markPdfLinks', 'bool', true, {
    labelKey: 'settings.content.markPdfLinks',
    descKey: 'settings.content.markPdfLinksDesc',
    section: 'content',
  }),
  option('content.customCss', 'textarea', '', {
    labelKey: 'settings.content.customCss',
    descKey: 'settings.content.customCssDesc',
    section: 'content',
    rows: 12,
  }),
  option('content.customCssEnabled', 'bool', false, {
    labelKey: 'settings.content.customCssEnabled',
    descKey: 'settings.content.customCssEnabledDesc',
    section: 'content',
  }),

  /* ----------------------------------------------------------------- search */
  option('search.engines', 'list', [
    { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={q}', shortcut: '@ddg', enabled: true },
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={q}', shortcut: '@g', enabled: true },
    { id: 'mojeek', name: 'Mojeek', url: 'https://www.mojeek.com/search?q={q}', shortcut: '@m', enabled: true },
    { id: 'github', name: 'GitHub', url: 'https://github.com/search?q={q}', shortcut: '@gh', enabled: true },
    { id: 'wikipedia', name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search={q}', shortcut: '@w', enabled: true },
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/results?search_query={q}', shortcut: '@yt', enabled: true },
    { id: 'npm', name: 'npm', url: 'https://www.npmjs.com/search?q={q}', shortcut: '@npm', enabled: true },
  ], {
    labelKey: 'settings.search.engines',
    descKey: 'settings.search.enginesDesc',
    section: 'general',
    itemSchema: { name: 'text', url: 'text', shortcut: 'text', enabled: 'bool' },
    itemLabelKey: 'settings.search.engineItem',
  }),
  option('search.defaultEngine', 'text', 'duckduckgo', {
    labelKey: 'settings.search.defaultEngine',
    descKey: 'settings.search.defaultEngineDesc',
    section: 'general',
  }),
  option('search.suggestions', 'bool', true, {
    labelKey: 'settings.search.suggestions',
    descKey: 'settings.search.suggestionsDesc',
    section: 'general',
  }),
  option('search.historySuggestions', 'bool', true, {
    labelKey: 'settings.search.historySuggestions',
    descKey: 'settings.search.historySuggestionsDesc',
    section: 'general',
  }),

  /* ---------------------------------------------------------------- network */
  option('network.proxyMode', 'select', 'system', {
    labelKey: 'settings.network.proxyMode',
    descKey: 'settings.network.proxyModeDesc',
    section: 'network',
    options: [
      { value: 'system', labelKey: 'settings.proxy.system' },
      { value: 'manual', labelKey: 'settings.proxy.manual' },
      { value: 'off', labelKey: 'settings.proxy.off' },
    ],
  }),
  option('network.proxyRules', 'text', '', {
    labelKey: 'settings.network.proxyRules',
    descKey: 'settings.network.proxyRulesDesc',
    section: 'network',
    placeholder: 'http=127.0.0.1:8080;https=127.0.0.1:8080',
  }),
  option('network.userAgent', 'text', '', {
    labelKey: 'settings.network.userAgent',
    descKey: 'settings.network.userAgentDesc',
    section: 'network',
  }),
  option('network.acceptLanguages', 'text', '', {
    labelKey: 'settings.network.acceptLanguages',
    descKey: 'settings.network.acceptLanguagesDesc',
    section: 'network',
    placeholder: 'de,en',
  }),
  option('network.downloadDirectory', 'text', '', {
    labelKey: 'settings.network.downloadDirectory',
    descKey: 'settings.network.downloadDirectoryDesc',
    section: 'network',
  }),
  option('network.downloadLimit', 'number', 0, {
    labelKey: 'settings.network.downloadLimit',
    descKey: 'settings.network.downloadLimitDesc',
    section: 'network',
    min: 0,
    max: 1000,
    step: 5,
    unit: ' MB/s',
  }),

  /* -------------------------------------------------------------- extensions */
  option('extensions.enabled', 'multiselect', ['hinterlandfocus', 'hinterlandpanel', 'hinterlandpass'], {
    labelKey: 'settings.extensions.enabled',
    descKey: 'settings.extensions.enabledDesc',
    section: 'extensions',
    options: [],
  }),
  option('extensions.developerMode', 'bool', false, {
    labelKey: 'settings.extensions.developerMode',
    descKey: 'settings.extensions.developerModeDesc',
    section: 'extensions',
  }),
  option('extensions.allowUnpacked', 'bool', false, {
    labelKey: 'settings.extensions.allowUnpacked',
    descKey: 'settings.extensions.allowUnpackedDesc',
    section: 'extensions',
  }),
  option('extensions.initialized', 'bool', false),
  option('extensions.permissions', 'keyvalue', {}, {
    labelKey: 'settings.extensions.permissions',
    descKey: 'settings.extensions.permissionsDesc',
    section: 'extensions',
  }),
  option('extensions.updateCheck', 'bool', true, {
    labelKey: 'settings.extensions.updateCheck',
    descKey: 'settings.extensions.updateCheckDesc',
    section: 'extensions',
  }),

  /* --------------------------------------------------------------- bookmarks */
  option('data.bookmarks', 'list', [], {
    labelKey: 'settings.data.bookmarks',
    descKey: 'settings.data.bookmarksDesc',
    section: 'data',
    itemSchema: { title: 'text', url: 'text' },
    itemLabelKey: 'settings.data.bookmarkItem',
  }),
  option('data.readingList', 'list', [], {
    labelKey: 'settings.data.readingList',
    descKey: 'settings.data.readingListDesc',
    section: 'data',
  }),
  option('data.notes', 'list', [], {
    labelKey: 'settings.data.notes',
    descKey: 'settings.data.notesDesc',
    section: 'data',
  }),
  option('data.tabStashes', 'list', [], {
    labelKey: 'settings.data.tabStashes',
    descKey: 'settings.data.tabStashesDesc',
    section: 'data',
  }),

  /* --------------------------------------------------------------- shortcuts */
  option('shortcuts', 'keyvalue', {}, {
    labelKey: 'settings.shortcuts.title',
    descKey: 'settings.shortcuts.desc',
    section: 'shortcuts',
  }),

  /* ---------------------------------------------------------------- advanced */
  option('advanced.hardwareAcceleration', 'bool', true, {
    labelKey: 'settings.advanced.hardwareAcceleration',
    descKey: 'settings.advanced.hardwareAccelerationDesc',
    section: 'advanced',
  }),
  option('advanced.memorySaver', 'bool', true, {
    labelKey: 'settings.advanced.memorySaver',
    descKey: 'settings.advanced.memorySaverDesc',
    section: 'advanced',
  }),
  option('advanced.memorySaverDelay', 'number', 20, {
    labelKey: 'settings.advanced.memorySaverDelay',
    descKey: 'settings.advanced.memorySaverDelayDesc',
    section: 'advanced',
    min: 5,
    max: 180,
    step: 5,
    unit: ' min',
  }),
  option('advanced.blockWebViewTag', 'bool', true, {
    labelKey: 'settings.advanced.blockWebViewTag',
    descKey: 'settings.advanced.blockWebViewTagDesc',
    section: 'advanced',
  }),
  option('advanced.disableProtocolHandlers', 'bool', false, {
    labelKey: 'settings.advanced.disableProtocolHandlers',
    descKey: 'settings.advanced.disableProtocolHandlersDesc',
    section: 'advanced',
  }),
  option('advanced.crashRecovery', 'bool', true, {
    labelKey: 'settings.advanced.crashRecovery',
    descKey: 'settings.advanced.crashRecoveryDesc',
    section: 'advanced',
  }),
  option('advanced.logging', 'bool', false, {
    labelKey: 'settings.advanced.logging',
    descKey: 'settings.advanced.loggingDesc',
    section: 'advanced',
  }),

  /* ----------------------------------------------------------------- store */
  option('store.activeThemeId', 'text', 'midnight', {
    labelKey: 'settings.store.activeTheme',
    descKey: 'settings.store.activeThemeDesc',
    section: 'appearance',
  }),
  option('store.installedThemes', 'list', [], {
    labelKey: 'settings.store.installedThemes',
    descKey: 'settings.store.installedThemesDesc',
    section: 'appearance',
    itemSchema: { id: 'text', name: 'text', author: 'text' },
    itemLabelKey: 'settings.store.themeItem',
  }),
  option('store.extensionConfigs', 'keyvalue', {}, {
    labelKey: 'settings.store.extensionConfigs',
    descKey: 'settings.store.extensionConfigsDesc',
    section: 'extensions',
  }),
  option('store.communityRegistries', 'list', [], {
    labelKey: 'settings.store.communityRegistries',
    descKey: 'settings.store.communityRegistriesDesc',
    section: 'extensions',
    itemSchema: { name: 'text', url: 'text' },
    itemLabelKey: 'settings.store.registryItem',
  }),
];

export function buildDefaults() {
  const result = {};
  for (const definition of SCHEMA) {
    const keys = definition.key.split('.');
    let node = result;
    for (let index = 0; index < keys.length - 1; index += 1) {
      if (typeof node[keys[index]] !== 'object' || node[keys[index]] === null) node[keys[index]] = {};
      node = node[keys[index]];
    }
    node[keys[keys.length - 1]] = structuredClone(definition.default);
  }
  return result;
}

export function exportSchema() {
  return {
    version: SCHEME_VERSION,
    sections: SECTIONS,
    options: SCHEMA.map(({ default: ignored, ...rest }) => ({ ...rest, defaultValue: ignored })),
    defaults: buildDefaults(),
  };
}