import { clearSession } from "./_lib.js";

export default function handler(req, res) {
  clearSession(res);
  res.json({ ok: true });
}
