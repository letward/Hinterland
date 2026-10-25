#!/usr/bin/env node
// Smoke tests for the Vercel website + feedback API.
const BASE = process.env.SITE_URL || 'https://hinterland-browser.vercel.app';
let failed = 0;

async function check(name, fn) {
  try { await fn(); console.log('PASS:', name); }
  catch (e) { failed++; console.error('FAIL:', name, '-', e.message); }
}

await check('homepage returns 200', async () => {
  const r = await fetch(BASE + '/');
  if (r.status !== 200) throw new Error('status ' + r.status);
  const html = await r.text();
  if (!html.includes('Hinterland')) throw new Error('missing brand');
  if (!html.includes('Download for Windows')) throw new Error('missing download CTA');
});

await check('tokens.css returns 200', async () => {
  const r = await fetch(BASE + '/tokens.css');
  if (r.status !== 200) throw new Error('status ' + r.status);
});

await check('feedback API rejects GET', async () => {
  const r = await fetch(BASE + '/api/feedback', { method: 'GET' });
  if (r.status !== 405) throw new Error('status ' + r.status);
});

await check('feedback API rejects short message', async () => {
  const r = await fetch(BASE + '/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hi' }),
  });
  if (r.status !== 400) throw new Error('status ' + r.status);
});

await check('feedback API rejects empty body', async () => {
  const r = await fetch(BASE + '/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (r.status !== 400) throw new Error('status ' + r.status);
});

if (failed > 0) { console.error(`\n${failed} smoke test(s) failed.`); process.exit(1); }
console.log('\nAll website smoke tests passed.');