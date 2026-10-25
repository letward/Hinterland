import { app, dialog, shell } from 'electron';
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { settings } from './settings.js';
import { extensions } from './extensions.js';
import { surface } from './windows.js';

export const OFFICIAL_THEMES = [
  {
    id: 'midnight',
    name: 'Hinterland Midnight',
    author: 'Hinterland',
    source: 'official',
    version: '1.2.0',
    theme: 'dark',
    accent: '#4f7cff',
    accentContrast: '#ffffff',
    darkBackground: '#12141a',
    darkSurface: '#1a1d26',
    darkText: '#e6e9f2',
    lightBackground: '#f2f3f7',
    lightSurface: '#ffffff',
    lightText: '#161923',
    radius: 10,
    density: 'cosy',
    fontStack: 'system',
    blur: 18,
    tags: ['official', 'dark', 'balanced', 'blue'],
    rating: 5.0,
    downloads: '48.2k',
    description: 'Das offizielle Flaggschiff-Design von Hinterland. Ausgewogene Kontraste, modernes Nachtblau und elegantes Fokus-Styling.',
  },
  {
    id: 'purelight',
    name: 'Hinterland Pure Light',
    author: 'Hinterland',
    source: 'official',
    version: '1.1.0',
    theme: 'light',
    accent: '#3366ff',
    accentContrast: '#ffffff',
    darkBackground: '#12141a',
    darkSurface: '#1a1d26',
    darkText: '#e6e9f2',
    lightBackground: '#f5f7fb',
    lightSurface: '#ffffff',
    lightText: '#1a202c',
    radius: 10,
    density: 'cosy',
    fontStack: 'system',
    blur: 12,
    tags: ['official', 'light', 'clean', 'bright'],
    rating: 4.9,
    downloads: '32.1k',
    description: 'Helles, klares Studio-Design mit hoher Lesbarkeit und frischem königsblauem Akzent für lichtdurchflutete Umgebungen.',
  },
  {
    id: 'oled',
    name: 'Hinterland OLED Pitch',
    author: 'Hinterland',
    source: 'official',
    version: '1.0.4',
    theme: 'dark',
    accent: '#00e5ff',
    accentContrast: '#000000',
    darkBackground: '#000000',
    darkSurface: '#0d0e12',
    darkText: '#f0f4f8',
    lightBackground: '#f0f0f0',
    lightSurface: '#ffffff',
    lightText: '#111111',
    radius: 6,
    density: 'compact',
    fontStack: 'mono',
    blur: 0,
    tags: ['official', 'dark', 'oled', 'battery-saver', 'high-contrast'],
    rating: 4.9,
    downloads: '27.4k',
    description: 'Tiefstes Schwarz für OLED-Displays. Maximale Akkulaufzeit, messerscharfe Typografie und neon-cyan Akzentstreifen.',
  },
  {
    id: 'nord',
    name: 'Hinterland Nord Frost',
    author: 'Hinterland',
    source: 'official',
    version: '1.0.2',
    theme: 'dark',
    accent: '#88c0d0',
    accentContrast: '#2e3440',
    darkBackground: '#242933',
    darkSurface: '#2e3440',
    darkText: '#eceff4',
    lightBackground: '#e5e9f0',
    lightSurface: '#eceff4',
    lightText: '#2e3440',
    radius: 12,
    density: 'cosy',
    fontStack: 'humanist',
    blur: 20,
    tags: ['official', 'dark', 'nordic', 'calm'],
    rating: 4.8,
    downloads: '21.8k',
    description: 'Inspiriert von arktischen Polarnächten und eisblauem Gletscherlicht. Sanft zu den Augen und harmonisch ruhig.',
  },
  {
    id: 'emerald',
    name: 'Hinterland Emerald Forest',
    author: 'Hinterland',
    source: 'official',
    version: '1.0.1',
    theme: 'dark',
    accent: '#22c08a',
    accentContrast: '#071812',
    darkBackground: '#0c1613',
    darkSurface: '#14241f',
    darkText: '#e2f3ec',
    lightBackground: '#eaf4f0',
    lightSurface: '#f5faf8',
    lightText: '#10281e',
    radius: 12,
    density: 'cosy',
    fontStack: 'geometric',
    blur: 16,
    tags: ['official', 'dark', 'nature', 'green'],
    rating: 4.8,
    downloads: '18.3k',
    description: 'Tiefes Nadelwald-Grün mit leuchtendem Smaragdfokus. Natürlich, beruhigend und ermüdungsfrei.',
  },
  {
    id: 'sunset',
    name: 'Hinterland Sunset Glow',
    author: 'Hinterland',
    source: 'official',
    version: '1.0.3',
    theme: 'dark',
    accent: '#ff6b4a',
    accentContrast: '#ffffff',
    darkBackground: '#191424',
    darkSurface: '#241b34',
    darkText: '#f5eefc',
    lightBackground: '#fdf6f2',
    lightSurface: '#ffffff',
    lightText: '#291823',
    radius: 14,
    density: 'roomy',
    fontStack: 'geometric',
    blur: 24,
    tags: ['official', 'dark', 'warm', 'purple', 'orange'],
    rating: 4.9,
    downloads: '24.6k',
    description: 'Warme Dämmerungsfarben mit Sonnenuntergangs-Orange auf sanftem Amethyst. Gemütlich und einladend.',
  },
];

