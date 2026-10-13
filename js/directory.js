// دليل الصالونات العام: بحث بالاسم وفلتر المحافظة والمنطقة (بدون Firebase حتى يمكن اختباره)
// تطبيع عربي للبحث: يتجاهل التشكيل والهمزات والتاء المربوطة والألف المقصورة
export const normAr = (s) => String(s ?? '').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();

export function filterSalons(list, { q = '', g = '', a = '' } = {}) {
  const nq = normAr(q);
  return list.filter((x) => (!g || x.governorateId === g) && (!a || x.areaId === a) && (!nq || normAr(x.name).includes(nq)));
}

// المحافظات التي فيها صالونات فقط، مرتبة بالاسم العربي
export function govOptions(list, names) {
  return [...new Set(list.map((x) => x.governorateId).filter(Boolean))].map((id) => ({ id, name: names[id] || id })).sort((x, y) => x.name.localeCompare(y.name, 'ar'));
}
// مناطق المحافظة المختارة التي فيها صالونات فقط (بدون محافظة: لا شيء)
export function areaOptions(list, g, names) {
  if (!g) return [];
  return [...new Set(list.filter((x) => x.governorateId === g).map((x) => x.areaId).filter(Boolean))].map((id) => ({ id, name: names[id] || id })).sort((x, y) => x.name.localeCompare(y.name, 'ar'));
}

// بيانات منظّمة لمحركات البحث (ItemList). base = رابط الصفحة الرئيسية بدون ?
export function itemListJsonLd(list, base) {
  return { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: list.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, url: base + '?salon=' + encodeURIComponent(x.id) })) };
}
