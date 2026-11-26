// OpenDocument Text (.odt) : archive zip dont le contenu est dans content.xml.
import JSZip from 'jszip';
import { utf8, decodeXml, markdownTable } from './common.js';
import { ConversionError } from '../errors.js';

// Parseur XML minimal : éléments, attributs, texte. Suffisant pour content.xml.
function parseXml(xml) {
	const root = { name: '#root', attrs: {}, children: [] };
	const stack = [root];
	const tagRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
	let m;
	while ((m = tagRe.exec(xml))) {
		const top = stack[stack.length - 1];
		if (m[0].startsWith('<!--') || m[0].startsWith('<?')) continue;
		if (m[1] !== undefined && m[0].startsWith('<![CDATA[')) { top.children.push(m[1]); continue; }
		if (m[6] !== undefined) { top.children.push(decodeXml(m[6])); continue; }
		if (m[3] === undefined) continue;
		if (m[2] === '/') {
			if (stack.length > 1) stack.pop();
			continue;
		}
		const attrs = {};
		for (const a of (m[4] || '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
			attrs[a[1]] = decodeXml(a[2] ?? a[3] ?? '');
		}
		const node = { name: m[3], attrs, children: [] };
		top.children.push(node);
		if (m[5] !== '/') stack.push(node);
	}
	return root;
}

const find = (node, name) => node.children.filter(c => typeof c !== 'string' && c.name === name);

function textOf(node) {
	return node.children.map(c => {
		if (typeof c === 'string') return c;
		switch (c.name) {
			case 'text:s': return ' '.repeat(Number(c.attrs['text:c'] || 1));
			case 'text:tab': return '\t';
			case 'text:line-break': return '\n';
			case 'text:a': return `[${textOf(c)}](${c.attrs['xlink:href'] || ''})`;
			case 'text:note': case 'office:annotation': return '';
			default: return textOf(c);
		}
	}).join('');
}

function blocks(node, depth = 0) {
	const out = [];
	for (const c of node.children) {
		if (typeof c === 'string') continue;
		switch (c.name) {
			case 'text:h': {
				const level = Math.min(6, Number(c.attrs['text:outline-level'] || 1));
				const t = textOf(c).trim();
				if (t) out.push(`${'#'.repeat(level)} ${t}`);
				break;
			}
			case 'text:p': {
				const t = textOf(c).trim();
				if (t) out.push(t);
				break;
			}
			case 'text:list': {
				// Une liste = un seul bloc, sinon les lignes vides la cassent en Markdown.
				const lines = [];
				for (const item of find(c, 'text:list-item')) {
					const indent = '  '.repeat(depth);
					const parts = blocks(item, depth + 1);
					if (parts.length) lines.push(`${indent}- ${parts[0]}`, ...parts.slice(1).map(p => (p.startsWith(indent + '  ') ? p : `${indent}  ${p}`)));
				}
				if (lines.length) out.push(lines.join('\n'));
				break;
			}
			case 'table:table': {
				const rows = [];
				const collect = n => {
					for (const r of n.children) {
						if (typeof r === 'string') continue;
						if (r.name === 'table:table-row') {
							rows.push(r.children.filter(x => typeof x !== 'string' && /table-cell$/.test(x.name))
								.map(cell => blocks(cell).join(' ')));
						} else if (/table-(header-rows|row-group|rows)$/.test(r.name)) {
							collect(r);
						}
					}
				};
				collect(c);
				const table = markdownTable(rows);
				if (table) out.push(table);
				break;
			}
			case 'text:section': case 'text:soft-page-break': case 'table:table-cell': case 'text:list-header':
			case 'text:index-body': case 'office:text':
				out.push(...blocks(c, depth));
				break;
			default:
				break;
		}
	}
	return out;
}

/** Texte d'un .odt en Markdown : titres, paragraphes, listes, tableaux. */
export async function convertOdt(bytes) {
	const zip = await JSZip.loadAsync(bytes);
	const file = zip.file('content.xml');
	if (!file) throw new ConversionError('invalidOdt');
	const root = parseXml(utf8(await file.async('uint8array')));
	const body = (function findBody(n) {
		if (n.name === 'office:text') return n;
		for (const c of n.children) {
			if (typeof c === 'string') continue;
			const r = findBody(c);
			if (r) return r;
		}
		return null;
	})(root);
	if (!body) throw new ConversionError('invalidOdt');
	return blocks(body).join('\n\n');
}
