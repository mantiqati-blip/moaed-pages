// نصوص مشتركة بين الصفحات (بداية ملف النصوص الموحد). رسائل أخطاء Firebase بالعربي مع بقاء الرمز الأصلي بين قوسين لتسهيل الدعم.
export const ERR = {
  'permission-denied': 'ليس لديك صلاحية لهذا الإجراء، أو أن قواعد الحماية لم تُنشر بعد',
  'unavailable': 'تعذر الاتصال بالخادم، تأكدي من الإنترنت وأعيدي المحاولة',
  'deadline-exceeded': 'انتهت مهلة الاتصال، أعيدي المحاولة',
  'not-found': 'العنصر المطلوب غير موجود',
  'already-exists': 'العنصر موجود مسبقًا',
  'failed-precondition': 'لا يمكن تنفيذ الإجراء بالحالة الحالية',
  'resource-exhausted': 'تم تجاوز الحد المسموح، أعيدي المحاولة لاحقًا',
  'unauthenticated': 'انتهت جلستك، سجّلي الدخول من جديد',
  'aborted': 'تعارض مع عملية أخرى، أعيدي المحاولة',
  'auth/network-request-failed': 'تعذر الاتصال بالإنترنت',
  'auth/too-many-requests': 'محاولات كثيرة، أعيدي لاحقًا',
  'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
  'auth/email-already-in-use': 'اسم المستخدم مستعمل مسبقًا',
};
export const errText = (e) => { const c = e && (e.code || e.message); return ERR[c] ? `${ERR[c]} (${c})` : String(c || 'خطأ غير معروف'); };
