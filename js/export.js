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
