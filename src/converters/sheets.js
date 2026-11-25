// Tableurs : lecture minimale du .xlsx (zip + XML) et du .csv, sans bibliothèque lourde.
import JSZip from 'jszip';
import { utf8, decodeXml, markdownTable } from './common.js';

const colIndex = letters => {
	let n = 0;
	for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
	return n - 1;
};

/** Parse un CSV (guillemets, retours à la ligne dans les champs). Séparateur , ou ; détecté. */
export function parseCsv(text) {
	const firstLine = text.split(/\r?\n/, 1)[0] || '';
	const sep = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
			} else field += c;
		} else if (c === '"') {
			quoted = true;
		} else if (c === sep) {
			row.push(field); field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field); rows.push(row); row = []; field = '';
		} else {
			field += c;
		}
	}
	if (field !== '' || row.length) { row.push(field); rows.push(row); }
	return rows;
}

/** Lit les feuilles d'un .xlsx : [{ name, rows }]. */
export async function readXlsx(bytes) {
	const zip = await JSZip.loadAsync(bytes);
	const readText = name => (zip.file(name) ? zip.file(name).async('string') : null);

	const workbook = await readText('xl/workbook.xml');
	if (!workbook) throw new Error('fichier .xlsx invalide');
	const rels = (await readText('xl/_rels/workbook.xml.rels')) || '';
	const relTargets = new Map();
	for (const m of rels.matchAll(/<Relationship\s[^>]*\/?>/g)) {
		const tag = m[0];
		const id = tag.match(/Id="([^"]+)"/)?.[1];
		const target = tag.match(/Target="([^"]+)"/)?.[1];
		if (id && target) relTargets.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
	}

	const sharedXml = (await readText('xl/sharedStrings.xml')) || '';
	const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
		decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''))
	);

	const sheets = [];
	for (const m of workbook.matchAll(/<sheet\s[^>]*\/?>/g)) {
		const tag = m[0];
		const name = decodeXml(tag.match(/\sname="([^"]*)"/)?.[1] || 'Feuille');
		const rid = tag.match(/r:id="([^"]+)"/)?.[1];
		const target = relTargets.get(rid);
		const xml = target && (await readText(target));
		if (!xml) continue;
		sheets.push({ name, rows: parseSheetXml(xml, shared) });
	}
	return sheets;
}

function parseSheetXml(xml, shared) {
	const rows = [];
	for (const m of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
		const rowXml = m[1];
		const row = [];
		for (const m of rowXml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const attrs = m[1];
			const body = m[2] || '';
			const ref = attrs.match(/\sr="([A-Z]+)\d+"/)?.[1];
			const type = attrs.match(/\st="([^"]+)"/)?.[1];
			let value = '';
			if (type === 'inlineStr') {
				value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => decodeXml(t[1])).join('');
			} else {
				const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
				if (v !== undefined) {
					value = type === 's' ? (shared[Number(v)] ?? '') : decodeXml(v);
				}
			}
			const col = ref ? colIndex(ref) : row.length;
			while (row.length < col) row.push('');
			row[col] = value;
		}
		rows.push(Array.from(row, v => v ?? ''));
	}
	return rows;
}

/** Excel (.xlsx) et CSV — une section par feuille, en tableaux Markdown. */
export async function convertSpreadsheet(bytes, isText = false) {
	const sheets = isText
		? [{ name: 'CSV', rows: parseCsv(utf8(bytes)) }]
		: await readXlsx(bytes);

	const sections = sheets.map(sheet => {
		const table = markdownTable(sheet.rows);
		if (!table) return null;
		return sheets.length > 1 ? `## ${sheet.name}\n\n${table}` : table;
	});
	return sections.filter(Boolean).join('\n\n');
}
