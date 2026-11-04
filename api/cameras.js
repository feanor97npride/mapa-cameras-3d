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
  const user = requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === "GET") {
      const [cams, areas, [{ rev }]] = await sql.transaction([
        sql`SELECT id, nome, setor, tipo, modelo, lat, lon, ground, altura, heading, tilt, hfov, alcance, status, motivo, ultimo_sinal AS "ultimoSinal", ip, firmware, nvr, retencao, instalacao, manutencao, responsavel, stream FROM cameras ORDER BY id`,
        sql`SELECT nome, pts FROM areas ORDER BY id`,
        sql`SELECT rev::int AS rev FROM app_state`,
      ]);
      return res.json({ cams, areas, rev, role: user.role });
    }
    if (req.method === "PUT") { // substitui o estado inteiro (o histórico de status só cresce quando o status muda)
      if (user.role !== "edit") return res.status(403).json({ error: "Seu acesso é somente leitura." });
      if (!jsonOnly(req, res)) return;
      const { cams, areas, rev } = req.body || {};
      if (!Number.isInteger(rev) || !Array.isArray(cams) || !Array.isArray(areas) || cams.length > 5000 || areas.length > 500) return res.status(400).json({ error: "dados inválidos" });
      const rows = cams.map(toRow);
      const ar = areas.map(a => {
        if (!Array.isArray(a?.pts) || a.pts.length < 3 || a.pts.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) throw new Error("área inválida");
        return { nome: txt(a.nome) || "Área", pts: a.pts };
      });
      const cols = ["id", "status", "ultimo_sinal", ...TXT, ...NUM];
      const list = cols.join(", "), sets = cols.slice(1).map(c => `${c} = EXCLUDED.${c}`).join(", ");
      // Controle de versão: um único comando; tudo só age se o UPDATE da revisão casar (ninguém salvou depois deste cliente carregar).
      const bump = await sql.query(
        `WITH bump AS (UPDATE app_state SET rev = rev + 1 WHERE rev = $1::bigint RETURNING rev::int AS rev),
          d AS (DELETE FROM cameras WHERE id <> ALL($2::text[]) AND EXISTS (SELECT 1 FROM bump)),
          u AS (INSERT INTO cameras (${list}) SELECT ${list} FROM jsonb_populate_recordset(NULL::cameras, $3::jsonb) WHERE EXISTS (SELECT 1 FROM bump) ON CONFLICT (id) DO UPDATE SET ${sets}),
          da AS (DELETE FROM areas WHERE EXISTS (SELECT 1 FROM bump)),
          ia AS (INSERT INTO areas (nome, pts) SELECT nome, pts FROM jsonb_to_recordset($4::jsonb) AS t(nome text, pts jsonb) WHERE EXISTS (SELECT 1 FROM bump))
         SELECT rev FROM bump`,
        [rev, rows.map(r => r.id), JSON.stringify(rows), JSON.stringify(ar)]);
      if (!bump.length) return res.status(409).json({ error: "conflito" });
      return res.json({ ok: true, rev: bump[0].rev });
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(e.message?.includes("inválid") ? 400 : 500).json({ error: e.message?.includes("inválid") ? e.message : "erro no servidor" });
  }
}
