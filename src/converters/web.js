import { NodeHtmlMarkdown } from 'node-html-markdown';
import JSZip from 'jszip';
import { utf8 } from './common.js';
import { ConversionError } from '../errors.js';

const nhm = new NodeHtmlMarkdown({ useInlineLinks: true, bulletMarker: '-' });

/** HTML / XHTML. */
export function convertHtml(bytes) {
	return nhm.translate(utf8(bytes));
}

/** EPUB — chapitres HTML dans l'ordre de lecture (spine), concaténés. */
export async function convertEpub(bytes) {
	const zip = await JSZip.loadAsync(bytes);
	const container = await zip.file('META-INF/container.xml')?.async('string');
	const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
	if (!opfPath || !zip.file(opfPath)) throw new ConversionError('invalidEpub');

	const opf = await zip.file(opfPath).async('string');
	const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
	const manifest = new Map();
	for (const m of opf.matchAll(/<item\s[^>]*>/g)) {
		const tag = m[0];
		const id = tag.match(/\sid="([^"]+)"/)?.[1];
		const href = tag.match(/\shref="([^"]+)"/)?.[1];
		if (id && href) manifest.set(id, decodeURI(href));
	}
	const spine = [...opf.matchAll(/<itemref\s[^>]*idref="([^"]+)"/g)].map(m => manifest.get(m[1])).filter(Boolean);

	const parts = [];
	for (const href of spine) {
		const file = zip.file(dir + href);
		if (!file || !/\.x?html?$/i.test(href)) continue;
		const md = nhm.translate(await file.async('string')).trim();
		if (md) parts.push(md);
	}
	return parts.join('\n\n---\n\n');
}
