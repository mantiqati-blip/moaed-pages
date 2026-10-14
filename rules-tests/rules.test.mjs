// اختبارات قواعد Firestore على المحاكي الرسمي. التشغيل: cd rules-tests && npm i && npm test   (يحتاج firebase-tools وJava)
// تغطي ما تعتمد عليه الواجهة: منع الحجز المباشر، عزل الصالونات، الحسابات، الكوبونات، التقييمات، واستعلامات الإحصائيات.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { test, before, beforeEach, after } from 'node:test';
import fs from 'node:fs';

const NOW = Date.now(), DAY = 864e5, H = 36e5;
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-moaed', firestore: { rules: fs.readFileSync(new URL('../firestore_server.rules', import.meta.url), 'utf8') } });
});
after(async () => { await env?.cleanup(); });

const bk = (o = {}) => ({ customerUid: 'cust1', customerName: 'سارة', customerPhone: '07701234567', salonId: 'sal1', staffId: 'st1', services: [{ name: 'قص', price: 10000, durationMin: 60 }],
  start: NOW + 3 * DAY, end: NOW + 3 * DAY + H, durationMin: 60, servicesTotal: 10000, customerFee: 1000, salonCut: 2000, discount: 0, status: 'confirmed', source: 'online', createdAt: NOW, ...o });
const coupon = (o = {}) => ({ code: 'WELCOME', type: 'percent', value: 20, maxUses: 10, used: 0, expiresAt: NOW + 30 * DAY, firstOnly: false, public: true, active: true, createdAt: NOW, ...o });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore(), S = (p, v) => setDoc(doc(d, p), v);
    await S('platform/settings', { customerFee: 1000, salonCut: 2000, cancelCutoffHours: 24, requirePhoneOtp: false, manualFeeMode: 'same', useServerBooking: true });
    await S('users/admin1', { role: 'admin', status: 'active', name: 'الأدمن' });
    await S('users/owner1', { role: 'owner', status: 'active', salonId: 'sal1', name: 'صاحبة 1' });
    await S('users/owner2', { role: 'owner', status: 'active', salonId: 'sal2', name: 'صاحبة 2' });
    await S('users/staff1', { role: 'staff', status: 'active', salonId: 'sal1', staffId: 'st1', name: 'موظفة' });
    await S('salons/sal1', { name: 'صالون 1', slug: 'sal1', status: 'active', ownerUid: 'owner1' });
    await S('salons/sal2', { name: 'صالون 2', slug: 'sal2', status: 'active', ownerUid: 'owner2' });
    await S('salons/sal3', { name: 'موقوف', slug: 'sal3', status: 'suspended', ownerUid: 'x' });
    await S('publicSalons/sal1', { name: 'صالون 1', slug: 'sal1', governorateId: '', areaId: '', status: 'active' });
    await S('salons/sal1/staff/st1', { name: 'ليلى', status: 'active' });
    await S('salons/sal1/services/sv1', { name: 'قص', price: 10000, durationMin: 60 });
    await S('bookings/b1', bk({ status: 'completed', completedAt: NOW - DAY, start: NOW - 2 * DAY, end: NOW - 2 * DAY + H }));          // مكتمل لزبونة 1
    await S('bookings/b2', bk({ customerUid: 'cust2', salonId: 'sal2' }));                                                                 // صالون آخر وزبونة أخرى
    await S('bookings/b3', bk());                                                                                                          // مؤكد بعد ٣ أيام (خارج مهلة الإلغاء)
    await S('bookings/b4', bk({ start: NOW - 2 * H, end: NOW - H }));                                                                       // مؤكد وموعده مضى (للإكمال)
    await S('bookings/b4/private/code', { code: '1234' });
    await S('bookings/b5', bk({ start: NOW + 2 * H, end: NOW + 3 * H }));                                                                  // داخل المهلة
    await S('bookings/b7', bk({ status: 'completed', completedAt: NOW - 31 * DAY, start: NOW - 32 * DAY, end: NOW - 32 * DAY + H }));      // أكثر من ٣٠ يومًا
    await S('salons/sal1/coupons/WELCOME', coupon());
    await S('salons/sal1/coupons/PRIVATE', coupon({ code: 'PRIVATE', public: false }));
    await S('announcements/a1', { title: 'إعلان', body: 'نص الإعلان', active: true, by: 'admin1', createdAt: NOW });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore(), anon = () => env.unauthenticatedContext().firestore();

