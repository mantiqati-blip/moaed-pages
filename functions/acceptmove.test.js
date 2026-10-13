const test = require('node:test'), assert = require('node:assert');
const { planAcceptMove } = require('./acceptmove.js'), { toEpoch } = require('./plan.js');
const now = toEpoch('2026-10-13', 600), DEL = Symbol('del');
const prop = (o = {}) => ({ start: toEpoch('2026-10-16', 840), end: toEpoch('2026-10-16', 900), staffId: 's2', reason: 'غياب', by: 'o1', at: now, ...o });
const b = (o = {}) => ({ customerUid: 'u1', status: 'confirmed', staffId: 's1', durationMin: 60, start: toEpoch('2026-10-15', 720), moveProposal: prop(), ...o });
const run = (bo, extra = {}) => planAcceptMove({ booking: bo, newStaff: { status: 'active' }, auth: { uid: 'u1' }, now, deleteMark: DEL, ...extra });
const code = (f) => { try { f(); } catch (e) { return e.message; } return 'OK'; };

test('قبول صحيح: خلايا قديمة وجديدة بموظفتين مختلفتين، ويُحذف الاقتراح', () => {
  const r = run(b());
  assert.equal(r.oldSchedule, 's1_2026-10-15'); assert.equal(r.newSchedule, 's2_2026-10-16');
  assert.deepEqual(r.oldKeys, ['48', '49', '50', '51']); assert.deepEqual(r.newKeys, ['56', '57', '58', '59']);
  assert.equal(r.patch.moveProposal, DEL); assert.equal(r.patch.staffId, 's2'); assert.equal(r.patch.prevStart, b().start);
  assert.ok(!('rescheduleCount' in r.patch));
});
test('ليس حجزها', () => assert.equal(code(() => run(b({ customerUid: 'x' }))), 'NOT_YOURS'));
test('بدون اقتراح أو غير مؤكد', () => {
  assert.equal(code(() => run(b({ moveProposal: undefined }))), 'NOT_ALLOWED');
  assert.equal(code(() => run(b({ status: 'cancel_requested' }))), 'NOT_ALLOWED');
});
test('اقتراح بوقت ماضٍ أو نهايته لا تطابق المدة', () => {
  assert.equal(code(() => run(b({ moveProposal: prop({ start: now - 1, end: now - 1 + 3600000 }) }))), 'PAST');
  assert.equal(code(() => run(b({ moveProposal: prop({ end: toEpoch('2026-10-16', 930) }) }))), 'BAD_PROPOSAL');
});
test('موظفة غير موجودة أو غير فعّالة', () => {
  assert.equal(code(() => run(b(), { newStaff: null })), 'STAFF_INACTIVE');
  assert.equal(code(() => run(b(), { newStaff: { status: 'disabled' } })), 'STAFF_INACTIVE');
});
