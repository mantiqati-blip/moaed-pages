// منطق تعديل موعد الزبونة من السيرفر بدون اعتماد على Firebase (قابل للاختبار). نفس شروط الواجهة والقواعد: مرة واحدة، قبل المهلة، نفس الموظفة والمدة.
const { toEpoch, hm, CELL, TZ_MS } = require('./plan.js');
const err = (code, msg) => Object.assign(new Error(msg), { code });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const keysFor = (startMin, durationMin) => Array.from({ length: durationMin / CELL }, (_, i) => String(startMin / CELL + i));
const split = (epoch) => { const d = new Date(epoch + TZ_MS); return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };

// booking: وثيقة الحجز الحالية. salon: وثيقة الصالون. platform: platform/settings.
function planReschedule({ booking, salon, platform, auth, req, now }) {
  if (!booking) throw err('not-found', 'NOT_FOUND');
  if (booking.customerUid !== auth.uid) throw err('permission-denied', 'NOT_YOURS');
  if (booking.status !== 'confirmed' || booking.source !== 'online') throw err('failed-precondition', 'NOT_ALLOWED');
  if (booking.rescheduleCount) throw err('failed-precondition', 'ALREADY_RESCHEDULED');
  const cutoff = Number.isFinite(platform?.cancelCutoffHours) ? platform.cancelCutoffHours : 2;
  if (booking.start - now < cutoff * 36e5) throw err('failed-precondition', 'TOO_LATE');
  if (!salon || salon.status !== 'active') throw err('failed-precondition', 'SALON_INACTIVE');
  if (!DATE.test(String(req.date)) || !Number.isInteger(req.startMin) || req.startMin < 0 || req.startMin % CELL) throw err('invalid-argument', 'BAD_TIME');
  const start = toEpoch(req.date, req.startMin), end = start + booking.durationMin * 60000;
  if (start <= now + 5 * 60000) throw err('invalid-argument', 'PAST');
  if (start > now + 30 * 864e5) throw err('invalid-argument', 'TOO_FAR');
  const h = salon.hours?.[new Date(start + TZ_MS).getUTCDay()];
  if (!h || h.off || req.startMin < hm(h.open) || req.startMin + booking.durationMin > hm(h.close)) throw err('failed-precondition', 'OUTSIDE_HOURS');
  const o = split(booking.start);
  return {
    start, end,
    oldSchedule: `${booking.staffId}_${o.date}`, oldKeys: keysFor(o.min, booking.durationMin),
    newSchedule: `${booking.staffId}_${req.date}`, newKeys: keysFor(req.startMin, booking.durationMin),
    patch: { start, end, rescheduleCount: 1, rescheduledAt: now, prevStart: booking.start },
  };
}
module.exports = { planReschedule };
