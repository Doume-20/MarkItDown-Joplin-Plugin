import { utf8, codeBlock } from './common.js';

/** Texte brut et Markdown : repris tels quels. */
export function convertPlainText(bytes) {
	return utf8(bytes);
}

/** JSON / XML : mis en bloc de code. */
export function convertCode(bytes, lang) {
	return codeBlock(lang, utf8(bytes));
}

/** Jupyter : cellules markdown en texte, cellules de code en blocs python. */
export function convertNotebook(bytes) {
	const nb = JSON.parse(utf8(bytes));
	return (nb.cells || []).map(cell => {
		const src = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
		if (cell.cell_type === 'markdown') return src;
		if (cell.cell_type === 'code') return codeBlock('python', src);
		return '';
	}).filter(s => s.trim()).join('\n\n');
}
