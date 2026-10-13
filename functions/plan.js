// منطق إنشاء الحجز بدون أي اعتماد على Firebase (قابل للاختبار بـ node --test). كل الأرقام تُحسب هنا من بيانات السيرفر، لا من العميل.
const CELL = 15, TZ_MS = 3 * 36e5, PHONE = /^07[3-9][0-9]{8}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
const toEpoch = (d, m) => { const [y, mo, da] = d.split('-').map(Number); return Date.UTC(y, mo - 1, da) + m * 60000 - TZ_MS; };
const feeOf = (salon, platform, k) => (Number.isInteger(salon?.[k]) ? salon[k] : platform?.[k]);
const err = (code, msg) => Object.assign(new Error(msg), { code });

function planBooking({ salon, platform, staff, services, req, auth, now }) {
  if (!salon || salon.status !== 'active') throw err('failed-precondition', 'SALON_INACTIVE');
  if (!staff || staff.status !== 'active') throw err('failed-precondition', 'STAFF_INACTIVE');
  const name = String(req.customerName || '').trim(), phone = String(req.customerPhone || '').trim();
  if (name.length < 3 || name.length > 80) throw err('invalid-argument', 'BAD_NAME');
  if (!PHONE.test(phone)) throw err('invalid-argument', 'BAD_PHONE');
  if (platform?.requirePhoneOtp === true && (auth?.token?.phone_number || '').replace('+964', '0') !== phone) throw err('permission-denied', 'PHONE_NOT_VERIFIED');
  if (!DATE.test(String(req.date)) || !Number.isInteger(req.startMin) || req.startMin < 0 || req.startMin % CELL) throw err('invalid-argument', 'BAD_TIME');
  if (!Array.isArray(req.serviceIds) || !req.serviceIds.length || req.serviceIds.length > 10 || new Set(req.serviceIds).size !== req.serviceIds.length) throw err('invalid-argument', 'BAD_SERVICES');
  const picked = req.serviceIds.map((id) => services.find((s) => s.id === id && s.active));
  if (picked.some((s) => !s)) throw err('invalid-argument', 'SERVICE_UNAVAILABLE');
  const durationMin = picked.reduce((n, s) => n + s.durationMin, 0);
  if (!Number.isInteger(durationMin) || durationMin <= 0 || durationMin % CELL) throw err('invalid-argument', 'BAD_DURATION');
  const start = toEpoch(req.date, req.startMin), end = start + durationMin * 60000;
  if (start <= now + 5 * 60000) throw err('invalid-argument', 'PAST');
  if (start > now + 30 * 864e5) throw err('invalid-argument', 'TOO_FAR');
  const h = salon.hours?.[new Date(start + TZ_MS).getUTCDay()];
  if (!h || h.off || req.startMin < hm(h.open) || req.startMin + durationMin > hm(h.close)) throw err('failed-precondition', 'OUTSIDE_HOURS');
  const customerFee = feeOf(salon, platform, 'customerFee'), salonCut = feeOf(salon, platform, 'salonCut');
  if (!Number.isInteger(customerFee) || !Number.isInteger(salonCut)) throw err('failed-precondition', 'NOT_CONFIGURED');
  const first = req.startMin / CELL, keys = Array.from({ length: durationMin / CELL }, (_, i) => String(first + i));
  return {
    keys,
    booking: {
      customerUid: auth.uid, customerName: name, customerPhone: phone, salonId: salon.id, staffId: staff.id,
      services: picked.map((s) => ({ id: s.id, name: s.name, price: s.price, durationMin: s.durationMin })),
      start, end, durationMin, servicesTotal: picked.reduce((n, s) => n + s.price, 0), customerFee, salonCut, discount: 0,
      status: 'confirmed', source: 'online', src: req.src ?? null, createdAt: now,
    },
  };
}
module.exports = { planBooking, toEpoch, hm, CELL, TZ_MS };
