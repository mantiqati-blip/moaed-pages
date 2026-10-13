// تشغيل على جهازك (يحتاج Node 18+):  node tools/make-sitemap.mjs
// يقرأ publicSalons (قراءتها عامة بالقواعد) ويكتب sitemap.xml بروابط الصالونات الفعّالة. بعدها ارفعي sitemap.xml للمستودع.
import { writeFileSync } from 'node:fs';
import { buildSitemap, parseRestSalons } from '../js/sitemap-logic.mjs';

const PROJECT = process.env.FIREBASE_PROJECT || 'moaed-unotha-prod';
const BASE = process.env.SITE_URL || 'https://mantiqati-blip.github.io/moaed-pages/';
const salons = []; let token = '';
do {
  const u = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/publicSalons?pageSize=300${token ? '&pageToken=' + encodeURIComponent(token) : ''}`;
  const r = await fetch(u); if (!r.ok) throw new Error('تعذر قراءة الصالونات: ' + r.status + ' ' + await r.text());
  const j = await r.json(); salons.push(...parseRestSalons(j)); token = j.nextPageToken || '';
} while (token);
writeFileSync(new URL('../sitemap.xml', import.meta.url), buildSitemap(BASE, salons));
console.log('تم: ' + salons.filter((x) => x.status === 'active').length + ' صالون فعّال في sitemap.xml');
