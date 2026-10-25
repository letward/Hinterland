// Vercel Serverless Function: collects website feedback and opens a GitHub Issue.
// Required env vars (set in Vercel project settings):
//   GITHUB_TOKEN  - PAT with `repo` scope
//   GITHUB_REPO   - "owner/repo" (default: letward/Hinterland)

const REPO = process.env.GITHUB_REPO || 'letward/Hinterland';
const TOKEN = process.env.GITHUB_TOKEN;

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 5;
  const entry = hits.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count++;
  hits.set(ip, entry);
  return entry.count > max;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests' });

  if (!TOKEN) return res.status(500).json({ error: 'Server not configured (missing GITHUB_TOKEN)' });

  const body = req.body || {};
  const message = String(body.message || '').trim().slice(0, 2000);
  const email = String(body.email || '').trim().slice(0, 200);

  if (message.length < 5) return res.status(400).json({ error: 'Message too short' });

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
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'hinterland-feedback',
      },
      body: JSON.stringify({ title, body: issueBody, labels: ['feedback', 'from-website'] }),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: 'GitHub API error', detail: text.slice(0, 300) });
    }
    const data = await r.json();
    return res.status(201).json({ ok: true, issue: data.html_url, number: data.number });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};