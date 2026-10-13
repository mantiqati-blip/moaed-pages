// منطق الحسابات (مبالغ أعداد صحيحة بالدينار). الحجز المحسوب: مكتمل وليس وقتًا مغلقًا.
export const counted = (b) => b.status === 'completed' && b.source !== 'blocked';
export function summarize(bookings, payments = []) {
  const done = bookings.filter(counted), sum = (f) => done.reduce((n, b) => n + f(b), 0);
  const servicesRevenue = sum((b) => b.servicesTotal - (b.discount || 0)), customerFees = sum((b) => b.customerFee), salonCuts = sum((b) => b.salonCut);
  const due = customerFees + salonCuts, paid = payments.reduce((n, p) => n + p.amount, 0);
  return { count: done.length, servicesRevenue, customerFees, salonCuts, due, paid, remaining: due - paid, net: servicesRevenue - salonCuts };
}
export function validatePayment(amount, remaining) {
  if (!Number.isInteger(amount) || amount <= 0) return 'المبلغ لازم يكون عددًا صحيحًا أكبر من صفر.';
  if (amount > remaining) return 'المبلغ أكبر من المتبقي.';
  return null;
}
export const money = (n) => Number(n).toLocaleString('en') + ' د.ع';
// الرسم والاستقطاع الفعليان لصالون: قيمته الخاصة إن وُجدت (يحددها الأدمن) وإلا الافتراضي للمنصة.
export function effectiveFees(salon, settings) {
  const pick = (k) => (Number.isInteger(salon?.[k]) ? salon[k] : settings?.[k]);
  return { ...settings, customerFee: pick('customerFee'), salonCut: pick('salonCut') };
}
export const validFee = (n) => Number.isInteger(n) && n >= 0 && n <= 1000000;