test('القراءة العامة: الإعدادات والقائمة العامة والصالون الفعّال فقط', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'platform/settings'))); await assertSucceeds(getDoc(doc(anon(), 'publicSalons/sal1')));
  await assertSucceeds(getDoc(doc(anon(), 'salons/sal1'))); await assertFails(getDoc(doc(anon(), 'salons/sal3')));
  await assertFails(getDocs(collection(anon(), 'salons')));                                   // لا قائمة عامة للصالونات
  await assertSucceeds(getDocs(collection(anon(), 'salons/sal1/services')));
});
test('المستخدمون: يقرأ حسابه فقط والأدمن يكتب', async () => {
  await assertSucceeds(getDoc(doc(as('owner1'), 'users/owner1'))); await assertFails(getDoc(doc(as('owner1'), 'users/admin1'))); await assertFails(getDoc(doc(anon(), 'users/admin1')));
  await assertFails(updateDoc(doc(as('owner1'), 'users/owner1'), { role: 'admin' }));
  await assertSucceeds(setDoc(doc(as('admin1'), 'users/new1'), { role: 'owner', status: 'active', salonId: 'sal1' }));
});
test('الإعدادات والتدقيق: للأدمن فقط', async () => {
  await assertFails(updateDoc(doc(as('owner1'), 'platform/settings'), { customerFee: 0 })); await assertSucceeds(updateDoc(doc(as('admin1'), 'platform/settings'), { customerFee: 1500 }));
  await assertFails(addDoc(collection(anon(), 'audit'), { by: 'x', action: 'a', target: 't' }));
  await assertSucceeds(addDoc(collection(as('admin1'), 'audit'), { by: 'admin1', action: 'a', target: 't' }));
});

// ===== الحجوزات =====
test('الزبونة لا تنشئ حجزًا مباشرة (يُنشأ بدالة السيرفر فقط)', async () => {
  await assertFails(setDoc(doc(as('cust1'), 'bookings/new1'), bk()));
  await assertFails(setDoc(doc(as('cust1'), 'bookings/new2'), bk({ source: 'manual' })));
  await assertFails(setDoc(doc(as('owner1'), 'bookings/new3'), bk({ source: 'online' })));                   // حتى صاحبة الصالون لا تنشئ «إلكتروني»
});
test('الحجز اليدوي: صاحبة الصالون والموظفة بالرسم الصحيح وفي صالونهما فقط', async () => {
  const m = (o) => bk({ source: 'manual', customerUid: 'owner1', ...o });
  await assertSucceeds(setDoc(doc(as('owner1'), 'bookings/m1'), m()));
  await assertSucceeds(setDoc(doc(as('staff1'), 'bookings/m2'), m({ customerUid: 'staff1' })));
  await assertFails(setDoc(doc(as('owner1'), 'bookings/m3'), m({ customerFee: 0 })));                         // رسم غير مطابق
  await assertFails(setDoc(doc(as('owner1'), 'bookings/m4'), m({ salonId: 'sal2' })));                        // صالون غيرها
  await assertFails(setDoc(doc(as('owner1'), 'bookings/m5'), m({ start: NOW - H, end: NOW })));               // موعد ماضٍ
});
test('قراءة الحجوزات: صاحبة الحجز وصالونه والأدمن فقط', async () => {
  await assertSucceeds(getDoc(doc(as('cust1'), 'bookings/b1'))); await assertFails(getDoc(doc(as('cust2'), 'bookings/b1')));
  await assertSucceeds(getDoc(doc(as('owner1'), 'bookings/b1'))); await assertFails(getDoc(doc(as('owner2'), 'bookings/b1'))); await assertSucceeds(getDoc(doc(as('admin1'), 'bookings/b1')));
  await assertFails(getDoc(doc(anon(), 'bookings/b1')));
});
test('استعلامات الإحصائيات والحسابات: بشرط الصالون، والأدمن كل الحجوزات', async () => {
  const B = (d) => collection(d, 'bookings');
  await assertSucceeds(getDocs(query(B(as('owner1')), where('salonId', '==', 'sal1'))));                      // تبويب الإحصائيات للصالون
  await assertFails(getDocs(B(as('owner1')))); await assertFails(getDocs(query(B(as('owner1')), where('salonId', '==', 'sal2'))));
  await assertSucceeds(getDocs(B(as('admin1')))); await assertSucceeds(getDocs(query(B(as('admin1')), where('status', '==', 'completed'))));   // تبويب الإحصائيات للأدمن
  await assertSucceeds(getDocs(query(B(as('cust1')), where('customerUid', '==', 'cust1')))); await assertFails(getDocs(query(B(as('cust1')), where('salonId', '==', 'sal1'))));
});
test('طلب الإلغاء من الزبونة: قبل المهلة وبسبب ولحجزها فقط', async () => {
  const req = { status: 'cancel_requested', cancelReason: 'ظرف طارئ', cancelRequestedAt: NOW };
  await assertSucceeds(updateDoc(doc(as('cust1'), 'bookings/b3'), req));
  await assertFails(updateDoc(doc(as('cust1'), 'bookings/b5'), req));                                         // داخل المهلة
  await assertFails(updateDoc(doc(as('cust2'), 'bookings/b3'), req));                                         // حجز غيرها
  await assertFails(updateDoc(doc(as('cust1'), 'bookings/b3'), { ...req, cancelReason: '' }));
  await assertFails(updateDoc(doc(as('cust1'), 'bookings/b3'), { status: 'completed', completedAt: NOW, codeEntered: '1234' }));
  await assertFails(deleteDoc(doc(as('cust1'), 'bookings/b3')));
});
test('إكمال الخدمة: بالرمز الصحيح فقط ومن صالون الحجز', async () => {
  const done = (code) => ({ status: 'completed', completedAt: Date.now(), codeEntered: code });
  await assertFails(updateDoc(doc(as('owner1'), 'bookings/b4'), done('9999')));
  await assertFails(updateDoc(doc(as('owner2'), 'bookings/b4'), done('1234')));
  await assertFails(updateDoc(doc(as('owner1'), 'bookings/b3'), done('1234')));                               // موعده لم يحن
  await assertSucceeds(updateDoc(doc(as('owner1'), 'bookings/b4'), done('1234')));
});
test('رمز الإكمال: تقرؤه الزبونة والأدمن فقط', async () => {
  await assertSucceeds(getDoc(doc(as('cust1'), 'bookings/b4/private/code'))); await assertSucceeds(getDoc(doc(as('admin1'), 'bookings/b4/private/code')));
  await assertFails(getDoc(doc(as('owner1'), 'bookings/b4/private/code'))); await assertFails(getDoc(doc(as('cust2'), 'bookings/b4/private/code')));
});
test('الجدول: الزبونة لا تكتب، الصالون يكتب', async () => {
  await assertFails(setDoc(doc(as('cust1'), 'schedules/st1_2026-10-20'), { cells: { 40: 'b3' } }));
  await assertSucceeds(setDoc(doc(as('owner1'), 'schedules/st1_2026-10-20'), { cells: { 40: 'm1' } }));
  await assertSucceeds(getDoc(doc(as('cust1'), 'schedules/st1_2026-10-20')));
});

