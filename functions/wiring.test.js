// يختبر ربط index.js بـ Firestore على نسخة وهمية بالذاكرة (ليست المحاكي الرسمي): يتحقق من ترتيب القراءة قبل الكتابة، ودمج الخلايا، وحذفها، ورفض التعارض.
const test = require('node:test'), assert = require('node:assert'), Module = require('node:module');
const DEL = { __del: true }, store = new Map();
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const clone = (x) => JSON.parse(JSON.stringify(x));
function mergeInto(t, p) { for (const [k, v] of Object.entries(p)) { if (v === DEL) delete t[k]; else if (v && typeof v === 'object') { t[k] = t[k] && typeof t[k] === 'object' ? t[k] : {}; mergeInto(t[k], v); } else t[k] = v; } return t; }
function setDotted(t, key, v) { const ps = key.split('.'); let o = t; ps.slice(0, -1).forEach((p) => { o[p] = o[p] || {}; o = o[p]; }); if (v === DEL) delete o[ps.at(-1)]; else o[ps.at(-1)] = v; }
const snap = (path) => ({ exists: store.has(path), id: path.split('/').pop(), data: () => clone(store.get(path)) });
const ref = (path) => ({ path, collection: (n) => colRef(`${path}/${n}`), get: async () => snap(path) });
const colRef = (path) => { const f = []; const q = { path, doc: (id) => ref(`${path}/${id ?? 'auto' + store.size}`), where(k, o, v) { f.push([k, o, v]); return q; }, limit() { return q; }, _run() { const docs = [...store.keys()].filter((p) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/')).filter((p) => f.every(([k, o, v]) => { const x = store.get(p)[k]; return o === '==' ? x === v : o === '>' ? x > v : true; })).map((p) => snap(p)); return { docs, size: docs.length }; } }; return q; };
const fakeDb = {
  doc: ref, collection: colRef,
  async runTransaction(fn) {
    const writes = []; let wrote = false;
    const tx = {
      async get(x) { if (wrote) throw new Error('READ_AFTER_WRITE'); return x._run ? x._run() : snap(x.path); },
      set(r, d, o) { wrote = true; writes.push(() => { if (o && o.merge) store.set(r.path, mergeInto(store.has(r.path) ? clone(store.get(r.path)) : {}, d)); else store.set(r.path, clone(d)); }); },
      update(r, d) { wrote = true; writes.push(() => { if (!store.has(r.path)) throw new Error('NO_DOC'); const t = clone(store.get(r.path)); Object.entries(d).forEach(([k, v]) => setDotted(t, k, v)); store.set(r.path, t); }); },
    };
    const out = await fn(tx); writes.forEach((w) => w()); return out;
  },
};
const orig = Module._load;
Module._load = function (req, ...a) {
  if (req === 'firebase-functions/v2/https') return { onCall: (_o, h) => h, HttpsError };
  if (req === 'firebase-admin/app') return { initializeApp() {} };
  if (req === 'firebase-admin/firestore') return { getFirestore: () => fakeDb, FieldValue: { delete: () => DEL } };
  return orig.call(this, req, ...a);
};
const fns = require('./index.js'), { toEpoch } = require('./plan.js');
const now = Date.now(), day = (n) => new Date(now + 3 * 36e5 + n * 864e5).toISOString().slice(0, 10);
const hours = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [i, { open: '09:00', close: '20:00' }]));
const ID = 'b'.repeat(20), ID2 = 'c'.repeat(20), auth = (uid) => ({ auth: { uid, token: {} } });
const reset = () => {
  store.clear();
  store.set('salons/sal', { status: 'active', hours, customerFee: 1000, salonCut: 500 }); store.set('platform/settings', { cancelCutoffHours: 2 });
  store.set('salons/sal/staff/s1', { status: 'active' }); store.set('salons/sal/staff/s2', { status: 'active' });
  store.set('salons/sal/services/v1', { name: 'قص', price: 10000, durationMin: 60, active: true });
};
const put = (id, o = {}) => { const st = toEpoch(day(3), 720); store.set(`bookings/${id}`, { customerUid: 'u1', customerPhone: '07701234567', status: 'confirmed', source: 'online', salonId: 'sal', staffId: 's1', durationMin: 60, start: st, end: st + 36e5, ...o }); store.set(`schedules/s1_${day(3)}`, { cells: { 48: id, 49: id, 50: id, 51: id } }); };
const fails = async (p, code, msg) => { try { await p; } catch (e) { assert.equal(e.code, code); assert.equal(e.message, msg); return; } assert.fail('لم يفشل'); };

test('createBooking: ينشئ حجزًا ويكتب الخلايا والرمز', async () => {
  reset();
  const r = await fns.createBooking({ ...auth('u1'), data: { idempotencyKey: ID, salonId: 'sal', staffId: 's1', serviceIds: ['v1'], date: day(3), startMin: 720, customerName: 'سارة أحمد', customerPhone: '07701234567' } });
  assert.match(r.code, /^\d{4}$/); assert.deepEqual(Object.keys(store.get(`schedules/s1_${day(3)}`).cells), ['48', '49', '50', '51']);
  assert.equal(store.get(`bookings/${ID}`).customerFee, 1000); assert.ok(store.has(`bookings/${ID}/private/code`));
  const again = await fns.createBooking({ ...auth('u1'), data: { idempotencyKey: ID, salonId: 'sal', staffId: 's1', serviceIds: ['v1'], date: day(3), startMin: 720, customerName: 'سارة أحمد', customerPhone: '07701234567' } });
  assert.equal(again.duplicate, true);
});
test('createBooking: وقت مأخوذ يفشل', async () => {
  reset(); put(ID);
  await fails(fns.createBooking({ ...auth('u2'), data: { idempotencyKey: ID2, salonId: 'sal', staffId: 's1', serviceIds: ['v1'], date: day(3), startMin: 735, customerName: 'ليلى حسن', customerPhone: '07711234567' } }), 'aborted', 'SLOT_TAKEN');
});
test('rescheduleBooking: يحرّر القديمة ويثبّت الجديدة ويستهلك التعديل', async () => {
  reset(); put(ID);
  const r = await fns.rescheduleBooking({ ...auth('u1'), data: { bookingId: ID, date: day(4), startMin: 840 } });
  assert.equal(r.start, toEpoch(day(4), 840));
  assert.deepEqual(store.get(`schedules/s1_${day(3)}`).cells, {}); assert.deepEqual(Object.keys(store.get(`schedules/s1_${day(4)}`).cells), ['56', '57', '58', '59']);
  const b = store.get(`bookings/${ID}`); assert.equal(b.rescheduleCount, 1); assert.equal(b.start, r.start);
  await fails(fns.rescheduleBooking({ ...auth('u1'), data: { bookingId: ID, date: day(5), startMin: 840 } }), 'failed-precondition', 'ALREADY_RESCHEDULED');
});
test('rescheduleBooking: نفس اليوم بتداخل (١٢:٠٠ إلى ١٢:١٥) يحتفظ بالخلايا المشتركة', async () => {
  reset(); put(ID);
  await fns.rescheduleBooking({ ...auth('u1'), data: { bookingId: ID, date: day(3), startMin: 735 } });
  assert.deepEqual(Object.keys(store.get(`schedules/s1_${day(3)}`).cells).sort(), ['49', '50', '51', '52']);
});
test('rescheduleBooking: وقت محجوز لغيرها يفشل ولا يغيّر شيئًا', async () => {
  reset(); put(ID); store.set(`schedules/s1_${day(4)}`, { cells: { 57: 'other' } });
  await fails(fns.rescheduleBooking({ ...auth('u1'), data: { bookingId: ID, date: day(4), startMin: 840 } }), 'aborted', 'SLOT_TAKEN');
  assert.equal(Object.keys(store.get(`schedules/s1_${day(3)}`).cells).length, 4); assert.equal(store.get(`bookings/${ID}`).rescheduleCount, undefined);
});
test('acceptMove: ينقل لموظفة أخرى ويحذف الاقتراح بدون استهلاك التعديل', async () => {
  reset(); const st = toEpoch(day(5), 840); put(ID, { moveProposal: { start: st, end: st + 36e5, staffId: 's2', reason: 'غياب', by: 'o1', at: now } });
  await fns.acceptMove({ ...auth('u1'), data: { bookingId: ID } });
  const b = store.get(`bookings/${ID}`); assert.equal(b.staffId, 's2'); assert.equal(b.moveProposal, undefined); assert.equal(b.rescheduleCount, undefined); assert.equal(b.start, st);
  assert.deepEqual(store.get(`schedules/s1_${day(3)}`).cells, {}); assert.deepEqual(Object.keys(store.get(`schedules/s2_${day(5)}`).cells), ['56', '57', '58', '59']);
});
test('acceptMove: زبونة أخرى مرفوضة', async () => {
  reset(); const st = toEpoch(day(5), 840); put(ID, { moveProposal: { start: st, end: st + 36e5, staffId: 's2', reason: 'x', by: 'o1', at: now } });
  await fails(fns.acceptMove({ ...auth('u9'), data: { bookingId: ID } }), 'permission-denied', 'NOT_YOURS');
});
test('acceptMove: الوقت المقترح محجوز لغيرها يفشل ولا يغيّر شيئًا', async () => {
  reset(); const st = toEpoch(day(5), 840); put(ID, { moveProposal: { start: st, end: st + 36e5, staffId: 's2', reason: 'x', by: 'o1', at: now } });
  store.set(`schedules/s2_${day(5)}`, { cells: { 58: 'other' } });
  await fails(fns.acceptMove({ ...auth('u1'), data: { bookingId: ID } }), 'aborted', 'SLOT_TAKEN');
  const b = store.get(`bookings/${ID}`); assert.equal(b.staffId, 's1'); assert.ok(b.moveProposal); assert.equal(Object.keys(store.get(`schedules/s1_${day(3)}`).cells).length, 4);
});

// ---- closePeriod ----
const done = (id, at, o = {}) => store.set(`bookings/${id}`, { salonId: 'sal', status: 'completed', source: 'online', completedAt: at, servicesTotal: 10000, discount: 0, customerFee: 1000, salonCut: 2000, ...o });
const admin = () => { store.set('users/adm', { role: 'admin', status: 'active' }); store.set('users/own', { role: 'owner', status: 'active' }); };
const periods = () => [...store.keys()].filter((p) => /^salons\/sal\/periods\/[^/]+$/.test(p));
test('closePeriod: الأدمن يصفّر حسابًا متوازنًا ويُكتب سجل التدقيق', async () => {
  reset(); admin(); done('a', now - 5000); done('b', now - 4000);
  store.set('salons/sal/payments/p1', { amount: 6000, by: 'adm', at: now - 3000 });
  const r = await fns.closePeriod({ ...auth('adm'), data: { salonId: 'sal' } });
  assert.deepEqual([r.count, r.due, r.paid, r.remaining, r.net, r.from], [2, 6000, 6000, 0, 16000, 0]);
  assert.equal(periods().length, 1); assert.equal(store.get(periods()[0]).closedBy, 'adm');
  assert.ok([...store.keys()].some((p) => p.startsWith('audit/') && store.get(p).action === 'period.close'));
});
test('closePeriod: غير الأدمن مرفوض ولا يُكتب شيء', async () => {
  reset(); admin(); done('a', now - 5000); store.set('salons/sal/payments/p1', { amount: 3000, by: 'adm', at: now - 3000 });
  await fails(fns.closePeriod({ ...auth('own'), data: { salonId: 'sal' } }), 'permission-denied', 'ADMIN_ONLY');
  assert.equal(periods().length, 0);
});
test('closePeriod: المتبقي ليس صفرًا يُرفض', async () => {
  reset(); admin(); done('a', now - 5000); store.set('salons/sal/payments/p1', { amount: 2999, by: 'adm', at: now - 3000 });
  await fails(fns.closePeriod({ ...auth('adm'), data: { salonId: 'sal' } }), 'failed-precondition', 'REMAINING_NOT_ZERO');
  assert.equal(periods().length, 0);
});
test('closePeriod: الفترة الثانية لا تعدّ القديم مرة ثانية', async () => {
  reset(); admin(); done('a', now - 5000); store.set('salons/sal/payments/p1', { amount: 3000, by: 'adm', at: now - 3000 });
  const first = await fns.closePeriod({ ...auth('adm'), data: { salonId: 'sal' } });
  await new Promise((r) => setTimeout(r, 5));
  done('b', Date.now() - 1, { customerFee: 500, salonCut: 500 }); store.set('salons/sal/payments/p2', { amount: 1000, by: 'adm', at: Date.now() - 1 });
  const second = await fns.closePeriod({ ...auth('adm'), data: { salonId: 'sal' } });
  assert.deepEqual([second.count, second.due, second.from], [1, 1000, first.closedAt]); assert.equal(periods().length, 2);
});
