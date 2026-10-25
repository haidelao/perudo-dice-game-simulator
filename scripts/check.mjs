import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['dist', 'node_modules', '.git'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(m?js)$/.test(entry.name)) {
      const check = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
      if (check.status !== 0) { console.error(check.stderr); process.exitCode = 1; }
    }
  }
}
await walk(root);
if (!process.exitCode) console.log('All JavaScript modules passed syntax checks.');
