import { sql } from "./_lib.js";

// Chamado 1x por dia pelo cron da Vercel (vercel.json). Sem segredo: só grava se o último backup tem mais de 20 h,
// então chamadas repetidas de qualquer pessoa não fazem nada. Não faz backup de banco vazio (não empurra os bons para fora).
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  try {
    const [made] = await sql.transaction([
      sql`INSERT INTO backups (data)
          SELECT jsonb_build_object(
            'cameras', (SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]') FROM cameras c),
            'areas', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]') FROM areas a),
            'status_history', (SELECT coalesce(jsonb_agg(to_jsonb(h)), '[]') FROM status_history h))
          WHERE EXISTS (SELECT 1 FROM cameras) AND NOT EXISTS (SELECT 1 FROM backups WHERE at > now() - interval '20 hours')
          RETURNING id`,
      sql`DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY at DESC LIMIT 14)`,
    ]);
    res.json({ created: made.length > 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erro no servidor" });
  }
}
