// تسديد بتأكيد الطرفين: الصالون يرسل طلب تسديد (salons/{id}/paymentRequests) والإدارة تؤكد الاستلام أو ترفض.
// التسديد الفعلي (salons/{id}/payments) لا يُنشأ إلا عند التأكيد، فكل حسابات المستحق والمتبقي والتصفير تبقى كما هي.
// منطق بدون Firebase حتى يمكن اختباره.
export const NOTE_MAX = 300;
export const STATUS = { pending: 'بانتظار تأكيد الإدارة', approved: 'تم الاستلام', rejected: 'مرفوض' };

export const parseAmount = (raw) => Number(String(raw ?? '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[,،\s]/g, ''));
export const pendingTotal = (reqs) => reqs.filter((r) => r.status === 'pending').reduce((n, r) => n + r.amount, 0);

// تحقق من طلب الصالون: المبلغ لا يتجاوز المتبقي بعد خصم طلباته المعلّقة (حتى لا يرسل طلبين لنفس المبلغ)
export function validateRequest(amount, note, remaining, pending = 0) {
  if (!Number.isInteger(amount) || amount <= 0) return 'المبلغ لازم يكون عددًا صحيحًا أكبر من صفر.';
  if (amount > remaining - pending) return pending > 0 ? 'المبلغ أكبر من المتبقي بعد طلباتك المعلّقة.' : 'المبلغ أكبر من المتبقي.';
  if (String(note ?? '').trim().length > NOTE_MAX) return `الملاحظة أطول من ${NOTE_MAX} حرفًا.`;
  return null;
}
export function buildRequest({ amount, note, uid, now }) {
  const d = { amount, by: uid, at: now, status: 'pending' }, n = String(note ?? '').trim();
  if (n) d.note = n;
  return d;
}

// تأكيد الإدارة: الطلب معلّق، والمبلغ ما زال ضمن المتبقي (قد يكون الحساب تغيّر أو صُفّر بعد الطلب)
export function validateApproval(req, remaining) {
  if (!req || req.status !== 'pending') return 'الطلب لم يعد معلّقًا.';
  if (req.amount > remaining) return 'مبلغ الطلب أكبر من المتبقي الحالي. ارفضيه واذكري السبب.';
  return null;
}
// وثيقتا الكتابة الذريّة عند التأكيد: التسديد الفعلي + تحديث الطلب (يربطه بمعرّف التسديد)
export function approvalDocs({ req, paymentId, uid, now }) {
  return { payment: { amount: req.amount, by: uid, at: now }, update: { status: 'approved', decidedAt: now, decidedBy: uid, paymentId } };
}
export function rejectUpdate(reason, uid, now) {
  const r = String(reason ?? '').trim();
  if (r.length < 3) return { error: 'اكتبي سبب الرفض (٣ أحرف على الأقل).' };
  if (r.length > NOTE_MAX) return { error: `السبب أطول من ${NOTE_MAX} حرفًا.` };
  return { update: { status: 'rejected', decision: r, decidedAt: now, decidedBy: uid } };
}
