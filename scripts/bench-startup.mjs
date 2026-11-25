// Mesure le coût de chargement du plugin au démarrage (import du bundle + onStart), avec une API Joplin simulée.
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
global.self ??= globalThis;
global.self.location ??= { href: 'http://localhost/' };
const noop = async () => {};
let registered = null;
global.joplin = {
	plugins: { register: p => (registered = p) },
	require: async () => (await import('node:fs/promises')),
	settings: { value: noop, registerSection: noop, registerSettings: noop, globalValues: async () => ['en_GB'] },
	interop: { registerImportModule: noop },
	commands: { register: noop },
	views: { menuItems: { create: noop }, dialogs: {} },
};

const t0 = performance.now();
await import(pathToFileURL(path.join(root, 'dist', 'index.js')).href);
const t1 = performance.now();
await registered.onStart();
const t2 = performance.now();
console.log(JSON.stringify({ importMs: Math.round(t1 - t0), onStartMs: Math.round(t2 - t1), totalMs: Math.round(t2 - t0) }));
