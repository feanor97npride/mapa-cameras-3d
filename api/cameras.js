import { sql, requireUser, jsonOnly } from "./_lib.js";

const TXT = ["nome", "setor", "tipo", "modelo", "motivo", "ip", "firmware", "nvr", "retencao", "instalacao", "manutencao", "responsavel", "stream"];
const NUM = ["lat", "lon", "ground", "altura", "heading", "tilt", "hfov", "alcance"];
const STATUS = ["online", "alerta", "offline", "planejada"];
const txt = v => String(v ?? "").slice(0, 500);

// Valida e converte uma câmera do painel (camelCase) para as colunas do banco.
function toRow(c) {
  if (!c || typeof c.id !== "string" || !c.id.trim() || !STATUS.includes(c.status)) throw new Error("câmera inválida");
  const row = { id: c.id.trim().slice(0, 100), status: c.status, ultimo_sinal: Math.max(0, Math.round(Number(c.ultimoSinal) || 0)) };
  for (const k of TXT) row[k] = txt(c[k]);
  for (const k of NUM) { row[k] = Number(c[k]); if (!Number.isFinite(row[k])) throw new Error("número inválido em " + k); }
  return row;
}

export default async function handler(req, res) {
  if (!requireUser(req, res)) return;
  try {
    if (req.method === "GET") {
      const [cams, areas] = await sql.transaction([
        sql`SELECT id, nome, setor, tipo, modelo, lat, lon, ground, altura, heading, tilt, hfov, alcance, status, motivo, ultimo_sinal AS "ultimoSinal", ip, firmware, nvr, retencao, instalacao, manutencao, responsavel, stream FROM cameras ORDER BY id`,
        sql`SELECT nome, pts FROM areas ORDER BY id`,
      ]);
      return res.json({ cams, areas });
    }
    if (req.method === "PUT") { // substitui o estado inteiro (o histórico de status só cresce quando o status muda)
      if (!jsonOnly(req, res)) return;
      const { cams, areas } = req.body || {};
      if (!Array.isArray(cams) || !Array.isArray(areas) || cams.length > 5000 || areas.length > 500) return res.status(400).json({ error: "dados inválidos" });
      const rows = cams.map(toRow);
      const ar = areas.map(a => {
        if (!Array.isArray(a?.pts) || a.pts.length < 3 || a.pts.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) throw new Error("área inválida");
        return { nome: txt(a.nome) || "Área", pts: a.pts };
      });
      const cols = ["id", "status", "ultimo_sinal", ...TXT, ...NUM];
      const list = cols.join(", "), sets = cols.slice(1).map(c => `${c} = EXCLUDED.${c}`).join(", ");
      await sql.transaction([
        sql.query(`DELETE FROM cameras WHERE id <> ALL($1::text[])`, [rows.map(r => r.id)]),
        sql.query(`INSERT INTO cameras (${list}) SELECT ${list} FROM jsonb_populate_recordset(NULL::cameras, $1::jsonb) ON CONFLICT (id) DO UPDATE SET ${sets}`, [JSON.stringify(rows)]),
        sql`DELETE FROM areas`,
        sql`INSERT INTO areas (nome, pts) SELECT nome, pts FROM jsonb_to_recordset(${JSON.stringify(ar)}::jsonb) AS t(nome text, pts jsonb)`,
      ]);
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(e.message?.includes("inválid") ? 400 : 500).json({ error: e.message?.includes("inválid") ? e.message : "erro no servidor" });
  }
}
