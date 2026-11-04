// Uso: node test/merge.test.mjs  (carrega merge.js como no navegador, sem banco)
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(new URL("../merge.js", import.meta.url), "utf8") + ";this.mergeState = mergeState", ctx);
const merge = (b, m, t) => JSON.parse(JSON.stringify(ctx.mergeState(b, m, t))); // tira os protótipos do vm
const cam = (id, o = {}) => ({ id, nome: id, status: "online", altura: 6, alcance: 60, ground: 0, ...o });
const S = (cams, areas = []) => ({ cams, areas });
const A = (nome, d = 0) => ({ nome, pts: [[d, 1], [2, 3], [4, 5]] });
const by = r => Object.fromEntries(r.cams.map(c => [c.id, c]));

// 1) câmeras diferentes: as duas mudanças entram, sem conflito
let r = merge(S([cam("A"), cam("B")]), S([cam("A", { altura: 9 }), cam("B")]), S([cam("A"), cam("B", { status: "offline" })]));
assert.equal(by(r).A.altura, 9); assert.equal(by(r).B.status, "offline"); assert.deepEqual(r.conflicts, []); assert.equal(r.dirty, true);
// 2) mesma câmera, campos diferentes: combina
r = merge(S([cam("A")]), S([cam("A", { altura: 9 })]), S([cam("A", { status: "alerta" })]));
assert.deepEqual([by(r).A.altura, by(r).A.status], [9, "alerta"]); assert.deepEqual(r.conflicts, []);
// 3) mesmo campo com valores diferentes: conflito, vale o do banco
r = merge(S([cam("A")]), S([cam("A", { status: "offline" })]), S([cam("A", { status: "alerta" })]));
assert.equal(by(r).A.status, "alerta"); assert.deepEqual(r.conflicts, [{ id: "A", fields: ["status"] }]);
// 4) mesmo campo, mesmo valor: não é conflito e não há nada a enviar
r = merge(S([cam("A")]), S([cam("A", { status: "offline" })]), S([cam("A", { status: "offline" })]));
assert.deepEqual(r.conflicts, []); assert.equal(r.dirty, false);
// 5) câmeras novas dos dois lados ficam
r = merge(S([cam("A")]), S([cam("A"), cam("X")]), S([cam("A"), cam("Y")]));
assert.deepEqual(Object.keys(by(r)).sort(), ["A", "X", "Y"]);
// 6) eu excluo: some se ninguém mexeu; fica se alguém mexeu (com aviso)
r = merge(S([cam("A")]), S([]), S([cam("A")])); assert.equal(r.cams.length, 0); assert.deepEqual(r.conflicts, []);
r = merge(S([cam("A")]), S([]), S([cam("A", { altura: 9 })])); assert.equal(by(r).A.altura, 9); assert.deepEqual(r.conflicts, [{ id: "A", fields: [], deleted: "mine" }]);
// 7) outra pessoa exclui: some se eu não mexi; fica a minha se eu editei (com aviso)
r = merge(S([cam("A")]), S([cam("A")]), S([])); assert.equal(r.cams.length, 0);
r = merge(S([cam("A")]), S([cam("A", { altura: 9 })]), S([])); assert.equal(by(r).A.altura, 9); assert.deepEqual(r.conflicts, [{ id: "A", fields: [], deleted: "theirs" }]);
// 8) excluída pelos dois
r = merge(S([cam("A")]), S([]), S([])); assert.equal(r.cams.length, 0); assert.deepEqual(r.conflicts, []);
// 9) 'ground' e 'ultimoSinal' não contam como edição
r = merge(S([cam("A")]), S([cam("A", { ground: 700 })]), S([cam("A")])); assert.equal(r.dirty, false); assert.deepEqual(r.conflicts, []);
// 10) nada meu mudou: o resultado é o do banco e não há o que enviar
r = merge(S([cam("A")]), S([cam("A")]), S([cam("A", { altura: 9 }), cam("Z")])); assert.equal(r.dirty, false); assert.equal(by(r).Z.id, "Z");
// 11) áreas
r = merge(S([], [A("a")]), S([], [A("a"), A("minha", 1)]), S([], [A("a"), A("dela", 2)])); assert.deepEqual(r.areas.map(a => a.nome), ["a", "dela", "minha"]);
r = merge(S([], [A("a"), A("b", 1)]), S([], [A("a")]), S([], [A("a"), A("b", 1), A("c", 2)])); assert.deepEqual(r.areas.map(a => a.nome), ["a", "c"]); // eu removi "b"; "c" é dela
console.log("ok");
