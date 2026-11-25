// Crée publish/ : manifest.json (copie) et markitdown-import.jpl.
// Joplin installe un .jpl comme une archive tar (gzip) contenant
// manifest.json et index.js à la racine. Un zip n'est PAS reconnu.
// Le dossier publish/ est ce que le dépôt officiel Joplin attend dans le package npm.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const publish = path.join(root, 'publish');
const manifestText = await fs.readFile(path.join(root, 'manifest.json'), 'utf8');
const manifest = JSON.parse(manifestText);

// L'archive doit avoir manifest.json et index.js à sa racine : on les copie dans dist/.
await fs.writeFile(path.join(dist, 'manifest.json'), manifestText);
await fs.rm(publish, { recursive: true, force: true });
await fs.mkdir(publish, { recursive: true });
const out = path.join(publish, 'markitdown-import.jpl');
await tar.create({ gzip: true, file: out, cwd: dist, portable: true }, ['manifest.json', 'index.js']);
await fs.writeFile(path.join(publish, 'manifest.json'), manifestText);

console.log(`OK ${path.relative(root, out)} (${manifest.id} ${manifest.version})`);
