// منطق قبول الزبونة لنقل اقترحه الصالون، بدون اعتماد على Firebase (قابل للاختبار). لا يستهلك تعديلها الوحيد.
const { CELL, TZ_MS } = require('./plan.js');
const err = (code, msg) => Object.assign(new Error(msg), { code });
const keysFor = (startMin, durationMin) => Array.from({ length: durationMin / CELL }, (_, i) => String(startMin / CELL + i));
const split = (epoch) => { const d = new Date(epoch + TZ_MS); return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };

// newStaff: وثيقة الموظفة المقترحة (أو null إن لم توجد). deleteMark: قيمة حذف الحقل (FieldValue.delete() بالسيرفر).
function planAcceptMove({ booking, newStaff, auth, now, deleteMark }) {
  if (!booking) throw err('not-found', 'NOT_FOUND');
  if (booking.customerUid !== auth.uid) throw err('permission-denied', 'NOT_YOURS');
  const p = booking.moveProposal;
  if (booking.status !== 'confirmed' || !p) throw err('failed-precondition', 'NOT_ALLOWED');
  if (p.start <= now + 5 * 60000) throw err('failed-precondition', 'PAST');
  if (!Number.isInteger(booking.durationMin) || booking.durationMin <= 0 || booking.durationMin % CELL) throw err('failed-precondition', 'BAD_DURATION');
  if (p.end !== p.start + booking.durationMin * 60000) throw err('failed-precondition', 'BAD_PROPOSAL');
  if (!newStaff || newStaff.status !== 'active') throw err('failed-precondition', 'STAFF_INACTIVE');
  const o = split(booking.start), n = split(p.start);
  if (n.min % CELL) throw err('failed-precondition', 'BAD_PROPOSAL');
  return {
    start: p.start, end: p.end, reason: p.reason || null,
    oldSchedule: `${booking.staffId}_${o.date}`, oldKeys: keysFor(o.min, booking.durationMin),
    newSchedule: `${p.staffId}_${n.date}`, newKeys: keysFor(n.min, booking.durationMin),
    patch: { start: p.start, end: p.end, staffId: p.staffId, moveProposal: deleteMark, movedAt: now, prevStart: booking.start },
  };
}
module.exports = { planAcceptMove };
