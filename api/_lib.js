import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);
const KEY = () => createHash("sha256").update("cam-session:" + process.env.DATABASE_URL).digest();
const sign = v => createHmac("sha256", KEY()).update(v).digest("base64url");
const COOKIE = "cam_session", DAYS = 7;

export const allowed = email => (process.env.ALLOWED_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean).includes(String(email).trim().toLowerCase());

export function setSession(res, email) {
  const body = Buffer.from(JSON.stringify({ e: email, x: Date.now() + DAYS * 864e5 })).toString("base64url");
  res.setHeader("Set-Cookie", `${COOKIE}=${body}.${sign(body)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DAYS * 86400}`);
}
export const clearSession = res => res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);

// Retorna o e-mail logado ou responde 401/403 e retorna null.
export function requireUser(req, res) {
  const raw = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1) || "";
  const [body, mac] = raw.split(".");
  let user = null;
  try {
    const a = Buffer.from(mac || ""), b = Buffer.from(sign(body || ""));
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (a.length === b.length && timingSafeEqual(a, b) && p.x > Date.now() && allowed(p.e)) user = p.e;
  } catch {}
  if (!user) res.status(401).json({ error: "login" });
  return user;
}

// Escritas só com JSON: um formulário de outro site não consegue enviar isso.
export function jsonOnly(req, res) {
  if (/application\/json/i.test(req.headers["content-type"] || "")) return true;
  res.status(415).json({ error: "json" }); return false;
}
