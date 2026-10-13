// دالة إنشاء الحجز من السيرفر (تحتاج Blaze). لم تُنشر ولم تُجرَّب على Firebase: المنطق بـ plan.js مختبر، وهذا الملف يربطه بـ Firestore فقط.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const crypto = require('node:crypto');
const { planBooking } = require('./plan.js');
const { planClose } = require('./period.js');
initializeApp();
const db = getFirestore(), MAX_ACTIVE_PER_PHONE = 3;

exports.createBooking = onCall({ region: 'europe-west1', maxInstances: 20 }, async (call) => {
  if (!call.auth) throw new HttpsError('unauthenticated', 'LOGIN_REQUIRED');
  const d = call.data || {}, key = String(d.idempotencyKey || '');
  if (!/^[A-Za-z0-9-]{16,64}$/.test(key)) throw new HttpsError('invalid-argument', 'BAD_KEY');
  const salonId = String(d.salonId || ''), staffId = String(d.staffId || '');
  if (!/^[a-z0-9-]{2,40}$/.test(salonId) || !/^[A-Za-z0-9_-]{1,64}$/.test(staffId)) throw new HttpsError('invalid-argument', 'BAD_IDS');
  const now = Date.now(), bref = db.doc(`bookings/${key}`);
  try {
    return await db.runTransaction(async (tx) => {
      const ex = await tx.get(bref);
      if (ex.exists) { if (ex.data().customerUid === call.auth.uid) return { id: key, duplicate: true }; throw new HttpsError('already-exists', 'KEY_TAKEN'); }
      const [ss, ps, sts, svs] = await Promise.all([tx.get(db.doc(`salons/${salonId}`)), tx.get(db.doc('platform/settings')), tx.get(db.doc(`salons/${salonId}/staff/${staffId}`)), tx.get(db.collection(`salons/${salonId}/services`))]);
      if (!ss.exists || !sts.exists) throw new HttpsError('not-found', 'NOT_FOUND');
      const { booking, keys } = planBooking({
        salon: { id: salonId, ...ss.data() }, platform: ps.data() || {}, staff: { id: staffId, ...sts.data() }, services: svs.docs.map((x) => ({ id: x.id, ...x.data() })),
        req: { serviceIds: d.serviceIds, staffId, date: d.date, startMin: d.startMin, customerName: d.customerName, customerPhone: d.customerPhone, src: typeof d.src === 'string' ? d.src.slice(0, 20) : null }, auth: call.auth, now });
      const sref = db.doc(`schedules/${staffId}_${d.date}`), snap = await tx.get(sref), cells = snap.exists ? snap.data().cells || {} : {};
      if (keys.some((k) => cells[k] !== undefined)) throw new HttpsError('aborted', 'SLOT_TAKEN');
      const act = await tx.get(db.collection('bookings').where('customerPhone', '==', booking.customerPhone).where('status', '==', 'confirmed').where('start', '>', now).limit(MAX_ACTIVE_PER_PHONE));
      if (act.size >= MAX_ACTIVE_PER_PHONE) throw new HttpsError('resource-exhausted', 'TOO_MANY_ACTIVE');
      const code = String(crypto.randomInt(1000, 10000));
      tx.set(bref, booking); tx.set(bref.collection('private').doc('code'), { code });
      tx.set(sref, { cells: Object.fromEntries(keys.map((k) => [k, key])) }, { merge: true });
      return { id: key, code };
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e && e.code && /^(invalid-argument|failed-precondition|permission-denied)$/.test(e.code)) throw new HttpsError(e.code, e.message);
    console.error('createBooking', e); throw new HttpsError('internal', 'INTERNAL');
  }
});

// تصفير حساب صالون من السيرفر: للأدمن فقط. يقرأ الحجوزات والتسديدات بنفسه ولا يثق بأرقام العميل.
exports.closePeriod = onCall({ region: 'europe-west1', maxInstances: 5 }, async (call) => {
  if (!call.auth) throw new HttpsError('unauthenticated', 'LOGIN_REQUIRED');
  const me = await db.doc(`users/${call.auth.uid}`).get();
  if (!me.exists || me.data().role !== 'admin' || me.data().status !== 'active') throw new HttpsError('permission-denied', 'ADMIN_ONLY');
  const salonId = String((call.data || {}).salonId || '');
  if (!/^[a-z0-9-]{2,40}$/.test(salonId)) throw new HttpsError('invalid-argument', 'BAD_IDS');
  const now = Date.now();
  try {
    return await db.runTransaction(async (tx) => {
      const [bs, ps, per] = await Promise.all([
        tx.get(db.collection('bookings').where('salonId', '==', salonId).where('status', '==', 'completed')),
        tx.get(db.collection(`salons/${salonId}/payments`)), tx.get(db.collection(`salons/${salonId}/periods`))]);
      const last = per.docs.reduce((m, d) => Math.max(m, d.data().closedAt || 0), 0);
      const rec = planClose({ bookings: bs.docs.map((d) => d.data()), payments: ps.docs.map((d) => d.data()), lastClosedAt: last, by: call.auth.uid, now });
      const ref = db.collection(`salons/${salonId}/periods`).doc();
      tx.set(ref, rec); tx.set(db.collection('audit').doc(), { by: call.auth.uid, action: 'period.close', target: `${salonId}: ${rec.count} bookings, due ${rec.due}`, at: now });
      return { id: ref.id, ...rec };
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e && e.code === 'failed-precondition') throw new HttpsError('failed-precondition', e.message);
    console.error('closePeriod', e); throw new HttpsError('internal', 'INTERNAL');
  }
});
