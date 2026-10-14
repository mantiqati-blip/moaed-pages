const test = require('node:test'), assert = require('node:assert/strict');
const M = import('../js/backup.js');
const ts = (ms) => ({ toMillis: () => ms });
// Firestore وهمي: store = { 'path': [[id, data]] }، deny = مسارات ترمي permission-denied
const fake = (store, deny = []) => ({
  collection: (_, ...s) => ({ path: s.join('/') }), doc: (_, ...s) => ({ path: s.join('/') }),
  getDocs: async (r) => { if (deny.includes(r.path)) throw Object.assign(new Error('x'), { code: 'permission-denied' }); return { docs: (store[r.path] || []).map(([id, d]) => ({ id, data: () => d })) }; },
  getDoc: async (r) => { const [col, id, , sub] = r.path.split('/'), f = (store[`${col}/${id}/private`] || []).find(([i]) => i === sub); return { exists: () => !!f, data: () => f?.[1] }; },
});
test('serialize: Timestamp ومصفوفات متداخلة، وتُحذف undefined وتُحوَّل NaN إلى null', async () => {
  const { serialize } = await M;
  assert.deepEqual(serialize({ a: ts(5), b: [1, { c: ts(7) }, undefined], d: undefined, e: NaN, f: null, g: 'نص' }), { a: { __ts: 5 }, b: [1, { c: { __ts: 7 } }, null], e: null, f: null, g: 'نص' });
});
test('readAll: يقرأ المجموعات العليا وفرعيات كل صالون وفترات/اعتراضاتها', async () => {
  const { readAll, buildBackup } = await M;
  const F = fake({ users: [['u1', { role: 'admin' }]], salons: [['s1', { name: 'أ', createdAt: ts(9) }], ['s2', { name: 'ب' }]], 'salons/s1/services': [['v1', { price: 5 }]], 'salons/s2/reviews': [['b1', { rating: 5 }]],
    'salons/s1/periods': [['p1', { closedAt: 1 }]], 'salons/s1/periods/p1/objections': [['main', { reason: 'x' }]], bookings: [['b1', { status: 'confirmed' }]] });
  const r = await readAll({ F, db: {} }), B = buildBackup(r, 1700000000000);
  assert.deepEqual(r.errors, []); assert.equal(B.collections.salons.s1.createdAt.__ts, 9);
  assert.deepEqual(Object.keys(B.collections).sort(), ['bookings', 'salons', 'salons/s1/periods', 'salons/s1/periods/p1/objections', 'salons/s1/services', 'salons/s2/reviews', 'users']);   // الفارغ لا يُكتب
  assert.equal(B.total, 8); assert.equal(B.counts['salons/s1/services'], 1); assert.equal(B.version, 1);
});
test('رموز الإكمال: للحجوزات المفتوحة فقط', async () => {
  const { readAll, buildBackup } = await M;
  const F = fake({ bookings: [['o1', { status: 'confirmed' }], ['o2', { status: 'pending_admin' }], ['d1', { status: 'completed' }], ['c1', { status: 'cancelled' }]],
    'bookings/o1/private': [['code', { code: '1234' }]], 'bookings/d1/private': [['code', { code: '9999' }]] });
  const B = buildBackup(await readAll({ F, db: {} }));
  assert.deepEqual(B.collections['bookings/o1/private'], { code: { code: '1234' } });
  assert.equal('bookings/d1/private' in B.collections, false); assert.equal('bookings/o2/private' in B.collections, false);
});
test('فشل مجموعة لا يوقف النسخة: يُسجَّل بـ errors ويُكمل الباقي', async () => {
  const { readAll, buildBackup } = await M;
  const F = fake({ users: [['u1', {}]], salons: [['s1', {}]], 'salons/s1/payments': [['p', { amount: 1 }]] }, ['audit', 'salons/s1/support']);
  const B = buildBackup(await readAll({ F, db: {} }));
  assert.deepEqual(B.errors, ['audit: permission-denied', 'salons/s1/support: permission-denied']); assert.equal(B.counts['salons/s1/payments'], 1);
});
test('تقدّم القراءة، واسم الملف بتوقيت بغداد، وحجم مقروء', async () => {
  const { readAll, backupName, sizeText } = await M, seen = [];
  await readAll({ F: fake({}), db: {}, onProgress: (p) => seen.push(p) });
  assert.equal(seen[0], 'users'); assert.equal(seen.at(-1), '');
  assert.equal(backupName(Date.UTC(2026, 9, 14, 21, 5)), 'moaed-backup-2026-10-15-0005.json');   // 21:05 UTC = 00:05 بغداد
  assert.equal(sizeText(100), '1 KB'); assert.equal(sizeText(2048), '2 KB'); assert.equal(sizeText(3 * 1048576), '3.0 MB');
});
