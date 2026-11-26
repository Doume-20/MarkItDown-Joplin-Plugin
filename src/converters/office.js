import mammoth from 'mammoth';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import JSZip from 'jszip';
import { toArrayBuffer, decodeXml, markdownTable } from './common.js';
import { t } from '../i18n.js';

// Échappe seulement ce qui peut déclencher une mise en forme Markdown.
const htmlToMarkdown = new NodeHtmlMarkdown({
	useInlineLinks: true,
	bulletMarker: '-',
	globalEscape: [/[\\`*_~]/gm, '\\$&'],
});

/**
 * Nettoie le Markdown produit depuis le HTML de Word :
 * - retire les échappements inutiles (\=, \+, \., \(…) hors début de ligne ;
 * - corrige les puces doubles « - - » laissées par les listes après un tableau ;
 * - supprime les puces vides et les espaces insécables ou multiples.
 */
export function tidyMarkdown(markdown) {
	const out = [];
	for (let line of markdown.split('\n')) {
		line = line.replace(/\u00a0/g, ' ');
		if (line.startsWith('|')) {
			out.push(line.replace(/\\([=+\-.()#<>!])/g, '$1'));
			continue;
		}
		line = line.replace(/^- - /, '- ');
		if (/^\s*-\s*$/.test(line)) continue;
		// Le préfixe (puce, titre, ou caractère échappé en tête de ligne) n'est pas modifié.
		const [, prefix, rest] = /^(\s*(?:\\[=+\-.()#<>!]|[-+*]\s|\d+\.\s|>\s|#{1,6}\s)?)(.*)$/.exec(line);
		out.push(prefix + rest.replace(/\\([=+\-.()#<>!])/g, '$1').replace(/(\S) {2,}(?=\S)/g, '$1 '));
	}
	return out.join('\n');
}

/**
 * Word (.docx) — mammoth → HTML → Markdown.
 * Le mode Markdown de mammoth aplatit les tableaux ; le HTML les conserve.
 */
/**
 * Tableaux HTML → tableaux Markdown. Dans Word, les tableaux de signes ou de
 * variations mettent plusieurs valeurs dans une même cellule, séparées par
 * de longs espaces : chaque groupe d'au moins 3 espaces devient une colonne.
 */
function htmlTableToMarkdown(tableHtml) {
	const rows = [];
	for (const [, rowHtml] of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
		const cells = [];
		for (const [, cellHtml] of rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)) {
			const text = decodeXml(cellHtml.replace(/<br\s*\/?>|<\/p>/g, ' ').replace(/<[^>]+>/g, ''))
				.replace(/\u00a0/g, ' ')
				.trim();
			const parts = text.split(/\s{3,}/).filter(Boolean);
			cells.push(...(parts.length ? parts : ['']));
		}
		rows.push(cells);
	}
	return markdownTable(rows);
}

export async function convertDocx(bytes) {
	// mammoth lit `buffer` dans Node et `arrayBuffer` dans le build navigateur.
	const input = { arrayBuffer: toArrayBuffer(bytes) };
	if (typeof Buffer !== 'undefined') input.buffer = Buffer.from(bytes);
	const result = await mammoth.convertToHtml(input);

	// Les tableaux sont convertis à part et réinsérés via un marqueur,
	// que node-html-markdown ne peut pas abîmer.
	const tables = [];
	const html = result.value.replace(/<table[\s\S]*?<\/table>/g, tableHtml => {
		tables.push(htmlTableToMarkdown(tableHtml));
		return `<p>ZZTABLEZZ${tables.length - 1}ZZ</p>`;
	});
	const markdown = htmlToMarkdown.translate(html).replace(/^ZZTABLEZZ(\d+)ZZ$/gm, (_, i) => tables[Number(i)]);
	return tidyMarkdown(markdown);
}

/** PowerPoint (.pptx) — texte des diapositives, dans l'ordre. */
export async function convertPptx(bytes) {
	const zip = await JSZip.loadAsync(bytes);
	const slides = Object.keys(zip.files)
		.map(name => ({ name, match: name.match(/^ppt\/slides\/slide(\d+)\.xml$/) }))
		.filter(s => s.match)
		.sort((a, b) => Number(a.match[1]) - Number(b.match[1]));

	const sections = [];
	for (const slide of slides) {
		const xml = await zip.file(slide.name).async('string');
		const paragraphs = [];
		for (const m of xml.matchAll(/<a:p[ >][\s\S]*?<\/a:p>/g)) {
			const para = m[0];
			const text = [...para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => decodeXml(m[1])).join('');
			if (text.trim()) paragraphs.push(text.trim());
		}
		sections.push(`## ${t('slide', { n: slide.match[1] })}\n\n${paragraphs.join('\n\n')}`.trimEnd());
	}
	return sections.join('\n\n');
}
