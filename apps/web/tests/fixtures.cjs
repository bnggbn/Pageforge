const fs = require('node:fs')
const { zipSync, strToU8 } = require('fflate')
fs.mkdirSync('.preview/fixtures', { recursive: true })
const text =
  '# 我的閱讀文件\n\n這是一份自製的中文測試文件。\n\n## 閱讀與筆記\n\n' +
  Array.from(
    { length: 90 },
    (_, i) =>
      `第 ${i + 1} 段：文字會留下痕跡，閱讀也有自己的節奏。這是一段用來驗證位置恢復的內容。\n\n`,
  ).join('') +
  '## 安全內容\n\n<script>window.__unsafe = true</script>\n\n[不安全連結](javascript:alert(1))\n\n![遠端圖片](https://example.com/never-load.png)\n'
fs.writeFileSync('.preview/fixtures/閱讀測試.md', text)
fs.writeFileSync('.preview/fixtures/純文字.txt', '純文字第一行\n第二行保留換行。\n\n第二段文字。')
const epub = {
  mimetype: 'application/epub+zip',
  'META-INF/container.xml':
    '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
  'OPS/book.opf':
    '<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>章節閱讀測試</dc:title></metadata><manifest><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',
  'OPS/chapter1.xhtml':
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head><body><h1>第一章：文字</h1><p>EPUB 的中文內容。</p><script>window.__unsafe=true</script><img src="https://example.com/never-load.png"/></body></html>',
  'OPS/chapter2.xhtml':
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第二章：留白</h1><p>另一個章節的內容。</p></body></html>',
}
fs.writeFileSync(
  '.preview/fixtures/章節.epub',
  zipSync(Object.fromEntries(Object.entries(epub).map(([k, v]) => [k, strToU8(v)]))),
)
const xlsx = {
  '[Content_Types].xml':
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
  'xl/workbook.xml':
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="清單" sheetId="1" r:id="r1"/><sheet name="統計" sheetId="2" r:id="r2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml':
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>中文儲存格</t></si></sst>',
  'xl/worksheets/sheet1.xml':
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>42</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>第二列</t></is></c><c r="B2"><f>21*2</f><v>42</v></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml':
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>100</v></c></row></sheetData></worksheet>',
}
fs.writeFileSync(
  '.preview/fixtures/試算表.xlsx',
  zipSync(Object.fromEntries(Object.entries(xlsx).map(([k, v]) => [k, strToU8(v)]))),
)
const stream = 'BT /F1 24 Tf 72 720 Td (Pageforge PDF Preview) Tj ET'
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
]
let pdf = '%PDF-1.4\n',
  offsets = [0]
objects.forEach((o, i) => {
  offsets.push(Buffer.byteLength(pdf))
  pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
})
const xref = Buffer.byteLength(pdf)
pdf +=
  `xref\n0 6\n0000000000 65535 f \n` +
  offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('') +
  `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
fs.writeFileSync('.preview/fixtures/文件.pdf', pdf)
console.log('Created local MD, TXT, EPUB, XLSX and PDF fixtures.')
