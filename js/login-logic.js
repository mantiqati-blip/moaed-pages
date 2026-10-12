export const USER_RE = /^[a-z0-9]+$/;
// اسم المستخدم داخليًا بريد وهمي، ولا يراه المستخدم
export function usernameToEmail(u) {
  const s = String(u || '').trim().toLowerCase();
  if (!USER_RE.test(s)) throw new Error('BAD_USERNAME');
  return `${s}@local.salon`;
}
export const homeFor = (role) => ({ admin: 'admin.html', owner: 'owner.html', staff: 'owner.html' }[role] || null);
export function authErrorMessage(code) {
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) return 'اسم المستخدم أو كلمة السر غير صحيحة.';
  if (code === 'auth/too-many-requests') return 'محاولات كثيرة، حاولي بعد قليل.';
  if (code === 'auth/network-request-failed') return 'تأكدي من اتصال الإنترنت وأعيدي المحاولة.';
  if (code === 'auth/user-disabled') return 'الحساب موقوف، تواصلي مع الإدارة.';
  return 'تعذر تسجيل الدخول، أعيدي المحاولة.';
}
// قفل مؤقت بعد ٥ محاولات فاشلة (حماية خفيفة من الواجهة؛ Firebase يحد المحاولات أيضًا)
export const LOCK = { max: 5, ms: 15 * 60e3 };
export function lockState(rec, now) {
  if (!rec) return { locked: false, left: 0 };
  return rec.until > now ? { locked: true, left: Math.ceil((rec.until - now) / 60e3) } : { locked: false, left: 0 };
}
export function afterFailure(rec, now) {
  const n = ((rec && rec.until > now) ? 0 : (rec?.n || 0)) + 1;
  return n >= LOCK.max ? { n: 0, until: now + LOCK.ms } : { n, until: 0 };
}
