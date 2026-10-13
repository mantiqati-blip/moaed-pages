// منطق تصفير الحساب من السيرفر (نفس منطق js/finance.js بالواجهة). مبالغ أعداد صحيحة بالدينار، بدون اعتماد على Firebase.
const counted = (b) => b.status === 'completed' && b.source !== 'blocked';
function summarize(bookings, payments = []) {
  const done = bookings.filter(counted), sum = (f) => done.reduce((n, b) => n + f(b), 0);
  const servicesRevenue = sum((b) => b.servicesTotal - (b.discount || 0)), customerFees = sum((b) => b.customerFee), salonCuts = sum((b) => b.salonCut);
  const due = customerFees + salonCuts, paid = payments.reduce((n, p) => n + p.amount, 0);
  return { count: done.length, servicesRevenue, customerFees, salonCuts, due, paid, remaining: due - paid, net: servicesRevenue - salonCuts };
}
const err = (code, msg) => Object.assign(new Error(msg), { code });
// يحسب سجل الفترة المراد أرشفتها. الحجوزات والتسديدات المحسوبة هي ما بعد آخر تصفير وحتى لحظة التصفير.
function planClose({ bookings, payments, lastClosedAt = 0, by, now }) {
  const inP = (t) => (!lastClosedAt || (t || 0) > lastClosedAt) && (t || 0) <= now;
  const B = bookings.filter((b) => counted(b) && inP(b.completedAt)), P = payments.filter((p) => Number.isInteger(p.amount) && inP(p.at));
  const S = summarize(B, P);
  if (S.count === 0) throw err('failed-precondition', 'NOTHING_TO_CLOSE');
  if (S.remaining !== 0) throw err('failed-precondition', 'REMAINING_NOT_ZERO');
  return { from: lastClosedAt, to: now, closedAt: now, closedBy: by, count: S.count, servicesRevenue: S.servicesRevenue, customerFees: S.customerFees, salonCuts: S.salonCuts, due: S.due, paid: S.paid, remaining: 0, net: S.net };
}
module.exports = { summarize, planClose, counted };
