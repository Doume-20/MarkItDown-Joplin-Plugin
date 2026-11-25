import { getDocumentProxy, extractText } from 'unpdf';

/** PDF — extraction du texte (pas d'OCR : les PDF scannés donnent peu ou rien). */
export async function convertPdf(bytes) {
	const pdf = await getDocumentProxy(new Uint8Array(bytes));
	const { text } = await extractText(pdf, { mergePages: false });
	const pages = Array.isArray(text) ? text : [text];
	return pages
		.map(p => String(p).replace(/[ \t]+\n/g, '\n').trim())
		.filter(Boolean)
		.join('\n\n---\n\n');
}
