// Uso: node test/audit.test.mjs  (cálculo do que mudou + caminhos que recusam; não toca no banco)
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgresql://u:p@ep-x.neon.tech/db";
process.env.ALLOWED_EMAILS = "ed@x.com";
process.env.VIEWER_EMAILS = "v@x.com";
const { diffCameras } = await import("../api/_audit.js");
const { setSession } = await import("../api/_lib.js");
const { default: audit } = await import("../api/audit.js");
const { default: maint } = await import("../api/maintenance.js");

const cam = (id, o = {}) => ({ id, nome: id, status: "online", altura: 6, alcance: 60, lat: -23.5, lon: -46.6, ground: 0, ultimo_sinal: 0, motivo: "", ...o });
const d = (o, n) => diffCameras(o, n);
// criar, excluir, atualizar
assert.deepEqual(d([], [cam("A", { nome: "Portaria" })]), [{ camera_id: "A", action: "create", field: null, old_value: null, new_value: "Portaria" }]);
assert.deepEqual(d([cam("A", { nome: "Portaria" })], []), [{ camera_id: "A", action: "delete", field: null, old_value: "Portaria", new_value: null }]);
assert.deepEqual(d([cam("A")], [cam("A", { status: "offline", motivo: "Sem energia" })]).map(e => [e.field, e.old_value, e.new_value]), [["status", "online", "offline"], ["motivo", "", "Sem energia"]]);
// nada mudou, ou só campos derivados: nada a registrar
assert.deepEqual(d([cam("A")], [cam("A")]), []);
assert.deepEqual(d([cam("A")], [cam("A", { ground: 700, ultimo_sinal: 30 })]), []);
// número igual escrito de outro jeito não é mudança; número diferente é
assert.deepEqual(d([cam("A", { alcance: 60 })], [cam("A", { alcance: "60" })]), []);
assert.deepEqual(d([cam("A", { lat: -23.5 })], [cam("A", { lat: -23.50001 })]).map(e => e.field), ["lat"]);
// importação enorme: limita e resume o resto
const big = d([], Array.from({ length: 1500 }, (_, i) => cam("C" + i)));
assert.equal(big.length, 1001); assert.match(big[1000].new_value, /^\+500 mudanças/);

const cookie = email => { let h; setSession({ setHeader: (_, v) => (h = v) }, email); return h.split(";")[0]; };
const call = async (handler, method, email, { query = {}, body, type = "application/json" } = {}) => {
  const res = { c: 200, status(c) { this.c = c; return this; }, json() { return this; }, end() { return this; } };
  await handler({ method, query, body, headers: { cookie: email ? cookie(email) : "", "content-type": type } }, res); return res.c;
};
const today = new Date().toISOString().slice(0, 10), good = { camera_id: "A", done_on: today, tecnico: "Zé", descricao: "Troca de lente" };
// /api/audit
assert.equal(await call(audit, "GET", null, { query: { id: "A" } }), 401);
assert.equal(await call(audit, "POST", "ed@x.com", { query: { id: "A" } }), 405);
assert.equal(await call(audit, "GET", "ed@x.com"), 400);
// /api/maintenance: login, papel, método, validação (tudo antes do banco)
assert.equal(await call(maint, "POST", null, { body: good }), 401);
assert.equal(await call(maint, "POST", "v@x.com", { body: good }), 403);          // só consulta não grava
assert.equal(await call(maint, "DELETE", "v@x.com", { query: { id: "1" } }), 403);
assert.equal(await call(maint, "PUT", "ed@x.com"), 405);
assert.equal(await call(maint, "GET", "ed@x.com"), 400);                          // sem id
assert.equal(await call(maint, "POST", "ed@x.com", { body: good, type: "text/plain" }), 415);
for (const bad of [{ ...good, descricao: "  " }, { ...good, done_on: "04/11/2026" }, { ...good, done_on: "2026-13-45" }, { ...good, done_on: "2999-01-01" }, { ...good, camera_id: "" }, { ...good, tecnico: "x".repeat(101) }, { ...good, descricao: "x".repeat(501) }])
  assert.equal(await call(maint, "POST", "ed@x.com", { body: bad }), 400, JSON.stringify(bad).slice(0, 60));
assert.equal(await call(maint, "DELETE", "ed@x.com", { query: { id: "abc" } }), 400);
console.log("ok");
