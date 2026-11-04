import { sql, requireUser } from "./_lib.js";

// Desde quando cada câmera offline/em alerta está nesse status (a última mudança de status igual ao status atual).
export default async function handler(req, res) {
  if (!requireUser(req, res)) return;
  if (req.method !== "GET") return res.status(405).end();
  try {
    const rows = await sql`SELECT DISTINCT ON (h.camera_id) h.camera_id AS id, h.changed_at AS at
      FROM status_history h JOIN cameras c ON c.id = h.camera_id AND c.status = h.status
      WHERE c.status IN ('offline', 'alerta') ORDER BY h.camera_id, h.changed_at DESC`;
    res.json({ since: Object.fromEntries(rows.map(r => [r.id, r.at])) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erro no servidor" });
  }
}
