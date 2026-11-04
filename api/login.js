import { allowed, setSession, jsonOnly } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!jsonOnly(req, res)) return;
  const { email, password, signup } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "Informe e-mail e senha (mínimo 8 caracteres)." });
  // Só e-mails autorizados entram, inclusive para criar conta (o cadastro do Neon Auth é aberto).
  if (!allowed(email)) return res.status(403).json({ error: "Este e-mail não tem acesso ao painel." });
  const base = process.env.NEON_AUTH_BASE_URL.replace(/\/+$/, "");
  const root = base.endsWith("/auth") ? base : base + "/auth";
  const r = await fetch(`${root}/${signup ? "sign-up" : "sign-in"}/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: `https://${req.headers.host}` },
    body: JSON.stringify(signup ? { email, password, name: email } : { email, password }),
  });
  if (!r.ok) return res.status(401).json({ error: signup ? "Não foi possível criar a conta (talvez ela já exista)." : "E-mail ou senha incorretos." });
  setSession(res, email.trim().toLowerCase());
  res.json({ ok: true });
}
