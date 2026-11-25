// Teste le bundle réel (dist/index.js, après `npm run build`) avec une API Joplin simulée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Joplin tourne dans un contexte navigateur : `self` existe, pas sous Node.
global.self ??= globalThis;
global.self.location ??= { href: 'http://localhost/' };

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'tests', 'fixtures');

function makeJoplin({ existingTag = null, files = [], attachOriginal = true, locale = 'en_GB' }) {
	const state = { registered: null, command: null, menu: null, messages: [], posts: [], importModule: null };
	let counter = 0;
	global.joplin = {
		plugins: { register: p => (state.registered = p) },
		require: async m => { if (m !== 'fs-extra') throw new Error(`module interdit : ${m}`); return fs; },
		settings: {
			value: async key => (key === 'attachOriginal' ? attachOriginal : undefined),
			registerSection: async () => {},
			registerSettings: async () => {},
			globalValues: async keys => keys.map(k => (k === 'locale' ? locale : undefined)),
		},
		interop: { registerImportModule: async m => (state.importModule = m) },
		commands: { register: async c => (state.command = c) },
		views: {
			menuItems: { create: async (id, cmd, loc) => (state.menu = { id, cmd, loc }) },
			dialogs: {
				showOpenDialog: async () => files,
				showMessageBox: async m => { state.messages.push(m); return 0; },
			},
		},
		workspace: { selectedFolder: async () => ({ id: 'folder1' }) },
		data: {
			get: async () => ({ items: existingTag ? [existingTag] : [] }),
			post: async (p, _q, body, res) => {
				state.posts.push({ path: p, body, files: res });
				if (p[0] === 'tags' && p.length === 1) return { id: 'tagNew' };
				if (p[0] === 'resources') return { id: `res${++counter}` };
				if (p[0] === 'notes') return { id: `note${++counter}` };
				return {};
			},
		},
	};
	return state;
}

async function loadPlugin(state) {
	// import dynamique à chaque test : le bundle enregistre le plugin à son chargement
	const url = pathToFileURL(path.join(root, 'dist', 'index.js')).href + `?t=${Math.random()}`;
	await import(url);
	return state.registered;
}

