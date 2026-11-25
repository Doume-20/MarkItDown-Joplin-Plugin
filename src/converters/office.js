import mammoth from 'mammoth';
import JSZip from 'jszip';
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
