#!/usr/bin/env node
// Autopilot: triage feedback issues, generate a patch via OpenRouter, open a PR.
// Env: OPENROUTER_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo)

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.env.GITHUB_REPOSITORY || 'letward/Hinterland';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const MAX_TOKENS = 40000;

function sh(cmd) { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }); }

async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hinterland-autopilot',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  if (!TOKEN) { console.error('GITHUB_TOKEN missing'); process.exit(1); }
  if (!OR_KEY) { console.error('OPENROUTER_API_KEY missing'); process.exit(1); }

  // 1. Fetch open feedback issues
  const issues = await gh(`/repos/${REPO}/issues?labels=feedback&state=open&per_page=20`);
  const feedback = issues.filter(i => !i.pull_request);
  console.log(`Found ${feedback.length} open feedback issues.`);
  if (feedback.length === 0) { console.log('No feedback. Exiting.'); return; }

  // 2. Build context from selected files
  const files = [
    'CHANGELOG.md',
    'package.json',
    'website/index.html',
    'src/ui/js/panels.js',
    'src/ui/js/menu.js',
    'src/ui/js/commandPalette.js',
    'src/main/ipc.js',
    'sdk/src/security.js',
    'sdk/src/index.js',
  ];
  let context = '';
  for (const f of files) {
    if (!existsSync(f)) continue;
    const content = readFileSync(f, 'utf8');
    context += `\n\n===== FILE: ${f} =====\n${content}`;
  }
  // Trim context to budget (rough char->token)
  if (context.length > MAX_TOKENS * 4) context = context.slice(0, MAX_TOKENS * 4) + '\n...[truncated]';

  const feedbackText = feedback.map(i => `#${i.number}: ${i.title}\n${i.body || ''}`).join('\n\n---\n\n');

  const prompt = `You are an autonomous maintainer of the Hinterland browser repo.

Open user feedback issues:
${feedbackText}

Repository context (selected files):
${context}

Task: Triage the feedback, pick the SINGLE most valuable, smallest-scope improvement, and produce a minimal patch.

Respond ONLY with valid JSON in this exact shape:
{
  "summary": "one-line PR title",
  "issue": <issue number you addressed>,
  "edits": [
    { "path": "relative/path", "search": "exact existing snippet", "replace": "new snippet" }
  ],
  "changelog": "one bullet line for CHANGELOG.md Added/Fixed/Changed"
}

Rules:
- Only edit files present in the context.
- "search" must be an exact substring of the file.
- Keep edits minimal and safe. Do not touch .github/workflows, security policy, or package.json scripts.
- Do not introduce secrets or network calls.
- If no safe improvement exists, return {"summary":null,"issue":null,"edits":[],"changelog":null}.`;

  // 3. Call OpenRouter
  const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OR_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/letward/Hinterland',
      'X-Title': 'Hinterland Autopilot',
    },
    body: JSON.stringify({
      model: 'openrouter/free',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });
  if (!orRes.ok) { console.error('OpenRouter error:', orRes.status, await orRes.text()); process.exit(1); }
  const orData = await orRes.json();
  const raw = orData.choices?.[0]?.message?.content || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) { console.error('No JSON in response:', raw.slice(0, 500)); process.exit(1); }
  let plan;
  try { plan = JSON.parse(jsonMatch[0]); } catch (e) { console.error('JSON parse failed:', e.message, raw.slice(0, 500)); process.exit(1); }

  if (!plan.summary || !plan.edits || plan.edits.length === 0) {
    console.log('No safe improvement. Exiting.');
    return;
  }
  console.log('Plan:', plan.summary, 'issue', plan.issue);

  // 4. Apply edits
  for (const edit of plan.edits) {
    if (!existsSync(edit.path)) { console.warn('Skip missing file:', edit.path); continue; }
    const content = readFileSync(edit.path, 'utf8');
    if (!content.includes(edit.search)) { console.warn('Search not found in', edit.path); continue; }
    writeFileSync(edit.path, content.replace(edit.search, edit.replace));
    console.log('Patched', edit.path);
  }

  // 5. Run checks
  try { sh('npm run check'); } catch (e) { console.error('check failed:', e.stdout || e.message); process.exit(1); }
  try { sh('npm run test:sdk'); } catch (e) { console.error('tests failed:', e.stdout || e.message); process.exit(1); }

  // 6. Append changelog bullet
  if (plan.changelog) {
    const cl = readFileSync('CHANGELOG.md', 'utf8');
    const marker = '## [1.16.0]'; // append under current version's Added if present; fallback: prepend after header
    // Insert bullet into first "### Added" under the latest version
    const idx = cl.indexOf('### Added');
    if (idx !== -1) {
      const insertAt = cl.indexOf('\n', idx) + 1;
      const newCl = cl.slice(0, insertAt) + `- ${plan.changelog}\n` + cl.slice(insertAt);
      writeFileSync('CHANGELOG.md', newCl);
    }
  }

  // 7. Git branch + PR
  const branch = `autopilot/${Date.now()}`;
  sh(`git checkout -b ${branch}`);
  sh('git config user.email "autopilot@hinterland.bot"');
  sh('git config user.name "Hinterland Autopilot"');
  sh('git add -A');
  sh(`git commit -m "autopilot: ${plan.summary}"`);
  sh(`git push origin ${branch}`);
  const pr = await gh(`/repos/${REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `[Autopilot] ${plan.summary}`,
      head: branch,
      base: 'main',
      body: `Automated PR addressing #${plan.issue}.\n\n${plan.summary}`,
      labels: ['autopilot'],
    }),
  });
  console.log('PR created:', pr.html_url);

  // Label the issue
  if (plan.issue) {
    await gh(`/repos/${REPO}/issues/${plan.issue}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: ['in-progress'] }),
    }).catch(() => {});
  }
}

main().catch(e => { console.error(e); process.exit(1); });