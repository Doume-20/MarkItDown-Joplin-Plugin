import { convertDocx, convertPptx, convertSpreadsheet } from './converters/office.js';
import { convertPdf } from './converters/pdf.js';
import { convertHtml, convertEpub } from './converters/web.js';
import { convertPlainText, convertCode, convertNotebook } from './converters/text.js';

/** Extensions prises en charge (mêmes formats que MarkItDown, hors OCR/audio/images). */
export const SUPPORTED_EXTENSIONS = [
	'docx', 'pptx', 'xlsx', 'xls', 'csv', 'pdf', 'html', 'htm',
	'epub', 'json', 'xml', 'ipynb', 'txt', 'md', 'markdown',
];

export function extensionOf(filename) {
	const m = /\.([^./\\]+)$/.exec(filename);
	return m ? m[1].toLowerCase() : '';
}

/**
 * Convertit le contenu d'un fichier en Markdown.
 * @param {Uint8Array} bytes contenu du fichier
 * @param {string} filename nom du fichier (sert à détecter le format)
 * @returns {Promise<string>} Markdown
 */
export async function convertToMarkdown(bytes, filename) {
	const ext = extensionOf(filename);
	switch (ext) {
		case 'docx': return convertDocx(bytes);
		case 'pptx': return convertPptx(bytes);
		case 'xlsx':
		case 'xls': return convertSpreadsheet(bytes, false);
		case 'csv': return convertSpreadsheet(bytes, true);
		case 'pdf': return convertPdf(bytes);
		case 'html':
		case 'htm': return convertHtml(bytes);
		case 'epub': return convertEpub(bytes);
		case 'json': return convertCode(bytes, 'json');
		case 'xml': return convertCode(bytes, 'xml');
		case 'ipynb': return convertNotebook(bytes);
		case 'txt':
		case 'md':
		case 'markdown': return convertPlainText(bytes);
		case 'doc':
			throw new Error('format .doc (ancien Word) non pris en charge : enregistrez le fichier en .docx');
		case 'rtf':
			throw new Error('format .rtf non pris en charge : enregistrez le fichier en .docx');
		default:
			throw new Error(`format non pris en charge${ext ? ` : .${ext}` : ''}`);
	}
}
