import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const logo = join(ROOT, 'build', 'icons', 'Hinterland_Logo.jpg');
const script = join(ROOT, 'scripts', 'generate_icons.ps1');

if (!existsSync(logo)) {
  console.error(`Source logo not found at: ${logo}`);
  process.exit(1);
}

if (!existsSync(script)) {
  console.error(`Generator script not found at: ${script}`);
  process.exit(1);
}

console.log('Generating build icons from Hinterland_Logo.jpg...');
const ps = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const result = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
  stdio: 'inherit',
  cwd: ROOT,
});

if (result.error) {
  console.error('Failed to execute PowerShell script:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}