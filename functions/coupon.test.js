const test = require('node:test'), assert = require('node:assert/strict'), { planCoupon, discountOf } = require('./coupon.js');
const C = import('../js/coupons.js'), R = import('../js/reviews.js');
const now = Date.UTC(2026, 9, 14);
const cp = (o = {}) => ({ type: 'percent', value: 20, maxUses: 10, used: 0, expiresAt: now + 864e5, firstOnly: false, active: true, ...o });
const plan = (o = {}, c = cp()) => planCoupon({ coupon: c, code: 'WELCOME', servicesTotal: 40000, now, ...o });
const fails = (fn, msg) => assert.throws(fn, (e) => e.message === msg && e.code === 'failed-precondition');

test('نسبة: تُقرَّب لأسفل لأقرب ٢٥٠ ولا تتجاوز المجموع', () => {
  assert.equal(plan().discount, 8000); assert.equal(plan().couponId, 'WELCOME');
  assert.equal(discountOf(cp({ value: 15 }), 12000), 1750);         // 1800 → 1750
  assert.equal(discountOf(cp({ value: 90 }), 1000), 750);
});
test('ثابت: الخصم لا يتجاوز مجموع الخدمات', () => {
  assert.equal(plan({}, cp({ type: 'fixed', value: 5000 })).discount, 5000);
  assert.equal(plan({ servicesTotal: 3000 }, cp({ type: 'fixed', value: 5000 })).discount, 3000);
});
test('الرمز يُطبَّع، وغير الصالح يرفض', () => {
  assert.equal(plan({ code: ' welcome ' }).couponId, 'WELCOME');
  fails(() => plan({ code: 'ab' }), 'COUPON_INVALID'); fails(() => planCoupon({ coupon: null, code: 'WELCOME', servicesTotal: 1000, now }), 'COUPON_INVALID');
});
test('موقوف، منتهٍ، مستنفد، سبق استعماله، لأول حجز فقط', () => {
  fails(() => plan({}, cp({ active: false })), 'COUPON_INACTIVE');
  fails(() => plan({}, cp({ expiresAt: now })), 'COUPON_EXPIRED');
  fails(() => plan({}, cp({ used: 10 })), 'COUPON_USED_UP');
  fails(() => plan({ usedByPhone: true }), 'COUPON_ALREADY_USED');
  fails(() => plan({ hasPrior: true }, cp({ firstOnly: true })), 'COUPON_FIRST_ONLY');
  assert.ok(plan({ hasPrior: true }).discount);                      // غير مقيّد بأول حجز
});
test('وثيقة كوبون تالفة ترفض بدل أن تعطي خصمًا غريبًا', () => {
  fails(() => plan({}, cp({ value: -5 })), 'COUPON_INVALID'); fails(() => plan({}, cp({ type: 'x' })), 'COUPON_INVALID'); fails(() => plan({}, cp({ maxUses: undefined })), 'COUPON_USED_UP');
});
test('معاينة الواجهة تطابق حساب السيرفر على جدول من الحالات', async () => {
  const { discountOf: cd, previewCoupon } = await C;
  for (const type of ['percent', 'fixed']) for (const value of type === 'percent' ? [5, 10, 15, 33, 90] : [250, 1000, 5000, 99999]) for (const total of [1000, 7250, 12000, 40000, 123456]) {
    const c = cp({ type, value }); assert.equal(cd(c, total), discountOf(c, total), `${type} ${value} on ${total}`);
    const s = (() => { try { return planCoupon({ coupon: c, code: 'WELCOME', servicesTotal: total, now }).discount; } catch (e) { return e.message; } })(), p = previewCoupon(c, 'WELCOME', total, now);
    assert.equal(p.discount ?? 'COUPON_INVALID', s);
  }
});
test('إنشاء كوبون: التحقق والبناء', async () => {
  const { validateCoupon, buildCoupon, couponState, normCode, genCode } = await C, ok = { code: 'eid25', type: 'percent', value: 20, maxUses: 50, days: 30 };
  assert.equal(validateCoupon(ok), null); assert.equal(normCode('eid٢٥'), 'EID25');
  assert.match(validateCoupon({ ...ok, code: 'ab' }), /الكود/); assert.match(validateCoupon({ ...ok, value: 95 }), /90/); assert.match(validateCoupon({ ...ok, type: 'fixed', value: 1.5 }), /عددًا صحيحًا/);
  assert.match(validateCoupon({ ...ok, days: 5 }), /الصلاحية/); assert.match(validateCoupon({ ...ok, maxUses: 0 }), /مرات/);
  const b = buildCoupon({ ...ok, firstOnly: true, isPublic: true, label: ' ترحيب ', now }); assert.deepEqual(Object.keys(b).sort(), ['active', 'code', 'createdAt', 'expiresAt', 'firstOnly', 'label', 'maxUses', 'public', 'type', 'used', 'value']);
  assert.equal(b.code, 'EID25'); assert.equal(b.used, 0); assert.equal(b.label, 'ترحيب'); assert.equal(b.expiresAt, now + 30 * 864e5);
  assert.equal(couponState(b, now), 'live'); assert.equal(couponState({ ...b, used: 50 }, now), 'used_up'); assert.equal(couponState(b, now + 31 * 864e5), 'expired'); assert.equal(couponState({ ...b, active: false }, now), 'off');
  assert.match(genCode(), /^[A-HJ-KM-NP-Z2-9]{6}$/);
});
test('التقييم: التحقق، الاسم الأول فقط، نافذة ٣٠ يومًا', async () => {
  const { validateReview, buildReview, canReview, summarize, stars, WINDOW_MS } = await R;
  assert.equal(validateReview(5, ''), null); assert.ok(validateReview(0, '')); assert.ok(validateReview(6, '')); assert.ok(validateReview(4.5, '')); assert.ok(validateReview(3, 'x'.repeat(301)));
  const r = buildReview({ rating: 4, comment: '  ممتاز  ', customerName: 'سارة علي حسن', now }); assert.deepEqual(r, { rating: 4, name: 'سارة', at: now, hidden: false, comment: 'ممتاز' });
  assert.equal('comment' in buildReview({ rating: 5, comment: '  ', customerName: '', now }), false); assert.equal(buildReview({ rating: 5, customerName: '', now }).name, 'زبونة');
  const b = { status: 'completed', source: 'online', completedAt: now }; assert.ok(canReview(b, now + WINDOW_MS)); assert.ok(!canReview(b, now + WINDOW_MS + 1));
  assert.ok(!canReview({ ...b, source: 'manual' }, now)); assert.ok(!canReview({ ...b, status: 'confirmed' }, now)); assert.ok(!canReview({ status: 'completed', source: 'online' }, now));
  assert.deepEqual(summarize([{ rating: 5 }, { rating: 4 }]), { count: 2, avg: 4.5, show: false });
  assert.deepEqual(summarize([{ rating: 5 }, { rating: 4 }, { rating: 4 }, { rating: 1, hidden: true }]), { count: 3, avg: 4.3, show: true });
  assert.equal(stars(4.4), '★★★★☆'); assert.equal(stars(0), '☆☆☆☆☆');
});
