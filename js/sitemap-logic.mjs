// توليد sitemap.xml من قائمة الصالونات (بدون شبكة حتى يمكن اختباره)
const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const STATIC_PAGES = [['', 'daily', '1.0'], ['join.html', 'monthly', '0.5'], ['terms.html', 'yearly', '0.2'], ['privacy.html', 'yearly', '0.2']];

export function buildSitemap(base, salons) {
  const b = base.endsWith('/') ? base : base + '/';
  const url = (loc, f, p) => `  <url><loc>${xmlEsc(loc)}</loc><changefreq>${f}</changefreq><priority>${p}</priority></url>`;
  const ids = [...new Set(salons.filter((x) => x && x.id && x.status === 'active').map((x) => x.id))].sort();
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + [...STATIC_PAGES.map(([pg, f, p]) => url(b + pg, f, p)), ...ids.map((id) => url(b + '?salon=' + encodeURIComponent(id), 'weekly', '0.8'))].join('\n') + '\n</urlset>\n';
}

// تحويل رد Firestore REST (قائمة وثائق publicSalons) إلى مصفوفة بسيطة
export function parseRestSalons(json) {
  return (json.documents || []).map((d) => ({ id: d.name.split('/').pop(), status: d.fields?.status?.stringValue }));
}