// ===== الحسابات =====
test('التسديدات: الأدمن يسجّل، وصاحبة الصالون تقرأ صالونها فقط، والموظفة بلا صلاحية لا تقرأ', async () => {
  await assertSucceeds(setDoc(doc(as('admin1'), 'salons/sal1/payments/p1'), { amount: 5000, by: 'admin1', at: NOW }));
  await assertFails(setDoc(doc(as('owner1'), 'salons/sal1/payments/p2'), { amount: 5000, by: 'owner1', at: NOW }));
  await assertFails(setDoc(doc(as('admin1'), 'salons/sal1/payments/p3'), { amount: -5, by: 'admin1', at: NOW }));
  await assertSucceeds(getDocs(collection(as('owner1'), 'salons/sal1/payments'))); await assertFails(getDocs(collection(as('owner2'), 'salons/sal1/payments'))); await assertFails(getDocs(collection(as('staff1'), 'salons/sal1/payments')));
});
test('التصفير: لا يُنشأ من العميل أبدًا (دالة closePeriod فقط)', async () => {
  await assertFails(setDoc(doc(as('admin1'), 'salons/sal1/periods/x'), { closedAt: NOW, count: 1, due: 0, paid: 0, remaining: 0 }));
});
test('الصالون: لا تغيّر الرسم ولا الحالة، وتغيّر اسمها', async () => {
  await assertSucceeds(updateDoc(doc(as('owner1'), 'salons/sal1'), { name: 'اسم جديد' }));
  await assertFails(updateDoc(doc(as('owner1'), 'salons/sal1'), { customerFee: 0 })); await assertFails(updateDoc(doc(as('owner1'), 'salons/sal1'), { status: 'suspended' }));
  await assertFails(updateDoc(doc(as('owner2'), 'salons/sal1'), { name: 'س' })); await assertSucceeds(updateDoc(doc(as('admin1'), 'salons/sal1'), { customerFee: 1500 }));
});
test('الخدمات والموظفات: لصاحبة الصالون، والموظفة الجديدة تبدأ معلّقة', async () => {
  await assertSucceeds(setDoc(doc(as('owner1'), 'salons/sal1/services/sv2'), { name: 'صبغة', price: 30000, durationMin: 90 })); await assertFails(setDoc(doc(as('cust1'), 'salons/sal1/services/sv3'), { name: 'x' }));
  await assertSucceeds(setDoc(doc(as('owner1'), 'salons/sal1/staff/st2'), { name: 'نور', status: 'pending' })); await assertFails(setDoc(doc(as('owner1'), 'salons/sal1/staff/st3'), { name: 'هدى', status: 'active' }));
});

