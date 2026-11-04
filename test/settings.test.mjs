// Uso: node test/settings.test.mjs  (só os caminhos que recusam, antes de tocar no banco)
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgresql://u:p@ep-x.neon.tech/db";
process.env.ALLOWED_EMAILS = "ed@x.com";
process.env.VIEWER_EMAILS = "v@x.com";
const { setSession } = await import("../api/_lib.js");
const { default: handler } = await import("../api/settings.js");

const cookie = email => { let h; setSession({ setHeader: (_, v) => (h = v) }, email); return h.split(";")[0]; };
const call = (method, email, body, type = "application/json") => {
  const res = { c: 200, status(c) { this.c = c; return this; }, json() { return this; }, end() { return this; } };
  const req = { method, body, headers: { cookie: email ? cookie(email) : "", "content-type": type } };
  return Promise.resolve(handler(req, res)).then(() => res.c);
};
assert.equal(await call("PUT", null, { cesiumToken: "x" }), 401);          // sem login
assert.equal(await call("GET", "ed@x.com"), 405);                          // só PUT
assert.equal(await call("PUT", "v@x.com", { cesiumToken: "x" }), 403);     // só consulta
assert.equal(await call("PUT", "ed@x.com", { cesiumToken: "x" }, "text/plain"), 415);
assert.equal(await call("PUT", "ed@x.com", { cesiumToken: 5 }), 400);      // tipo errado
assert.equal(await call("PUT", "ed@x.com", { cesiumToken: "x".repeat(4001) }), 400);
console.log("ok");
