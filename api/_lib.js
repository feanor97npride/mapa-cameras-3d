import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);
const KEY = () => createHash("sha256").update("cam-session:" + process.env.DATABASE_URL).digest();
const sign = v => createHmac("sha256", KEY()).update(v).digest("base64url");
const COOKIE = "cam_session", DAYS = 7;

const list = name => (process.env[name] || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
// ALLOWED_EMAILS edita; VIEWER_EMAILS só consulta; qualquer outro e-mail não entra.
export const roleOf = email => { const e = String(email).trim().toLowerCase(); return list("ALLOWED_EMAILS").includes(e) ? "edit" : list("VIEWER_EMAILS").includes(e) ? "view" : null; };
export const allowed = email => roleOf(email) !== null;

export function setSession(res, email) {
  const body = Buffer.from(JSON.stringify({ e: email, x: Date.now() + DAYS * 864e5 })).toString("base64url");
  res.setHeader("Set-Cookie", `${COOKIE}=${body}.${sign(body)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DAYS * 86400}`);
}
export const clearSession = res => res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);

// Retorna { email, role } do usuário logado ou responde 401 e retorna null.
export function requireUser(req, res) {
  const raw = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1) || "";
  const [body, mac] = raw.split(".");
  let user = null;
  try {
    const a = Buffer.from(mac || ""), b = Buffer.from(sign(body || ""));
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (a.length === b.length && timingSafeEqual(a, b) && p.x > Date.now() && roleOf(p.e)) user = { email: p.e, role: roleOf(p.e) };
  } catch {}
  if (!user) res.status(401).json({ error: "login" });
  return user;
}

// Escritas só com JSON: um formulário de outro site não consegue enviar isso.
export function jsonOnly(req, res) {
  if (/application\/json/i.test(req.headers["content-type"] || "")) return true;
  res.status(415).json({ error: "json" }); return false;
}