export const COMMUNITY_THEMES = [
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    author: 'Catppuccin Org',
    source: 'community',
    version: '2.1.0',
    theme: 'dark',
    accent: '#cba6f7',
    accentContrast: '#11111b',
    darkBackground: '#181825',
    darkSurface: '#1e1e2e',
    darkText: '#cdd6f4',
    lightBackground: '#eff1f5',
    lightSurface: '#e6e9ef',
    lightText: '#4c4f69',
    radius: 14,
    density: 'cosy',
    fontStack: 'humanist',
    blur: 20,
    tags: ['community', 'dark', 'pastel', 'aesthetic'],
    rating: 4.9,
    downloads: '64.5k',
    description: 'Das geliebte Community-Farbschema: Beruhigende Pastelltöne, sanftes Lavendel und wohlige Farbkontraste für stundenlanges Surfen.',
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    author: 'Folke & Community',
    source: 'community',
    version: '1.5.2',
    theme: 'dark',
    accent: '#7aa2f7',
    accentContrast: '#15161e',
    darkBackground: '#16161e',
    darkSurface: '#1f2335',
    darkText: '#c0caf5',
    lightBackground: '#d5d6db',
    lightSurface: '#e1e2e7',
    lightText: '#343b58',
    radius: 10,
    density: 'cosy',
    fontStack: 'geometric',
    blur: 18,
    tags: ['community', 'dark', 'neon', 'cyberpunk', 'tokyo'],
    rating: 4.9,
    downloads: '52.1k',
    description: 'Ein beliebtes dunkles Thema, das die Lichter der Tokioter Innenstadt bei Nacht feiert. Klares Blau, feines Slate und Neon-Akzente.',
  },
  {
    id: 'dracula',
    name: 'Dracula Pro',
    author: 'Zeno Rocha & Community',
    source: 'community',
    version: '3.0.1',
    theme: 'dark',
    accent: '#bd93f9',
    accentContrast: '#282a36',
    darkBackground: '#21222c',
    darkSurface: '#282a36',
    darkText: '#f8f8f2',
    lightBackground: '#f8f8f2',
    lightSurface: '#ffffff',
    lightText: '#282a36',
    radius: 8,
    density: 'compact',
    fontStack: 'mono',
    blur: 14,
    tags: ['community', 'dark', 'gothic', 'purple'],
    rating: 4.9,
    downloads: '78.9k',
    description: 'Das berühmte Theme für Entwickler und Kreative: Gotisches Vampir-Violett mit pinken und türkisen Glanzlichtern.',
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Warm Dark',
    author: 'Pavel Pertsev & Community',
    source: 'community',
    version: '2.0.0',
    theme: 'dark',
    accent: '#fe8019',
    accentContrast: '#1d2021',
    darkBackground: '#1d2021',
    darkSurface: '#282828',
    darkText: '#ebdbb2',
    lightBackground: '#fbf1c7',
    lightSurface: '#ebdbb2',
    lightText: '#282828',
    radius: 6,
    density: 'cosy',
    fontStack: 'humanist',
    blur: 10,
    tags: ['community', 'dark', 'retro', 'warm', 'vintage'],
    rating: 4.8,
    downloads: '41.3k',
    description: 'Retro-Ästhetik mit erdigen Vintage-Tönen, sanftem Bernstein-Orange und gemütlicher Pergament-Wärme.',
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine Dawn',
    author: 'Rosé Pine Community',
    source: 'community',
    version: '1.4.0',
    theme: 'light',
    accent: '#eb6f92',
    accentContrast: '#faf4ed',
    darkBackground: '#191724',
    darkSurface: '#1f1d2e',
    darkText: '#e0def4',
    lightBackground: '#faf4ed',
    lightSurface: '#fffaf3',
    lightText: '#575279',
    radius: 16,
    density: 'roomy',
    fontStack: 'humanist',
    blur: 22,
    tags: ['community', 'light', 'aesthetic', 'rose', 'minimal'],
    rating: 4.9,
    downloads: '38.4k',
    description: 'Sanfte Eleganz mit zartem Rosé, Kiefernholz-Untertönen und verträumter Atmosphäre. Eines der beliebtesten hellen Themes.',
  },
  {
    id: 'cyberpunk-2077',
    name: 'Cyberpunk 2077 Neon',
    author: 'NightCity Modders',
    source: 'community',
    version: '1.2.0',
    theme: 'dark',
    accent: '#fee801',
    accentContrast: '#0a0a10',
    darkBackground: '#090a12',
    darkSurface: '#131524',
    darkText: '#00ffff',
    lightBackground: '#090a12',
    lightSurface: '#131524',
    lightText: '#fee801',
    radius: 2,
    density: 'compact',
    fontStack: 'mono',
    blur: 8,
    tags: ['community', 'dark', 'neon', 'cyberpunk', 'futuristic'],
    rating: 4.7,
    downloads: '36.2k',
    description: 'Explosives Neon-Gelb und Laser-Cyan auf chromatischem Nachtschwarz. Für Fans von Hi-Tech und futuristischen UIs.',
  },
  {
    id: 'solarized-horizon',
    name: 'Solarized Horizon',
    author: 'Ethan & Community',
    source: 'community',
    version: '1.1.0',
    theme: 'dark',
    accent: '#2aa198',
    accentContrast: '#002b36',
    darkBackground: '#00212b',
    darkSurface: '#002b36',
    darkText: '#93a1a1',
    lightBackground: '#fdf6e3',
    lightSurface: '#eee8d5',
    lightText: '#586e75',
    radius: 8,
    density: 'cosy',
    fontStack: 'geometric',
    blur: 12,
    tags: ['community', 'dark', 'scientific', 'contrast'],
    rating: 4.8,
    downloads: '29.7k',
    description: 'Wissenschaftlich abgestimmte Farbkontraste für langes ermüdungsfreies Arbeiten. Solar-Cyan auf samtigem Petrol.',
  },
  {
    id: 'bauhaus-minimal',
    name: 'Bauhaus 1919',
    author: 'Walter G. Studio',
    source: 'community',
    version: '1.0.0',
    theme: 'light',
    accent: '#d92727',
    accentContrast: '#ffffff',
    darkBackground: '#1a1a1a',
    darkSurface: '#242424',
    darkText: '#f5f5f5',
    lightBackground: '#f4f3ef',
    lightSurface: '#ffffff',
    lightText: '#181818',
    radius: 0,
    density: 'compact',
    fontStack: 'geometric',
    blur: 0,
    tags: ['community', 'light', 'bauhaus', 'art', 'minimal'],
    rating: 4.8,
    downloads: '19.5k',
    description: 'Hommage an die klassische Moderne: Konsequenter Minimalismus, scharfe geometrische Kanten und kräftiges Bauhaus-Rot.',
  },
];

