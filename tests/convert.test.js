import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { convertToMarkdown, extensionOf } from '../src/convert.js';
import { markdownTable, decodeXml, codeBlock } from '../src/converters/common.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = name => fs.readFile(path.join(fixtures, name)).then(b => new Uint8Array(b));

test('extensionOf', () => {
	assert.equal(extensionOf('Rapport.FINAL.DOCX'), 'docx');
	assert.equal(extensionOf('sans-extension'), '');
});

test('docx -> markdown (mammoth)', async () => {
	const md = await convertToMarkdown(await load('sample.docx'), 'sample.docx');
	assert.match(md, /^# Rapport test/m);
	assert.match(md, /Word/);
});

test('pdf -> text (unpdf)', async () => {
	const md = await convertToMarkdown(await load('sample.pdf'), 'sample.pdf');
	assert.match(md, /Hello PDF MarkItDown/);
});

test('html -> markdown with inline links', async () => {
	const md = await convertToMarkdown(await load('sample.html'), 'sample.html');
	assert.match(md, /^## Titre HTML/m);
	assert.match(md, /\[ici\]\(https:\/\/example\.com\)/);
});

test('csv -> markdown table', async () => {
	const md = await convertToMarkdown(await load('sample.csv'), 'sample.csv');
	assert.equal(md, '| nom | valeur |\n| --- | --- |\n| a | 1 |\n| b | 2 |');
});

test('xlsx -> one section per sheet (shared strings, inline strings, numbers)', async () => {
	const zip = new JSZip();
	zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Feuille1" sheetId="1" r:id="rId1"/><sheet name="Feuille2" sheetId="2" r:id="rId2"/></sheets></workbook>');
	zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>');
	zip.file('xl/sharedStrings.xml', '<sst><si><t>x</t></si><si><t>y</t></si><si><t>a|b</t></si></sst>');
	zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2" t="s"><v>2</v></c></row></sheetData></worksheet>');
	zip.file('xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>z</t></is></c></row><row r="2"><c r="A2"><v>42</v></c></row></sheetData></worksheet>');
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	const md = await convertToMarkdown(bytes, 'book.xlsx');
	assert.match(md, /## Feuille1\n\n\| x \| y \|\n\| --- \| --- \|\n\| 1 \| a\\\|b \|/);
	assert.match(md, /## Feuille2\n\n\| z \|\n\| --- \|\n\| 42 \|/);
});

test('csv: quoted fields, embedded newlines, ; separator', async () => {
	const { parseCsv } = await import('../src/converters/sheets.js');
	assert.deepEqual(parseCsv('a,"b, c"\n1,"multi\nline ""q"""'), [['a', 'b, c'], ['1', 'multi\nline "q"']]);
	assert.deepEqual(parseCsv('x;y\n1;2'), [['x', 'y'], ['1', '2']]);
});

test('xls (binary Excel) gives a clear error', async () => {
	await assert.rejects(convertToMarkdown(new Uint8Array(), 'old.xls'), /enregistrez le fichier en .xlsx/);
});

test('pptx -> slides in numeric order', async () => {
	const zip = new JSZip();
	const slide = (texts) => `<?xml version="1.0"?><p:sld xmlns:a="x"><a:p><a:r><a:t>${texts[0]}</a:t></a:r></a:p><a:p><a:r><a:t>${texts[1]}</a:t></a:r></a:p></p:sld>`;
	zip.file('ppt/slides/slide2.xml', slide(['Deux &amp; co', 'second']));
	zip.file('ppt/slides/slide10.xml', slide(['Dix', 'dixième']));
	zip.file('ppt/slides/slide1.xml', slide(['Un', 'premier']));
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	const md = await convertToMarkdown(bytes, 'deck.pptx');
	assert.equal(md, '## Diapositive 1\n\nUn\n\npremier\n\n## Diapositive 2\n\nDeux & co\n\nsecond\n\n## Diapositive 10\n\nDix\n\ndixième');
});

test('epub -> chapters in spine order', async () => {
	const zip = new JSZip();
	zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
	zip.file('OEBPS/content.opf', '<package><manifest><item id="c2" href="b.xhtml"/><item id="c1" href="a.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>');
	zip.file('OEBPS/a.xhtml', '<html><body><h1>Chapitre A</h1></body></html>');
	zip.file('OEBPS/b.xhtml', '<html><body><h1>Chapitre B</h1></body></html>');
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	const md = await convertToMarkdown(bytes, 'book.epub');
	assert.ok(md.indexOf('Chapitre A') < md.indexOf('Chapitre B'));
	assert.match(md, /---/);
});

test('txt, md, json, ipynb', async () => {
	const enc = s => new TextEncoder().encode(s);
	assert.equal(await convertToMarkdown(enc('brut'), 'a.txt'), 'brut');
	assert.equal(await convertToMarkdown(enc('# md'), 'a.md'), '# md');
	assert.equal(await convertToMarkdown(enc('{"a":1}'), 'a.json'), '```json\n{"a":1}\n```');
	const nb = JSON.stringify({ cells: [{ cell_type: 'markdown', source: ['# T'] }, { cell_type: 'code', source: ['print(1)'] }] });
	assert.equal(await convertToMarkdown(enc(nb), 'n.ipynb'), '# T\n\n```python\nprint(1)\n```');
});

test('unsupported formats give a clear error', async () => {
	await assert.rejects(convertToMarkdown(new Uint8Array(), 'old.doc'), /\.doc.*docx/);
	await assert.rejects(convertToMarkdown(new Uint8Array(), 'x.mp3'), /non pris en charge : \.mp3/);
});

test('corrupt pdf raises an error instead of returning empty text', async () => {
	await assert.rejects(convertToMarkdown(new Uint8Array(300).map(() => 7), 'bad.pdf'));
});

test('helpers', () => {
	assert.equal(decodeXml('a &amp;lt; &#233; &#x41;'), 'a &lt; é A');
	assert.equal(markdownTable([]), '');
	assert.equal(codeBlock('txt', 'a ``` b'), '~~~~txt\na ``` b\n~~~~');
});
