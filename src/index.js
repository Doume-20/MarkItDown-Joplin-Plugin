/*
 * MarkItDown Import — plugin Joplin
 *
 * Importe des fichiers (docx, pptx, xlsx, pdf, html, epub, csv, …) :
 *   1. le fichier est converti en Markdown directement dans le plugin ;
 *   2. la note est créée dans le carnet sélectionné ;
 *   3. la note reçoit le tag « MarkItDown » ;
 *   4. le fichier original peut être joint à la note.
 *
 * Deux points d'entrée :
 *   - Fichier → Import → « Importer (autre) » / « Import (other) » : une
 *     fenêtre de choix de fichier s'ouvre directement (module d'import Joplin) ;
 *   - Outils → Importer avec MarkItDown… : choix de plusieurs fichiers.
 *
 * Tout tourne localement : aucun serveur, aucun envoi réseau.
 */
import { convertToMarkdown, SUPPORTED_EXTENSIONS } from './convert.js';

const TAG_TITLE = 'MarkItDown';
const FALLBACK_NOTEBOOK = 'MarkItDown';
const SECTION = 'markitdownImport';

// Valeurs numériques de l'API Joplin (SettingItemType).
const SETTING_BOOL = 3;

let fs = null; // fs-extra : seul module natif autorisé par Joplin

function basename(filePath) {
	return filePath.split(/[\\/]/).pop();
}

function stripExtension(name) {
	return name.replace(/\.[^.]+$/, '');
}

async function showMessage(message) {
	await joplin.views.dialogs.showMessageBox(message);
}

/** Retrouve le tag « MarkItDown » (insensible à la casse) ou le crée. */
async function getOrCreateTag(title) {
	const search = await joplin.data.get(['search'], { query: title, type: 'tag', fields: ['id', 'title'] });
	const existing = (search.items || []).find(t => t.title.toLowerCase() === title.toLowerCase());
	if (existing) return existing.id;
	const created = await joplin.data.post(['tags'], null, { title });
	return created.id;
}

/** Carnet de destination : celui sélectionné, sinon un carnet « MarkItDown ». */
async function destinationFolderId() {
	const folder = await joplin.workspace.selectedFolder();
	if (folder && folder.id) return folder.id;

	const folders = await joplin.data.get(['folders'], { fields: ['id', 'title'], limit: 100 });
	const existing = (folders.items || []).find(f => f.title === FALLBACK_NOTEBOOK);
	if (existing) return existing.id;
	const created = await joplin.data.post(['folders'], null, { title: FALLBACK_NOTEBOOK });
	return created.id;
}

/** Crée la note (et la pièce jointe originale si demandée). */
async function createNote(filePath, markdown, folderId, attachOriginal) {
	const name = basename(filePath);
	let body = markdown.trim() || '_(aucun contenu extrait)_';

	if (attachOriginal) {
		const resource = await joplin.data.post(['resources'], null, { title: name }, [{ path: filePath }]);
		body += `\n\n---\n\n[Fichier original : ${name}](:/${resource.id})`;
	}

	return joplin.data.post(['notes'], null, {
		title: stripExtension(name),
		body,
		parent_id: folderId,
	});
}

/** Convertit un fichier et crée la note taguée. Lève une erreur en cas d'échec. */
async function importOneFile(filePath, folderId, tagId, attachOriginal) {
	const bytes = new Uint8Array(await fs.readFile(filePath));
	const markdown = await convertToMarkdown(bytes, basename(filePath));
	const note = await createNote(filePath, markdown, folderId, attachOriginal);
	await joplin.data.post(['tags', tagId, 'notes'], null, { id: note.id });
	return note;
}

/** Action du menu Outils : plusieurs fichiers, récapitulatif à la fin. */
async function importWithMarkItDown() {
	const folderId = await destinationFolderId();
	const attachOriginal = !!(await joplin.settings.value('attachOriginal'));

	const filePaths = await joplin.views.dialogs.showOpenDialog({
		properties: ['openFile', 'multiSelections'],
		filters: [
			{ name: 'Documents', extensions: SUPPORTED_EXTENSIONS },
			{ name: 'Tous les fichiers', extensions: ['*'] },
		],
	});
	if (!filePaths || !filePaths.length) return;

	const tagId = await getOrCreateTag(TAG_TITLE);
	const imported = [];
	const failed = [];

	for (const filePath of filePaths) {
		const name = basename(filePath);
		try {
			await importOneFile(filePath, folderId, tagId, attachOriginal);
			imported.push(name);
		} catch (err) {
			failed.push(`${name} : ${err.message}`);
		}
	}

	const lines = [];
	if (imported.length) lines.push(`Importé(s) avec le tag « ${TAG_TITLE} » :\n- ${imported.join('\n- ')}`);
	if (failed.length) lines.push(`Échec(s) :\n- ${failed.join('\n- ')}`);
	await showMessage(lines.join('\n\n') || 'Rien à importer.');
}

/** Libellé du module d'import selon la langue de Joplin (Fichier → Import). */
async function importModuleDescription() {
	try {
		const [locale] = await joplin.settings.globalValues(['locale']);
		if (String(locale || '').toLowerCase().startsWith('fr')) return 'Importer (autre)';
	} catch (_) {
		// valeur indisponible : libellé anglais
	}
	return 'Import (other)';
}

joplin.plugins.register({
	onStart: async function () {
		fs = await joplin.require('fs-extra');

		await joplin.settings.registerSection(SECTION, {
			label: 'MarkItDown Import',
			iconName: 'fas fa-file-import',
		});

		await joplin.settings.registerSettings({
			attachOriginal: {
				value: true,
				type: SETTING_BOOL,
				section: SECTION,
				public: true,
				label: 'Joindre le fichier original à la note',
			},
		});

		// Fichier → Import → « Importer (autre) » : ouvre directement le choix de fichier.
		await joplin.interop.registerImportModule({
			format: 'markitdown',
			description: await importModuleDescription(),
			isNoteArchive: false,
			sources: ['file'],
			fileExtensions: SUPPORTED_EXTENSIONS,
			outputFormat: 'md',
			onExec: async (context) => {
				const folderId = await destinationFolderId();
				const tagId = await getOrCreateTag(TAG_TITLE);
				const attachOriginal = !!(await joplin.settings.value('attachOriginal'));
				try {
					await importOneFile(context.sourcePath, folderId, tagId, attachOriginal);
				} catch (err) {
					context.warnings.push(`${basename(context.sourcePath)} : ${err.message}`);
					throw err;
				}
			},
		});

		// Outils → Importer avec MarkItDown… : plusieurs fichiers à la fois.
		await joplin.commands.register({
			name: 'markitdownImport',
			label: 'Importer avec MarkItDown…',
			iconName: 'fas fa-file-import',
			execute: importWithMarkItDown,
		});

		await joplin.views.menuItems.create('markitdownImportMenu', 'markitdownImport', 'tools');
	},
});
