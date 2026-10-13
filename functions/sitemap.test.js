const test = require('node:test'), assert = require('node:assert/strict');
const M = import('../js/sitemap-logic.mjs');
test('sitemap: الصفحات الثابتة + الصالونات الفعّالة فقط، مرتبة وبدون تكرار ومشفّرة', async () => {
  const { buildSitemap } = await M;
  const x = buildSitemap('https://x.test/p', [{ id: 'b', status: 'active' }, { id: 'a', status: 'active' }, { id: 'a', status: 'active' }, { id: 'z', status: 'pending' }, { id: 'a&b c', status: 'active' }, null]);
  assert.match(x, /<loc>https:\/\/x\.test\/p\/<\/loc>/);
  assert.match(x, /join\.html/);
  assert.ok(!x.includes('?salon=z'));
  assert.equal((x.match(/\?salon=a</g) || []).length, 1);
  assert.ok(x.indexOf('?salon=a<') < x.indexOf('?salon=b<'));
  assert.match(x, /\?salon=a%26b%20c</);   // مشفّر بالرابط ثم لا يحتاج تهريب XML إضافي
  assert.ok(x.startsWith('<?xml'));
});
test('تحويل رد REST إلى معرّفات وحالات', async () => {
  const { parseRestSalons } = await M;
  assert.deepEqual(parseRestSalons({ documents: [{ name: 'projects/p/databases/(default)/documents/publicSalons/s1', fields: { status: { stringValue: 'active' } } }] }), [{ id: 's1', status: 'active' }]);
  assert.deepEqual(parseRestSalons({}), []);
});
