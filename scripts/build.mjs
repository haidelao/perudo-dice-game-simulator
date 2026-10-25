import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
for (const entry of ['index.html', 'favicon.svg', 'src']) await cp(path.join(root, entry), path.join(dist, entry), { recursive: true });
await writeFile(path.join(dist, '.nojekyll'), '');
console.log('Built dist/ — all asset and worker URLs are relative to the deployed site.');
