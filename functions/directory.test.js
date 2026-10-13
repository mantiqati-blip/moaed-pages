const test = require('node:test'), assert = require('node:assert/strict');
const D = import('../js/directory.js');
const L = [
  { id: 'a', name: 'صالون الأميرة', governorateId: 'bg', areaId: 'kr' }, { id: 'b', name: 'ورد بغداد', governorateId: 'bg', areaId: 'mn' },
  { id: 'c', name: 'لمسة جمال', governorateId: 'bs', areaId: 'zb' }, { id: 'd', name: 'بدون موقع' },
];
test('البحث يتجاهل الهمزة والتاء المربوطة والتشكيل', async () => {
  const { filterSalons, normAr } = await D;
  assert.equal(normAr('الأَميرة'), normAr('الاميره'));
  assert.deepEqual(filterSalons(L, { q: 'الاميره' }).map((x) => x.id), ['a']);
  assert.deepEqual(filterSalons(L, { q: '  جمال ' }).map((x) => x.id), ['c']);
});
test('فلتر المحافظة والمنطقة يعملان معًا، وبدون فلتر تظهر الكل', async () => {
  const { filterSalons } = await D;
  assert.equal(filterSalons(L).length, 4);
  assert.deepEqual(filterSalons(L, { g: 'bg' }).map((x) => x.id), ['a', 'b']);
  assert.deepEqual(filterSalons(L, { g: 'bg', a: 'mn' }).map((x) => x.id), ['b']);
  assert.deepEqual(filterSalons(L, { g: 'bg', q: 'ورد' }).map((x) => x.id), ['b']);
  assert.deepEqual(filterSalons(L, { g: 'bs', a: 'kr' }), []);
});
test('خيارات المحافظة والمنطقة من الصالونات الموجودة فقط', async () => {
  const { govOptions, areaOptions } = await D, N = { bg: 'بغداد', bs: 'البصرة', kr: 'الكرخ', mn: 'المنصور', zb: 'الزبير', zz: 'غير مستعملة' };
  assert.deepEqual(govOptions(L, N).map((x) => x.id).sort(), ['bg', 'bs']);
  assert.deepEqual(areaOptions(L, 'bg', N).map((x) => x.id).sort(), ['kr', 'mn']);
  assert.deepEqual(areaOptions(L, '', N), []);
});
test('البيانات المنظّمة: ترتيب وروابط مشفّرة', async () => {
  const { itemListJsonLd } = await D, j = itemListJsonLd(L.slice(0, 2), 'https://x.test/p/');
  assert.equal(j['@type'], 'ItemList'); assert.equal(j.itemListElement[1].position, 2); assert.equal(j.itemListElement[0].url, 'https://x.test/p/?salon=a');
});