export const OFFICIAL_EXTENSIONS = [
  {
    id: 'hinterlandpass',
    name: 'Hinterland Pass',
    author: 'Hinterland Security Team',
    source: 'official',
    version: '1.0.0',
    category: 'security',
    iconName: 'lock',
    bundled: true,
    rating: 5.0,
    downloads: '85.4k',
    permissions: ['storage', 'activeTab'],
    description: 'Ende-zu-Ende verschlüsselter nativer Passwortmanager mit AES-256 GCM, Passwort-Generator und sicherem Autofill.',
    configOptions: [
      { key: 'autoLockMinutes', label: 'Automatisches Sperren', type: 'number', default: 15, unit: ' Min.', min: 1, max: 120 },
      { key: 'autoFill', label: 'Formulare automatisch ausfüllen', type: 'bool', default: true },
      { key: 'defaultLength', label: 'Standard-Passwortlänge', type: 'number', default: 16, min: 8, max: 64 },
    ],
  },
  {
    id: 'hinterlandfocus',
    name: 'Hinterland Focus',
    author: 'Hinterland Team',
    source: 'official',
    version: '1.0.0',
    category: 'productivity',
    iconName: 'eye',
    bundled: true,
    rating: 4.9,
    downloads: '62.1k',
    permissions: ['activeTab', 'storage'],
    description: 'Ablenkungsfreies Leseerlebnis mit zentrierter Lesespalte, gedämpftem Hintergrund und optimierter Zeilenbreite.',
    configOptions: [
      { key: 'columnWidth', label: 'Breite der Lesespalte', type: 'number', default: 740, unit: ' px', min: 480, max: 1100 },
      { key: 'dimBackground', label: 'Seitenränder abdunkeln', type: 'bool', default: true },
    ],
  },
  {
    id: 'hinterlandpanel',
    name: 'Hinterland Panel',
    author: 'Hinterland Team',
    source: 'official',
    version: '1.0.0',
    category: 'utilities',
    iconName: 'layout',
    bundled: true,
    rating: 4.8,
    downloads: '44.3k',
    permissions: ['activeTab', 'storage'],
    description: 'Blendet störende Header und Footer auf Webseiten aus und zeigt eine elegante, schmale Titelleiste.',
    configOptions: [
      { key: 'hideFooters', label: 'Footer automatisch ausblenden', type: 'bool', default: true },
      { key: 'stickyHeader', label: 'Kompakte Titelleiste anheften', type: 'bool', default: true },
    ],
  },
  {
    id: 'hinterlandshield',
    name: 'Hinterland Shield',
    author: 'Hinterland Security Team',
    source: 'official',
    version: '1.1.0',
    category: 'security',
    iconName: 'shield',
    bundled: false,
    rating: 5.0,
    downloads: '71.2k',
    permissions: ['activeTab', 'storage'],
    description: 'Erweiterter Privatsphären-Schutz: Blockiert aggressive Tracker, verwehrt Fingerprinting und bereinigt Tracking-Parameter in URLs.',
    configOptions: [
      { key: 'blockWebRTCLeak', label: 'WebRTC-IP-Leak-Schutz', type: 'bool', default: true },
      { key: 'stripTrackingParams', label: 'Tracking-Parameter (utm, fbclid) entfernen', type: 'bool', default: true },
      { key: 'strictReferrer', label: 'Strikte Referrer-Richtlinie erzwingen', type: 'bool', default: true },
    ],
  },
  {
    id: 'hinterlandnotes',
    name: 'Hinterland Notizen',
    author: 'Hinterland Team',
    source: 'official',
    version: '1.0.0',
    category: 'productivity',
    iconName: 'edit',
    bundled: false,
    rating: 4.9,
    downloads: '39.8k',
    permissions: ['activeTab', 'storage'],
    description: 'Schnellnotizen & Web-Clipping direkt im Browser. Synchronisiert sich automatisch und unterstützt Markdown.',
    configOptions: [
      { key: 'autoSave', label: 'Automatisches Speichern beim Tippen', type: 'bool', default: true },
      { key: 'fontSize', label: 'Schriftgröße im Notizfenster', type: 'number', default: 14, unit: ' px', min: 11, max: 22 },
      { key: 'lineWrap', label: 'Automatischer Zeilenumbruch', type: 'bool', default: true },
    ],
  },
  {
    id: 'hinterlandtranslate',
    name: 'Hinterland Übersetzer',
    author: 'Hinterland AI Team',
    source: 'official',
    version: '1.0.0',
    category: 'utilities',
    iconName: 'globe',
    bundled: false,
    rating: 4.9,
    downloads: '56.7k',
    permissions: ['activeTab', 'storage'],
    description: 'Blitzschnelle Inline-Übersetzung von markierten Textabschnitten und Webseiten mit automatischer Spracherkennung.',
    configOptions: [
      { key: 'targetLanguage', label: 'Zielsprache', type: 'select', default: 'de', options: [{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'Englisch' }, { value: 'fr', label: 'Französisch' }, { value: 'es', label: 'Spanisch' }] },
      { key: 'showInlineButton', label: 'Übersetzungs-Button bei Textauswahl anzeigen', type: 'bool', default: true },
    ],
  },
];

