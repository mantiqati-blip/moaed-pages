const test = require('node:test'), assert = require('node:assert');
const { planReschedule } = require('./reschedule.js'), { toEpoch } = require('./plan.js');
const hours = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [i, { open: '09:00', close: '20:00' }]));
const now = toEpoch('2026-10-13', 600), salon = { status: 'active', hours };
const b = (o = {}) => ({ customerUid: 'u1', status: 'confirmed', source: 'online', staffId: 's1', durationMin: 60, start: toEpoch('2026-10-15', 720), ...o });
const run = (bo, req, extra = {}) => planReschedule({ booking: bo, salon, platform: { cancelCutoffHours: 2 }, auth: { uid: 'u1' }, req, now, ...extra });
const code = (f) => { try { f(); } catch (e) { return e.message; } return 'OK'; };

test('نقل صحيح يحسب خلايا القديم والجديد', () => {
  const r = run(b(), { date: '2026-10-16', startMin: 840 });
  assert.deepEqual(r.oldKeys, ['48', '49', '50', '51']); assert.deepEqual(r.newKeys, ['56', '57', '58', '59']);
  assert.equal(r.oldSchedule, 's1_2026-10-15'); assert.equal(r.newSchedule, 's1_2026-10-16');
  assert.equal(r.patch.rescheduleCount, 1); assert.equal(r.end - r.start, 3600000);
});
test('مرة واحدة فقط', () => assert.equal(code(() => run(b({ rescheduleCount: 1 }), { date: '2026-10-16', startMin: 840 })), 'ALREADY_RESCHEDULED'));
test('ليس حجزها', () => assert.equal(code(() => run(b({ customerUid: 'x' }), { date: '2026-10-16', startMin: 840 })), 'NOT_YOURS'));
test('داخل المهلة', () => assert.equal(code(() => run(b({ start: now + 3600000 }), { date: '2026-10-16', startMin: 840 })), 'TOO_LATE'));
test('خارج الدوام', () => assert.equal(code(() => run(b(), { date: '2026-10-16', startMin: 19 * 60 + 30 })), 'OUTSIDE_HOURS'));
test('وقت ماضٍ وتنسيق غلط', () => {
  assert.equal(code(() => run(b(), { date: '2026-10-13', startMin: 600 })), 'PAST');
  assert.equal(code(() => run(b(), { date: '2026-10-16', startMin: 841 })), 'BAD_TIME');
});
test('غير مؤكد أو يدوي', () => {
  assert.equal(code(() => run(b({ status: 'cancelled' }), { date: '2026-10-16', startMin: 840 })), 'NOT_ALLOWED');
  assert.equal(code(() => run(b({ source: 'manual' }), { date: '2026-10-16', startMin: 840 })), 'NOT_ALLOWED');
});
