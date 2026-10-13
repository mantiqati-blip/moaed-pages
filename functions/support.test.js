const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const S = import('../js/support.js'), N = import('../js/notify-logic.js');

test('الرسالة: ترفض الفارغ والطويل، وتُبنى مقصوصة', async () => {
  const { validateText, buildMessage } = await S;
  assert.ok(validateText('')); assert.ok(validateText('   ')); assert.ok(validateText('x'.repeat(1001))); assert.equal(validateText('مرحبا'), null);
  assert.deepEqual(buildMessage({ text: ' مرحبا ', from: 'owner', uid: 'o', now: 5 }), { text: 'مرحبا', from: 'owner', by: 'o', at: 5 });
});
test('ملخص المحادثة: رسالة الصالون تنتظر الأدمن، وردّ الأدمن يرفعها، والمعاينة مقصوصة', async () => {
  const { threadAfter } = await S;
  const a = threadAfter({ salonName: 'س', text: 'x'.repeat(300), from: 'owner', now: 1 });
  assert.equal(a.awaitingAdmin, true); assert.equal(a.lastText.length, 120); assert.deepEqual(Object.keys(a).sort(), ['awaitingAdmin', 'lastAt', 'lastFrom', 'lastText', 'salonName']);
  assert.equal(threadAfter({ salonName: 'س', text: 'تم', from: 'admin', now: 2 }).awaitingAdmin, false);
});
test('الإعلان: عنوان ونص بحدود، والمعروض فعّال فقط والأحدث أولًا', async () => {
  const { validateAnnouncement, buildAnnouncement, visibleAnnouncements } = await S;
  assert.ok(validateAnnouncement('ab', 'نص')); assert.ok(validateAnnouncement('عنوان', '')); assert.ok(validateAnnouncement('x'.repeat(81), 'نص')); assert.ok(validateAnnouncement('عنوان', 'x'.repeat(2001)));
  assert.equal(validateAnnouncement('عنوان', 'نص الإعلان'), null);
  assert.deepEqual(Object.keys(buildAnnouncement({ title: ' ع١٢ ', body: ' ن١٢ ', uid: 'a', now: 1 })).sort(), ['active', 'body', 'by', 'createdAt', 'title']);
  const L = [{ title: 'قديم', active: true, createdAt: 1 }, { title: 'موقوف', active: false, createdAt: 9 }, { title: 'جديد', active: true, createdAt: 5 }];
  assert.deepEqual(visibleAnnouncements(L).map((x) => x.title), ['جديد', 'قديم']);
});
test('غير المقروء وترتيب المحادثات', async () => {
  const { unreadFromAdmin, sortThreads, byTime } = await S;
  const M = [{ from: 'admin', at: 5 }, { from: 'owner', at: 6 }, { from: 'admin', at: 9 }];
  assert.equal(unreadFromAdmin(M, 0), 2); assert.equal(unreadFromAdmin(M, 5), 1); assert.equal(unreadFromAdmin(M, 9), 0);
  assert.deepEqual(byTime([{ at: 3 }, { at: 1 }]).map((x) => x.at), [1, 3]);
  assert.deepEqual(sortThreads([{ id: 'a', awaitingAdmin: false, lastAt: 9 }, { id: 'b', awaitingAdmin: true, lastAt: 1 }, { id: 'c', awaitingAdmin: true, lastAt: 5 }]).map((x) => x.id), ['c', 'b', 'a']);
});
test('التنبيهات: الأدمن على رسالة جديدة فقط، الصالون على رد الإدارة وإعلان فعّال فقط', async () => {
  const { classify, pendingCount } = await N, th = { awaitingAdmin: true, salonName: 'الأميرة', lastAt: 5 };
  assert.match(classify('admin', 'support', { type: 'added', data: th }).text, /الأميرة/);
  assert.equal(classify('admin', 'support', { type: 'added', data: th }).tab, 9);
  assert.ok(classify('admin', 'support', { type: 'modified', data: { ...th, lastAt: 8 }, prev: th }));   // رسالة ثانية بنفس المحادثة
  assert.equal(classify('admin', 'support', { type: 'modified', data: th, prev: th }), null);            // بلا جديد
  assert.ok(classify('admin', 'support', { type: 'modified', data: th, prev: { ...th, awaitingAdmin: false } }));
  assert.equal(pendingCount('admin', 'support', [th, th]), 2);
  assert.equal(classify('owner', 'support', { type: 'added', data: { from: 'admin' } }).tab, 8);
  assert.equal(classify('owner', 'support', { type: 'added', data: { from: 'owner' } }), null);          // رسالته هو
  assert.match(classify('owner', 'announce', { type: 'added', data: { active: true, title: 'صيانة' } }).text, /صيانة/);
  assert.equal(classify('owner', 'announce', { type: 'added', data: { active: false, title: 'x' } }), null);
  assert.equal(classify('admin', 'announce', { type: 'added', data: { active: true, title: 'x' } }), null);
  assert.equal(classify('owner', 'announce', { type: 'modified', data: { active: true }, prev: { active: false } }), null);
});
test('القواعد: الإعلانات والدعم بحدودها', () => {
  const r = fs.readFileSync(__dirname + '/../firestore_server.rules', 'utf8');
  const blk = (start, end) => r.slice(r.indexOf(start), r.indexOf(end, r.indexOf(start) + 5));
  const an = blk('match /announcements/{id}', 'match /supportThreads'), th = blk('match /supportThreads/{sid}', 'match /salons/{sid} {'), ms = blk('match /support/{mid}', 'match /periods/{pid}');
  assert.match(an, /allow create: if isAdmin\(\)/); assert.match(an, /hasOnly\(\['active'\]\)/); assert.match(an, /allow delete: if isAdmin\(\)/);
  assert.match(an, /role\(\) == 'owner' \|\| role\(\) == 'staff'/);
  assert.match(th, /lastFrom == 'owner' && request\.resource\.data\.awaitingAdmin == true/); assert.match(th, /lastFrom == 'admin' && request\.resource\.data\.awaitingAdmin == false/); assert.match(th, /allow delete: if false/);
  assert.match(ms, /allow update, delete: if false/); assert.match(ms, /from == 'owner'/); assert.match(ms, /from == 'admin'/);
  const strip = (t) => t.replace(/\/\/[^\n]*/g, ''), c = (t, ch) => t.split(ch).length - 1, s = strip(r);
  for (const [a, b] of [['{', '}'], ['(', ')'], ['[', ']']]) assert.equal(c(s, a), c(s, b), 'توازن ' + a);
});
