import { sql, allowed, setSession, jsonOnly } from "./_lib.js";

const MAX_EMAIL = 5, MAX_IP = 20; // falhas em 15 minutos

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!jsonOnly(req, res)) return;
  const { email, password, signup } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "Informe e-mail e senha (mínimo 8 caracteres)." });
  const em = email.trim().toLowerCase(), ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  const [[{ n: ne }], [{ n: ni }]] = await sql.transaction([
    sql`SELECT count(*)::int AS n FROM login_attempts WHERE k = ${"e:" + em} AND at > now() - interval '15 minutes'`,
    sql`SELECT count(*)::int AS n FROM login_attempts WHERE k = ${"i:" + ip} AND at > now() - interval '15 minutes'`,
  ]);
  if (ne >= MAX_EMAIL || ni >= MAX_IP) return res.status(429).json({ error: "Muitas tentativas. Tente de novo em 15 minutos." });
  const fail = (keys, status, error) => sql.transaction([
    sql`INSERT INTO login_attempts (k) SELECT unnest(${keys}::text[])`,
    sql`DELETE FROM login_attempts WHERE at < now() - interval '1 day'`,
  ]).then(() => res.status(status).json({ error }));
  // Só e-mails autorizados entram, inclusive para criar conta (o cadastro do Neon Auth é aberto).
  if (!allowed(email)) return fail(["i:" + ip], 403, "Este e-mail não tem acesso ao painel.");
  const base = process.env.NEON_AUTH_BASE_URL.replace(/\/+$/, "");
  const root = base.endsWith("/auth") ? base : base + "/auth";
  const r = await fetch(`${root}/${signup ? "sign-up" : "sign-in"}/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: `https://${req.headers.host}` },
    body: JSON.stringify(signup ? { email, password, name: email } : { email, password }),
  });
  if (!r.ok) return fail(["e:" + em, "i:" + ip], 401, signup ? "Não foi possível criar a conta (talvez ela já exista)." : "E-mail ou senha incorretos.");
  await sql`DELETE FROM login_attempts WHERE k = ${"e:" + em}`;
  setSession(res, em);
  res.json({ ok: true });
}
