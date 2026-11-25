import { extensionOf, SUPPORTED_EXTENSIONS } from './formats.js';
import { ConversionError } from './errors.js';

export { SUPPORTED_EXTENSIONS, extensionOf };

// Chaque convertisseur est chargé à la demande (import dynamique) : les
// bibliothèques lourdes (pdf.js, xlsx, mammoth…) ne sont évaluées qu'au
// premier fichier de ce type, pas au démarrage de Joplin.
const loaders = {
	office: () => import('./converters/office.js'),
	sheets: () => import('./converters/sheets.js'),
	pdf: () => import('./converters/pdf.js'),
	web: () => import('./converters/web.js'),
	text: () => import('./converters/text.js'),
};

/**
 * Convertit le contenu d'un fichier en Markdown.
 * @param {Uint8Array} bytes contenu du fichier
 * @param {string} filename nom du fichier (sert à détecter le format)
 * @returns {Promise<string>} Markdown
 */
export async function convertToMarkdown(bytes, filename) {
	const ext = extensionOf(filename);
	switch (ext) {
		case 'docx': return (await loaders.office()).convertDocx(bytes);
		case 'pptx': return (await loaders.office()).convertPptx(bytes);
		case 'xlsx': return (await loaders.sheets()).convertSpreadsheet(bytes, false);
		case 'csv': return (await loaders.sheets()).convertSpreadsheet(bytes, true);
		case 'xls':
			throw new ConversionError('xls');
		case 'pdf': return (await loaders.pdf()).convertPdf(bytes);
		case 'html':
		case 'htm': return (await loaders.web()).convertHtml(bytes);
		case 'epub': return (await loaders.web()).convertEpub(bytes);
		case 'json': return (await loaders.text()).convertCode(bytes, 'json');
		case 'xml': return (await loaders.text()).convertCode(bytes, 'xml');
		case 'ipynb': return (await loaders.text()).convertNotebook(bytes);
		case 'txt':
		case 'md':
		case 'markdown': return (await loaders.text()).convertPlainText(bytes);
		case 'doc':
			throw new ConversionError('doc');
		case 'rtf':
			throw new ConversionError('rtf');
		default:
			throw ext ? new ConversionError('unsupported', { ext }) : new ConversionError('unsupportedNoExt');
	}
}