test('bundle is a single self-contained file (no node built-ins required besides fs-extra)', async () => {
	const src = await fs.readFile(path.join(root, 'dist', 'index.js'), 'utf8');
	assert.doesNotMatch(src, /require\(["']node:/);
	assert.doesNotMatch(src, /from ["']node:/);
});

test('plugin registers command + File menu item, and imports files with tag', async () => {
	const files = [path.join(fixtures, 'sample.docx'), path.join(fixtures, 'sample.html')];
	const state = makeJoplin({ files });
	const plugin = await loadPlugin(state);
	await plugin.onStart();

	assert.equal(state.command.name, 'markitdownImport');
	assert.deepEqual(state.menu, { id: 'markitdownImportMenu', cmd: 'markitdownImport', loc: 'tools' });

	await state.command.execute();

	const notes = state.posts.filter(p => p.path[0] === 'notes');
	assert.equal(notes.length, 2);
	assert.equal(notes[0].body.body.split('\n')[0], '# Rapport test');
	assert.match(notes[0].body.body, /\[Original file: sample\.docx\]\(:\/res\d+\)/);
	assert.equal(notes[0].body.title, 'sample');
	assert.equal(notes[0].body.parent_id, 'folder1');

	const tagLinks = state.posts.filter(p => p.path[0] === 'tags' && p.path[2] === 'notes');
	assert.equal(tagLinks.length, 2);
	assert.ok(tagLinks.every(t => t.path[1] === 'tagNew'));
	assert.match(state.messages.at(-1), /Imported with the tag « MarkItDown »/);
});

test('existing MarkItDown tag is reused (case-insensitive) instead of recreated', async () => {
	const state = makeJoplin({ existingTag: { id: 'tagOld', title: 'markitdown' }, files: [path.join(fixtures, 'sample.csv')] });
	const plugin = await loadPlugin(state);
	await plugin.onStart();
	await state.command.execute();

	assert.ok(!state.posts.some(p => p.path.length === 1 && p.path[0] === 'tags'));
	const link = state.posts.find(p => p.path[0] === 'tags' && p.path[2] === 'notes');
	assert.equal(link.path[1], 'tagOld');
});

test('attachOriginal=false creates no resource and no link', async () => {
	const state = makeJoplin({ files: [path.join(fixtures, 'sample.csv')], attachOriginal: false });
	const plugin = await loadPlugin(state);
	await plugin.onStart();
	await state.command.execute();

	assert.ok(!state.posts.some(p => p.path[0] === 'resources'));
	const note = state.posts.find(p => p.path[0] === 'notes');
	assert.doesNotMatch(note.body.body, /Original file/);
});

test('one failing file does not stop the others and is reported', async () => {
	const bad = path.join(fixtures, 'bad.pdf');
	await fs.writeFile(bad, Buffer.alloc(300, 7));
	try {
		const state = makeJoplin({ files: [bad, path.join(fixtures, 'sample.csv')] });
		const plugin = await loadPlugin(state);
		await plugin.onStart();
		await state.command.execute();
		const msg = state.messages.at(-1);
		assert.match(msg, /Failed:[\s\S]*bad\.pdf/);
		assert.match(msg, /Imported with[\s\S]*sample\.csv/);
		assert.equal(state.posts.filter(p => p.path[0] === 'notes').length, 1);
	} finally {
		await fs.rm(bad, { force: true });
	}
});

test('import module appears under File > Import, with localized label and file picker only', async () => {
	const state = makeJoplin({ locale: 'fr_FR' });
	const plugin = await loadPlugin(state);
	await plugin.onStart();
	assert.equal(state.importModule.format, 'markitdown');
	assert.equal(state.importModule.description, 'Importer (autre)');
	assert.deepEqual(state.importModule.sources, ['file']);
	assert.equal(state.importModule.isNoteArchive, false);
	assert.ok(state.importModule.fileExtensions.includes('docx'));
});

test('import module label falls back to English for unsupported languages', async () => {
	const state = makeJoplin({ locale: 'ja_JP' });
	const plugin = await loadPlugin(state);
	await plugin.onStart();
	assert.equal(state.importModule.description, 'Import (other)');
});

test('import module onExec converts the given file into a tagged note', async () => {
	const state = makeJoplin({ files: [] });
	const plugin = await loadPlugin(state);
	await plugin.onStart();
	const warnings = [];
	await state.importModule.onExec({ sourcePath: path.join(fixtures, 'sample.html'), options: {}, warnings });
	const note = state.posts.find(p => p.path[0] === 'notes');
	assert.equal(note.body.title, 'sample');
	assert.match(note.body.body, /## Titre HTML/);
	assert.equal(state.posts.find(p => p.path.length === 3 && p.path[2] === 'notes').path[1], 'tagNew');
	assert.deepEqual(warnings, []);
});

test('import module onExec reports the error and rethrows it', async () => {
	const bad = path.join(fixtures, 'bad2.pdf');
	await fs.writeFile(bad, Buffer.alloc(300, 7));
	try {
		const state = makeJoplin({});
		const plugin = await loadPlugin(state);
		await plugin.onStart();
		const warnings = [];
		await assert.rejects(state.importModule.onExec({ sourcePath: bad, options: {}, warnings }));
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /bad2\.pdf/);
	} finally {
		await fs.rm(bad, { force: true });
	}
});

test('manifest has every field Joplin requires (missing "name" silently prevents loading)', async () => {
	const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
	for (const key of ['manifest_version', 'id', 'name', 'version', 'app_min_version']) {
		assert.ok(manifest[key], `champ manquant : ${key}`);
	}
	assert.match(manifest.id, /^[0-9a-zA-Z._-]+$/);
	assert.ok(manifest.id.length >= 16, 'id trop court pour Joplin (min 16 caractères)');
	assert.equal(manifest.version, (JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))).version);
});

test('.jpl is a gzipped tar with manifest.json and index.js at its root (what Joplin extracts)', async () => {
	const tar = await import('tar');
	const os = await import('node:os');
	const jpl = path.join(root, 'dist', 'markitdown-import.jpl');
	const entries = [];
	await tar.t({ file: jpl, gzip: true, onReadEntry: e => entries.push(e.path) });
	assert.deepEqual(entries.sort(), ['index.js', 'manifest.json']);

	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jpl-'));
	try {
		await tar.x({ file: jpl, cwd: dir, strict: true });
		const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
		assert.equal(manifest.id, 'markitdown-import.joplin');
		assert.ok((await fs.stat(path.join(dir, 'index.js'))).size > 1000);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

test('German locale translates the import module and command labels', async () => {
	const state = makeJoplin({ locale: 'de_DE' });
	const plugin = await loadPlugin(state);
	await plugin.onStart();
	assert.equal(state.importModule.description, 'Andere importieren');
	assert.equal(state.command.label, 'Mit MarkItDown importieren…');
});

test('settings and labels are localized from the Joplin locale (pt_BR)', async () => {
	const state = makeJoplin({ locale: 'pt_BR' });
	const plugin = await loadPlugin(state);
	await plugin.onStart();
	assert.equal(state.importModule.description, 'Importar (outros)');
	assert.equal(state.command.label, 'Importar com MarkItDown…');
});
