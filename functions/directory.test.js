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

test('فلتر الخدمة: يطابق جزءًا من الاسم بالتطبيع ويعمل مع بقية الفلاتر', async () => {
  const { filterSalons } = await D;
  const S = [{ id: 'a', name: 'أ', governorateId: 'bg', svc: ['صبغة شعر', 'مكياج'] }, { id: 'b', name: 'ب', governorateId: 'bs', svc: ['قص شعر'] }, { id: 'c', name: 'ج' }];
  assert.deepEqual(filterSalons(S, { s: 'صبغه' }).map((x) => x.id), ['a']);
  assert.deepEqual(filterSalons(S, { s: 'شعر' }).map((x) => x.id), ['a', 'b']);
  assert.deepEqual(filterSalons(S, { s: 'شعر', g: 'bs' }).map((x) => x.id), ['b']);
  assert.equal(filterSalons(S, { s: '' }).length, 3);
  assert.deepEqual(filterSalons(S, { s: 'تنظيف' }), []);
});
test('أكثر الخدمات شيوعًا: عدّ لكل صالون مرة، ترتيب بالعدد ثم الاسم', async () => {
  const { topServices } = await D;
  const S = [{ svc: ['قص شعر', 'قص شعر', 'مكياج'] }, { svc: ['قص شعر'] }, { svc: ['مكياج', 'حنة'] }, {}];
  assert.deepEqual(topServices(S, 2), ['قص شعر', 'مكياج']);
  assert.deepEqual(topServices(S, 10), ['قص شعر', 'مكياج', 'حنة']);
  assert.deepEqual(topServices([]), []);
});
