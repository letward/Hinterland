# Hinterland Website (Vercel)

This folder is the dedicated root directory for the Hinterland marketing/download website deployed on Vercel.

- Shows the latest changelogs (loaded from `CHANGELOG.md` on `main`).
- Main call-to-action: download the latest Hinterland browser build for Windows.

## Vercel setup

1. In the Vercel project dashboard, set **Root Directory** to `website`.
2. Framework preset: **Other** (static).
3. No build command / output directory needed (static files).

The `.vercel/` linkage folder (if present) lives here and is gitignored.