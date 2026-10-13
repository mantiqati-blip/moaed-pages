import { cellKeys, taken, toEpoch, scheduleId } from './cells.js';
// fs = { doc, runTransaction } من firebase-firestore (تُحقن لتسهيل الاختبار)
// الحجز المزدوج: Transaction يقرأ وثيقة اليوم ثم يكتب خلايا الحجز؛ لو سبقتها زبونة أخرى يُعاد التنفيذ ويفشل بـ SLOT_TAKEN
export async function bookSlot({ db, fs, user, salon, staffId, date, startMin, services, settings, idempotencyKey, source = 'online', src = null, customerName = '', customerPhone = '' }) {
  if (settings.customerFee == null || settings.salonCut == null) throw new Error('NOT_CONFIGURED');
  const durationMin = services.reduce((n, s) => n + s.durationMin, 0), keys = cellKeys(startMin, durationMin);
  const start = toEpoch(date, startMin), end = start + durationMin * 60000;
  const bref = fs.doc(db, 'bookings', idempotencyKey), sref = fs.doc(db, 'schedules', scheduleId(staffId, date)), cref = fs.doc(db, 'bookings', idempotencyKey, 'private', 'code');
  const code = String(1000 + Math.floor(Math.random() * 9000));
  return fs.runTransaction(db, async (tx) => {
    if ((await tx.get(bref)).exists()) return { id: idempotencyKey, duplicate: true };           // إعادة المحاولة بعد انقطاع الشبكة
    const snap = await tx.get(sref), cells = snap.exists() ? snap.data().cells || {} : {};
    if (taken(cells, keys).length) throw new Error('SLOT_TAKEN');
    const free = source === 'blocked' || (source === 'manual' && settings.manualFeeMode === 'none');
    tx.set(bref, { customerUid: user.uid, customerName, customerPhone, salonId: salon.id, staffId, services, start, end, durationMin,
      servicesTotal: services.reduce((n, s) => n + s.price, 0), customerFee: free ? 0 : settings.customerFee, salonCut: free ? 0 : settings.salonCut,
      discount: 0, status: 'confirmed', source, src, createdAt: Date.now() });
    tx.set(cref, { code });
    tx.set(sref, { cells: Object.fromEntries(keys.map((k) => [k, idempotencyKey])) }, { merge: true });
    return { id: idempotencyKey, code };
  });
}