// ===== الكوبونات =====
test('إنشاء كوبون: صاحبة الصالون بقيم صحيحة فقط', async () => {
  const mk = (code, o) => setDoc(doc(as('owner1'), `salons/sal1/coupons/${code}`), coupon({ code, ...o }));
  await assertSucceeds(mk('SUMMER10', { label: 'عرض الصيف' }));
  await assertFails(mk('USED1', { used: 1 })); await assertFails(mk('BIG95', { value: 95 })); await assertFails(mk('EXPIRED1', { expiresAt: NOW - DAY })); await assertFails(mk('LONGLIFE', { expiresAt: NOW + 120 * DAY }));
  await assertFails(setDoc(doc(as('owner1'), 'salons/sal1/coupons/low1'), coupon({ code: 'low1' })));         // معرّف بحروف صغيرة
  await assertFails(setDoc(doc(as('owner2'), 'salons/sal1/coupons/OTHER1'), coupon({ code: 'OTHER1' })));     // صالون غيرها
  await assertFails(setDoc(doc(as('cust1'), 'salons/sal1/coupons/CUST1'), coupon({ code: 'CUST1' })));
});
test('قراءة الكوبونات: معاينة بالكود، والقائمة العلنية الفعّالة فقط للزبونة', async () => {
  await assertSucceeds(getDoc(doc(as('cust1'), 'salons/sal1/coupons/PRIVATE'))); await assertFails(getDoc(doc(anon(), 'salons/sal1/coupons/WELCOME')));
  const C = (d) => collection(d, 'salons/sal1/coupons');
  await assertSucceeds(getDocs(query(C(as('cust1')), where('public', '==', true), where('active', '==', true))));
  await assertFails(getDocs(C(as('cust1')))); await assertSucceeds(getDocs(C(as('owner1')))); await assertFails(getDocs(C(as('owner2'))));
});
test('تعديل الكوبون: التفعيل والعلنية فقط، والعدّاد للسيرفر', async () => {
  const w = doc(as('owner1'), 'salons/sal1/coupons/WELCOME');
  await assertSucceeds(updateDoc(w, { active: false })); await assertSucceeds(updateDoc(w, { public: false }));
  await assertFails(updateDoc(w, { used: 5 })); await assertFails(updateDoc(w, { value: 90 }));
  await assertFails(updateDoc(doc(as('cust1'), 'salons/sal1/coupons/WELCOME'), { active: false }));
  await assertSucceeds(deleteDoc(doc(as('owner1'), 'salons/sal1/coupons/PRIVATE'))); await assertFails(deleteDoc(doc(as('cust1'), 'salons/sal1/coupons/WELCOME')));
});

