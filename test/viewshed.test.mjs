// Uso: node test/viewshed.test.mjs  (carrega viewshed.js como no navegador; mundos de brinquedo, sem Cesium)
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../viewshed.js", import.meta.url), "utf8") + ";this.vsSamples = vsSamples; this.vsAnalyze = vsAnalyze; this.vsCell = vsCell", ctx);
const { vsSamples, vsAnalyze, vsCell } = ctx;

const cam = (o = {}) => ({ lat: -23.56, lon: -46.65, heading: 90, tilt: -20, hfov: 90, alcance: 60, ...o }); // olhando para o leste
const world = (c, S, h) => { const k = 111320 * Math.cos(c.lat * Math.PI / 180); return S.pts.map(p => h((p.lon - c.lon) * k, (p.lat - c.lat) * 111320)); }; // x = leste, y = norte, em metros
const run = (c, h, h0 = 6) => { const S = vsSamples(c), r = vsAnalyze(c, S, h0, world(c, S, h)); return { S, ...r }; };
const count = (r, v) => [...r.status].filter(x => x === v).length;

// 1) amostras: limites de custo e direção
let c = cam(), S = vsSamples(c);
assert.equal(S.pts.length, S.nR * S.nD); assert.ok(S.pts.length <= 6000);
assert.ok(Math.abs(S.pts[S.nD - 1].d - 60) < 1e-9);                       // o último ponto do raio está no alcance
const mid = S.pts[Math.floor(S.nR / 2) * S.nD + S.nD - 1];                // raio do meio aponta para o leste (heading 90)
assert.ok(mid.lon > c.lon && Math.abs(mid.lat - c.lat) < 1e-6);
assert.ok(vsSamples(cam({ alcance: 300, hfov: 180 })).pts.length <= 6000); // alcance e ângulo máximos não estouram o limite

// 2) terreno plano: nada atrapalha; só fica de fora o que está perto demais (ângulo vertical)
let r = run(c, () => 0);
assert.equal(count(r, 2), 0); assert.equal(r.pct, 100); assert.ok(count(r, 1) > 0); assert.ok(count(r, 0) > 0);

// 3) um prédio de 15 m a 20 m: tudo atrás dele fica escondido, o que está antes continua visível
r = run(c, (x, y) => (x >= 20 && x <= 25 && Math.abs(y) <= 60 ? 15 : 0));
assert.ok(count(r, 2) > 0); assert.ok(r.pct < 100 && r.pct > 0);
const behind = S.pts.map((p, j) => [p, j]).filter(([p, j]) => { const x = (p.lon - c.lon) * 111320 * Math.cos(c.lat * Math.PI / 180); return x > 30 && Math.abs((p.lat - c.lat) * 111320) < 10; });
assert.ok(behind.length > 0 && behind.every(([, j]) => r.status[j] === 2));  // sombra atrás do prédio
const before = S.pts.map((p, j) => [p, j]).filter(([p]) => (p.lon - c.lon) * 111320 * Math.cos(c.lat * Math.PI / 180) > 8 && (p.lon - c.lon) * 111320 * Math.cos(c.lat * Math.PI / 180) < 18 && Math.abs((p.lat - c.lat) * 111320) < 10);
assert.ok(before.length > 0 && before.every(([, j]) => r.status[j] === 1)); // antes do prédio, visível
// altura do obstáculo e da câmera
const pct = (h0, hb) => run(c, (x, y) => (x >= 20 && x <= 25 ? hb : 0), h0).pct;
assert.equal(pct(6, 30), pct(6, 15));                    // acima da lente, qualquer altura esconde todo o chão atrás
assert.ok(pct(6, 5) < pct(6, 3));                        // abaixo da lente, quanto mais alto o muro, maior a sombra
assert.ok(pct(40, 15) > pct(6, 15));

// 4) um morro: a subida é visível, o outro lado não
r = run(c, x => (x > 20 ? Math.max(0, 25 - Math.abs(x - 35) * 2.5) : 0), 6);
assert.ok(count(r, 2) > 0);

// 5) sem dado em alguns pontos: não quebra, não vira obstáculo e não entra na porcentagem
const Sx = vsSamples(c), H = world(c, Sx, () => 0); H[5] = undefined; H[Sx.nD + 3] = NaN;
r = vsAnalyze(c, Sx, 6, H); assert.equal(r.status[5], -1); assert.equal(r.status[Sx.nD + 3], -1); assert.equal(r.pct, 100);
assert.equal(vsAnalyze(c, Sx, 6, Sx.pts.map(() => undefined)).pct, null);   // nada medido: sem porcentagem

// 6) inclinação: câmera apontada para o horizonte enxerga mais longe e deixa de ver o chão perto
const flat = t => run(cam({ tilt: t }), () => 0);
assert.ok(count(flat(-5), 0) > count(flat(-30), 0) || count(flat(-5), 1) !== count(flat(-30), 1));

// 7) célula: quatro cantos e dentro do arco
const cell = vsCell(c, S, 3, 7); assert.equal(cell.length, 4); assert.ok(cell.every(([lo, la]) => Number.isFinite(lo) && Number.isFinite(la)));
console.log("ok");
