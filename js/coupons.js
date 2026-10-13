// الكوبونات من جهة الواجهة (بدون Firebase): إنشاء كوبون من صاحبة الصالون، ومعاينة الخصم للزبونة. المرجع الفعلي للخصم دالة createBooking (functions/coupon.js)؛ اختبار يضمن تطابق الحساب.
export const ROUND = 250, CODE = /^[A-Z0-9]{4,16}$/, PCT_MAX = 90, FIXED_MAX = 10000000, LABEL_MAX = 60;
export const normCode = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim().toUpperCase();
// رمز عشوائي بلا حروف ملتبسة (O/0 وI/1)
export const genCode = (rnd = Math.random) => Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(rnd() * 31)]).join('');
export function discountOf(c, total) {
  const raw = c.type === 'percent' ? Math.floor((total * c.value) / 100 / ROUND) * ROUND : c.value;
  return Math.max(0, Math.min(total, raw));
}
export const MSG = {
  COUPON_INVALID: 'الكود غير صحيح.', COUPON_INACTIVE: 'هذا الكود موقوف.', COUPON_EXPIRED: 'انتهت صلاحية هذا الكود.', COUPON_USED_UP: 'انتهى عدد مرات استعمال هذا الكود.',
  COUPON_ALREADY_USED: 'استعملتِ هذا الكود من قبل.', COUPON_FIRST_ONLY: 'هذا الكود لأول حجز بهذا الصالون فقط.',
};
// معاينة للزبونة: تفحص ما تعرفه الواجهة فقط (الاستعمال السابق بهذا الهاتف وأول حجز يتحققهما السيرفر عند التأكيد)
export function previewCoupon(coupon, code, servicesTotal, now = Date.now()) {
  if (!CODE.test(normCode(code)) || !coupon) return { error: MSG.COUPON_INVALID };
  if (coupon.active !== true) return { error: MSG.COUPON_INACTIVE };
  if (!(coupon.expiresAt > now)) return { error: MSG.COUPON_EXPIRED };
  if (!(coupon.used < coupon.maxUses)) return { error: MSG.COUPON_USED_UP };
  const discount = discountOf(coupon, servicesTotal);
  return discount > 0 ? { discount, couponId: normCode(code) } : { error: MSG.COUPON_INVALID };
}
// وصف قصير للخصم: «خصم 20٪» أو «خصم 5,000 د.ع»
export const describe = (c) => c.type === 'percent' ? `خصم ${c.value}٪` : `خصم ${Number(c.value).toLocaleString('en')} د.ع`;
export function validateCoupon({ code, type, value, maxUses, days, label }) {
  if (!CODE.test(normCode(code))) return 'الكود ٤ إلى ١٦ خانة، حروف إنكليزية كبيرة وأرقام فقط.';
  if (type !== 'percent' && type !== 'fixed') return 'اختاري نوع الخصم.';
  if (!Number.isInteger(value) || value <= 0) return 'قيمة الخصم لازم تكون عددًا صحيحًا أكبر من صفر.';
  if (type === 'percent' && value > PCT_MAX) return `النسبة لا تتجاوز ${PCT_MAX}٪.`;
  if (type === 'fixed' && value > FIXED_MAX) return 'قيمة الخصم كبيرة جدًا.';
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000) return 'عدد مرات الاستعمال بين ١ و١٠٠٠٠٠.';
  if (![7, 14, 30, 60, 90].includes(days)) return 'اختاري مدة الصلاحية.';
  if (String(label ?? '').length > LABEL_MAX) return `الوصف أقصاه ${LABEL_MAX} حرفًا.`;
  return null;
}
export function buildCoupon({ code, type, value, maxUses, days, firstOnly = false, isPublic = false, label = '', now }) {
  const c = { code: normCode(code), type, value, maxUses, used: 0, expiresAt: now + days * 864e5, firstOnly: !!firstOnly, public: !!isPublic, active: true, createdAt: now };
  const l = String(label ?? '').trim(); if (l) c.label = l;
  return c;
}
export const couponState = (c, now = Date.now()) => c.active !== true ? 'off' : c.expiresAt <= now ? 'expired' : c.used >= c.maxUses ? 'used_up' : 'live';