// ===== التقييمات =====
const rv = (o = {}) => ({ rating: 5, comment: 'ممتاز', name: 'سارة', at: Date.now(), hidden: false, ...o });
test('تقييم: صاحبة حجز مكتمل خلال ٣٠ يومًا، مرة واحدة، للصالون الصحيح', async () => {
  await assertSucceeds(setDoc(doc(as('cust1'), 'salons/sal1/reviews/b1'), rv()));
  await assertFails(setDoc(doc(as('cust1'), 'salons/sal1/reviews/b1'), rv()));                                // التكرار يصير تعديلًا فيُرفض
});
test('تقييم مرفوض: زبونة أخرى، غير مكتمل، قديم، صالون خطأ', async () => {
  await assertFails(setDoc(doc(as('cust2'), 'salons/sal1/reviews/b1'), rv())); await assertFails(setDoc(doc(as('cust1'), 'salons/sal1/reviews/b3'), rv()));
  await assertFails(setDoc(doc(as('cust1'), 'salons/sal1/reviews/b7'), rv())); await assertFails(setDoc(doc(as('cust1'), 'salons/sal2/reviews/b1'), rv()));
  await assertFails(setDoc(doc(anon(), 'salons/sal1/reviews/b1'), rv()));
});
test('تقييم بقيم سيئة: نجوم خارج النطاق، مخفي، حقل زائد، تعليق طويل', async () => {
  for (const o of [{ rating: 6 }, { rating: 0 }, { rating: 4.5 }, { hidden: true }, { extra: 1 }, { comment: 'x'.repeat(301) }, { name: '' }])
    await assertFails(setDoc(doc(as('cust1'), 'salons/sal1/reviews/b1'), rv(o)));
  await assertSucceeds(setDoc(doc(as('cust1'), 'salons/sal1/reviews/b1'), { rating: 3, name: 'سارة', at: Date.now(), hidden: false }));   // بدون تعليق مقبول
});
test('التقييمات: قراءة عامة، والأدمن وحده يُخفي، ولا حذف', async () => {
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'salons/sal1/reviews/b1'), rv()));
  await assertSucceeds(getDoc(doc(anon(), 'salons/sal1/reviews/b1'))); await assertSucceeds(getDocs(collection(anon(), 'salons/sal1/reviews')));
  await assertFails(updateDoc(doc(as('owner1'), 'salons/sal1/reviews/b1'), { hidden: true })); await assertFails(updateDoc(doc(as('cust1'), 'salons/sal1/reviews/b1'), { rating: 1 }));
  await assertFails(updateDoc(doc(as('admin1'), 'salons/sal1/reviews/b1'), { rating: 1 }));
  await assertSucceeds(updateDoc(doc(as('admin1'), 'salons/sal1/reviews/b1'), { hidden: true }));
  await assertFails(deleteDoc(doc(as('admin1'), 'salons/sal1/reviews/b1')));
});

// ===== الرسائل والإعلانات والانضمام =====
test('الإعلانات: تقرؤها الإدارة وأصحاب الصالونات، والأدمن وحده ينشئ', async () => {
  await assertSucceeds(getDoc(doc(as('owner1'), 'announcements/a1'))); await assertFails(getDoc(doc(as('cust1'), 'announcements/a1'))); await assertFails(getDoc(doc(anon(), 'announcements/a1')));
  const a = { title: 'صيانة', body: 'صيانة مجدولة غدًا', active: true, by: 'admin1', createdAt: NOW };
  await assertSucceeds(setDoc(doc(as('admin1'), 'announcements/a2'), a)); await assertFails(setDoc(doc(as('owner1'), 'announcements/a3'), { ...a, by: 'owner1' }));
});
test('ملخص الدعم: صاحبة الصالون لصالونها فقط، والأدمن يرد', async () => {
  const t = (o) => ({ salonName: 'صالون 1', lastText: 'مرحبا', lastFrom: 'owner', lastAt: Date.now(), awaitingAdmin: true, ...o });
  await assertSucceeds(setDoc(doc(as('owner1'), 'supportThreads/sal1'), t())); await assertFails(setDoc(doc(as('owner2'), 'supportThreads/sal1'), t()));
  await assertFails(setDoc(doc(as('owner1'), 'supportThreads/sal1'), t({ awaitingAdmin: false })));
  await assertSucceeds(setDoc(doc(as('admin1'), 'supportThreads/sal1'), t({ lastFrom: 'admin', awaitingAdmin: false })));
});
test('طلب الانضمام: بشروطه ومكالمتان «لم تتم»، والمقدِّمة وحدها تقرؤه', async () => {
  const a = { status: 'pending', createdBy: 'cust1', acceptedTerms: true, calls: { voice: { status: 'none' }, video: { status: 'none' } }, ownerPhone: '07701234567', whatsapp: '07701234567', ownerName: 'نور', salonName: 'صالون نور', address: 'بغداد', servicesText: 'قص وصبغة' };
  await assertSucceeds(setDoc(doc(as('cust1'), 'applications/ap1'), a)); await assertFails(setDoc(doc(as('cust1'), 'applications/ap2'), { ...a, status: 'approved' }));
  await assertFails(setDoc(doc(as('cust1'), 'applications/ap3'), { ...a, ownerPhone: '12345' })); await assertFails(setDoc(doc(as('cust1'), 'applications/ap4'), { ...a, createdBy: 'cust2' }));
  await assertSucceeds(getDoc(doc(as('cust1'), 'applications/ap1'))); await assertFails(getDoc(doc(as('cust2'), 'applications/ap1'))); await assertSucceeds(getDoc(doc(as('admin1'), 'applications/ap1')));
});
