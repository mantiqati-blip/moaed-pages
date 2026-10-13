const test = require('node:test'), assert = require('node:assert/strict'), { planBooking, toEpoch } = require('./plan.js');
const base = () => ({
  salon: { id: 'tota', status: 'active', hours: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: '10:00', close: '20:00' }])), customerFee: 1000 },
  platform: { customerFee: 500, salonCut: 2000 }, staff: { id: 's1', status: 'active' },
  services: [{ id: 'a', name: 'قص', price: 10000, durationMin: 30, active: true }, { id: 'b', name: 'صبغ', price: 30000, durationMin: 60, active: true }, { id: 'x', name: 'موقوفة', price: 1, durationMin: 15, active: false }],
  req: { serviceIds: ['a', 'b'], staffId: 's1', date: '2026-10-20', startMin: 660, customerName: 'سارة علي', customerPhone: '07701234567' },
  auth: { uid: 'u1', token: {} }, now: Date.UTC(2026, 9, 13),
});
const fails = (m, code) => assert.throws(() => planBooking(m), (e) => e.message === code);
test('يحسب السعر والمدة والرسم من بيانات السيرفر، وقيمة الصالون تتقدم على الافتراضي', () => {
  const { booking, keys } = planBooking(base());
  assert.equal(booking.servicesTotal, 40000); assert.equal(booking.durationMin, 90); assert.equal(booking.customerFee, 1000); assert.equal(booking.salonCut, 2000);
  assert.deepEqual(keys, ['44', '45', '46', '47', '48', '49']); assert.equal(booking.start, toEpoch('2026-10-20', 660)); assert.equal(booking.end - booking.start, 90 * 60000);
});
test('خدمة موقوفة أو غير موجودة أو مكررة ترفض', () => {
  let m = base(); m.req.serviceIds = ['x']; fails(m, 'SERVICE_UNAVAILABLE');
  m = base(); m.req.serviceIds = ['zzz']; fails(m, 'SERVICE_UNAVAILABLE');
  m = base(); m.req.serviceIds = ['a', 'a']; fails(m, 'BAD_SERVICES');
});
test('خارج الدوام أو يوم إجازة أو ماضٍ أو بعيد جدًا', () => {
  let m = base(); m.req.startMin = 1170; fails(m, 'OUTSIDE_HOURS');
  m = base(); m.req.startMin = 540; fails(m, 'OUTSIDE_HOURS');
  m = base(); m.salon.hours[new Date(toEpoch('2026-10-20', 660) + 3 * 36e5).getUTCDay()].off = true; fails(m, 'OUTSIDE_HOURS');
  m = base(); m.req.date = '2026-10-10'; fails(m, 'PAST');
  m = base(); m.req.date = '2027-03-01'; fails(m, 'TOO_FAR');
});
test('رقم أو اسم غير صالح، وصالون أو موظفة غير فعّالة، وإعدادات ناقصة', () => {
  let m = base(); m.req.customerPhone = '0123'; fails(m, 'BAD_PHONE');
  m = base(); m.req.customerName = 'ab'; fails(m, 'BAD_NAME');
  m = base(); m.salon.status = 'suspended'; fails(m, 'SALON_INACTIVE');
  m = base(); m.staff.status = 'pending'; fails(m, 'STAFF_INACTIVE');
  m = base(); delete m.salon.customerFee; delete m.platform.customerFee; fails(m, 'NOT_CONFIGURED');
});
test('اشتراط رمز الهاتف: يرفض بدونه ويقبل إذا طابق', () => {
  let m = base(); m.platform.requirePhoneOtp = true; fails(m, 'PHONE_NOT_VERIFIED');
  m.auth.token.phone_number = '+9647701234567'; assert.ok(planBooking(m).booking);
  m.auth.token.phone_number = '+9647709999999'; fails(m, 'PHONE_NOT_VERIFIED');
});
