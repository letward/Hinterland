const PATHS = {
  back: '<path d="M15 5l-7 7 7 7" />',
  forward: '<path d="M9 5l7 7-7 7" />',
  reload: '<path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" />',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" />',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />',
  plus: '<path d="M12 5v14M5 12h14" />',
  minus: '<path d="M5 12h14" />',
  close: '<path d="M6 6l12 12M18 6L6 18" />',
  pin: '<path d="M9 4h6l-1 6 3 3v1H7v-1l3-3z" /><path d="M12 14v6" />',
  more: '<circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />',
  shield: '<path d="M12 3l7 3v5c0 4.4-2.9 8.2-7 10-4.1-1.8-7-5.6-7-10V6z" />',
  puzzle: '<path d="M10 4h4v2.2a1.8 1.8 0 1 0 3.6 0V9H20v4h-2.2a1.8 1.8 0 1 0 0 3.6H20V20H4v-3.4h1.6a1.8 1.8 0 1 0 0-3.6H4V9h2.2a1.8 1.8 0 1 0 3.6 0V4z" />',
  download: '<path d="M12 4v10" /><path d="M8 11l4 4 4-4" /><path d="M5 19h14" />',
  star: '<path d="M12 4l2.4 5 5.6.8-4 4 .9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-4 5.6-.8z" />',
  gear: '<circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6" />',
  search: '<circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" />',
  external: '<path d="M14 5h5v5" /><path d="M19 5l-8 8" /><path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />',
  volume: '<path d="M5 10v4h3l4 3V7l-4 3z" /><path d="M16 9.5a3.5 3.5 0 0 1 0 5" />',
  volumeOff: '<path d="M5 10v4h3l4 3V7l-4 3z" /><path d="M16 10l4 4M20 10l-4 4" />',
  find: '<circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /><path d="M8.5 11h5" />',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2" /><path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />',
  trash: '<path d="M5 7h14" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" />',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" />',
  chevronRight: '<path d="M9 5l7 7-7 7" />',
  chevronDown: '<path d="M5 9l7 7 7-7" />',
  warning: '<path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.2v.1" />',
  info: '<circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8.2v.1" />',
  globe: '<circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />',
  key: '<circle cx="7.5" cy="15.5" r="4.5" /><path d="M21 3l-9.9 9.9M15 9l2 2M18 6l2 2" />',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.1M11 10h.1M15 10h.1M17 10h.1M7 14h10" />',
  sliders: '<path d="M5 6h14M5 12h14M5 18h14" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="8" cy="18" r="2" />',
  archive: '<rect x="4" y="5" width="16" height="4" rx="1" /><path d="M6 9v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9" /><path d="M10 13h4" />',
  brush: '<path d="M5 19s2-1 2-3a2 2 0 1 0-4 0c0 2 2 3 2 3z" /><path d="M8 16l9-9 2 2-9 9" />',
  tabs: '<rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 11h18" /><path d="M9 7V5h6" />',
  compass: '<circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" />',
  page: '<path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 17h4" />',
  monitor: '<rect x="3" y="5" width="18" height="12" rx="2" /><path d="M9 21h6M12 17v4" />',
  sun: '<circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />',
  clock: '<circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3.5 2" />',
  bookmark: '<path d="M7 4h10v16l-5-4-5 4z" />',
  edit: '<path d="M5 19h4L19 9a2.1 2.1 0 0 0-3-3L5 16z" /><path d="M15 6l3 3" />',
  power: '<path d="M12 4v8" /><path d="M7.5 6.8a7 7 0 1 0 9 0" />',
  code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />',
  list: '<path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.1M4.5 12h.1M4.5 18h.1" />',
  upload: '<path d="M12 20V10" /><path d="M8 13l4-4 4 4" /><path d="M5 5h14" />',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 7" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.4-1.4" />',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" />',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.5" />',
  filter: '<path d="M4 6h16l-6 7v6l-4-2v-4z" />',
  reader: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />',
  print: '<path d="M7 8V4h10v4" /><rect x="4" y="8" width="16" height="8" rx="2" /><path d="M7 14h10v6H7z" />',
  zoomIn: '<circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5M8.5 11h5M11 8.5v5" />',
  zoomOut: '<circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5M8.5 11h5" />',
  zoomReset: '<circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5M9 11h4" />',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" />',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" />',
  save: '<path d="M5 4h11l3 3v13H5z" /><path d="M8 4v6h7V4M8 20v-6h8v6" />',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4.5V9H8" /><path d="M12 7.5V12l3 2" />',
  flag: '<path d="M6 21V4M6 5h11l-2 3.5L17 12H6" />',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />',
  readingList: '<path d="M4 6h16M4 10h16M4 14h10M4 18h10" /><path d="M17 14l2 2 4-4" />',
  store: '<path d="M3 9l1-5h16l1 5M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 13a3 3 0 0 0 6 0" />',
  sparkles: '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM19 16l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9zM5 16l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />',
  palette: '<path d="M12 2a10 10 0 0 0-10 10c0 5.5 4.5 10 10 10 1.4 0 2.5-1.1 2.5-2.5 0-.7-.3-1.3-.7-1.8-.4-.5-.7-1.1-.7-1.7 0-1.4 1.1-2.5 2.5-2.5h2.4c3.6 0 6.5-2.9 6.5-6.5C22 5.6 17.5 2 12 2z" /><circle cx="7.5" cy="11.5" r="1.5" /><circle cx="12" cy="7.5" r="1.5" /><circle cx="16.5" cy="11.5" r="1.5" />',
  pip: '<rect x="2" y="4" width="20" height="16" rx="2" /><rect x="12" y="11" width="8" height="7" rx="1" />',
  play: '<polygon points="6 4 19 12 6 20 6 4" />',
  pause: '<rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />',
  notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" />',
  microphone: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" />',
  location: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" />',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="5.5" y="5.5" width="2" height="2" fill="currentColor" stroke="none" /><rect x="16.5" y="5.5" width="2" height="2" fill="currentColor" stroke="none" /><rect x="5.5" y="16.5" width="2" height="2" fill="currentColor" stroke="none" /><path d="M14 14h3v3h-3zM18 17h3v3h-3zM14 20h3v1h-3zM20 14h1v2h-1z" />',
};

const FILLED = new Set(['star']);

export function icon(name, filled = false) {
  const path = PATHS[name] ?? PATHS.globe;
  const solid = filled && FILLED.has(name);
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${solid ? ' fill="currentColor" stroke="none"' : ''}>${path}</svg>`;
}

export function applyIcon(element, name, filled = false) {
  if (!element) return element;
  element.innerHTML = icon(name, filled);
  return element;
}

export function hasIcon(name) {
  return Boolean(PATHS[name]);
}