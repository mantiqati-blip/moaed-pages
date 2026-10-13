const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const P = import('../js/payreq.js'), F = import('../js/finance.js');

test('طلب الصالون: يرفض مبلغًا غير صحيح أو أكبر من المتبقي بعد الطلبات المعلّقة', async () => {
  const { validateRequest } = await P;
  for (const a of [0, -5, 1.5, NaN, 'x']) assert.ok(validateRequest(a, '', 10000, 0), 'يجب الرفض: ' + a);
  assert.equal(validateRequest(10000, '', 10000, 0), null);
  assert.ok(validateRequest(10001, '', 10000, 0));
  assert.equal(validateRequest(4000, '', 10000, 6000), null);
  assert.match(validateRequest(4001, '', 10000, 6000), /المعلّقة/);
  assert.ok(validateRequest(1000, 'x'.repeat(301), 10000, 0));
});
test('بناء الطلب: حالة معلّقة، والملاحظة الفارغة لا تُكتب', async () => {
  const { buildRequest, parseAmount, pendingTotal } = await P;
  assert.deepEqual(buildRequest({ amount: 500, note: '  ', uid: 'o', now: 9 }), { amount: 500, by: 'o', at: 9, status: 'pending' });
  assert.equal(buildRequest({ amount: 500, note: ' نقدًا ', uid: 'o', now: 9 }).note, 'نقدًا');
  assert.equal(parseAmount('١٢٬٣٤٥'.replace('٬', ',')), 12345);
  assert.equal(parseAmount('١٢،٥٠٠'), 12500);
  assert.equal(pendingTotal([{ status: 'pending', amount: 3 }, { status: 'approved', amount: 99 }, { status: 'pending', amount: 4 }]), 7);
});
test('تأكيد الإدارة: لا يُقبل إلا طلب معلّق ضمن المتبقي', async () => {
  const { validateApproval } = await P;
  assert.equal(validateApproval({ status: 'pending', amount: 5000 }, 5000), null);
  assert.ok(validateApproval({ status: 'pending', amount: 5001 }, 5000));
  assert.ok(validateApproval({ status: 'approved', amount: 1 }, 5000));
  assert.ok(validateApproval(null, 5000));
});
test('التأكيد ينتج تسديدًا بنفس شكل تسديدات الأدمن، ويقلّ المتبقي بحسابات المنصة نفسها', async () => {
  const { approvalDocs } = await P, { summarize } = await F;
  const bks = [{ status: 'completed', servicesTotal: 50000, customerFee: 1000, salonCut: 2000, completedAt: 1 }];
  const before = summarize(bks, []), req = { status: 'pending', amount: 1000 };
  const w = approvalDocs({ req, paymentId: 'p9', uid: 'adm', now: 50 });
  assert.deepEqual(Object.keys(w.payment).sort(), ['amount', 'at', 'by']);         // يطابق hasOnly لقاعدة payments
  assert.deepEqual(w.update, { status: 'approved', decidedAt: 50, decidedBy: 'adm', paymentId: 'p9' });
  assert.equal(summarize(bks, [w.payment]).remaining, before.remaining - 1000);
});
test('الرفض يتطلب سببًا بين ٣ و٣٠٠ حرف', async () => {
  const { rejectUpdate } = await P;
  assert.ok(rejectUpdate('', 'a', 1).error); assert.ok(rejectUpdate('ab', 'a', 1).error); assert.ok(rejectUpdate('x'.repeat(301), 'a', 1).error);
  assert.deepEqual(rejectUpdate('  المبلغ ناقص ', 'adm', 7).update, { status: 'rejected', decision: 'المبلغ ناقص', decidedAt: 7, decidedBy: 'adm' });
});
test('تنبيه الصالون: عند تأكيد أو رفض طلبه فقط، ولا تنبيه للأدمن ولا عند الإنشاء', async () => {
  const { classify, pendingCount } = await import('../js/notify-logic.js');
  const pend = { status: 'pending', amount: 1 };
  assert.match(classify('owner', 'payreq', { type: 'modified', data: { status: 'approved' }, prev: pend }).text, /تأكيد استلام/);
  assert.match(classify('owner', 'payreq', { type: 'modified', data: { status: 'rejected', decision: 'ناقص' }, prev: pend }).text, /رُفض.*ناقص/);
  assert.equal(classify('owner', 'payreq', { type: 'added', data: pend }), null);
  assert.equal(classify('owner', 'payreq', { type: 'modified', data: { status: 'approved' }, prev: { status: 'approved' } }), null);
  assert.equal(classify('admin', 'payreq', { type: 'modified', data: { status: 'approved' }, prev: pend }), null);
  assert.equal(classify('owner', 'payreq', { type: 'modified', data: { status: 'approved' }, prev: pend }).tab, 5);
  assert.equal(pendingCount('owner', 'payreq', [pend]), null);
});
test('القواعد: كتلة paymentRequests موجودة بحدودها (الأدمن وحده يقرر، الصالون ينشئ ويسحب المعلّق فقط)', () => {
  const r = fs.readFileSync(__dirname + '/../firestore_server.rules', 'utf8'), i = r.indexOf('match /paymentRequests/{rid}'), blk = r.slice(i, r.indexOf('match /periods/{pid}'));
  assert.ok(i > 0);
  assert.match(blk, /allow create: if isOwner\(sid\)/);
  assert.match(blk, /allow update: if isAdmin\(\) && resource\.data\.status == 'pending'/);
  assert.match(blk, /getAfter\(.*payments.*\)\.data\.amount == resource\.data\.amount/s);
  assert.match(blk, /allow delete: if isOwner\(sid\) && resource\.data\.status == 'pending'/);
  const strip = (t) => t.replace(/\/\/[^\n]*/g, ''), c = (t, ch) => t.split(ch).length - 1, s = strip(r);
  for (const [a, b] of [['{', '}'], ['(', ')'], ['[', ']']]) assert.equal(c(s, a), c(s, b), 'توازن ' + a);
});
