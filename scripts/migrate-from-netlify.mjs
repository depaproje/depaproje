/**
 * One-time data migration from the old Netlify API to the new Cloudflare Pages API.
 * Requires Node.js 20+; does not require third-party packages.
 * Environment variables:
 *   SOURCE_URL=https://old-netlify-site.example
 *   TARGET_URL=https://depaproje.pages.dev
 *   ADMIN_PASSWORD=the new Cloudflare admin password
 *
 * Run: node scripts/migrate-from-netlify.mjs
 */
const source = (process.env.SOURCE_URL || "").replace(/\/$/, "");
const target = (process.env.TARGET_URL || "").replace(/\/$/, "");
const password = process.env.ADMIN_PASSWORD || "";
if (!source || !target || !password) {
  console.error("SOURCE_URL, TARGET_URL ve ADMIN_PASSWORD ortam değişkenlerini tanımlayın.");
  process.exit(1);
}

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} isteği başarısız: HTTP ${response.status}. Eski Netlify API erişilemiyor olabilir.`);
  return response.json();
}
async function imageData(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Görsel alınamadı (${response.status}): ${url}`);
  const type = (response.headers.get("content-type") || "image/jpeg").split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error(`Desteklenmeyen görsel türü: ${type}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${type};base64,${bytes.toString("base64")}`;
}
async function targetApi(path, body) {
  return getJson(`${target}/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-password": password },
    body: JSON.stringify(body),
  });
}

console.log("Eski Netlify'dan proje listesi ve site içeriği alınıyor...");
const [projects, content] = await Promise.all([
  getJson(`${source}/api/projects`),
  getJson(`${source}/api/content`).catch(() => null),
]);
if (!Array.isArray(projects)) throw new Error("Eski API'den beklenen proje listesi alınamadı.");
console.log(`${projects.length} proje bulundu.`);

for (let i = projects.length - 1; i >= 0; i--) {
  const project = projects[i];
  const addImages = [];
  for (const id of (project.images || [])) addImages.push(await imageData(`${source}/api/img/${encodeURIComponent(id)}`));
  const { id, images, created, ...fields } = project;
  await targetApi("projects", { ...fields, addImages });
  console.log(`Aktarıldı: ${project.title || id} (${addImages.length} fotoğraf)`);
}

if (content && typeof content === "object") {
  if (Array.isArray(content.references)) {
    for (const ref of content.references) {
      if (!ref.logo) continue;
      const data = await imageData(`${source}/api/img/${encodeURIComponent(ref.logo)}`);
      const uploaded = await targetApi("logo", { data });
      ref.logo = uploaded.id;
      console.log(`Referans logosu aktarıldı: ${ref.name || "Adsız kurum"}`);
    }
  }
  const response = await fetch(`${target}/api/content`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-password": password },
    body: JSON.stringify(content),
  });
  if (!response.ok) throw new Error(`Site içeriği kaydedilemedi: HTTP ${response.status} ${await response.text()}`);
  console.log("Site içeriği ve referanslar aktarıldı.");
} else {
  console.warn("Eski API'den site içeriği alınamadı; içerik varsayılan değerlerle başlayabilir.");
}
console.log("Aktarım tamamlandı. Yeni sitede projeleri ve fotoğrafları kontrol edin.");
