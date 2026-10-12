// يحوّل نتائج الفحوصات إلى قائمة مقروءة. ok: true/false/null (null = لم يُفحص أو غير معروف)
export function evaluate(r) {
  const L = [], add = (name, ok, hint = '') => L.push({ name, ok, hint });
  add('ملف الإعدادات firebase-config.js', r.configured, 'الصقي firebaseConfig في public/js/firebase-config.js');
  if (!r.configured) return L;
  add('الدخول المجهول (Anonymous) مفعّل', r.anonOk, 'فعّليه من Authentication ثم Sign-in method');
  add('قراءة platform/settings', r.settings?.ok, 'شغّلي seed.js، وتأكدي من نشر القواعد');
  if (r.settings?.ok) add('رسم الخدمة والاستقطاع أعداد صحيحة', Number.isInteger(r.settings.fee) && Number.isInteger(r.settings.cut), 'الإعدادات ناقصة أو غير صحيحة');
  add('المحافظات (١٩) والمناطق', r.geo?.ok && r.geo.gov >= 19 && r.geo.areas >= 100, `وُجد: ${r.geo?.gov ?? 0} محافظة و${r.geo?.areas ?? 0} منطقة. شغّلي seed.js`);
  add('حساب الدخول: دور admin وحالة active', r.me?.signedIn ? r.me.role === 'admin' && r.me.status === 'active' : null, r.me?.signedIn ? `الدور الحالي: ${r.me.role || 'لا وثيقة'}` : 'سجّلي الدخول من login.html لفحص الأدمن');
  // اختبارات الأمان السلبية: المطلوب أن تُرفض
  add('الأمان: غير الأدمن لا يكتب في platform', r.denied?.platformWrite, 'خطر: القواعد تسمح بالكتابة. احذفي الوثيقة platform/_probe وأعيدي نشر القواعد');
  add('الأمان: لا ترقية للنفس إلى أدمن', r.denied?.selfAdmin, 'خطر: ممكن لأي مستخدم أن يجعل نفسه أدمن!');
  add('الأمان: حجز برسم خاطئ يُرفض', r.denied?.badBooking, 'خطر: احذفي bookings/_probe وراجعي القواعد');
  return L;
}
export const verdict = (L) => L.some((x) => x.ok === false) ? 'fail' : L.some((x) => x.ok === null) ? 'partial' : 'pass';
