import { sql, requireUser, jsonOnly } from "./_lib.js";

// Guarda o token do Cesium ion no banco (só editores). A leitura vem junto com GET /api/cameras.
export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (req.method !== "PUT") return res.status(405).end();
  if (user.role !== "edit") return res.status(403).json({ error: "Seu acesso é somente leitura." });
  if (!jsonOnly(req, res)) return;
  const t = req.body?.cesiumToken;
  if (typeof t !== "string" || t.length > 4000) return res.status(400).json({ error: "token inválido" });
  try {
    await sql`UPDATE app_state SET cesium_token = ${t.trim()}`;
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erro no servidor" });
  }
}
