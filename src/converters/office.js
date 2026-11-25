import mammoth from 'mammoth';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { toArrayBuffer, utf8, decodeXml, markdownTable } from './common.js';

/** Word (.docx) — via mammoth. */
export async function convertDocx(bytes) {
	// mammoth lit `buffer` dans Node et `arrayBuffer` dans le build navigateur.
	const input = { arrayBuffer: toArrayBuffer(bytes) };
	if (typeof Buffer !== 'undefined') input.buffer = Buffer.from(bytes);
	const result = await mammoth.convertToMarkdown(input);
	return result.value;
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
		sections.push(`## Diapositive ${slide.match[1]}\n\n${paragraphs.join('\n\n')}`.trimEnd());
	}
	return sections.join('\n\n');
}

/** Excel (.xlsx, .xls) et CSV — une section par feuille, en tableaux Markdown. */
export function convertSpreadsheet(bytes, isText = false) {
	const workbook = isText
		? XLSX.read(utf8(bytes), { type: 'string', raw: true })
		: XLSX.read(bytes, { type: 'array', cellDates: true });

	const sections = workbook.SheetNames.map(name => {
		const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', blankrows: false, raw: false });
		const table = markdownTable(rows);
		if (!table) return null;
		return workbook.SheetNames.length > 1 ? `## ${name}\n\n${table}` : table;
	});
	return sections.filter(Boolean).join('\n\n');
}
