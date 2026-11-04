// Uso: node test/auth.test.mjs  (não precisa de banco: só a lógica de papéis e do cookie)
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgresql://u:p@ep-x.neon.tech/db";
process.env.ALLOWED_EMAILS = "Ed@x.com";
process.env.VIEWER_EMAILS = "v@x.com, w@x.com";
const { roleOf, setSession, requireUser } = await import("../api/_lib.js");

assert.equal(roleOf("ed@x.com"), "edit");
assert.equal(roleOf(" V@x.com "), "view");
assert.equal(roleOf("w@x.com"), "view");
assert.equal(roleOf("z@x.com"), null);

const login = email => { let h; setSession({ setHeader: (_, v) => (h = v) }, email); return h.split(";")[0]; };
const check = cookie => { const r = { c: 200, status(c) { this.c = c; return this; }, json() { return this; } }; return [requireUser({ headers: { cookie } }, r), r.c]; };
assert.deepEqual(check(login("v@x.com")), [{ email: "v@x.com", role: "view" }, 200]);
assert.deepEqual(check(login("ed@x.com"))[0].role, "edit");
assert.equal(check(login("z@x.com"))[1], 401);            // e-mail sem papel
assert.equal(check(login("v@x.com").slice(0, -2) + "xx")[1], 401); // cookie adulterado
assert.equal(check("")[1], 401);
process.env.VIEWER_EMAILS = "";                            // papel revogado vale na hora, mesmo com cookie antigo
assert.equal(check(login("v@x.com"))[1], 401);
console.log("ok");
