// Uso: node test/geocode.test.mjs  (o Nominatim é simulado; não usa rede nem banco)
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgresql://u:p@ep-x.neon.tech/db";
process.env.ALLOWED_EMAILS = "ed@x.com";
const { setSession } = await import("../api/_lib.js");
const { default: handler } = await import("../api/geocode.js");

let seen, reply;
globalThis.fetch = async (url, opts) => { seen = { url: String(url), ua: opts.headers["user-agent"] }; return reply(); };
const cookie = email => { let h; setSession({ setHeader: (_, v) => (h = v) }, email); return h.split(";")[0]; };
const call = async (q, email = "ed@x.com", method = "GET") => {
  const out = { c: 200, b: null, status(c) { this.c = c; return this; }, json(b) { this.b = b; return this; }, end() { return this; } };
  await handler({ method, query: { q }, headers: { cookie: email ? cookie(email) : "" } }, out); return out;
};

assert.equal((await call("avenida paulista", null)).c, 401);                    // sem login
assert.equal((await call("avenida paulista", "ed@x.com", "POST")).c, 405);
assert.equal((await call("ab")).c, 400);                                         // curto demais
assert.equal((await call("x".repeat(201))).c, 400);
reply = async () => ({ ok: true, json: async () => [{ display_name: "Av. Paulista, São Paulo", lat: "-23.5614", lon: "-46.6559", boundingbox: ["-23.57", "-23.55", "-46.67", "-46.64"] }, { display_name: "sem coordenadas", lat: "x", lon: "y" }] });
const ok = await call("avenida paulista");
assert.equal(ok.c, 200); assert.deepEqual(ok.b, [{ label: "Av. Paulista, São Paulo", lat: -23.5614, lon: -46.6559, bbox: [-23.57, -23.55, -46.67, -46.64] }]); // descarta resultado inválido
assert.match(seen.url, /q=avenida\+paulista/); assert.match(seen.ua, /mapa-cameras-3d/);
reply = async () => ({ ok: false }); assert.equal((await call("avenida paulista")).c, 502);
reply = async () => { throw new Error("rede"); }; console.error = () => {}; assert.equal((await call("avenida paulista")).c, 502);
console.log("ok");
