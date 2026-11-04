import { sql, requireUser } from "./_lib.js";

const TZ = "America/Sao_Paulo";
const SEC = "EXTRACT(EPOCH FROM LEAST(ev.e, days.e, now()) - GREATEST(ev.s, days.s))";

// Disponibilidade (online ou alerta / tempo instalada, planejada fora) por dia nos últimos 30 dias e por câmera.
export default async function handler(req, res) {
  if (!requireUser(req, res)) return;
  if (req.method !== "GET") return res.status(405).end();
  try {
    const [days, cameras] = await sql.transaction([
      sql.query(`WITH days AS (SELECT d AS ld, d AT TIME ZONE '${TZ}' AS s, (d + interval '1 day') AT TIME ZONE '${TZ}' AS e
            FROM generate_series(date_trunc('day', now() AT TIME ZONE '${TZ}') - interval '29 days', date_trunc('day', now() AT TIME ZONE '${TZ}'), interval '1 day') d),
          ev AS (SELECT status, changed_at AS s, COALESCE(LEAD(changed_at) OVER (PARTITION BY camera_id ORDER BY changed_at, id), now()) AS e FROM status_history)
        SELECT to_char(days.ld, 'YYYY-MM-DD') AS day,
               round((sum(${SEC}) FILTER (WHERE ev.status IN ('online', 'alerta')) / NULLIF(sum(${SEC}) FILTER (WHERE ev.status <> 'planejada'), 0) * 100)::numeric, 1)::float AS pct
        FROM days JOIN ev ON ev.s < days.e AND ev.e > days.s AND ev.s < now() GROUP BY days.ld ORDER BY days.ld`),
      sql.query(`WITH ev AS (SELECT camera_id, status, GREATEST(changed_at, now() - interval '30 days') AS s, COALESCE(LEAD(changed_at) OVER (PARTITION BY camera_id ORDER BY changed_at, id), now()) AS e FROM status_history),
          c AS (SELECT camera_id, sum(EXTRACT(EPOCH FROM e - s)) FILTER (WHERE status IN ('online', 'alerta')) AS up, sum(EXTRACT(EPOCH FROM e - s)) FILTER (WHERE status <> 'planejada') AS total
                FROM ev WHERE e > now() - interval '30 days' GROUP BY camera_id)
        SELECT camera_id AS id, round((up / total * 100)::numeric, 1)::float AS pct FROM c WHERE total > 0 ORDER BY pct, camera_id LIMIT 10`),
    ]);
    res.json({ days, cameras });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erro no servidor" });
  }
}
