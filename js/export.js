// تصدير إلى CSV يفتحه Excel مباشرة: ترميز UTF-8 مع BOM، والمبالغ تبقى أرقامًا (ليست نصوصًا) لتسهل جمعها.
export const STATUS = { confirmed: 'مؤكد', completed: 'تمت الخدمة', no_show: 'لم تحضر', cancel_requested: 'طلب إلغاء', pending_admin: 'بانتظار قرار الإدارة', cancelled: 'ملغي' };
export const SOURCE = { online: 'إلكتروني', manual: 'يدوي', blocked: 'وقت مغلق' };
const cell = (v) => {
  if (typeof v === 'number') return String(v);
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                       // منع تنفيذ الصيغ إذا بدأ نص الزبونة بـ = أو + أو -
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function toCSV(rows, columns) {
  const head = columns.map(([h]) => cell(h)).join(',');
  const body = rows.map((r) => columns.map(([, f]) => cell(f(r))).join(','));
  return '\uFEFF' + [head, ...body].join('\r\n');
}
const B3 = (t) => new Date(t + 3 * 36e5), pad = (n) => String(n).padStart(2, '0');
export const dateOf = (t) => B3(t).toISOString().slice(0, 10);
export const timeOf = (t) => pad(B3(t).getUTCHours()) + ':' + pad(B3(t).getUTCMinutes());
// أعمدة الحجوزات؛ names = { staffId: اسم } و salons = { salonId: اسم } (اختياري للأدمن)
export function bookingColumns({ names = {}, salons = null } = {}) {
  const c = [];
  if (salons) c.push(['الصالون', (b) => salons[b.salonId] || b.salonId]);
  c.push(['التاريخ', (b) => dateOf(b.start)], ['الوقت', (b) => timeOf(b.start)], ['الموظفة', (b) => names[b.staffId] || ''],
    ['الزبونة', (b) => b.customerName || ''], ['الهاتف', (b) => b.customerPhone || ''], ['الخدمات', (b) => (b.services || []).map((s) => s.name).join('، ')],
    ['المدة (دقيقة)', (b) => b.durationMin || 0], ['إيراد الخدمات', (b) => (b.servicesTotal || 0) - (b.discount || 0)], ['رسم الخدمة', (b) => b.customerFee || 0],
    ['الاستقطاع', (b) => b.salonCut || 0], ['الحالة', (b) => STATUS[b.status] || b.status], ['المصدر', (b) => SOURCE[b.source] || b.source || ''], ['رقم الحجز', (b) => b.id]);
  return c;
}
export function download(filename, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ===== ملف xlsx حقيقي بدون مكتبات خارجية (ZIP بدون ضغط + XML). النصوص تُكتب نصًا صريحًا فلا تُنفَّذ كصيغ، والأرقام تبقى أرقامًا. =====
const enc = new TextEncoder(), esx = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {                                                   // files: [[path, string]]
  const parts = [], cen = []; let off = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name), d = enc.encode(text), crc = crc32(d), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    parts.push(new Uint8Array(h.buffer), n, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), n); off += 30 + n.length + d.length;
  }
  const csz = cen.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  const all = [...parts, ...cen, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((a, x) => a + x.length, 0)); let p = 0; for (const x of all) { out.set(x, p); p += x.length; } return out;
}
const colName = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
export function toXLSX(rows, columns, sheet = 'الحجوزات') {
  const cellX = (v, r, c, st) => { const ref = colName(c) + r; return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${esx(v ?? '')}</t></is></c>`; };
  const data = [columns.map(([h]) => h), ...rows.map((r) => columns.map(([, f]) => f(r)))];
  const sd = data.map((row, i) => `<row r="${i + 1}">${row.map((v, c) => cellX(v, i + 1, c, i === 0 ? ' s="1"' : '')).join('')}</row>`).join('');
  const cols = columns.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="18" customWidth="1"/>`).join('');
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', NS = 'http://schemas.openxmlformats.org/';
  return zip([
    ['[Content_Types].xml', `${X}<Types xmlns="${NS}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `${X}<Relationships xmlns="${NS}package/2006/relationships"><Relationship Id="rId1" Type="${NS}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${X}<workbook xmlns="${NS}spreadsheetml/2006/main" xmlns:r="${NS}officeDocument/2006/relationships"><sheets><sheet name="${esx(sheet).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${X}<Relationships xmlns="${NS}package/2006/relationships"><Relationship Id="rId1" Type="${NS}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `${X}<styleSheet xmlns="${NS}spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/worksheets/sheet1.xml', `${X}<worksheet xmlns="${NS}spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${sd}</sheetData></worksheet>`],
  ]);
}
export function downloadX(filename, bytes) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
