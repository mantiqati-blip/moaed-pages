const test = require('node:test'), assert = require('node:assert/strict');
const L = import('../js/notify-logic.js');
const bk = (o = {}) => ({ customerName: 'سارة', source: 'online', status: 'confirmed', staffId: 's1', start: 1000, ...o });

test('أول لقطة لا تنبّه أبدًا (baseline) لكن تحفظ الحالة', async () => {
  const { alertsFromSnapshot } = await L, prev = new Map();
  assert.deepEqual(alertsFromSnapshot('owner', 'booking', [{ type: 'added', id: 'a', data: bk() }], prev, true, {}), []);
  assert.equal(prev.size, 1);
});
test('صاحبة الصالون: حجز أونلاين جديد ينبّه، واليدوي لا', async () => {
  const { classify } = await L;
  assert.match(classify('owner', 'booking', { type: 'added', data: bk() }).text, /حجز جديد من سارة/);
  assert.equal(classify('owner', 'booking', { type: 'added', data: bk({ source: 'manual' }) }), null);
});
test('صاحبة الصالون: طلب إلغاء وتعديل موعد، ولا تنبيه على إكمال الخدمة', async () => {
  const { classify } = await L, prev = bk();
  assert.match(classify('owner', 'booking', { type: 'modified', data: bk({ status: 'cancel_requested' }), prev }).text, /طلب إلغاء/);
  assert.match(classify('owner', 'booking', { type: 'modified', data: bk({ start: 2000 }), prev }).text, /غيّرت موعدها/);
  assert.equal(classify('owner', 'booking', { type: 'modified', data: bk({ status: 'completed' }), prev }), null);
});
test('الأدمن: حجز يدخل pending_admin وطلب انضمام جديد، وليس كل تعديل', async () => {
  const { classify } = await L;
  assert.equal(classify('admin', 'application', { type: 'added', data: { salonName: 'ورد' } }).tab, 7);
  assert.equal(classify('admin', 'booking', { type: 'added', data: bk({ status: 'pending_admin' }) }).tab, 4);
  assert.equal(classify('admin', 'booking', { type: 'modified', data: bk({ status: 'pending_admin', note: 1 }), prev: bk({ status: 'pending_admin' }) }), null);
  assert.equal(classify('admin', 'application', { type: 'modified', data: {}, prev: {} }), null);
});
test('الموظفة: حجزها فقط، النقل إليها وعنها، والإلغاء', async () => {
  const { classify } = await L, ctx = { staffId: 's1' };
  assert.match(classify('staff', 'booking', { type: 'added', data: bk() }, ctx).text, /لك/);
  assert.equal(classify('staff', 'booking', { type: 'added', data: bk({ staffId: 's2' }) }, ctx), null);
  assert.match(classify('staff', 'booking', { type: 'modified', data: bk(), prev: bk({ staffId: 's2' }) }, ctx).text, /نُقل إليك/);
  assert.match(classify('staff', 'booking', { type: 'modified', data: bk({ staffId: 's2' }), prev: bk() }, ctx).text, /نُقل عنك/);
  assert.match(classify('staff', 'booking', { type: 'modified', data: bk({ status: 'cancelled' }), prev: bk() }, ctx).text, /أُلغي/);
  assert.equal(classify('staff', 'booking', { type: 'modified', data: bk({ staffId: 's2' }), prev: bk({ staffId: 's3' }) }, ctx), null);
});
test('لقطة بعد الـbaseline تنبّه مرة وتتذكر الحالة السابقة', async () => {
  const { alertsFromSnapshot } = await L, prev = new Map();
  alertsFromSnapshot('owner', 'booking', [{ type: 'added', id: 'a', data: bk() }], prev, true, {});
  const r = alertsFromSnapshot('owner', 'booking', [{ type: 'modified', id: 'a', data: bk({ status: 'cancel_requested' }) }], prev, false, {});
  assert.equal(r.length, 1); assert.equal(prev.get('a').status, 'cancel_requested');
  assert.equal(alertsFromSnapshot('owner', 'booking', [{ type: 'removed', id: 'a', data: bk() }], prev, false, {}).length, 0); assert.equal(prev.size, 0);
});
test('عدّاد «بانتظار إجراء»', async () => {
  const { pendingCount } = await L;
  assert.equal(pendingCount('admin', 'booking', [{}, {}]), 2);
  assert.equal(pendingCount('owner', 'booking', [bk(), bk({ status: 'cancel_requested' })]), 1);
  assert.equal(pendingCount('staff', 'booking', [bk()]), null);
});
