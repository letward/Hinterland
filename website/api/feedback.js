const REPO = process.env.GITHUB_REPO || 'letward/Hinterland';
const TOKEN = process.env.GITHUB_TOKEN;

// Shared-ish rate limit. Vercel serverless instances are ephemeral, so this is
// best-effort per instance; for production-grade shared limiting, swap to Vercel KV.
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  if (entry.count > MAX_PER_WINDOW) return true;
  return false;
}

// Periodic cleanup to avoid unbounded growth.
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of hits) if (now > e.reset) hits.delete(ip);
}, 5 * 60_000).unref?.();

function isEmail(v) {
  return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function sanitize(s) {
  return String(s).replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

function genericError(res, status = 400) {
  return res.status(status).json({ error: 'Request could not be processed.' });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return genericError(res, 405);

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Please try again later.' });

  const body = req.body || {};
  const message = sanitize(body.message).slice(0, 2000);
  const email = sanitize(body.email).slice(0, 200);
  // Honeypot field for spam bots.
  if (body.website || body.url || body.company) return res.status(200).json({ ok: true });

  if (message.length < 5 || message.length > 2000) return genericError(res);
  if (!isEmail(email)) return genericError(res);

  if (!TOKEN) return res.status(500).json({ error: 'Service temporarily unavailable.' });

  const title = 'Website feedback: ' + message.slice(0, 60) + (message.length > 60 ? '…' : '');
  const issueBody = [
    '**Source:** Hinterland website feedback form',
    email ? `**Contact:** ${email}` : '',
    '',
    '**Message:**',
    message,
  ].filter(Boolean).join('\n');

  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'hinterland-feedback',
      },
      body: JSON.stringify({ title, body: issueBody, labels: ['feedback', 'from-website'] }),
    });
    if (!r.ok) {
      // Do not leak upstream details.
      return res.status(502).json({ error: 'Service temporarily unavailable.' });
    }
    const data = await r.json();
    return res.status(201).json({ ok: true, issue: data.html_url, number: data.number });
  } catch (e) {
    return res.status(500).json({ error: 'Service temporarily unavailable.' });
  }
};