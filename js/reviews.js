// تقييمات الزبونات (بدون Firebase). التقييم يُكتب مرة لكل حجز مكتمل (معرّف الوثيقة = معرّف الحجز) خلال ٣٠ يومًا من الإكمال.
export const COMMENT_MAX = 300, NAME_MAX = 40, WINDOW_MS = 30 * 864e5, MIN_SHOWN = 3;
export const canReview = (b, now = Date.now()) => !!b && b.status === 'completed' && b.source === 'online' && Number.isInteger(b.completedAt) && now <= b.completedAt + WINDOW_MS;
export const firstName = (n) => String(n ?? '').trim().split(/\s+/)[0].slice(0, NAME_MAX) || 'زبونة';
export function validateReview(rating, comment) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'اختاري عدد النجوم.';
  if (String(comment ?? '').trim().length > COMMENT_MAX) return `التعليق أقصاه ${COMMENT_MAX} حرفًا.`;
  return null;
}
export function buildReview({ rating, comment, customerName, now }) {
  const r = { rating, name: firstName(customerName), at: now, hidden: false }, c = String(comment ?? '').trim();
  if (c) r.comment = c;
  return r;
}
// الوسط يُعرض بعد ٣ تقييمات على الأقل حتى لا يضلّل تقييم واحد؛ المخفي (بقرار الإدارة) لا يُحسب
export function summarize(list) {
  const L = list.filter((x) => x && !x.hidden && Number.isInteger(x.rating)), n = L.length;
  const avg = n ? Math.round((L.reduce((s, x) => s + x.rating, 0) / n) * 10) / 10 : 0;
  return { count: n, avg, show: n >= MIN_SHOWN };
}
export const stars = (n) => { const k = Math.max(0, Math.min(5, Math.round(n))); return '★'.repeat(k) + '☆'.repeat(5 - k); };
