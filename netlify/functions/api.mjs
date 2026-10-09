import { getStore } from "@netlify/blobs";
import { timingSafeEqual, randomUUID } from "node:crypto";

const CATS = ["Deprem Performans Analizi","Güçlendirme","İnşaat","Proje","Restorasyon","Emlak"];
const STATUS = ["Tamamlandı","Devam ediyor"];
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function authed(req) {
  const p = process.env.ADMIN_PASSWORD || "";
  const h = req.headers.get("x-admin-password") || "";
  return p.length > 0 && h.length === p.length && timingSafeEqual(Buffer.from(h), Buffer.from(p));
}

export default async (req) => {
  const parts = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const store = getStore("projects"), imgs = getStore("images");
  const load = async () => (await store.get("list", { type: "json" })) || [];
  const [route, id] = parts;

  if (route === "img" && id && req.method === "GET") {
    const r = await imgs.getWithMetadata(id, { type: "arrayBuffer" });
    if (!r) return new Response("Not found", { status: 404 });
    return new Response(r.data, { headers: { "content-type": r.metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  }
  if (route === "projects" && req.method === "GET") return json(await load());
  if (route === "content" && req.method === "GET") return json((await store.get("site", { type: "json" })) || null);

  if (!authed(req)) return json({ error: "Şifre hatalı." }, 401);
  if (route === "login") return json({ ok: true });
  if (route === "content" && req.method === "PUT") {
    const raw = await req.text();
    if (raw.length > 80000) return json({ error: "İçerik çok uzun." }, 400);
    let c; try { c = JSON.parse(raw); } catch { return json({ error: "Geçersiz içerik." }, 400); }
    if (!c || typeof c !== "object" || Array.isArray(c)) return json({ error: "Geçersiz içerik." }, 400);
    await store.setJSON("site", c);
    return json({ ok: true });
  }

  const saveImages = async (arr = []) => {
    const ids = [];
    for (const d of arr.slice(0, 12)) {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d || "");
      if (!m) continue;
      const b = Buffer.from(m[2], "base64");
      const k = randomUUID();
      await imgs.set(k, b.buffer.slice(b.byteOffset, b.byteOffset + b.length), { metadata: { type: m[1] } });
      ids.push(k);
    }
    return ids;
  };
  const fields = (b) => ({
    title: String(b.title || "").trim().slice(0, 120),
    category: b.category,
    status: STATUS.includes(b.status) ? b.status : STATUS[0],
    year: String(b.year || "").trim().slice(0, 4),
    location: String(b.location || "").trim().slice(0, 80),
    description: String(b.description || "").trim().slice(0, 2000),
    area: String(b.area || "").trim().slice(0, 60),
    scope: (Array.isArray(b.scope) ? b.scope : []).map(x => String(x).trim().slice(0, 160)).filter(Boolean).slice(0, 15),
  });

  if (route === "logo" && req.method === "POST") {
    const b = await req.json();
    const [k] = await saveImages([b.data]);
    return k ? json({ id: k }, 201) : json({ error: "Geçersiz görsel." }, 400);
  }
  if (route === "projects" && req.method === "POST") {
    const b = await req.json(), f = fields(b);
    if (!f.title || !CATS.includes(f.category)) return json({ error: "Başlık ve kategori zorunlu." }, 400);
    const p = { id: randomUUID(), ...f, images: await saveImages(b.addImages), created: Date.now() };
    const list = await load(); list.unshift(p);
    await store.setJSON("list", list);
    return json(p, 201);
  }
  if (route === "projects" && id && req.method === "PUT") {
    const b = await req.json(), f = fields(b), list = await load(), p = list.find(x => x.id === id);
    if (!p) return json({ error: "Proje bulunamadı." }, 404);
    if (!f.title || !CATS.includes(f.category)) return json({ error: "Başlık ve kategori zorunlu." }, 400);
    const rm = (b.removeImages || []).filter(x => p.images.includes(x));
    for (const k of rm) await imgs.delete(k);
    Object.assign(p, f, { images: [...p.images.filter(x => !rm.includes(x)), ...(await saveImages(b.addImages))] });
    await store.setJSON("list", list);
    return json(p);
  }
  if (route === "projects" && id && req.method === "DELETE") {
    const list = await load(), p = list.find(x => x.id === id);
    if (!p) return json({ error: "Proje bulunamadı." }, 404);
    for (const k of p.images) await imgs.delete(k);
    await store.setJSON("list", list.filter(x => x.id !== id));
    return json({ ok: true });
  }
  return json({ error: "Bulunamadı." }, 404);
};

export const config = { path: "/api/*" };
