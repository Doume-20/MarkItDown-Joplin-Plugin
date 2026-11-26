// Helpers partagés entre les convertisseurs.

/** Convertit un Uint8Array en ArrayBuffer « propre » (sans décalage). */
export function toArrayBuffer(bytes) {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function utf8(bytes) {
	return new TextDecoder('utf-8').decode(bytes);
}

/** Décode les entités XML courantes. */
export function decodeXml(text) {
	return text
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

function cell(value) {
	if (value === null || value === undefined) return '';
	return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/**
 * Tableau Markdown à partir d'un tableau de lignes (la première ligne sert d'en-tête).
 * @param {string[][]} rows
 * @param {boolean[]} [centered] colonnes à centrer (alignement `:---:`)
 */
export function markdownTable(rows, centered = []) {
	const data = rows.filter(r => Array.isArray(r) && r.some(c => cell(c) !== ''));
	if (!data.length) return '';
	const width = Math.max(...data.map(r => r.length));
	const norm = r => Array.from({ length: width }, (_, i) => cell(r[i]));
	const [header, ...body] = data.map(norm);
	const separator = Array.from({ length: width }, (_, i) => (centered[i] ? ':---:' : '---'));
	const lines = [
		`| ${header.join(' | ')} |`,
		`| ${separator.join(' | ')} |`,
		...body.map(r => `| ${r.join(' | ')} |`),
	];
	return lines.join('\n');
}

/** Bloc de code avec une fence assez longue pour le contenu. */
export function codeBlock(lang, text) {
	const fence = text.includes('```') ? '~~~~' : '```';
	return `${fence}${lang}\n${text.replace(/\s+$/, '')}\n${fence}`;
}