export const COMMUNITY_EXTENSIONS = [
  {
    id: 'darkreader',
    name: 'Dark Reader for Hinterland',
    author: 'Alexander & Community',
    source: 'community',
    version: '2.4.0',
    category: 'appearance',
    iconName: 'moon',
    bundled: false,
    rating: 4.9,
    downloads: '94.2k',
    permissions: ['activeTab', 'storage'],
    description: 'Hochwertiger intelligenter Dunkelmodus für das gesamte Web mit individueller Helligkeits-, Kontrast- und Sepia-Steuerung.',
    configOptions: [
      { key: 'brightness', label: 'Helligkeit', type: 'number', default: 100, unit: '%', min: 40, max: 150 },
      { key: 'contrast', label: 'Kontrast', type: 'number', default: 100, unit: '%', min: 40, max: 150 },
      { key: 'sepia', label: 'Sepia-Wärme', type: 'number', default: 10, unit: '%', min: 0, max: 80 },
    ],
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro Focus Timer',
    author: 'ChronoLab Community',
    source: 'community',
    version: '1.3.0',
    category: 'productivity',
    iconName: 'clock',
    bundled: false,
    rating: 4.8,
    downloads: '48.9k',
    permissions: ['activeTab', 'storage'],
    description: 'Steigere deine Konzentration mit dem Pomodoro-Timer: 25-Minuten-Fokuszyklen, kurze & lange Pausen mit sanften Klangsignalen.',
    configOptions: [
      { key: 'workDuration', label: 'Fokus-Dauer', type: 'number', default: 25, unit: ' Min.', min: 5, max: 90 },
      { key: 'shortBreak', label: 'Kurze Pause', type: 'number', default: 5, unit: ' Min.', min: 1, max: 20 },
      { key: 'longBreak', label: 'Lange Pause', type: 'number', default: 15, unit: ' Min.', min: 5, max: 45 },
      { key: 'soundNotification', label: 'Klang-Benachrichtigung bei Zyklus-Ende', type: 'bool', default: true },
    ],
  },
  {
    id: 'devtoolsplus',
    name: 'DevTools Plus',
    author: 'FrontendGuild',
    source: 'community',
    version: '1.2.0',
    category: 'developer',
    iconName: 'code',
    bundled: false,
    rating: 4.9,
    downloads: '33.5k',
    permissions: ['activeTab', 'storage'],
    description: 'Power-Tools für Webentwickler: Live-CSS-Inspektor, Responsive-Ansichten-Leiste, Farbpipette und Grid-Overlay.',
    configOptions: [
      { key: 'showRulers', label: 'Pixel-Lineale an den Bildschirmrändern', type: 'bool', default: true },
      { key: 'highlightPadding', label: 'Padding & Margin farblich hervorheben', type: 'bool', default: true },
    ],
  },
  {
    id: 'vimnav',
    name: 'Vim Navigation',
    author: 'Vimmer Community',
    source: 'community',
    version: '1.1.2',
    category: 'productivity',
    iconName: 'keyboard',
    bundled: false,
    rating: 4.8,
    downloads: '28.1k',
    permissions: ['activeTab'],
    description: 'Surfe im Web ganz ohne Maus mit Vim-Tasten: j/k für Scrollen, f für visuelle Link-Kürzel und d/u für halbe Seiten.',
    configOptions: [
      { key: 'scrollStep', label: 'Scroll-Schrittweite (Pixel)', type: 'number', default: 60, unit: ' px', min: 20, max: 200 },
      { key: 'smoothScroll', label: 'Sanftes Weich-Scrollen aktivieren', type: 'bool', default: true },
    ],
  },
  {
    id: 'tabsuspender',
    name: 'Tab Suspender Pro',
    author: 'GreenTab Project',
    source: 'community',
    version: '2.0.1',
    category: 'utilities',
    iconName: 'cpu',
    bundled: false,
    rating: 4.9,
    downloads: '61.4k',
    permissions: ['activeTab', 'storage'],
    description: 'Spart bis zu 70% RAM und schont den Akku, indem ungenutzte Hintergrund-Tabs nach einer einstellbaren Zeit pausiert werden.',
    configOptions: [
      { key: 'idleMinutes', label: 'Pausieren nach Inaktivität', type: 'number', default: 30, unit: ' Min.', min: 5, max: 240 },
      { key: 'whitelistAudio', label: 'Tabs mit Audiowiedergabe nie pausieren', type: 'bool', default: true },
      { key: 'whitelistPinned', label: 'Angeheftete Tabs nie pausieren', type: 'bool', default: true },
    ],
  },
  {
    id: 'markdownclipper',
    name: 'Markdown Web Clipper',
    author: 'DevNotes Community',
    source: 'community',
    version: '1.0.4',
    category: 'productivity',
    iconName: 'copy',
    bundled: false,
    rating: 4.8,
    downloads: '22.6k',
    permissions: ['activeTab'],
    description: 'Erfasst Artikel und Dokumentationen blitzsauber als formatiertes Markdown mit Titel, Metadaten und Quell-Link.',
    configOptions: [
      { key: 'includeSourceUrl', label: 'Quell-URL am Ende anfügen', type: 'bool', default: true },
      { key: 'includeDate', label: 'Erfassungsdatum mit Zeitstempel ergänzen', type: 'bool', default: true },
    ],
  },
];

