const test = require('node:test'), assert = require('node:assert/strict');
const M = import('../js/charts.js');
const now = Date.UTC(2026, 9, 14, 12);                       // 2026-10-14 بتوقيت بغداد
const at = (d, h = 10) => Date.UTC(2026, 9, 14 - d, h - 3);  // قبل d يومًا الساعة h بتوقيت بغداد
const bk = (o) => ({ salonId: 's1', status: 'completed', source: 'online', start: at(0), services: [{ name: 'صبغة', price: 30000 }], servicesTotal: 30000, discount: 0, customerFee: 1000, salonCut: 2000, ...o });

test('dayList: n يوم مرتبة من الأقدم إلى اليوم، وتعبر حدود الأشهر', async () => {
  const { dayList } = await M, L = dayList(7, now);
  assert.equal(L.length, 7); assert.equal(L[6], '2026-10-14'); assert.equal(L[0], '2026-10-08');
  assert.deepEqual((await M).dayList(3, Date.UTC(2026, 2, 1, 12)), ['2026-02-27', '2026-02-28', '2026-03-01']);
});
test('اليوم بتوقيت بغداد: 23:30 UTC تُحسب يوم الغد', async () => {
  const { bookingsPerDay } = await M, r = bookingsPerDay([bk({ start: Date.UTC(2026, 9, 13, 22, 30) })], 7, now);
  assert.equal(r.find((x) => x.date === '2026-10-14').value, 1); assert.equal(r.find((x) => x.date === '2026-10-13').value, 0);
});
test('الحجوزات حسب اليوم: تستبعد الملغاة والأوقات المغلقة وخارج النطاق', async () => {
  const { bookingsPerDay, sum } = await M;
  const B = [bk(), bk({ status: 'confirmed' }), bk({ status: 'no_show', start: at(2) }), bk({ status: 'cancelled' }), bk({ source: 'blocked' }), bk({ start: at(20) }), bk({ start: at(-1) }), bk({ start: undefined })];
  const r = bookingsPerDay(B, 7, now);
  assert.equal(r.length, 7); assert.equal(r[6].value, 2); assert.equal(r[4].value, 1); assert.equal(sum(r), 3);
});
test('الدخل: المكتمل فقط، بعد الخصم؛ ودخل المنصة = رسم + استقطاع', async () => {
  const { incomePerDay, serviceRevenue, platformIncome, sum } = await M;
  const B = [bk({ discount: 5000 }), bk({ status: 'confirmed' }), bk({ source: 'blocked' }), bk({ start: at(1), servicesTotal: 10000 })];
  assert.equal(sum(incomePerDay(B, 7, now)), 25000 + 10000);
  assert.equal(sum(incomePerDay(B, 7, now, platformIncome)), 3000 * 2);
  assert.equal(serviceRevenue({}), 0); assert.equal(platformIncome({}), 0);
});
test('أكثر الخدمات: بالعدد ثم الدخل، الملغاة خارجًا، والدخل للمكتمل فقط', async () => {
  const { topServices } = await M, S = (n, p) => ({ name: n, price: p });
  const B = [bk({ services: [S('قص', 10000), S('سيشوار', 8000)] }), bk({ services: [S('قص', 10000)], status: 'confirmed' }), bk({ services: [S('صبغة', 50000)] }), bk({ services: [S('قص', 1)], status: 'cancelled' }), bk({ services: [S('صبغة', 1)], start: at(40) })];
  const r = topServices(B, 14, now);
  assert.deepEqual(r.map((x) => [x.name, x.count, x.revenue]), [['قص', 2, 10000], ['صبغة', 1, 50000], ['سيشوار', 1, 8000]]);
  assert.equal(topServices(B, 14, now, 1).length, 1);
});
test('بيانات تالفة لا تكسر الحساب', async () => {
  const { topServices, bookingsPerDay, renderStats } = await M;
  const B = [bk({ services: null }), bk({ services: [null, { name: '  ' }, { name: 'قص', price: 'x' }] }), bk({ services: undefined })];
  assert.deepEqual(topServices(B, 7, now).map((x) => [x.name, x.revenue]), [['قص', 0]]);
  assert.doesNotThrow(() => { bookingsPerDay([], 7, now); renderStats([], { now }); renderStats(B, { now, mode: 'admin' }); });
});
test('أكثر الصالونات: بالاسم ثم المعرّف عند غياب الاسم', async () => {
  const { topSalons } = await M;
  const r = topSalons([bk(), bk(), bk({ salonId: 's2' }), bk({ salonId: 's3', status: 'cancelled' })], 7, now, { s1: 'الأناقة' });
  assert.deepEqual(r, [{ name: 'الأناقة', count: 2 }, { name: 's2', count: 1 }]);
});
test('niceMax وcompact', async () => {
  const { niceMax, compact } = await M;
  assert.deepEqual([0, 3, 7, 12, 130, 1].map(niceMax), [1, 5, 10, 20, 200, 1]);
  assert.equal(compact(950), '950'); assert.equal(compact(12500), '12.5 ألف'); assert.equal(compact(2000000), '2 م');
});
test('الرسم: يهرّب النصوص، ويعرض عنوانًا لكل عمود، ولا قيم NaN', async () => {
  const { renderStats, barsSVG, hbarsHTML } = await M;
  const html = renderStats([bk({ services: [{ name: '<img src=x onerror=alert(1)>', price: 1 }] })], { now });
  assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img')); assert.ok(!/NaN|undefined/.test(html));
  assert.equal((barsSVG([{ date: '2026-10-14', value: 0 }], {}).match(/<rect/g) || []).length, 0);
  assert.ok(hbarsHTML([]).includes('لا توجد بيانات'));
  assert.equal((html.match(/data-d="/g) || []).length, 3); assert.ok(html.includes('aria-pressed="true"'));
});
test('وضع الأدمن يضيف أكثر الصالونات، ووضع الصالون لا يعرضها', async () => {
  const { renderStats } = await M;
  assert.ok(renderStats([bk()], { now, mode: 'admin', salons: { s1: 'س' } }).includes('أكثر الصالونات'));
  assert.ok(!renderStats([bk()], { now }).includes('أكثر الصالونات'));
});
