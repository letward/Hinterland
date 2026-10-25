# Hinterland Design

Das **Hinterland Design** ist die einheitliche Design-Philosophie für Browser, Website, SDK und Dokumentation.

## Prinzipien

1. **Klarheit vor Dekoration** — Inhalte stehen im Vordergrund, UI tritt zurück.
2. **Dunkel zuerst** — Standard ist Dark Mode; Light Mode ist gleichwertig unterstützt.
3. **Ruhige Bewegung** — Animationen sind kurz (≤ 200 ms), weich und respektieren `prefers-reduced-motion`.
4. **Zugänglichkeit** — Fokus-Ringe, Kontrast, Tastatur-Navigation sind Pflicht.
5. **Konsistenz** — Eine einzige Quelle der Wahrheit: `design/tokens.css`.

## Tokens

Alle Werte sind in `design/tokens.css` definiert und werden von `src/ui/css/tokens.css` und `website/tokens.css` gespiegelt.

- **Farben:** `--accent` (#4f7cff), `--bg`, `--surface`, `--surfaceAlt`, `--surfaceHover`, `--text`, `--textDim`, `--border`, `--borderSoft`, `--onAccent`.
- **Radien:** `--radius` (10px), `--radiusSmall` (6px), `--radiusLarge` (16px).
- **Schatten:** `--shadow`, `--shadowSmall`.
- **Bewegung:** `--anim` (140ms). Reduziert auf 0ms bei `data-animations="off"`.
- **Typografie:** `--font` (System-Stack), `--fontMono`.
- **Blur:** `--blur` (18px) für Glas-Effekte.

## Themes

- Dark (default): `color-scheme: dark`
- Light: `html[data-theme="light"]`
- Animationen aus: `html[data-animations="off"]`

## Komponenten

- **Buttons:** primär `--accent` mit `--onAccent`-Text, abgerundet `--radiusLarge`, Hover-Lift + Shine.
- **Cards:** `--surface` mit `--borderSoft`, `--radiusLarge`, subtiler Schatten.
- **Navbar:** geblurrt, sticky, Border erscheint beim Scrollen.
- **Modals/Sheets:** zentriert, `--shadow`, abgerundet.

## Motion

- Easing: `cubic-bezier(.2, 0, 0, 1)` für Eingänge, `ease` für Hover.
- Dauer: 140–240 ms für UI, 700 ms für Reveal.
- Respektiere `prefers-reduced-motion`.

## Barrierefreiheit

- `:focus-visible` mit 2px Accent-Outline.
- Scrollbars dezent, kontrastreich genug.
- Semantische HTML-Struktur, ARIA wo nötig.