// رسائل الدعم والإعلانات داخل المنصة (بدون إرسال خارجي). منطق بدون Firebase حتى يمكن اختباره.
// - محادثة دعم لكل صالون: salons/{id}/support/{msgId} {text, from:'owner'|'admin', by, at}
// - ملخص المحادثة للأدمن: supportThreads/{salonId} {salonName, lastText, lastFrom, lastAt, awaitingAdmin} (استعلام واحد بدل المرور على كل الصالونات)
// - الإعلانات: announcements/{id} {title, body, active, by, createdAt} يكتبها الأدمن وتقرؤها صاحبات الصالونات والموظفات
export const TEXT_MAX = 1000, TITLE_MAX = 80, BODY_MAX = 2000, PREVIEW_MAX = 120;

export function validateText(text) {
  const t = String(text ?? '').trim();
  if (!t) return 'اكتبي الرسالة أولًا.';
  if (t.length > TEXT_MAX) return `الرسالة أطول من ${TEXT_MAX} حرفًا.`;
  return null;
}
export const buildMessage = ({ text, from, uid, now }) => ({ text: String(text).trim(), from, by: uid, at: now });
// ملخص المحادثة بعد رسالة جديدة: رسالة الصالون تضع «بانتظار الأدمن»، ورد الأدمن يرفعها
export const threadAfter = ({ salonName, text, from, now }) => ({ salonName: String(salonName ?? '').slice(0, 80), lastText: String(text).trim().slice(0, PREVIEW_MAX), lastFrom: from, lastAt: now, awaitingAdmin: from === 'owner' });

export function validateAnnouncement(title, body) {
  const t = String(title ?? '').trim(), b = String(body ?? '').trim();
  if (t.length < 3) return 'عنوان الإعلان قصير (٣ أحرف على الأقل).';
  if (t.length > TITLE_MAX) return `العنوان أطول من ${TITLE_MAX} حرفًا.`;
  if (b.length < 3) return 'اكتبي نص الإعلان.';
  if (b.length > BODY_MAX) return `النص أطول من ${BODY_MAX} حرفًا.`;
  return null;
}
export const buildAnnouncement = ({ title, body, uid, now }) => ({ title: String(title).trim(), body: String(body).trim(), active: true, by: uid, createdAt: now });

// الإعلانات الظاهرة للصالون: الفعّالة فقط، الأحدث أولًا
export const visibleAnnouncements = (list, n = 10) => list.filter((a) => a.active).sort((x, y) => y.createdAt - x.createdAt).slice(0, n);
export const byTime = (msgs) => msgs.slice().sort((a, b) => a.at - b.at);
// رسائل جديدة من الإدارة للصالون منذ آخر فتح لتبويب الرسائل
export const unreadFromAdmin = (msgs, seenAt = 0) => msgs.filter((m) => m.from === 'admin' && m.at > seenAt).length;
// ترتيب محادثات الأدمن: التي تنتظر ردًا أولًا ثم الأحدث
export const sortThreads = (threads) => threads.slice().sort((a, b) => (b.awaitingAdmin ? 1 : 0) - (a.awaitingAdmin ? 1 : 0) || b.lastAt - a.lastAt);
