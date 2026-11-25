// Crée dist/markitdown-import.jpl.
// Joplin installe un .jpl comme une archive tar (gzip) contenant
// manifest.json et index.js à la racine. Un zip n'est PAS reconnu.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const manifestText = await fs.readFile(path.join(root, 'manifest.json'), 'utf8');
const manifest = JSON.parse(manifestText);

// Fichiers à archiver : copiés dans dist/ pour que l'archive ait la bonne racine.
await fs.writeFile(path.join(dist, 'manifest.json'), manifestText);
const out = path.join(dist, 'markitdown-import.jpl');
await tar.create({ gzip: true, file: out, cwd: dist, portable: true }, ['manifest.json', 'index.js']);

console.log(`OK ${path.relative(root, out)} (${manifest.id} ${manifest.version})`);
