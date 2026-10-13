const test = require('node:test'), assert = require('node:assert/strict'), { planClose, summarize } = require('./period.js');
const bk = (id, at, fee = 1000, cut = 2000, extra = {}) => ({ id, status: 'completed', source: 'online', completedAt: at, servicesTotal: 10000, discount: 0, customerFee: fee, salonCut: cut, ...extra });
test('يحسب المستحق والصافي ويؤرشف فترة متوازنة', () => {
  const r = planClose({ bookings: [bk('a', 10), bk('b', 20)], payments: [{ amount: 6000, at: 30 }], by: 'adm', now: 100 });
  assert.deepEqual([r.count, r.due, r.paid, r.remaining, r.net, r.servicesRevenue, r.from, r.to], [2, 6000, 6000, 0, 16000, 20000, 0, 100]);
});
test('يرفض إذا المتبقي ليس صفرًا (أقل أو أكثر من المستحق)', () => {
  for (const amt of [5999, 6001]) assert.throws(() => planClose({ bookings: [bk('a', 10), bk('b', 20)], payments: [{ amount: amt, at: 30 }], by: 'x', now: 100 }), (e) => e.message === 'REMAINING_NOT_ZERO');
});
test('يرفض إذا لا حجوزات مكتملة محسوبة (المغلقة وغير المكتملة لا تُحسب)', () => {
  assert.throws(() => planClose({ bookings: [bk('a', 10, 0, 0, { source: 'blocked' }), bk('b', 20, 1, 1, { status: 'confirmed' })], payments: [], by: 'x', now: 100 }), (e) => e.message === 'NOTHING_TO_CLOSE');
});
test('الفترة التالية تبدأ بعد آخر تصفير ولا تعدّ القديم مرتين', () => {
  const r = planClose({ bookings: [bk('old', 50), bk('new', 150)], payments: [{ amount: 3000, at: 160 }, { amount: 3000, at: 40 }], lastClosedAt: 100, by: 'x', now: 200 });
  assert.deepEqual([r.count, r.due, r.paid, r.from], [1, 3000, 3000, 100]);
});
test('ما بعد لحظة التصفير لا يدخل الفترة', () => {
  const r = planClose({ bookings: [bk('a', 10), bk('late', 500)], payments: [{ amount: 3000, at: 20 }], by: 'x', now: 100 });
  assert.equal(r.count, 1);
});
test('summarize يطابق منطق الواجهة', () => assert.equal(summarize([bk('a', 1, 500, 700)]).due, 1200));