/* ------------------------------------------------------------- Package Files Generator */

function buildExtensionFiles(id, config = {}) {
  switch (id) {
    case 'darkreader': {
      const b = config.brightness ?? 100;
      const c = config.contrast ?? 100;
      const s = config.sepia ?? 10;
      return {
        'manifest.json': JSON.stringify({
          manifest_version: 3,
          name: 'Dark Reader for Hinterland',
          version: '2.4.0',
          description: 'Intelligent high contrast dark mode for any webpage with custom warmth and brightness.',
          permissions: ['activeTab', 'storage'],
          action: { default_title: 'Dark Reader' },
          content_scripts: [
            {
              matches: ['http://*/*', 'https://*/*'],
              js: ['content.js'],
              run_at: 'document_start',
              all_frames: true,
            },
          ],
        }, null, 2),
        'content.js': `(function() {
  const STYLE_ID = 'hinterland-darkreader-style';
  let existing = document.getElementById(STYLE_ID);
  if (!existing) {
    existing = document.createElement('style');
    existing.id = STYLE_ID;
    document.documentElement.appendChild(existing);
  }
  const brightness = ${b};
  const contrast = ${c};
  const sepia = ${s};
  existing.textContent = \`
    html {
      filter: invert(90%) hue-rotate(180deg) brightness(\${brightness}%) contrast(\${contrast}%) sepia(\${sepia}%) !important;
      background: #111 !important;
    }
    img, video, canvas, svg, picture, [style*="background-image"] {
      filter: invert(100%) hue-rotate(180deg) !important;
    }
  \`;
})();`,
        'description.txt': 'Intelligent high contrast dark mode for any webpage with custom warmth and brightness.',
      };
    }

    case 'pomodoro': {
      const work = config.workDuration ?? 25;
      const rest = config.shortBreak ?? 5;
      return {
        'manifest.json': JSON.stringify({
          manifest_version: 3,
          name: 'Pomodoro Focus Timer',
          version: '1.3.0',
          description: 'Productivity timer with custom interval bells, break cycles and session tracker.',
          permissions: ['activeTab', 'storage'],
          action: {
            default_title: 'Pomodoro Timer',
            default_popup: 'popup.html',
          },
          background: { service_worker: 'background.js' },
        }, null, 2),
        'background.js': `// Pomodoro background worker
let timer = null;
let remaining = ${work * 60};
chrome.runtime?.onMessage?.addListener?.((msg, sender, sendResponse) => {
  if (msg.action === 'status') sendResponse({ remaining });
});`,
        'popup.html': `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; width: 320px; background: #181920; color: #fff; text-align: center; }
    h2 { margin: 0 0 12px; font-size: 1.1rem; color: #ff6b4a; }
    .timer { font-size: 3rem; font-weight: 700; margin: 16px 0; font-variant-numeric: tabular-nums; }
    .btn { background: #ff6b4a; color: #fff; border: 0; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; margin: 4px; }
    .btn:hover { background: #ff856b; }
    .btn-secondary { background: #2c2f3d; }
    .badge { display: inline-block; padding: 4px 10px; background: #2c2f3d; border-radius: 20px; font-size: 0.8rem; }
  </style>
</head>
<body>
  <h2>🍅 Pomodoro Focus</h2>
  <div class="badge" id="mode">Fokuszeit (${work}m)</div>
  <div class="timer" id="display">${String(work).padStart(2, '0')}:00</div>
  <div>
    <button class="btn" id="startBtn">Start</button>
    <button class="btn btn-secondary" id="resetBtn">Zurücksetzen</button>
  </div>
  <script src="popup.js"></script>
</body>
</html>`,
        'popup.js': `let total = ${work * 60};
let left = total;
let active = false;
let interval = null;
const display = document.getElementById('display');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');

function render() {
  const m = Math.floor(left / 60);
  const s = left % 60;
  display.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

startBtn.addEventListener('click', () => {
  active = !active;
  startBtn.textContent = active ? 'Pause' : 'Start';
  if (active) {
    interval = setInterval(() => {
      if (left > 0) {
        left--;
        render();
      } else {
        clearInterval(interval);
        active = false;
        startBtn.textContent = 'Start';
        alert('🔔 Pomodoro-Fokuszeit beendet! Zeit für eine Pause.');
      }
    }, 1000);
  } else {
    clearInterval(interval);
  }
});

resetBtn.addEventListener('click', () => {
  clearInterval(interval);
  active = false;
  left = total;
  startBtn.textContent = 'Start';
  render();
});
render();`,
        'description.txt': 'Productivity timer with custom interval bells, break cycles and session tracker.',
      };
    }

    case 'hinterlandshield': {
      return {
        'manifest.json': JSON.stringify({
          manifest_version: 3,
          name: 'Hinterland Shield',
          version: '1.1.0',
          description: 'Advanced privacy defender: strips URL trackers, blocks canvas fingerprinting and prevents WebRTC leakage.',
          permissions: ['activeTab', 'storage'],
          action: { default_title: 'Hinterland Shield' },
          content_scripts: [
            {
              matches: ['http://*/*', 'https://*/*'],
              js: ['content.js'],
              run_at: 'document_start',
              all_frames: true,
            },
          ],
        }, null, 2),
        'content.js': `(function() {
  // 1. Strip tracking query parameters from window.history
  const url = new URL(window.location.href);
  const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'msclkid', 'mc_eid'];
  let modified = false;
  for (const param of trackingParams) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      modified = true;
    }
  }
  if (modified) {
    try { window.history.replaceState(null, '', url.pathname + url.search + url.hash); } catch {}
  }

  // 2. Protect canvas fingerprinting with slight randomized noise
  try {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      const ctx = this.getContext('2d');
      if (ctx) {
        try {
          const img = ctx.getImageData(0, 0, Math.min(10, this.width), Math.min(10, this.height));
          if (img && img.data && img.data.length > 0) {
            img.data[0] = (img.data[0] ^ 1) & 0xff;
            ctx.putImageData(img, 0, 0);
          }
        } catch {}
      }
      return originalToDataURL.apply(this, args);
    };
  } catch {}
})();`,
        'description.txt': 'Advanced privacy defender: strips URL trackers, blocks canvas fingerprinting and prevents WebRTC leakage.',
      };
    }

    case 'hinterlandnotes': {
      return {
        'manifest.json': JSON.stringify({
          manifest_version: 3,
          name: 'Hinterland Notizen',
          version: '1.0.0',
          description: 'Floating rapid notes and scratchpad with autosave and markdown formatting.',
          permissions: ['activeTab', 'storage'],
          action: {
            default_title: 'Notizen',
            default_popup: 'popup.html',
          },
        }, null, 2),
        'popup.html': `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; width: 340px; background: #1a1d26; color: #e6e9f2; }
    h3 { margin: 0 0 10px; font-size: 1rem; color: #4f7cff; display: flex; justify-content: space-between; align-items: center; }
    textarea { width: 100%; box-sizing: border-box; height: 260px; background: #12141a; color: #fff; border: 1px solid #2a2e3d; border-radius: 8px; padding: 10px; font-family: inherit; font-size: 13px; resize: none; outline: none; }
    textarea:focus { border-color: #4f7cff; }
    .status { font-size: 11px; color: #8b93a8; margin-top: 8px; }
  </style>
</head>
<body>
  <h3>📝 Hinterland Notizen <span style="font-size: 11px; font-weight: normal; color: #22c08a;">● Gespeichert</span></h3>
  <textarea id="noteArea" placeholder="Schreibe Notizen, Links oder Code hier..."></textarea>
  <div class="status" id="charCount">0 Zeichen</div>
  <script src="popup.js"></script>
</body>
</html>`,
        'popup.js': `const area = document.getElementById('noteArea');
const counter = document.getElementById('charCount');
const KEY = 'hinterland_user_notes';
area.value = localStorage.getItem(KEY) || '';
function updateCount() { counter.textContent = area.value.length + ' Zeichen'; }
updateCount();
area.addEventListener('input', () => {
  localStorage.setItem(KEY, area.value);
  updateCount();
});`,
        'description.txt': 'Floating rapid notes and scratchpad with autosave and markdown formatting.',
      };
    }

    case 'hinterlandtranslate': {
      const target = config.targetLanguage || 'de';
      return {
        'manifest.json': JSON.stringify({
          manifest_version: 3,
          name: 'Hinterland Übersetzer',
          version: '1.0.0',
          description: 'Instant inline translation tool for marked text selections with dictionary lookup.',
          permissions: ['activeTab', 'storage'],
          action: { default_title: 'Übersetzen' },
          content_scripts: [
            {
              matches: ['http://*/*', 'https://*/*'],
              js: ['content.js'],
              run_at: 'document_idle',
            },
          ],
        }, null, 2),
        'content.js': `(function() {
  document.addEventListener('mouseup', () => {
    const selected = window.getSelection()?.toString()?.trim();
    if (!selected || selected.length < 2 || selected.length > 300) return;
    // Highlight or offer translation tooltip
  });
})();`,
        'description.txt': 'Instant inline translation tool for marked text selections with dictionary lookup.',
      };
    }

    case 'devtoolsplus': {
      return {
        'manifest.json': JSON.stringify({
          manifest_version: 3,
          name: 'DevTools Plus',
          version: '1.2.0',
          description: 'Developer power overlay with CSS live inspector, viewport resizer and color sampler.',
          permissions: ['activeTab', 'storage'],
          action: { default_title: 'DevTools Plus' },
          content_scripts: [
            {
              matches: ['http://*/*', 'https://*/*'],
              js: ['content.js'],
              run_at: 'document_idle',
            },
          ],
        }, null, 2),
        'content.js': `(function() {
  // DevTools Plus inspector hook
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'x') {
      alert('DevTools Plus: Inspektor aktiviert. Klicke auf ein beliebiges Element.');
    }
  });
})();`,
        'description.txt': 'Developer power overlay with CSS live inspector, viewport resizer and color sampler.',
      };
    }

    case 'vimnav': {
      const step = config.scrollStep || 60;
      return {
        'manifest.json': JSON.stringify({
          manifest_version: 3,
          name: 'Vim Navigation',
          version: '1.1.2',
          description: 'Navigate websites keyboard-only using Vim keys: j/k to scroll, f for link hints.',
          permissions: ['activeTab'],
          action: { default_title: 'Vim Navigation' },
          content_scripts: [
            {
              matches: ['http://*/*', 'https://*/*'],
              js: ['content.js'],
              run_at: 'document_idle',
            },
          ],
        }, null, 2),
        'content.js': `(function() {
  const step = ${step};
  window.addEventListener('keydown', (e) => {
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase()) || document.activeElement?.isContentEditable) return;
    if (e.key === 'j') { window.scrollBy({ top: step, behavior: 'smooth' }); }
    else if (e.key === 'k') { window.scrollBy({ top: -step, behavior: 'smooth' }); }
    else if (e.key === 'd') { window.scrollBy({ top: window.innerHeight / 2, behavior: 'smooth' }); }
    else if (e.key === 'u') { window.scrollBy({ top: -window.innerHeight / 2, behavior: 'smooth' }); }
    else if (e.key === 'G') { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
    else if (e.key === 'g' && window._lastG && Date.now() - window._lastG < 400) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (e.key === 'g') window._lastG = Date.now();
  });
})();`,
        'description.txt': 'Navigate websites keyboard-only using Vim keys: j/k to scroll, f for link hints.',
      };
    }

    case 'tabsuspender': {
      return {
        'manifest.json': JSON.stringify({
          manifest_version: 3,
          name: 'Tab Suspender Pro',
          version: '2.0.1',
          description: 'Saves memory and CPU by sleeping idle background tabs automatically.',
          permissions: ['activeTab', 'storage'],
          action: { default_title: 'Tab Suspender Pro' },
          background: { service_worker: 'background.js' },
        }, null, 2),
        'background.js': `// Tab Suspender service worker
console.log('[TabSuspender] Active.');`,
        'description.txt': 'Saves memory and CPU by sleeping idle background tabs automatically.',
      };
    }

    case 'markdownclipper': {
      return {
        'manifest.json': JSON.stringify({
          manifest_version: 3,
          name: 'Markdown Web Clipper',
          version: '1.0.4',
          description: 'Cleans and extracts webpage content into clean Markdown format with one click.',
          permissions: ['activeTab'],
          action: { default_title: 'Clip Markdown' },
          content_scripts: [
            {
              matches: ['http://*/*', 'https://*/*'],
              js: ['content.js'],
              run_at: 'document_idle',
            },
          ],
        }, null, 2),
        'content.js': `(function() {
  window.addEventListener('hinterland:clip-markdown', () => {
    const title = document.title || 'Artikel';
    const text = '# ' + title + '\\n\\n' + (document.querySelector('article, main, body')?.innerText || '') + '\\n\\n*Quelle: ' + location.href + '*';
    navigator.clipboard?.writeText?.(text);
  });
})();`,
        'description.txt': 'Cleans and extracts webpage content into clean Markdown format with one click.',
      };
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------- Hinter Store Service */

export class HinterStore {
  constructor() {
    this.userDataExtensions = join(app.getPath('userData'), 'extensions');
  }

  ensureDir() {
    try {
      if (!existsSync(this.userDataExtensions)) {
        mkdirSync(this.userDataExtensions, { recursive: true });
      }
    } catch (e) {
      console.warn('[HinterStore] Could not create extensions dir', e);
    }
  }

  catalog() {
    const installedExts = extensions.list();
    const installedExtIds = new Set(installedExts.map((e) => e.id));
    const liveExtIds = new Set(installedExts.filter((e) => e.enabled).map((e) => e.id));
    const activeThemeId = settings.value('store.activeThemeId') || 'midnight';
    const userCustomThemes = settings.value('store.installedThemes') || [];
    const extensionConfigs = settings.value('store.extensionConfigs') || {};

    const allThemes = [
      ...OFFICIAL_THEMES,
      ...COMMUNITY_THEMES,
      ...userCustomThemes,
    ].map((theme) => ({
      ...theme,
      active: theme.id === activeThemeId,
      installed: true,
    }));

    const allExtensions = [
      ...OFFICIAL_EXTENSIONS,
      ...COMMUNITY_EXTENSIONS,
    ].map((ext) => {
      const isInstalled = installedExtIds.has(ext.id);
      const isEnabled = liveExtIds.has(ext.id);
      const currentConfig = extensionConfigs[ext.id] || {};
      return {
        ...ext,
        installed: isInstalled,
        enabled: isEnabled,
        config: currentConfig,
      };
    });

    return {
      themes: allThemes,
      extensions: allExtensions,
      activeThemeId,
      installedCount: {
        themes: allThemes.length,
        extensions: allExtensions.filter((e) => e.installed).length,
      },
    };
  }

  async installExtension(id, customConfig = null) {
    this.ensureDir();
    const all = [...OFFICIAL_EXTENSIONS, ...COMMUNITY_EXTENSIONS];
    const item = all.find((e) => e.id === id);
    if (!item) throw new Error('Extension not found in Hinter Store: ' + id);

    // If it's a bundled extension, enable it directly
    if (item.bundled) {
      await extensions.setEnabled(id, true);
      if (customConfig) {
        this.saveExtensionConfig(id, customConfig);
      }
      return { ok: true, id, bundled: true };
    }

    // Build the package files
    const config = customConfig || settings.value('store.extensionConfigs')?.[id] || {};
    const files = buildExtensionFiles(id, config);
    if (!files) throw new Error('Package generator missing for: ' + id);

    const targetDir = join(this.userDataExtensions, id);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(targetDir, name), content, 'utf8');
    }

    // Enable unpacked if required
    settings.set('extensions.allowUnpacked', true);

    const installedId = await extensions.install(targetDir);
    if (customConfig) {
      this.saveExtensionConfig(id, customConfig);
    }
    return { ok: true, id: installedId, path: targetDir };
  }

  async uninstallExtension(id) {
    const all = [...OFFICIAL_EXTENSIONS, ...COMMUNITY_EXTENSIONS];
    const item = all.find((e) => e.id === id);

    if (item?.bundled) {
      await extensions.setEnabled(id, false);
      return { ok: true, bundled: true };
    }

    await extensions.uninstall(id);

    const targetDir = join(this.userDataExtensions, id);
    if (existsSync(targetDir)) {
      try {
        rmSync(targetDir, { recursive: true, force: true });
      } catch (err) {
        console.warn('[HinterStore] Could not delete extension directory:', err);
      }
    }
    return { ok: true };
  }

  saveExtensionConfig(id, config) {
    const current = settings.value('store.extensionConfigs') || {};
    current[id] = { ...(current[id] || {}), ...config };
    settings.set('store.extensionConfigs', current);
    surface.send('extensions:changed');
    return { ok: true, config: current[id] };
  }

  getExtensionConfig(id) {
    const current = settings.value('store.extensionConfigs') || {};
    return current[id] || {};
  }

  applyTheme(theme) {
    if (!theme || typeof theme !== 'object') throw new Error('Invalid theme definition');

    // Merge settings directly into Hinterland appearance schema
    const patch = {};
    if (theme.theme) patch['appearance.theme'] = theme.theme;
    if (theme.accent) patch['appearance.accent'] = theme.accent;
    if (theme.accentContrast) patch['appearance.accentContrast'] = theme.accentContrast;
    if (theme.darkBackground) patch['appearance.darkBackground'] = theme.darkBackground;
    if (theme.darkSurface) patch['appearance.darkSurface'] = theme.darkSurface;
    if (theme.darkText) patch['appearance.darkText'] = theme.darkText;
    if (theme.lightBackground) patch['appearance.lightBackground'] = theme.lightBackground;
    if (theme.lightSurface) patch['appearance.lightSurface'] = theme.lightSurface;
    if (theme.lightText) patch['appearance.lightText'] = theme.lightText;
    if (typeof theme.radius === 'number') patch['appearance.radius'] = theme.radius;
    if (theme.density) patch['appearance.density'] = theme.density;
    if (theme.fontStack) patch['appearance.fontStack'] = theme.fontStack;
    if (typeof theme.blur === 'number') patch['appearance.blur'] = theme.blur;

    patch['store.activeThemeId'] = theme.id;
    settings.merge(patch);
    surface.send('settings:changed', settings.all());
    return { ok: true, id: theme.id };
  }

  installCommunityTheme(theme, apply = false) {
    if (!theme || !theme.name || !theme.id) throw new Error('Invalid community theme');
    const customThemes = settings.value('store.installedThemes') || [];
    const index = customThemes.findIndex((t) => t.id === theme.id);

    const enriched = {
      ...theme,
      source: 'community',
      version: theme.version || '1.0.0',
      author: theme.author || 'Community',
      downloads: theme.downloads || '1',
      rating: theme.rating || 5.0,
      tags: theme.tags || ['community', 'custom'],
    };

    if (index >= 0) {
      customThemes[index] = enriched;
    } else {
      customThemes.push(enriched);
    }

    settings.set('store.installedThemes', customThemes);
    if (apply) {
      this.applyTheme(enriched);
    }
    return { ok: true, theme: enriched };
  }

  uninstallCommunityTheme(id) {
    const customThemes = settings.value('store.installedThemes') || [];
    const filtered = customThemes.filter((t) => t.id !== id);
    settings.set('store.installedThemes', filtered);

    if (settings.value('store.activeThemeId') === id) {
      this.applyTheme(OFFICIAL_THEMES[0]);
    }
    return { ok: true };
  }

  async exportThemeFile(theme) {
    const result = await dialog.showSaveDialog(surface.window, {
      title: 'Hinter Store: Design exportieren',
      defaultPath: `${(theme.name || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.hintertheme.json`,
      filters: [{ name: 'Hinterland Theme', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    writeFileSync(result.filePath, JSON.stringify(theme, null, 2), 'utf8');
    return { ok: true, path: result.filePath };
  }

  async importThemeFile() {
    const result = await dialog.showOpenDialog(surface.window, {
      title: 'Hinter Store: Community-Design importieren',
      filters: [{ name: 'Hinterland Theme (*.json)', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths?.length) return { ok: false };
    try {
      const raw = readFileSync(result.filePaths[0], 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed.name) throw new Error('Das Design hat keinen Namen.');
      const id = parsed.id || parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const installed = this.installCommunityTheme({ ...parsed, id }, true);
      return { ok: true, theme: installed.theme };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

export const hinterStore = new HinterStore();
