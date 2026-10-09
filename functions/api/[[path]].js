const CATS = ["Deprem Performans Analizi", "Güçlendirme", "İnşaat", "Proje", "Restorasyon", "Emlak"];
const STATUS = ["Tamamlandı", "Devam ediyor"];
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function equalSecret(a, b) {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  let diff = aa.length ^ bb.length;
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}

function decodeDataImage(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value || "");
  if (!match) return null;
  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, type: match[1] };
}

async function getValue(env, key, fallback = null) {
  const row = await env.DB.prepare("SELECT value FROM app_data WHERE key = ?").bind(key).first();
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}
async function setValue(env, key, value) {
  await env.DB.prepare("INSERT INTO app_data (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, JSON.stringify(value)).run();
}
async function deleteImage(env, key) {
  if (key) await env.IMAGES.delete(key);
}
async function saveImages(env, arr = []) {
  const ids = [];
  for (const value of (Array.isArray(arr) ? arr : []).slice(0, 12)) {
    const image = decodeDataImage(value);
    if (!image) continue;
    const id = crypto.randomUUID();
    await env.IMAGES.put(id, image.bytes, { httpMetadata: { contentType: image.type }, customMetadata: { contentType: image.type } });
    ids.push(id);
  }
  return ids;
}
function fields(body) {
  return {
    title: String(body.title || "").trim().slice(0, 120),
    category: body.category,
    status: STATUS.includes(body.status) ? body.status : STATUS[0],
    year: String(body.year || "").trim().slice(0, 4),
    location: String(body.location || "").trim().slice(0, 80),
    description: String(body.description || "").trim().slice(0, 2000),
    area: String(body.area || "").trim().slice(0, 60),
    scope: (Array.isArray(body.scope) ? body.scope : []).map(x => String(x).trim().slice(0, 160)).filter(Boolean).slice(0, 15),
  };
}
async function readJson(request) {
  const raw = await request.text();
  if (raw.length > 12_000_000) throw new Error("İstek boyutu çok büyük.");
  try { return JSON.parse(raw); } catch { throw new Error("Geçersiz JSON içeriği."); }
}

export async function onRequest(context) {
  const { request, env } = context;
  const parts = new URL(request.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [route, id] = parts;
  const method = request.method.toUpperCase();

  try {
    if (!env.DB || !env.IMAGES) return json({ error: "Sunucu kurulumu tamamlanmamış: D1 (DB) ve R2 (IMAGES) bağlantılarını kontrol edin." }, 503);

    if (route === "img" && id && method === "GET") {
      const obj = await env.IMAGES.get(id);
      if (!obj) return new Response("Not found", { status: 404 });
      const headers = new Headers({ "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" });
      obj.writeHttpMetadata(headers);
      if (!headers.has("content-type")) headers.set("content-type", obj.customMetadata?.contentType || "application/octet-stream");
      return new Response(obj.body, { headers });
    }
    if (route === "projects" && method === "GET") return json(await getValue(env, "projects", []));
    if (route === "content" && method === "GET") return json(await getValue(env, "site", null));

    const password = env.ADMIN_PASSWORD || "";
    if (!password) return json({ error: "Yönetici şifresi tanımlı değil. Cloudflare Pages > Settings > Variables and Secrets bölümünde ADMIN_PASSWORD ekleyin." }, 503);
    const supplied = request.headers.get("x-admin-password") || "";
    if (!equalSecret(supplied, password)) return json({ error: "Şifre hatalı." }, 401);
    if (route === "login" && method === "POST") return json({ ok: true });

    if (route === "content" && method === "PUT") {
      const content = await readJson(request);
      if (!content || typeof content !== "object" || Array.isArray(content)) return json({ error: "Geçersiz içerik." }, 400);
      await setValue(env, "site", content);
      return json({ ok: true });
    }

    if (route === "logo" && method === "POST") {
      const body = await readJson(request);
      const [imageId] = await saveImages(env, [body.data]);
      return imageId ? json({ id: imageId }, 201) : json({ error: "Geçersiz görsel." }, 400);
    }

    if (route === "projects" && method === "POST") {
      const body = await readJson(request);
      const projectFields = fields(body);
      if (!projectFields.title || !CATS.includes(projectFields.category)) return json({ error: "Başlık ve kategori zorunlu." }, 400);
      const project = { id: crypto.randomUUID(), ...projectFields, images: await saveImages(env, body.addImages), created: Date.now() };
      const list = await getValue(env, "projects", []);
      list.unshift(project);
      await setValue(env, "projects", list);
      return json(project, 201);
    }

    if (route === "projects" && id && method === "PUT") {
      const body = await readJson(request);
      const projectFields = fields(body);
      const list = await getValue(env, "projects", []);
      const project = list.find(item => item.id === id);
      if (!project) return json({ error: "Proje bulunamadı." }, 404);
      if (!projectFields.title || !CATS.includes(projectFields.category)) return json({ error: "Başlık ve kategori zorunlu." }, 400);
      const remove = (Array.isArray(body.removeImages) ? body.removeImages : []).filter(key => project.images.includes(key));
      for (const key of remove) await deleteImage(env, key);
      Object.assign(project, projectFields, { images: [...project.images.filter(key => !remove.includes(key)), ...(await saveImages(env, body.addImages))] });
      await setValue(env, "projects", list);
      return json(project);
    }

    if (route === "projects" && id && method === "DELETE") {
      const list = await getValue(env, "projects", []);
      const project = list.find(item => item.id === id);
      if (!project) return json({ error: "Proje bulunamadı." }, 404);
      for (const key of project.images || []) await deleteImage(env, key);
      await setValue(env, "projects", list.filter(item => item.id !== id));
      return json({ ok: true });
    }

    return json({ error: "Bulunamadı." }, 404);
  } catch (error) {
    return json({ error: error?.message || "Sunucu hatası." }, 500);
  }
}
