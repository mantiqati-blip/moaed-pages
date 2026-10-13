// منطق الكوبونات بدون أي اعتماد على Firebase (قابل للاختبار بـ node --test). السيرفر هو المرجع الوحيد للخصم؛ واجهة الزبونة تعرض معاينة فقط (js/coupons.js).
// الخصم تتحمله الصالون: يُخصم من servicesTotal فقط، أما رسم الخدمة والاستقطاع فثابتان، وfinance.summarize يحسبه أصلًا (servicesTotal - discount).
const ROUND = 250, CODE = /^[A-Z0-9]{4,16}$/;
const err = (code) => Object.assign(new Error(code), { code: 'failed-precondition' });
const normCode = (s) => String(s ?? '').trim().toUpperCase();

// الخصم بالدينار (عدد صحيح). النسبة تُقرَّب لأسفل لأقرب 250 د.ع حتى لا يصير الحساب النقدي بكسور؛ ولا يتجاوز الخصم مجموع الخدمات.
function discountOf(c, total) {
  const raw = c.type === 'percent' ? Math.floor((total * c.value) / 100 / ROUND) * ROUND : c.value;
  return Math.max(0, Math.min(total, raw));
}

// coupon: وثيقة الكوبون أو null. usedByPhone: وُجد سجل استعمال لهذا الهاتف. hasPrior: عندها حجز سابق (غير ملغي) بنفس الصالون.
function planCoupon({ coupon, code, servicesTotal, now, usedByPhone = false, hasPrior = false }) {
  if (!CODE.test(normCode(code))) throw err('COUPON_INVALID');
  if (!coupon) throw err('COUPON_INVALID');
  if (coupon.active !== true) throw err('COUPON_INACTIVE');
  if (!Number.isInteger(coupon.expiresAt) || coupon.expiresAt <= now) throw err('COUPON_EXPIRED');
  if (!Number.isInteger(coupon.maxUses) || !Number.isInteger(coupon.used) || coupon.used >= coupon.maxUses) throw err('COUPON_USED_UP');
  if (usedByPhone) throw err('COUPON_ALREADY_USED');
  if (coupon.firstOnly === true && hasPrior) throw err('COUPON_FIRST_ONLY');
  if (coupon.type !== 'percent' && coupon.type !== 'fixed') throw err('COUPON_INVALID');
  if (!Number.isInteger(coupon.value) || coupon.value <= 0) throw err('COUPON_INVALID');
  const discount = discountOf(coupon, servicesTotal);
  if (discount <= 0) throw err('COUPON_INVALID');
  return { discount, couponId: normCode(code) };
}
module.exports = { planCoupon, discountOf, normCode, ROUND, CODE };
