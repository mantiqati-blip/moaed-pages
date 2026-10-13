import { cellKeys, taken, toEpoch, scheduleId, TZ_MS } from './cells.js';
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

// تعديل موعد من الزبونة: نفس الموظفة ونفس الخدمات، يوم ووقت متاحان فقط. مرة واحدة لكل حجز، وقبل مهلة الإلغاء.
// الوقت الجديد يُثبَّت والقديم يُحرَّر داخل Transaction واحد، فلا يضيع الوقتان. fs = { doc, runTransaction, deleteField }
export async function rescheduleBooking({ db, fs, user, bookingId, date, startMin, cutoffHours = 2, now = Date.now() }) {
  const bref = fs.doc(db, 'bookings', bookingId);
  return fs.runTransaction(db, async (tx) => {
    const bs = await tx.get(bref); if (!bs.exists()) throw new Error('NOT_FOUND');
    const b = bs.data();
    if (b.customerUid !== user.uid) throw new Error('NOT_YOURS');
    if (b.status !== 'confirmed' || b.source !== 'online') throw new Error('NOT_ALLOWED');
    if (b.rescheduleCount) throw new Error('ALREADY_RESCHEDULED');
    if (b.start - now < cutoffHours * 36e5) throw new Error('TOO_LATE');
    const start = toEpoch(date, startMin), end = start + b.durationMin * 60000;
    if (start <= now) throw new Error('PAST');
    const od = new Date(b.start + TZ_MS), oldDate = od.toISOString().slice(0, 10), oldMin = od.getUTCHours() * 60 + od.getUTCMinutes();
    const oldKeys = cellKeys(oldMin, b.durationMin), newKeys = cellKeys(startMin, b.durationMin);
    const oid = scheduleId(b.staffId, oldDate), nid = scheduleId(b.staffId, date);
    const osnap = await tx.get(fs.doc(db, 'schedules', oid)), nsnap = oid === nid ? osnap : await tx.get(fs.doc(db, 'schedules', nid));
    const ncells = nsnap.exists() ? nsnap.data().cells || {} : {};
    const clash = newKeys.filter((k) => ncells[k] !== undefined && ncells[k] !== bookingId);   // خلايا حجزها نفسه ليست تعارضًا
    if (clash.length) throw new Error('SLOT_TAKEN');
    if (oid === nid) {
      const upd = {}; oldKeys.filter((k) => !newKeys.includes(k)).forEach((k) => { upd['cells.' + k] = fs.deleteField(); }); newKeys.forEach((k) => { upd['cells.' + k] = bookingId; }); upd.moving = bookingId;
      tx.update(fs.doc(db, 'schedules', nid), upd);
    } else {
      const del = {}; oldKeys.forEach((k) => { del['cells.' + k] = fs.deleteField(); }); del.moving = bookingId; tx.update(fs.doc(db, 'schedules', oid), del);
      tx.set(fs.doc(db, 'schedules', nid), { cells: Object.fromEntries(newKeys.map((k) => [k, bookingId])) }, { merge: true });
    }
    tx.update(bref, { start, end, rescheduleCount: 1, rescheduledAt: now, prevStart: b.start });
    tx.set(fs.doc(db, 'bookings', bookingId, 'events', 'rs-' + now), { by: user.uid, action: 'reschedule', from: b.start, to: start, at: now });
    return { start, end };
  });
}
