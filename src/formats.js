// Formats pris en charge. Module léger : il ne charge aucune bibliothèque de conversion.

/** Extensions prises en charge (mêmes formats que MarkItDown, hors OCR/audio/images). */
export const SUPPORTED_EXTENSIONS = [
	'docx', 'pptx', 'xlsx', 'csv', 'pdf', 'html', 'htm',
	'odt', 'epub', 'json', 'xml', 'ipynb', 'txt', 'md', 'markdown',
];

export function extensionOf(filename) {
	const m = /\.([^./\\]+)$/.exec(filename);
	return m ? m[1].toLowerCase() : '';
}
