// نسخة احتياطية كاملة من بيانات المنصة بملف JSON واحد، يقرؤها الأدمن من المتصفح (لا تحتاج Blaze ولا أدوات).
// الصيغة: { app, version, at, counts, errors, collections: { 'مسار/المجموعة': { معرّف: بيانات } } } والمواعيد (Timestamp) تُحفظ { __ts: ميلي ثانية }.
// لا تشمل: حسابات الدخول (Firebase Auth)، وسجل أحداث الحجوزات (events)، وسجلات استعمال الكوبونات (uses). للنسخ الكامل استعملي تصدير Firestore (انظري DEPLOY.md).
export const TOP = ['users', 'platform', 'governorates', 'areas', 'publicSalons', 'salonPrivate', 'applications', 'announcements', 'supportThreads', 'audit', 'bookings', 'schedules'];
export const SALON_SUB = ['services', 'staff', 'payments', 'paymentRequests', 'periods', 'support', 'reviews', 'coupons'];
export const OPEN = ['confirmed', 'cancel_requested', 'pending_admin'];       // حجوزات ما زال رمز إكمالها مطلوبًا

export function serialize(v) {
  if (v == null) return v === undefined ? undefined : null;
  if (typeof v === 'object' && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map((x) => serialize(x) ?? null);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialize(x)]).filter(([, x]) => x !== undefined));
  return typeof v === 'number' && !Number.isFinite(v) ? null : v;
}
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, data: d.data() }));
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
// F = وحدة firebase-firestore، db = قاعدة البيانات. تُحقن لتسهيل الاختبار.
export async function readAll({ F, db, onProgress = () => {} }) {
  const parts = {}, errors = [];
  const get = async (path) => {
    try { parts[path] = rows(await F.getDocs(F.collection(db, ...path.split('/')))); } catch (e) { parts[path] = []; errors.push(`${path}: ${e?.code || e?.message || e}`); }
    onProgress(path); return parts[path];
  };
  for (const c of TOP) await get(c);
  const salons = await get('salons');
  await pool(salons, 4, async (s) => {
    for (const sub of SALON_SUB) { const L = await get(`salons/${s.id}/${sub}`); if (sub === 'periods') for (const p of L) await get(`salons/${s.id}/periods/${p.id}/objections`); }
  });
  const open = (parts.bookings || []).filter((b) => OPEN.includes(b.data.status));
  await pool(open, 20, async (b) => {
    try { const d = await F.getDoc(F.doc(db, 'bookings', b.id, 'private', 'code')); if (d.exists()) parts[`bookings/${b.id}/private`] = [{ id: 'code', data: d.data() }]; }
    catch (e) { errors.push(`bookings/${b.id}/private: ${e?.code || e?.message || e}`); }
  });
  onProgress('');
  return { parts, errors };
}
export function buildBackup({ parts, errors = [] }, now = Date.now()) {
  const collections = {}, counts = {};
  for (const [path, L] of Object.entries(parts)) {
    if (!L.length) continue;
    collections[path] = Object.fromEntries(L.map((r) => [r.id, serialize(r.data)])); counts[path] = L.length;
  }
  return { app: 'moaed', version: 1, at: now, total: Object.values(counts).reduce((a, b) => a + b, 0), counts, errors, collections };
}
export const backupName = (now = Date.now()) => 'moaed-backup-' + new Date(now + 3 * 36e5).toISOString().slice(0, 16).replace('T', '-').replace(':', '') + '.json';
export const sizeText = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB');
