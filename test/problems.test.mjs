// Uso: node test/problems.test.mjs  (só os caminhos que recusam, antes de tocar no banco)
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgresql://u:p@ep-x.neon.tech/db";
process.env.ALLOWED_EMAILS = "ed@x.com";
const { setSession } = await import("../api/_lib.js");
const { default: handler } = await import("../api/problems.js");
const cookie = email => { let h; setSession({ setHeader: (_, v) => (h = v) }, email); return h.split(";")[0]; };
const call = async (method, email) => { const res = { c: 200, status(c) { this.c = c; return this; }, json() { return this; }, end() { return this; } }; await handler({ method, headers: { cookie: email ? cookie(email) : "" } }, res); return res.c; };
assert.equal(await call("GET", null), 401);       // sem login
assert.equal(await call("POST", "ed@x.com"), 405); // só GET
console.log("ok");
