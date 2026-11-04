"use strict";
const C = Cesium;
const $ = id => document.getElementById(id);
const D2R = Math.PI / 180;
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- Catálogos ---------- */
const TIPOS = {
  "Bullet": { hfov: 90, alc: 60, modelos: ["Bullet 4MP IR 50 m · lente 2,8 mm", "Bullet 8MP IR 80 m · lente 4 mm"] },
  "Dome": { hfov: 105, alc: 35, modelos: ["Dome 4MP IR 30 m · lente 2,8 mm", "Dome antivandalismo 5MP"] },
  "PTZ": { hfov: 58, alc: 150, modelos: ["Speed Dome PTZ 4MP zoom 25x", "PTZ 2MP zoom 32x IR 150 m"] },
  "LPR": { hfov: 30, alc: 40, modelos: ["LPR 2MP leitura de placas · lente 8–32 mm"] },
};
const STATUS = {
  online: { label: "Online", color: "#46c98b" },
  alerta: { label: "Alerta", color: "#e9b44c" },
  offline: { label: "Offline", color: "#ec5f5f" },
  planejada: { label: "Planejada", color: "#9aa5e0" },
};
const ORDER = { offline: 0, alerta: 1, online: 2, planejada: 3 };

/* ---------- Dados de exemplo (fictícios, semente fixa) ---------- */
function sampleCams() {
  let seed = 20261104; const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pick = a => a[Math.floor(R() * a.length)], gauss = () => (R() + R() + R() - 1.5) / 1.5;
  const SET = [
    { nome: "Paulista", n: 32, linha: true }, { nome: "Consolação", lat: -23.5525, lon: -46.6605, n: 18 },
    { nome: "Bela Vista", lat: -23.5575, lon: -46.6455, n: 20 }, { nome: "Jardins", lat: -23.5690, lon: -46.6625, n: 20 },
    { nome: "Cerqueira César", lat: -23.5585, lon: -46.6700, n: 16 }, { nome: "Paraíso", lat: -23.5745, lon: -46.6430, n: 18 },
  ];
  const LOCAIS = ["Poste", "Fachada", "Cobertura", "Portaria", "Cruzamento", "Marquise"];
  const EQUIPES = ["Equipe Centro", "Equipe Sul", "Equipe Oeste", "Manutenção terceirizada"];
  const MA = ["Sinal intermitente (perda de pacotes 18%)", "Lente obstruída ou suja", "Armazenamento do NVR acima de 95%", "IR desligado no período noturno", "Firmware desatualizado"];
  const MO = ["Sem resposta ao ping", "Falha de energia no poste", "Switch PoE sem link", "Cabo de rede rompido"];
  const out = []; let n = 0;
  SET.forEach((s, si) => {
    for (let i = 0; i < s.n; i++) {
      n++;
      const tipo = R() < 0.42 ? "Bullet" : R() < 0.55 ? "Dome" : R() < 0.7 ? "PTZ" : "LPR", t = TIPOS[tipo];
      let lat, lon;
      if (s.linha) { const f = i / (s.n - 1); lat = -23.5556 - f * 0.0156 + gauss() * 0.00025; lon = -46.6622 + f * 0.0182 + gauss() * 0.00025; }
      else { lat = s.lat + gauss() * 0.0035; lon = s.lon + gauss() * 0.0038; }
      const local = pick(LOCAIS);
      const altura = local === "Cobertura" ? 22 + Math.round(R() * 30) : local === "Poste" || local === "Cruzamento" ? 5 + Math.round(R() * 4) : 3 + Math.round(R() * 4);
      const r = R(), status = r < 0.84 ? "online" : r < 0.93 ? "alerta" : "offline";
      out.push({
        id: "CAM-" + String(n).padStart(3, "0"), nome: `${local} ${s.nome} ${String(i + 1).padStart(2, "0")}`,
        setor: s.nome, tipo, modelo: pick(t.modelos), lat, lon, altura, ground: 0,
        heading: Math.round(R() * 359), tilt: -(local === "Cobertura" ? 25 + Math.round(R() * 20) : 10 + Math.round(R() * 18)),
        hfov: t.hfov, alcance: t.alc, status,
        motivo: status === "alerta" ? pick(MA) : status === "offline" ? pick(MO) : "",
        ultimoSinal: status === "offline" ? Math.round(20 + R() * 600) : 0,
        ip: `10.20.${si + 1}.${10 + i}`, firmware: pick(["V5.7.3", "V5.7.10", "V5.8.1", "V5.6.2"]),
        nvr: "NVR-0" + (1 + (si % 4)), retencao: pick([15, 30, 30, 45]),
        instalacao: `${String(1 + Math.floor(R() * 12)).padStart(2, "0")}/${2019 + Math.floor(R() * 7)}`,
        manutencao: `${String(1 + Math.floor(R() * 28)).padStart(2, "0")}/${String(1 + Math.floor(R() * 10)).padStart(2, "0")}/2026`,
        responsavel: pick(EQUIPES), stream: "",
      });
    }
  });
  return out;
}

/* ---------- Estado ---------- */
let cams = [], isSample = false, areas = []; // preenchido por loadRemote (banco) ou loadLocal (navegador), para não mostrar exemplo atrás do login
let byId = {};
let selected = null, coneMode = "all", mode3d = "plano", token = store.get("ionToken") || "";
const statusOn = { online: true, alerta: true, offline: true, planejada: true };
function index() { byId = Object.fromEntries(cams.map(c => [c.id, c])); }
let remote = false, readonly = false, pushTimer = 0, rev = 0, base = null, pushQueue = Promise.resolve(); // rev: versão do banco que este navegador carregou // remote: logado, dados no banco Neon (via /api) em vez do navegador
const snapshotState = () => ({ cams: cams.map(({ entity, _new, _has, _nocoords, ...r }) => r), areas: areas.map(({ pct, total, label, ...r }) => r) });
function save() {
  if (!remote) { store.set("cams", snapshotState().cams); store.set("areas", snapshotState().areas); }
  isSample = false; $("tagSample").hidden = true;
  pushRemote();
}
function pushRemote() {
  if (!remote || readonly) return;
  clearTimeout(pushTimer);
  saveState("Salvando…");
  pushTimer = setTimeout(() => { pushQueue = pushQueue.then(sendState); }, 600);
}
async function sendState() { // uma gravação por vez, para a versão (rev) nunca ficar defasada
  pushTimer = 0;
  const sent = snapshotState(); // base = o que o banco passa a ter depois desta gravação
  try {
    const r = await fetch("/api/cameras", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sent, rev }) });
    if (r.ok) { rev = (await r.json()).rev; base = structuredClone(sent); if (!pushTimer) saveState("Salvo ✓", "ok"); if (!$("paneProb").hidden) loadSince(); return; }
    saveState("Não salvo", "bad");
    if (r.status === 401) { remote = false; openLogin(); }
    else if (r.status === 409) await resolveConflict();
    else toast("Não consegui salvar no banco: " + ((await r.json().catch(() => ({}))).error || r.status));
  } catch (e) { saveState("Não salvo", "bad"); toast("Sem conexão: as mudanças não foram salvas no banco."); }
}
async function resolveConflict() { // outra pessoa salvou antes: combina as duas versões em vez de descartar a minha
  try {
    const r = await fetch("/api/cameras"); if (!r.ok || !base) throw new Error(r.status);
    const t = await r.json(), theirs = { cams: t.cams, areas: t.areas }, m = mergeState(base, snapshotState(), theirs);
    rev = t.rev; base = structuredClone(theirs); reconcile(m);
    const why = c => c.deleted === "mine" ? `${c.id} (você a excluiu, mas outra pessoa a alterou: ficou)` : c.deleted === "theirs" ? `${c.id} (outra pessoa a excluiu, mas você a alterou: ficou a sua)` : `${c.id} (${c.fields.join(", ")})`;
    toast(m.conflicts.length ? `Outra pessoa também mexeu em ${m.conflicts.map(why).join("; ")}. Nos campos em conflito, valeu a versão dela. Confira.` : "Suas mudanças foram combinadas com as de outra pessoa.", 9000);
    if (m.dirty) pushRemote(); else saveState("Salvo ✓", "ok");
  } catch (e) { console.error(e); toast("Outra pessoa alterou os dados e não consegui combinar. Recarregando (sua última mudança não foi salva)."); loadRemote(); }
}
function reconcile(m) { // aplica o resultado da combinação sem mexer na seleção nem no que está sendo editado
  const cur = new Map(cams.map(c => [c.id, c]));
  const next = m.cams.map(n => { const o = cur.get(n.id); if (!o || o === editing) return o || n; return Object.assign(o, n); });
  cams.filter(c => !next.includes(c)).forEach(c => c.entity && camDS.entities.remove(c.entity));
  cams = next; index();
  for (const c of cams) { if (!c.entity) addEntity(c); else { c.entity.position = camPos(c); c.entity.billboard.image = ICONS[c.status + (c.id === selected ? "_sel" : "")]; } }
  areas = m.areas; rebuildAreaEntities(); renderSetores(); render(); computeCoverage();
  if (selected && !byId[selected]) select(null); else if (selected && !editing) select(selected, false);
}
function saveState(text, cls = "") { const el = $("saveState"); el.textContent = text; el.className = "save " + cls; }
index();

/* ---------- Mapa ---------- */
const BASES = {
  sat: () => new C.UrlTemplateImageryProvider({ url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maximumLevel: 19, credit: "Imagens © Esri, Maxar, Earthstar Geographics" }),
  dark: () => new C.UrlTemplateImageryProvider({ url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", subdomains: "abcd", maximumLevel: 19, credit: "© OpenStreetMap © CARTO" }),
};
C.Ion.defaultAccessToken = token;
const viewer = new C.Viewer("map", {
  baseLayer: new C.ImageryLayer(BASES.sat()),
  baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
  navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
  infoBox: false, selectionIndicator: false,
  contextOptions: { webgl: { preserveDrawingBuffer: true } }, // permite capturar o mapa para o relatório
});
viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
const scene = viewer.scene;

function camIcon(color, selectedRing, dashed) {
  const s = selectedRing ? 40 : 30, c = document.createElement("canvas"); c.width = c.height = s;
  const g = c.getContext("2d"), m = s / 2, k = s / 30;
  g.beginPath(); g.arc(m, m, m - 2, 0, 7); g.fillStyle = "#0d1215"; g.fill();
  if (dashed) g.setLineDash([4, 3]);
  g.lineWidth = selectedRing ? 3 : 2; g.strokeStyle = selectedRing ? "#5cc8e6" : color; g.stroke(); g.setLineDash([]);
  g.fillStyle = color;
  g.fillRect(m - 7 * k, m - 4 * k, 10 * k, 8 * k);
  g.beginPath(); g.moveTo(m + 3 * k, m - 1.5 * k); g.lineTo(m + 8 * k, m - 4.5 * k); g.lineTo(m + 8 * k, m + 4.5 * k); g.lineTo(m + 3 * k, m + 1.5 * k); g.fill();
  return c.toDataURL();
}
const ICONS = {};
for (const k in STATUS) { ICONS[k] = camIcon(STATUS[k].color, false, k === "planejada"); ICONS[k + "_sel"] = camIcon(STATUS[k].color, true, k === "planejada"); }
function clusterIcon(count, worst) {
  const s = count >= 20 ? 46 : 38, c = document.createElement("canvas"); c.width = c.height = s;
  const g = c.getContext("2d"), m = s / 2;
  g.beginPath(); g.arc(m, m, m - 2, 0, 7); g.fillStyle = "rgba(13,18,21,.92)"; g.fill();
  g.lineWidth = 3; g.strokeStyle = STATUS[worst].color; g.stroke();
  g.fillStyle = "#dce6ea"; g.font = "600 15px 'Barlow Semi Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(count, m, m + 1);
  return c.toDataURL();
}

const camDS = new C.CustomDataSource("cameras");
camDS.clustering.enabled = true;
camDS.clustering.pixelRange = 34;
camDS.clustering.minimumClusterSize = 4;
camDS.clustering.clusterEvent.addEventListener((ents, cluster) => {
  const st = ents.map(e => byId[e.camId]?.status);
  const worst = st.includes("offline") ? "offline" : st.includes("alerta") ? "alerta" : st.includes("online") ? "online" : "planejada";
  cluster.label.show = false;
  cluster.billboard.show = true;
  cluster.billboard.image = clusterIcon(ents.length, worst);
  cluster.billboard.verticalOrigin = C.VerticalOrigin.CENTER;
  cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
});
viewer.dataSources.add(camDS);
const areaDS = new C.CustomDataSource("areas"); viewer.dataSources.add(areaDS);
const drawDS = new C.CustomDataSource("draw"); viewer.dataSources.add(drawDS);

function camPos(c) { return C.Cartesian3.fromDegrees(c.lon, c.lat, (c.ground || 0) + c.altura); }
function addEntity(c) {
  c.entity = camDS.entities.add({ position: camPos(c), billboard: { image: ICONS[c.status + (c.id === selected ? "_sel" : "")], verticalOrigin: C.VerticalOrigin.CENTER, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
  c.entity.camId = c.id;
}
function rebuildEntities() { camDS.entities.removeAll(); cams.forEach(addEntity); }
rebuildEntities();

/* ---------- Geometria do campo de visão ---------- */
function dir(h, p) { return [Math.sin(h * D2R) * Math.cos(p * D2R), Math.cos(h * D2R) * Math.cos(p * D2R), Math.sin(p * D2R)]; }
function ray(c, h, p) { // fim do raio em ENU (m), cortado no solo
  const d = dir(h, p); let len = c.alcance;
  if (d[2] < 0) len = Math.min(len, c.altura / -d[2]);
  return [d[0] * len, d[1] * len, Math.max(d[2] * len, -c.altura + 0.4)];
}
function groundPt(c, h, p) { // projeção no solo
  const d = dir(h, p), cp = Math.cos(p * D2R);
  const dist = d[2] < 0 ? Math.min(c.alcance, c.altura / -d[2]) * cp : c.alcance * cp;
  return [Math.sin(h * D2R) * dist, Math.cos(h * D2R) * dist, -c.altura + 0.4];
}
function footENU(c) { // pegada no solo: borda distante + borda próxima
  const hf = c.hfov / 2, vf = c.hfov * 0.5625 / 2, N = 12, far = [], near = [];
  for (let i = 0; i <= N; i++) { const h = c.heading - hf + (2 * hf * i) / N; far.push(groundPt(c, h, c.tilt + vf)); near.push(groundPt(c, h, c.tilt - vf)); }
  return far.concat(near.reverse());
}
// shortcut: conversão métrica plana, precisa só na escala de centenas de metros (alcance das câmeras)
function footLL(c) { const k = 111320 * Math.cos(c.lat * D2R); return footENU(c).map(v => [c.lon + v[0] / k, c.lat + v[1] / 111320]); }
function coneGeometry(c) {
  const origin = camPos(c), enu = C.Transforms.eastNorthUpToFixedFrame(origin);
  const toW = v => C.Matrix4.multiplyByPoint(enu, new C.Cartesian3(v[0], v[1], v[2]), new C.Cartesian3());
  const hf = c.hfov / 2, vf = c.hfov * 0.5625 / 2;
  const corners = [[-hf, vf], [hf, vf], [hf, -vf], [-hf, -vf]].map(([a, b]) => toW(ray(c, c.heading + a, c.tilt + b)));
  const sides = []; for (let i = 0; i < 4; i++) sides.push([origin, corners[i], corners[(i + 1) % 4]]);
  return { sides, foot: footENU(c).map(toW) };
}

let conePrim = null, coneRaf = 0;
function buildCones() {
  coneRaf = 0;
  if (conePrim) { scene.primitives.remove(conePrim); conePrim = null; }
  const list = coneMode === "none" ? [] : coneMode === "sel" ? (selected && byId[selected] ? [byId[selected]] : []) : visible();
  if (!list.length) return;
  const inst = [];
  for (const c of list) {
    const g = coneGeometry(c), isSel = c.id === selected;
    const col = C.Color.fromCssColorString(isSel ? "#5cc8e6" : STATUS[c.status].color), dim = selected && !isSel ? 0.5 : 1;
    const add = (positions, a) => inst.push(new C.GeometryInstance({
      geometry: C.PolygonGeometry.fromPositions({ positions, perPositionHeight: true, vertexFormat: C.PerInstanceColorAppearance.FLAT_VERTEX_FORMAT }),
      attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(col.withAlpha(a * dim)) },
    }));
    add(g.foot, isSel ? 0.42 : 0.26);
    g.sides.forEach(s => add(s, isSel ? 0.2 : 0.07));
  }
  conePrim = scene.primitives.add(new C.Primitive({ geometryInstances: inst, appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: true, closed: false }) }));
}
const scheduleCones = () => { if (!coneRaf) coneRaf = requestAnimationFrame(buildCones); };

/* ---------- Cobertura e pontos cegos (rasterizado em canvas) ---------- */
let covEntity = null, covTimer = 0;
const scheduleCoverage = () => { clearTimeout(covTimer); covTimer = setTimeout(computeCoverage, 120); };
function computeCoverage() {
  const inclPlan = $("chkPlan").checked;
  const cover = cams.filter(c => c.status === "online" || c.status === "alerta" || (inclPlan && c.status === "planejada"));
  const polys = cover.map(footLL);
  const pts = polys.flat().concat(areas.flatMap(a => a.pts));
  if (covEntity) { viewer.entities.remove(covEntity); covEntity = null; }
  if (!pts.length) { areas.forEach(a => { a.pct = 0; a.total = 0; }); renderAreas(); return; }
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const [x, y] of pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  w -= 0.0004; e += 0.0004; s -= 0.0004; n += 0.0004;
  const kLon = 111320 * Math.cos(((s + n) / 2) * D2R), RES = 2.5; // metros por pixel
  const W = Math.max(8, Math.min(2048, Math.ceil((e - w) * kLon / RES))), H = Math.max(8, Math.min(2048, Math.ceil((n - s) * 111320 / RES)));
  const X = lon => (lon - w) / (e - w) * W, Y = lat => (n - lat) / (n - s) * H;
  const path = (g, poly) => { g.beginPath(); poly.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.closePath(); };

  const cc = document.createElement("canvas"); cc.width = W; cc.height = H;
  const g = cc.getContext("2d", { willReadFrequently: true });
  g.globalCompositeOperation = "lighter"; g.fillStyle = "rgb(1,0,0)"; // canal R = nº de câmeras cobrindo o pixel
  polys.forEach(p => { path(g, p); g.fill(); });
  const cnt = g.getImageData(0, 0, W, H).data;

  const mask = new Uint8Array(W * H);
  const mc = document.createElement("canvas"); mc.width = W; mc.height = H;
  const mg = mc.getContext("2d", { willReadFrequently: true });
  for (const a of areas) {
    mg.clearRect(0, 0, W, H); mg.fillStyle = "#fff"; path(mg, a.pts); mg.fill();
    const md = mg.getImageData(0, 0, W, H).data; let tot = 0, cov = 0;
    for (let i = 0, j = 0; i < md.length; i += 4, j++) if (md[i + 3] > 127) { tot++; mask[j] = 1; if (cnt[i] > 0) cov++; }
    a.total = tot * ((e - w) * kLon / W) * ((n - s) * 111320 / H); a.pct = tot ? cov / tot * 100 : 0;
  }
  renderAreas();
  if (!$("chkCov").checked) return;

  const oc = document.createElement("canvas"); oc.width = W; oc.height = H;
  const og = oc.getContext("2d"), img = og.createImageData(W, H), o = img.data;
  for (let i = 0, j = 0; i < cnt.length; i += 4, j++) {
    const k = cnt[i];
    if (k >= 2) { o[i] = 70; o[i + 1] = 201; o[i + 2] = 139; o[i + 3] = 190; }
    else if (k === 1) { o[i] = 70; o[i + 1] = 201; o[i + 2] = 139; o[i + 3] = 105; }
    else if (mask[j]) { o[i] = 236; o[i + 1] = 95; o[i + 2] = 95; o[i + 3] = 150; }
  }
  og.putImageData(img, 0, 0);
  covEntity = viewer.entities.add({ rectangle: { coordinates: C.Rectangle.fromDegrees(w, s, e, n), material: new C.ImageMaterialProperty({ image: oc, transparent: true }), classificationType: C.ClassificationType.BOTH } });
}

/* ---------- Áreas de interesse ---------- */
function rebuildAreaEntities() {
  areaDS.entities.removeAll();
  for (const a of areas) {
    const flat = a.pts.flat();
    areaDS.entities.add({ polyline: { positions: C.Cartesian3.fromDegreesArray([...flat, ...a.pts[0]]), clampToGround: true, width: 2.5, material: C.Color.fromCssColorString("#5cc8e6") } });
    const cx = a.pts.reduce((t, p) => t + p[0], 0) / a.pts.length, cy = a.pts.reduce((t, p) => t + p[1], 0) / a.pts.length;
    a.label = areaDS.entities.add({ position: C.Cartesian3.fromDegrees(cx, cy, 30), label: { text: a.nome, font: "600 14px Barlow, sans-serif", fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: Number.POSITIVE_INFINITY, heightReference: C.HeightReference.RELATIVE_TO_GROUND } });
  }
}
function renderAreas() {
  $("areaCount").textContent = areas.length === 1 ? "1 área" : `${areas.length} áreas`;
  if (!areas.length) { $("areas").innerHTML = `<li class="empty">Desenhe uma área (entrada, estacionamento, perímetro) para medir quanto dela as câmeras cobrem e onde estão os pontos cegos.</li>`; return; }
  $("areas").innerHTML = areas.map((a, i) => {
    const pct = a.pct ?? 0, col = pct >= 90 ? "var(--ok)" : pct >= 60 ? "var(--warn)" : "var(--bad)";
    const ha = (a.total || 0) >= 10000 ? ((a.total) / 10000).toFixed(2).replace(".", ",") + " ha" : Math.round(a.total || 0).toLocaleString("pt-BR") + " m²";
    return `<li><div class="arow"><input data-i="${i}" value="${esc(a.nome)}" aria-label="Nome da área"${readonly ? " disabled" : ""}><span class="pct" style="color:${col}">${pct.toFixed(0)}%</span></div>
      <div class="bar"><i style="width:${pct}%;background:${col}"></i></div>
      <div class="arow"><span class="asub" style="flex:1">${ha} · ${(100 - pct).toFixed(0)}% sem cobertura</span>
      <button class="btn sm" data-fly="${i}">Ver</button><button class="btn sm danger" data-del="${i}">Excluir</button></div></li>`;
  }).join("");
  areas.forEach(a => { if (a.label) a.label.label.text = `${a.nome} · ${(a.pct ?? 0).toFixed(0)}%`; });
}
$("areas").addEventListener("change", e => { const i = e.target.dataset.i; if (i == null) return; areas[i].nome = e.target.value.trim() || areas[i].nome; save(); renderAreas(); });
$("areas").addEventListener("click", e => {
  const f = e.target.dataset.fly, d = e.target.dataset.del;
  if (f != null) { const r = C.Rectangle.fromCartesianArray(C.Cartesian3.fromDegreesArray(areas[f].pts.flat())); viewer.camera.flyTo({ destination: r, orientation: { heading: 0, pitch: -60 * D2R, roll: 0 }, duration: 1.2 }); }
  if (d != null) {
    if (e.target.dataset.sure) { areas.splice(d, 1); save(); rebuildAreaEntities(); computeCoverage(); }
    else { e.target.dataset.sure = 1; e.target.textContent = "Confirmar"; e.target.classList.add("solid"); }
  }
});
$("chkCov").addEventListener("change", computeCoverage);
$("chkPlan").addEventListener("change", computeCoverage);

/* ---------- Modos de clique no mapa (nova câmera / desenhar área) ---------- */
let pickMode = null, drawPts = [], mouseLL = null;
function pickLL(pos) {
  let cart;
  if (google && scene.pickPositionSupported) cart = scene.pickPosition(pos);
  if (!cart && scene.globe.show) cart = scene.globe.pick(viewer.camera.getPickRay(pos), scene);
  if (!cart) cart = viewer.camera.pickEllipsoid(pos);
  if (!cart) return null;
  const k = C.Cartographic.fromCartesian(cart);
  return { lon: k.longitude / D2R, lat: k.latitude / D2R, h: Math.max(0, k.height || 0) };
}
function setPickMode(m) {
  pickMode = m; drawPts = []; drawDS.entities.removeAll();
  $("main").classList.toggle("picking", !!m);
  $("modebar").hidden = !m; $("modeOk").hidden = m !== "area";
  if (m === "cam") $("modeText").textContent = "Clique no mapa onde a câmera será instalada.";
  if (m === "area") {
    $("modeText").textContent = "Clique para marcar os vértices da área. Clique com o botão direito ou em Concluir para fechar.";
    drawDS.entities.add({ polyline: { positions: new C.CallbackProperty(() => { const p = drawPts.concat(mouseLL ? [mouseLL] : []); return p.length > 1 ? C.Cartesian3.fromDegreesArray([...p.flat(), ...p[0]]) : []; }, false), clampToGround: true, width: 2, material: new C.PolylineDashMaterialProperty({ color: C.Color.fromCssColorString("#5cc8e6") }) } });
  }
}
function finishArea() {
  if (drawPts.length < 3) return toast("Marque pelo menos 3 pontos para formar uma área.");
  areas.push({ nome: `Área ${areas.length + 1}`, pts: drawPts.map(p => [+p[0].toFixed(7), +p[1].toFixed(7)]) });
  setPickMode(null); save(); rebuildAreaEntities(); computeCoverage(); showTab("areas");
  toast("Área criada. Clique no nome para renomear.");
}
$("modeOk").onclick = finishArea;
$("modeCancel").onclick = () => setPickMode(null);
$("btnDraw").onclick = () => { select(null); setPickMode("area"); };
$("btnAdd").onclick = () => { select(null); setPickMode("cam"); };

function newCamAt(ll) {
  const num = Math.max(0, ...cams.map(c => parseInt(String(c.id).replace(/\D/g, ""), 10) || 0)) + 1;
  const c = { id: "CAM-" + String(num).padStart(3, "0"), nome: "Nova câmera", setor: $("fSetor").value || "Sem setor", tipo: "Bullet", modelo: TIPOS.Bullet.modelos[0],
    lat: ll.lat, lon: ll.lon, ground: ll.h, altura: 6, heading: 0, tilt: -20, hfov: TIPOS.Bullet.hfov, alcance: TIPOS.Bullet.alc,
    status: "planejada", motivo: "", ultimoSinal: 0, ip: "", firmware: "", nvr: "", retencao: 30, instalacao: "", manutencao: "", responsavel: "", stream: "", _new: true };
  cams.push(c); index(); addEntity(c); statusOn.planejada = true;
  setPickMode(null); select(c.id, false); edit(c.id);
}

const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(ev => {
  if (pickMode) {
    const ll = pickLL(ev.position); if (!ll) return;
    if (pickMode === "cam") return newCamAt(ll);
    drawPts.push([ll.lon, ll.lat]); return;
  }
  if (editing) return;
  const p = scene.pick(ev.position);
  if (p && p.id && p.id.camId) return select(p.id.camId, false);
  if (p && Array.isArray(p.id)) {
    const bs = C.BoundingSphere.fromPoints(p.id.map(e => e.position.getValue(C.JulianDate.now())));
    viewer.camera.flyToBoundingSphere(bs, { offset: new C.HeadingPitchRange(0, -50 * D2R, Math.max(250, bs.radius * 3.2)), duration: 1.2 });
  }
}, C.ScreenSpaceEventType.LEFT_CLICK);
handler.setInputAction(ev => {
  if (drag) return dragTo(ev.endPosition);
  if (pickMode === "area") { const ll = pickLL(ev.endPosition); mouseLL = ll ? [ll.lon, ll.lat] : null; }
}, C.ScreenSpaceEventType.MOUSE_MOVE);
handler.setInputAction(ev => { // começa a arrastar a câmera (mover) ou o ponto azul (direção e alcance), só durante a edição
  if (!editing || pickMode) return;
  const hit = scene.drillPick(ev.position).find(o => o.id === editing.entity || o.id === handleEnt); // drillPick: os cones translúcidos podem estar na frente
  drag = !hit ? null : hit.id === handleEnt ? "handle" : "move";
  if (drag) { scene.screenSpaceCameraController.enableInputs = false; scene.canvas.style.cursor = "grabbing"; }
}, C.ScreenSpaceEventType.LEFT_DOWN);
handler.setInputAction(() => { if (!drag) return; drag = null; scene.screenSpaceCameraController.enableInputs = true; scene.canvas.style.cursor = ""; }, C.ScreenSpaceEventType.LEFT_UP);
handler.setInputAction(() => { if (pickMode === "area") finishArea(); }, C.ScreenSpaceEventType.RIGHT_CLICK);
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("layers").hidden) return setLayers(false);
  if (!$("geoRes").hidden || geoDS.entities.values.length) return clearGeo();
  if (pickMode) setPickMode(null); else if (editing) cancelEdit(); else if (selected) select(null);
});

/* ---------- Filtros, lista e indicadores ---------- */
for (const t in TIPOS) $("fTipo").add(new Option(t, t));
function overdue(c, months) { // sem manutenção há mais de N meses (câmera planejada ainda não precisa; sem data conta como "sem manutenção")
  if (c.status === "planejada") return false;
  const d = parseDate(c.manutencao), cut = new Date(); cut.setMonth(cut.getMonth() - months);
  return !d || d < cut;
}
function visible() {
  const q = $("q").value.trim().toLowerCase(), st = $("fSetor").value, tp = $("fTipo").value, nv = $("fNvr").value, rp = $("fResp").value, mt = $("fManut").value;
  return cams.filter(c => statusOn[c.status] && (!st || c.setor === st) && (!tp || c.tipo === tp) && (!nv || c.nvr === nv) && (!rp || c.responsavel === rp) &&
    (!mt || (mt === "never" ? c.status !== "planejada" && !parseDate(c.manutencao) : overdue(c, +mt))) &&
    (!q || [c.id, c.nome, c.ip, c.modelo, c.setor].join(" ").toLowerCase().includes(q)));
}
const FILTERS = ["fSetor", "fTipo", "fNvr", "fResp", "fManut"];
function since(min) { return min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)} h ${min % 60} min`; }
function fillSelect(id, values) { // mantém a escolha atual se ela ainda existir
  const cur = $(id).value, list = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $(id).innerHTML = `<option value="">Todos</option>` + list.map(s => `<option${s === cur ? " selected" : ""}>${esc(s)}</option>`).join("");
}
function renderSetores() { fillSelect("fSetor", cams.map(c => c.setor)); fillSelect("fNvr", cams.map(c => c.nvr)); fillSelect("fResp", cams.map(c => c.responsavel)); }
function counts() { const k = { online: 0, alerta: 0, offline: 0, planejada: 0 }; cams.forEach(c => k[c.status]++); return k; }
function render() {
  const vis = visible(), visSet = new Set(vis.map(c => c.id));
  for (const c of cams) if (c.entity) c.entity.show = visSet.has(c.id) || c.id === selected;
  camDS.clustering.enabled = !editing; if (!editing) updateHandle();
  camDS.clustering.pixelRange = camDS.clustering.pixelRange; // força reagrupar
  const sorted = [...vis].sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.id).localeCompare(String(b.id)));
  $("list").innerHTML = sorted.length ? sorted.map(c => `<li><button data-id="${esc(c.id)}" aria-current="${c.id === selected}">
    <i class="dot ${c.status}"></i><span class="cid">${esc(c.id)}</span><span class="ctype">${esc(c.tipo)}</span>
    <span class="cname">${esc(c.nome)}${c.motivo && c.status !== "online" ? " · " + esc(c.motivo) : ""}</span></button></li>`).join("")
    : cams.length ? `<li class="empty">Nenhuma câmera com esses filtros.</li>`
    : `<li class="empty">Nenhuma câmera cadastrada ainda.${readonly ? "" : `<br><button class="btn primary" data-empty="import">Importar planilha</button><button class="btn" data-empty="add">+ Adicionar câmera</button>`}</li>`;
  $("count").textContent = `${vis.length} de ${cams.length} câmeras`;
  $("fClear").hidden = !($("q").value || FILTERS.some(id => $(id).value));
  const k = counts(), inst = cams.length - k.planejada;
  $("kTotal").textContent = cams.length; $("kOnline").textContent = k.online; $("kAlerta").textContent = k.alerta; $("kOffline").textContent = k.offline; $("kPlan").textContent = k.planejada;
  $("kPct").textContent = inst ? ((k.online + k.alerta) / inst * 100).toFixed(1).replace(".", ",") + "%" : "–";
  $("bar").innerHTML = inst ? ["online", "alerta", "offline"].map(s => `<i style="width:${k[s] / inst * 100}%;background:${STATUS[s].color}"></i>`).join("") : "";
  renderProblems();
  buildCones();
}
/* ---------- Aba Problemas: câmeras offline ou em alerta, as mais antigas primeiro ---------- */
let sinceMap = {}; // id -> desde quando está no status atual (do histórico no banco)
function dur(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} dias`; }
const ago = ms => "há " + dur(ms);
function renderProblems() {
  const probs = cams.filter(c => c.status === "offline" || c.status === "alerta"), now = Date.now();
  const t = c => sinceMap[c.id] ? new Date(sinceMap[c.id]).getTime() : c.status === "offline" && c.ultimoSinal ? now - c.ultimoSinal * 60000 : now; // sem histórico: usa o "último sinal" (se houver)
  probs.sort((a, b) => ORDER[a.status] - ORDER[b.status] || t(a) - t(b));
  const off = probs.filter(c => c.status === "offline").length;
  $("badgeProb").hidden = !probs.length; $("badgeProb").textContent = probs.length; $("badgeProb").classList.toggle("bad", off > 0);
  $("probCount").textContent = probs.length === 1 ? "1 com problema" : `${probs.length} com problema`;
  $("problems").innerHTML = probs.length ? probs.map(c => {
    const known = sinceMap[c.id] || (c.status === "offline" && c.ultimoSinal);
    return `<li><button data-id="${esc(c.id)}" aria-current="${c.id === selected}"><i class="dot ${c.status}"></i><span class="cid">${esc(c.id)}</span>
      <span class="ctype${c.status === "offline" ? " late" : ""}">${known ? ago(now - t(c)) : STATUS[c.status].label}</span>
      <span class="cname">${esc(c.nome)}${c.motivo ? " · " + esc(c.motivo) : ""}</span></button></li>`;
  }).join("") : `<li class="empty">${cams.length ? "Tudo funcionando: nenhuma câmera offline ou em alerta." : "Nenhuma câmera cadastrada ainda."}</li>`;
}
async function loadSince() {
  if (!remote) return renderProblems();
  try { const r = await fetch("/api/problems"); if (r.ok) { sinceMap = (await r.json()).since || {}; renderProblems(); } } catch (e) { /* sem rede: mantém os tempos que já tem */ }
}
setInterval(() => { if (!$("paneProb").hidden) loadSince(); }, 60000); // enquanto a aba está aberta, atualiza os tempos
$("q").addEventListener("input", render);
FILTERS.forEach(id => $(id).addEventListener("change", render));
$("fClear").onclick = () => { $("q").value = ""; FILTERS.forEach(id => $(id).value = ""); render(); };
$("kpis").addEventListener("click", e => {
  const b = e.target.closest(".kpi"); if (!b) return;
  if (b.dataset.k === "all") Object.keys(statusOn).forEach(s => statusOn[s] = true); else statusOn[b.dataset.k] = !statusOn[b.dataset.k];
  document.querySelectorAll(".kpi").forEach(el => el.setAttribute("aria-pressed", el.dataset.k === "all" ? Object.values(statusOn).every(Boolean) : statusOn[el.dataset.k]));
  render();
});
$("list").addEventListener("click", e => { const a = e.target.dataset.empty; if (a === "import") $("file").click(); if (a === "add") $("btnAdd").click(); });
$("list").addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b && !editing) select(b.dataset.id, true); });
$("problems").addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b && !editing) select(b.dataset.id, true); });
function showTab(t) {
  const tabs = { cams: ["tabCams", "paneCams"], prob: ["tabProb", "paneProb"], areas: ["tabAreas", "paneAreas"] };
  for (const [k, [tab, pane]] of Object.entries(tabs)) { $(tab).setAttribute("aria-selected", k === t); $(pane).hidden = k !== t; }
  if (t === "prob") loadSince();
}
$("tabCams").onclick = () => showTab("cams");
$("tabProb").onclick = () => showTab("prob");
$("tabAreas").onclick = () => showTab("areas");

/* ---------- Ficha técnica ---------- */
function geUrl(c) { return `https://earth.google.com/web/@${c.lat.toFixed(6)},${c.lon.toFixed(6)},${Math.round(c.ground || 0)}a,250d,35y,${Math.round(c.heading)}h,60t,0r`; }
const isHttp = u => /^https?:\/\//i.test(String(u || "").trim());
function select(id, fly) {
  if (selected && byId[selected]?.entity) byId[selected].entity.billboard.image = ICONS[byId[selected].status];
  selected = id || null;
  const c = selected && byId[selected];
  $("card").classList.remove("collapsed"); // escolher outra câmera reabre a ficha
  if (!c) { $("card").hidden = true; render(); return; }
  c.entity.billboard.image = ICONS[c.status + "_sel"];
  const pos = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"][Math.round(c.heading / 45) % 8];
  $("card").innerHTML = `
    <div class="card-h">
      <button class="close" data-act="close" aria-label="Fechar ficha">×</button>
      <button class="close collapse" data-act="collapse" aria-label="Recolher a ficha" title="Recolher (a câmera continua selecionada)">›</button>
      <h2>${esc(c.id)}</h2><p>${esc(c.nome)}</p>
      <span class="pill ${c.status}"><i class="dot ${c.status}"></i>${STATUS[c.status].label}${c.status === "offline" && c.ultimoSinal ? " · " + since(c.ultimoSinal) : ""}</span>
      ${c.motivo ? `<div class="reason">${esc(c.motivo)}</div>` : ""}
    </div>
    <div class="sec"><h3>Equipamento</h3><dl>
      <dt>Tipo</dt><dd>${esc(c.tipo)}</dd><dt>Modelo</dt><dd>${esc(c.modelo) || "–"}</dd>
      <dt>Endereço IP</dt><dd>${esc(c.ip) || "–"}</dd><dt>Firmware</dt><dd>${esc(c.firmware) || "–"}</dd>
      <dt>Gravação</dt><dd>${esc(c.nvr) || "–"}${c.retencao ? " · " + esc(c.retencao) + " dias" : ""}</dd>
      ${c.stream && !isHttp(c.stream) ? `<dt>Stream</dt><dd>${esc(c.stream)}</dd>` : ""}</dl></div>
    <div class="sec"><h3>Posicionamento</h3><dl>
      <dt>Coordenadas</dt><dd>${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}</dd>
      <dt>Altura</dt><dd>${c.altura} m do solo</dd>
      <dt>Azimute</dt><dd>${Math.round(c.heading)}° (${pos})</dd>
      <dt>Inclinação</dt><dd>${Math.abs(c.tilt)}° abaixo do horizonte</dd>
      <dt>Campo de visão</dt><dd>${c.hfov}° horiz. · alcance ${c.alcance} m</dd></dl></div>
    <div class="sec"><h3>Gestão</h3><dl>
      <dt>Setor</dt><dd>${esc(c.setor)}</dd><dt>Instalada em</dt><dd>${esc(c.instalacao) || "–"}</dd>
      <dt>Últ. manutenção</dt><dd>${esc(c.manutencao) || "–"}</dd><dt>Responsável</dt><dd>${esc(c.responsavel) || "–"}</dd></dl></div>
    <div class="sec" id="maintSec" hidden><h3>Manutenção</h3><div id="maintBody"></div></div>
    <div class="sec" id="histSec" hidden><h3>Histórico · 30 dias</h3><div id="histBody"></div></div>
    <div class="sec" id="auditSec" hidden><h3>Alterações</h3><div id="auditBody"></div></div>
    <div class="actions">
      <button class="btn" data-act="fly">Centralizar</button>
      <button class="btn" data-act="pov">Ver da câmera</button>
      ${isHttp(c.stream) ? `<a class="btn wide" href="${esc(c.stream.trim())}" target="_blank" rel="noopener">Vídeo ao vivo ↗</a>` : ""}
      <a class="btn" href="${geUrl(c)}" target="_blank" rel="noopener">Google Earth ↗</a>
      <button class="btn primary" data-act="edit">Editar</button>
    </div>`;
  $("card").hidden = false;
  render(); loadHistory(c.id); loadMaint(c.id); loadAudit(c.id);
  if (fly) flyTo(c);
  document.querySelector(`#list button[data-id="${CSS.escape(c.id)}"]`)?.scrollIntoView({ block: "nearest" });
}
/* ---------- Manutenção por câmera ---------- */
const brDate = iso => iso.split("-").reverse().join("/"); // 2026-11-03 -> 03/11/2026
function parseDate(s) { // aceita 03/11/2026, 11/2026 e 2026-11-03; o resto vira "sem data"
  s = String(s || "").trim(); let m;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return new Date(+m[3], +m[2] - 1, +m[1]);
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{4})$/))) return new Date(+m[2], +m[1] - 1, 1);
  return null;
}
async function loadMaint(id, removedDate) { // removedDate: data do registro que acabou de ser excluído
  if (!remote) return;
  try {
    const r = await fetch("/api/maintenance?id=" + encodeURIComponent(id));
    if (!r.ok) return;
    const { items } = await r.json();
    if (selected !== id || editing || !$("maintBody")) return;
    $("maintBody").innerHTML = (items.length ? `<ul class="mlist">${items.slice(0, 6).map(m => `<li><span class="when">${brDate(m.done_on)}${m.tecnico ? " · " + esc(m.tecnico) : ""}</span>${readonly ? "<span></span>" : `<button class="x" data-del-maint="${m.id}" data-date="${m.done_on}" title="Excluir este registro" aria-label="Excluir registro">×</button>`}<span class="what">${esc(m.descricao)}</span></li>`).join("")}</ul>${items.length > 6 ? `<p class="asub">…e mais ${items.length - 6} registros mais antigos.</p>` : ""}` : `<p class="asub">Nenhum serviço registrado.</p>`) +
      (readonly ? "" : `<button class="btn sm" data-act="maint">+ Registrar manutenção</button>`);
    $("maintSec").hidden = false;
    syncMaint(id, items, removedDate);
  } catch (e) { console.error(e); }
}
function syncMaint(id, items, removedDate) { // "Últ. manutenção" da câmera acompanha o registro mais recente
  const c = byId[id], last = items[0] ? brDate(items[0].done_on) : removedDate && c?.manutencao === brDate(removedDate) ? "" : null; // sem registros: só limpa se o campo vinha do registro excluído (pode ser um texto importado)
  if (readonly || !c || last == null || c.manutencao === last) return;
  c.manutencao = last; save(); if (selected === id && !editing) select(id, false);
}
function openMaint(id) { $("maintTitle").textContent = `Registrar manutenção · ${id}`; $("mDate").value = new Date().toLocaleDateString("sv-SE"); $("mDate").max = $("mDate").value; $("mWho").value = $("mWhat").value = ""; $("maintMsg").textContent = ""; $("dlgMaint").showModal(); $("mWhat").focus(); }
$("maintCancel").onclick = () => $("dlgMaint").close();
$("maintForm").addEventListener("submit", async e => {
  e.preventDefault(); const id = selected; if (!id) return;
  const r = await fetch("/api/maintenance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ camera_id: id, done_on: $("mDate").value, tecnico: $("mWho").value, descricao: $("mWhat").value }) }).catch(() => null);
  if (!r) return $("maintMsg").textContent = "Sem conexão.";
  if (!r.ok) return $("maintMsg").textContent = (await r.json().catch(() => ({}))).error || "Não consegui registrar.";
  $("dlgMaint").close(); toast("Manutenção registrada."); loadMaint(id);
});
$("card").addEventListener("click", async e => {
  const b = e.target.closest("[data-del-maint]"); if (!b || !confirm("Excluir este registro de manutenção?")) return;
  const r = await fetch("/api/maintenance?id=" + b.dataset.delMaint, { method: "DELETE" }).catch(() => null);
  if (r && r.ok) loadMaint(selected, b.dataset.date); else toast("Não consegui excluir o registro.");
});

/* ---------- Alterações: quem mudou o quê ---------- */
const FIELD_LABEL = { status: "Status", nome: "Nome", setor: "Setor", tipo: "Tipo", modelo: "Modelo", motivo: "Motivo", ip: "IP", firmware: "Firmware", nvr: "NVR", retencao: "Retenção", instalacao: "Instalação", manutencao: "Últ. manutenção", responsavel: "Responsável", stream: "Vídeo", lat: "Latitude", lon: "Longitude", altura: "Altura", heading: "Azimute", tilt: "Inclinação", hfov: "Campo de visão", alcance: "Alcance" };
let auditLast = 0;
function auditRow(e) {
  const v = (f, x) => x == null || x === "" ? "(vazio)" : f === "status" ? STATUS[x]?.label || x : x.length > 40 ? x.slice(0, 40) + "…" : x;
  const what = e.action === "create" ? "criou a câmera" : e.action === "delete" ? "excluiu a câmera" : e.field ? `${FIELD_LABEL[e.field] || e.field}: ${esc(v(e.field, e.old_value))} → ${esc(v(e.field, e.new_value))}` : esc(e.new_value || "");
  return `<li><span class="when">${new Date(e.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${esc(String(e.who).split("@")[0])}</span><span></span><span class="what">${what}</span></li>`;
}
async function loadAudit(id, more) {
  if (!remote) return;
  if (!more) await settled();
  try {
    const r = await fetch(`/api/audit?id=${encodeURIComponent(id)}&limit=10${more ? "&before=" + auditLast : ""}`);
    if (!r.ok) return;
    const { events, more: has } = await r.json();
    if (selected !== id || editing || !$("auditBody")) return;
    if (events.length) auditLast = events[events.length - 1].id;
    if (!more) $("auditBody").innerHTML = events.length ? `<ul class="mlist"></ul>` : `<p class="asub">Nenhuma alteração registrada ainda.</p>`;
    $("auditBody").querySelector(".mlist")?.insertAdjacentHTML("beforeend", events.map(auditRow).join(""));
    $("auditBody").querySelector("[data-act=audit-more]")?.remove();
    if (has) $("auditBody").insertAdjacentHTML("beforeend", `<button class="btn sm" data-act="audit-more">Mostrar mais</button>`);
    $("auditSec").hidden = false;
  } catch (e) { console.error(e); }
}

/* ---------- Histórico completo: período + "carregar mais" ---------- */
let histId = null, histLast = 0, histPrev = null; // histPrev: horário do item mais recente já listado (para calcular a duração de cada status)
async function fillHistory(more) {
  if (!more) { $("histList").innerHTML = `<li class="empty">Carregando…</li>`; $("histAvail").textContent = ""; $("histMore").hidden = true; histLast = 0; histPrev = null; }
  try {
    const r = await fetch(`/api/history?id=${encodeURIComponent(histId)}&days=${$("histDays").value}&limit=50${more ? "&before=" + histLast : ""}`);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json(), fmt = t => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    if (!more) $("histAvail").innerHTML = d.availability == null ? "" : `Disponibilidade no período: <b>${d.availability.toFixed(1).replace(".", ",")}%</b>`;
    const rows = d.events.map(e => { const t = new Date(e.at).getTime(), li = `<li><time>${fmt(e.at)}</time><span><i class="dot ${esc(e.status)}"></i> ${esc(STATUS[e.status]?.label || e.status)}</span><span class="dur">${histPrev == null ? "até agora" : "durou " + dur(histPrev - t)}</span>${e.motivo ? `<span class="why">${esc(e.motivo)}</span>` : ""}</li>`; histPrev = t; return li; });
    if (!more) $("histList").innerHTML = "";
    $("histList").insertAdjacentHTML("beforeend", rows.join("") || (more ? "" : `<li class="empty">Nenhuma mudança de status neste período.</li>`));
    histLast = d.events.length ? d.events[d.events.length - 1].id : histLast; $("histMore").hidden = !d.more;
  } catch (e) { console.error(e); if (!more) $("histList").innerHTML = `<li class="empty">Não consegui carregar o histórico.</li>`; else toast("Não consegui carregar mais."); }
}
function openHistory(id) { histId = id; $("histTitle").textContent = `Histórico de ${id}`; $("histDays").value = "30"; $("dlgHist").showModal(); fillHistory(false); }
$("histDays").onchange = () => fillHistory(false);
$("histMore").onclick = () => fillHistory(true);
$("histClose").onclick = () => $("dlgHist").close();
async function settled() { // espera a gravação pendente chegar ao banco (histórico e alterações dependem dela)
  if (pushTimer) await new Promise(r => setTimeout(r, 700)); // deixa a gravação pendente entrar na fila...
  await pushQueue; // ...e espera ela chegar ao banco
}
async function loadHistory(id) {
  if (!remote) return;
  await settled();
  try {
    const r = await fetch("/api/history?id=" + encodeURIComponent(id));
    if (!r.ok) return;
    const { events, availability } = await r.json();
    if (selected !== id || editing || !$("histBody")) return; // a ficha pode ter mudado enquanto a resposta chegava
    const fmt = t => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    $("histBody").innerHTML = `<p class="asub">Disponibilidade: <b>${availability == null ? "–" : availability.toFixed(1).replace(".", ",") + "%"}</b></p>` +
      `<dl>${events.slice(0, 8).map(e => `<dt>${fmt(e.at)}</dt><dd><i class="dot ${esc(e.status)}"></i> ${esc(STATUS[e.status]?.label || e.status)}${e.motivo ? " · " + esc(e.motivo) : ""}</dd>`).join("")}</dl>` +
      (events.length ? `<button class="btn sm" data-act="hist">Ver histórico completo</button>` : "");
    $("histSec").hidden = false;
  } catch (e) { console.error(e); }
}
function flyTo(c) {
  viewer.camera.flyToBoundingSphere(new C.BoundingSphere(camPos(c), Math.max(60, c.alcance * 1.4)), {
    offset: new C.HeadingPitchRange((c.heading + 180) * D2R, -35 * D2R, Math.max(180, c.alcance * 3)), duration: 1.4 });
}

/* ---------- Edição ---------- */
let editing = null, snapshot = null;
const editOpen = { id: true, visao: true, pos: false, equip: false, gestao: false, ...store.get("editSections") }; // seções abertas do formulário (lembra entre edições)
function sectionHints() { // resumo na linha da seção, útil quando ela está recolhida
  const c = editing; if (!c || !$("h_visao")) return;
  $("h_visao").textContent = `${Math.round(c.heading)}° · ${Math.abs(Math.round(c.tilt))}° · ${c.hfov}° · ${Math.round(c.alcance)} m`;
  $("h_pos").textContent = `${Number(c.lat).toFixed(5)}, ${Number(c.lon).toFixed(5)}`;
}
function edit(id) {
  if (readonly) return;
  const c = byId[id]; editing = c; snapshot = { ...c };
  const t = (label, f, full) => `<label class="fld${full ? " full" : ""}"><span>${label}</span><input data-f="${f}" value="${esc(c[f])}"></label>`;
  const n = (label, f, step) => `<label class="fld"><span>${label}</span><input data-f="${f}" type="number" step="${step}" value="${c[f]}"></label>`;
  const r = (label, f, min, max, unit) => { const v = Math.abs(c[f]); return `<label class="fld full"><span>${label}<output id="o_${f}">${v}${unit}</output></span><input data-f="${f}" data-unit="${unit}" type="range" min="${min}" max="${max}" step="1" value="${v}"></label>`; };
  const sel = (label, f, opts) => `<label class="fld"><span>${label}</span><select data-f="${f}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === c[f] ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const tipos = Object.keys(TIPOS).map(k => [k, k]); if (!TIPOS[c.tipo]) tipos.push([c.tipo, c.tipo]);
  const sec = (key, title, body) => `<details data-sec="${key}"${editOpen[key] ? " open" : ""}><summary>${title}<span class="hint" id="h_${key}"></span></summary><div class="grid">${body}</div></details>`;
  $("card").innerHTML = `
    <div class="card-h"><button class="close" data-act="cancel" aria-label="Cancelar edição">×</button>
      <h2>${c._new ? "Nova câmera" : "Editar " + esc(c.id)}</h2><p>${c._new ? "Arraste a câmera para posicioná-la e o ponto azul para girar e definir o alcance." : "Arraste a câmera ou o ponto azul no mapa; o cone acompanha."}</p></div>
    <div class="form">
      ${sec("id", "Identificação", `${t("ID", "id")}${sel("Status", "status", Object.entries(STATUS).map(([k, v]) => [k, v.label]))}
        ${t("Nome", "nome", true)}${t("Setor", "setor")}${sel("Tipo", "tipo", tipos)}`)}
      ${sec("visao", "Visão", `${r("Azimute (direção)", "heading", 0, 359, "°")}${r("Inclinação para baixo", "tilt", 0, 89, "°")}
        ${r("Campo de visão horizontal", "hfov", 10, 180, "°")}${r("Alcance", "alcance", 5, 300, " m")}`)}
      ${sec("pos", "Posição", `${n("Latitude", "lat", "0.000001")}${n("Longitude", "lon", "0.000001")}${r("Altura do solo", "altura", 1, 80, " m")}`)}
      ${sec("equip", "Equipamento", `${t("Modelo", "modelo", true)}${t("Endereço IP", "ip")}${t("NVR / gravador", "nvr")}${t("Link do vídeo (http/https ou rtsp)", "stream", true)}`)}
      ${sec("gestao", "Gestão", `${t("Motivo / observação", "motivo", true)}${t("Responsável", "responsavel")}${t("Instalada em", "instalacao")}`)}
      <div class="confirm" id="delBox">${c._new ? "" : `<button class="btn danger" data-act="del">Excluir câmera</button>`}</div>
    </div>
    <div class="actions"><button class="btn" data-act="cancel">Cancelar</button><button class="btn primary" data-act="save">Salvar</button></div>`;
  $("card").hidden = false;
  camDS.clustering.enabled = false; // senão a câmera em edição pode virar parte de um grupo e não dá para arrastar
  sectionHints(); updateHandle(); scheduleCones();
  // se a câmera ou o ponto azul ficaram fora da área visível do mapa (a ficha ocupa a coluna da direita), recentraliza
  const map = $("map").getBoundingClientRect(), hidden = pos => { const w = pos && C.SceneTransforms.worldToWindowCoordinates(scene, pos); return !w || w.x < 24 || w.y < 24 || w.x > map.width - 24 || w.y > map.height - 24; };
  if (hidden(camPos(c)) || hidden(handleEnt.position.getValue(C.JulianDate.now()))) flyTo(c);
}
/* ---------- Arrastar no mapa (câmera e ponto de direção/alcance) ---------- */
const handleDS = new C.CustomDataSource("handle"); viewer.dataSources.add(handleDS);
let handleEnt = null, drag = null;
function updateHandle() {
  if (!editing) { handleDS.entities.removeAll(); handleEnt = null; return; }
  const c = editing, k = 111320 * Math.cos(c.lat * D2R);
  const pos = C.Cartesian3.fromDegrees(c.lon + Math.sin(c.heading * D2R) * c.alcance / k, c.lat + Math.cos(c.heading * D2R) * c.alcance / 111320, (c.ground || 0) + 1);
  if (handleEnt) handleEnt.position = pos;
  else handleEnt = handleDS.entities.add({ position: pos, point: { pixelSize: 15, color: C.Color.fromCssColorString("#5cc8e6"), outlineColor: C.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
}
function syncForm(f) { // espelha no formulário o que foi arrastado
  const el = $("card").querySelector(`[data-f="${f}"]`); if (!el) return;
  const v = editing[f]; el.value = el.type === "range" ? Math.abs(Math.round(v)) : v;
  const o = $("o_" + f); if (o) o.textContent = Math.abs(Math.round(v)) + el.dataset.unit;
  sectionHints();
}
$("card").addEventListener("toggle", e => { const k = e.target.dataset?.sec; if (k) { editOpen[k] = e.target.open; store.set("editSections", editOpen); } }, true); // 'toggle' não borbulha: captura
function dragTo(pos) {
  const ll = pickLL(pos), c = editing; if (!ll || !c) return;
  if (drag === "move") { c.lat = +ll.lat.toFixed(7); c.lon = +ll.lon.toFixed(7); c.ground = ll.h; c.entity.position = camPos(c); syncForm("lat"); syncForm("lon"); }
  else {
    const dx = (ll.lon - c.lon) * 111320 * Math.cos(c.lat * D2R), dy = (ll.lat - c.lat) * 111320;
    c.heading = Math.round((Math.atan2(dx, dy) / D2R + 360) % 360) % 360; c.alcance = Math.min(300, Math.max(5, Math.round(Math.hypot(dx, dy))));
    syncForm("heading"); syncForm("alcance");
  }
  updateHandle(); scheduleCones();
}
$("card").addEventListener("input", e => {
  const el = e.target, f = el.dataset.f; if (!f || !editing) return;
  let v = el.value;
  if (el.type === "range" || el.type === "number") { v = parseFloat(v); if (!Number.isFinite(v)) return; }
  if (f === "tilt") v = -Math.abs(v);
  if (f === "lat" && Math.abs(v) > 90 || f === "lon" && Math.abs(v) > 180) return;
  editing[f] = f === "id" ? v.trim() : v;
  if (el.type === "range") $("o_" + f).textContent = Math.abs(v) + el.dataset.unit;
  if (f === "lat" || f === "lon" || f === "altura") editing.entity.position = camPos(editing);
  if (["lat", "lon", "heading", "alcance"].includes(f)) updateHandle();
  sectionHints();
  if (f === "status") editing.entity.billboard.image = ICONS[v + "_sel"];
  scheduleCones();
});
function cancelEdit() {
  const c = editing; editing = null;
  if (c._new) { cams = cams.filter(x => x !== c); camDS.entities.remove(c.entity); index(); return select(null); }
  Object.assign(c, snapshot); c.entity.position = camPos(c); select(c.id);
}
function saveEdit() {
  const c = editing;
  if (!c.id) return toast("Informe um ID para a câmera.");
  if (cams.some(x => x !== c && x.id === c.id)) return toast(`Já existe uma câmera com o ID ${c.id}.`);
  delete c._new; editing = null;
  c.entity.camId = c.id; index(); save(); renderSetores(); scheduleCoverage();
  select(c.id); toast("Câmera salva.");
}
$("cardTab").onclick = () => $("card").classList.remove("collapsed");
$("card").addEventListener("click", e => {
  const act = e.target.closest("[data-act]")?.dataset.act; if (!act) return;
  const c = editing || byId[selected];
  if (act === "close") select(null);
  if (act === "collapse") $("card").classList.add("collapsed");
  if (act === "hist") openHistory(c.id);
  if (act === "maint") openMaint(c.id);
  if (act === "audit-more") loadAudit(c.id, true);
  if (act === "fly") flyTo(c);
  if (act === "pov") viewer.camera.flyTo({ destination: camPos(c), orientation: { heading: c.heading * D2R, pitch: c.tilt * D2R, roll: 0 }, duration: 1.6 });
  if (act === "edit") edit(c.id);
  if (act === "cancel") cancelEdit();
  if (act === "save") saveEdit();
  if (act === "del") $("delBox").innerHTML = `<span>Excluir ${esc(c.id)} definitivamente?</span><button class="btn danger solid" data-act="delok">Excluir</button><button class="btn" data-act="delno">Manter</button>`;
  if (act === "delno") $("delBox").innerHTML = `<button class="btn danger" data-act="del">Excluir câmera</button>`;
  if (act === "delok") { editing = null; cams = cams.filter(x => x !== c); camDS.entities.remove(c.entity); index(); save(); renderSetores(); scheduleCoverage(); select(null); toast(`${c.id} excluída.`); }
});

/* ---------- Barra de ferramentas ---------- */
/* ---------- Busca de endereço ---------- */
const geoDS = new C.CustomDataSource("geo"); viewer.dataSources.add(geoDS);
let geoList = [];
function clearGeo() { geoDS.entities.removeAll(); $("geoRes").hidden = true; }
function goToAddress(x) {
  geoDS.entities.removeAll(); $("geoRes").hidden = true;
  geoDS.entities.add({ position: C.Cartesian3.fromDegrees(x.lon, x.lat), point: { pixelSize: 13, color: C.Color.fromCssColorString("#e9b44c"), outlineColor: C.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: { text: x.label.split(",").slice(0, 2).join(","), font: "600 13px Barlow, sans-serif", fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -22), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
  const [s, n, w, e] = x.bbox && x.bbox.length === 4 ? x.bbox : [x.lat, x.lat, x.lon, x.lon];
  const radius = Math.max(150, Math.hypot((e - w) * 111320 * Math.cos(x.lat * D2R), (n - s) * 111320) / 2); // mínimo de 150 m, para um endereço não virar zoom extremo
  viewer.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees((w + e) / 2, (s + n) / 2), radius), { offset: new C.HeadingPitchRange(0, -55 * D2R, radius * 2.6), duration: 1.4 });
}
$("geoForm").addEventListener("submit", async e => {
  e.preventDefault(); const q = $("geoQ").value.trim(), ul = $("geoRes");
  if (q.length < 3) return toast("Digite ao menos 3 letras do endereço.");
  ul.innerHTML = `<li class="empty">Buscando…</li>`; ul.hidden = false;
  try {
    const r = await fetch("/api/geocode?q=" + encodeURIComponent(q)), d = await r.json();
    if (!r.ok) throw new Error(d.error || r.status);
    geoList = d;
    ul.innerHTML = d.length ? d.map((x, i) => `<li><button type="button" data-i="${i}">${esc(x.label)}</button></li>`).join("") : `<li class="empty">Nenhum endereço encontrado.</li>`;
  } catch (err) { ul.hidden = true; toast(err.message || "Não consegui buscar o endereço."); }
});
$("geoRes").addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (b) goToAddress(geoList[b.dataset.i]); });
$("geoQ").addEventListener("input", () => { if (!$("geoQ").value) clearGeo(); });
document.addEventListener("click", e => { if (!$("geoRes").hidden && !$("geoForm").contains(e.target)) $("geoRes").hidden = true; });
function setLayers(open) { $("layers").hidden = !open; $("btnLayers").setAttribute("aria-expanded", open); }
$("btnLayers").onclick = e => { e.stopPropagation(); setLayers($("layers").hidden); };
document.addEventListener("click", e => { if (!$("layers").hidden && !$("layers").contains(e.target)) setLayers(false); });
const press = (sel, b) => document.querySelectorAll(sel).forEach(x => x.setAttribute("aria-pressed", x === b));
document.querySelectorAll("[data-cones]").forEach(b => b.onclick = () => { coneMode = b.dataset.cones; press("[data-cones]", b); buildCones(); });
document.querySelectorAll("[data-base]").forEach(b => b.onclick = () => {
  viewer.imageryLayers.removeAll(); viewer.imageryLayers.addImageryProvider(BASES[b.dataset.base]()); press("[data-base]", b);
});
document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => applyMode(b.dataset.mode));
function flyHome(duration = 1.4) {
  if (!cams.length) return;
  const bs = C.BoundingSphere.fromPoints(cams.map(camPos));
  viewer.camera.flyToBoundingSphere(bs, { offset: new C.HeadingPitchRange(5 * D2R, -48 * D2R, Math.max(400, bs.radius * 2.3)), duration });
}
$("btnHome").onclick = () => flyHome();
function toast(msg, ms = 4000) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, ms); }

/* ---------- Relevo, prédios e Google 3D ---------- */
let terrainTP = null, osm = null, google = null, pendingMode = null;
async function sampleGround(list) {
  if (mode3d === "plano" || !terrainTP || !list.length) { list.forEach(c => c.ground = 0); return; }
  const cartos = list.map(c => C.Cartographic.fromDegrees(c.lon, c.lat));
  await C.sampleTerrainMostDetailed(terrainTP, cartos);
  list.forEach((c, i) => c.ground = cartos[i].height || 0);
}
async function applyMode(mode) {
  if (mode !== "plano" && !token) { pendingMode = mode; return openToken(); }
  toast(mode === "plano" ? "Voltando ao mapa plano…" : "Carregando relevo e prédios 3D…");
  try {
    C.Ion.defaultAccessToken = token;
    if (google) { scene.primitives.remove(google); google = null; }
    if (osm) { scene.primitives.remove(osm); osm = null; }
    scene.globe.show = true;
    if (mode === "plano") viewer.terrainProvider = new C.EllipsoidTerrainProvider();
    else {
      terrainTP = terrainTP || await C.CesiumTerrainProvider.fromIonAssetId(1);
      viewer.terrainProvider = terrainTP;
      if (mode === "terreno") osm = scene.primitives.add(await C.createOsmBuildingsAsync());
      else { google = scene.primitives.add(await C.createGooglePhotorealistic3DTileset()); scene.globe.show = false; }
    }
    mode3d = mode; store.set("mode3d", mode);
    await sampleGround(cams);
    cams.forEach(c => c.entity.position = camPos(c));
    press("[data-mode]", document.querySelector(`[data-mode="${mode}"]`));
    document.querySelectorAll("[data-base]").forEach(b => b.disabled = mode === "google");
    render(); computeCoverage();
    toast(mode === "plano" ? "Mapa plano." : mode === "terreno" ? "Relevo e prédios do OpenStreetMap carregados." : "Cidade fotorrealista do Google carregada.");
  } catch (err) {
    console.error(err);
    toast(mode === "google" ? "Não consegui carregar o Google 3D. Adicione o asset Google Photorealistic 3D Tiles ao seu token no Cesium ion." : "Não consegui carregar o terreno. Confira o token do Cesium ion.");
  }
}
// Enter no campo acionaria o 1º botão do form ("Remover token"); força Salvar
$("token").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("dlg").close("save"); } });
function openToken() { $("token").value = token; $("dlg").showModal(); }
$("btnCfg").onclick = () => { pendingMode = null; openToken(); };
$("dlg").addEventListener("close", () => {
  const v = $("dlg").returnValue;
  if (v === "save") token = $("token").value.trim();
  else if (v === "clear") token = "";
  else { pendingMode = null; return; }
  store.set("ionToken", token || null); saveTokenRemote();
  if (!token) return applyMode("plano");
  applyMode(pendingMode || (mode3d === "plano" ? "terreno" : mode3d)); pendingMode = null;
});

/* ---------- Importar / exportar ---------- */
const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES = {
  id: ["id", "codigo", "cod", "camera", "cam", "identificador"], nome: ["nome", "name", "descricao", "local", "localizacao"],
  lat: ["lat", "latitude"], lon: ["lon", "lng", "long", "longitude"], altura: ["altura", "alturam", "height", "alt"],
  heading: ["azimute", "azimutegraus", "azimuth", "heading", "direcao", "rumo", "orientacao"], tilt: ["inclinacao", "inclinacaograus", "tilt", "pitch"],
  hfov: ["fov", "hfov", "angulo", "campodevisao", "angulodevisao", "fovgraus"], alcance: ["alcance", "alcancem", "range", "distancia"],
  setor: ["setor", "area", "zona", "regiao", "bairro"], tipo: ["tipo", "type"], modelo: ["modelo", "model"], ip: ["ip", "enderecoip"],
  firmware: ["firmware"], nvr: ["nvr", "gravador", "dvr", "gravacao"], status: ["status", "situacao", "estado"], motivo: ["motivo", "observacao", "obs"],
  responsavel: ["responsavel", "equipe"], instalacao: ["instalacao", "datainstalacao", "instaladaem"], manutencao: ["manutencao", "ultimamanutencao", "ultmanutencao"],
  stream: ["stream", "url", "link", "rtsp", "video", "linkdovideo"],
};
const KEYMAP = {}; for (const [k, list] of Object.entries(ALIASES)) list.forEach(a => KEYMAP[a] = k);
const num = v => typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
function normStatus(v) {
  const s = norm(v);
  if (/^(off|offline|inativ|fora|desligad|caid)/.test(s)) return "offline";
  if (/^(alert|warn|degrad|atenc|instav)/.test(s)) return "alerta";
  if (/^(planej|projet|planned|futur|previst)/.test(s)) return "planejada";
  return "online";
}
function mapRows(rows, keepNoCoords = false) { // keepNoCoords: aceita linha com ID mas sem coordenadas (só serve para atualizar uma câmera existente)
  const out = []; let skipped = 0, n = 0;
  for (const row of rows) {
    const r = {}; for (const [k, v] of Object.entries(row)) { const key = KEYMAP[norm(k)]; if (key && v !== "" && r[key] == null) r[key] = v; }
    const lat = num(r.lat), lon = num(r.lon);
    const coords = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    if (!coords && !(keepNoCoords && r.id != null)) { skipped++; continue; }
    n++;
    const tipo = Object.keys(TIPOS).find(t => norm(r.tipo || "").includes(norm(t))) || (r.tipo ? String(r.tipo) : "Bullet");
    const def = TIPOS[tipo] || TIPOS.Bullet, f = (v, d) => Number.isFinite(num(v)) ? num(v) : d;
    out.push({
      _has: Object.keys(r).filter(k => coords || (k !== "lat" && k !== "lon")), // colunas preenchidas nesta linha (para atualizar só o que veio na planilha)
      _nocoords: !coords,
      id: String(r.id ?? "CAM-" + String(n).padStart(3, "0")).trim(), nome: String(r.nome ?? `Câmera ${n}`), setor: String(r.setor ?? "Sem setor"),
      tipo, modelo: String(r.modelo ?? ""), lat: coords ? lat : 0, lon: coords ? lon : 0, ground: 0,
      altura: f(r.altura, 6), heading: ((f(r.heading, 0) % 360) + 360) % 360, tilt: -Math.abs(f(r.tilt, 20)),
      hfov: Math.min(180, Math.max(5, f(r.hfov, def.hfov))), alcance: Math.max(1, f(r.alcance, def.alc)),
      status: normStatus(r.status ?? ""), motivo: String(r.motivo ?? ""), ultimoSinal: 0,
      ip: String(r.ip ?? ""), firmware: String(r.firmware ?? ""), nvr: String(r.nvr ?? ""), retencao: "",
      instalacao: String(r.instalacao ?? ""), manutencao: String(r.manutencao ?? ""), responsavel: String(r.responsavel ?? ""), stream: String(r.stream ?? ""),
    });
  }
  const seen = new Set(); out.forEach((c, i) => { while (seen.has(c.id)) c.id = c.id + "-" + (i + 1); seen.add(c.id); });
  return { cams: out, skipped };
}
// autoteste do leitor de planilhas (vírgula decimal, acentos, inclinação positiva, status em português)
(() => {
  const t = mapRows([{ "Latitude": "-23,5", "Longitude": "-46,6", "Inclinação (°)": "20", "Status": "Fora do ar", "Azimute": "-90" }, { "Latitude": "", "Longitude": "1" }]);
  console.assert(t.cams.length === 1 && t.skipped === 1 && t.cams[0].lat === -23.5 && t.cams[0].tilt === -20 && t.cams[0].status === "offline" && t.cams[0].heading === 270, "mapRows falhou", t);
})();

function exportRows(list) {
  return list.map(c => ({ ID: c.id, Nome: c.nome, Setor: c.setor, Tipo: c.tipo, Modelo: c.modelo, Latitude: +c.lat.toFixed(7), Longitude: +c.lon.toFixed(7),
    Altura: c.altura, Azimute: Math.round(c.heading), "Inclinação": Math.abs(c.tilt), FOV: c.hfov, Alcance: c.alcance, Status: STATUS[c.status].label,
    Motivo: c.motivo, IP: c.ip, Firmware: c.firmware, NVR: c.nvr, "Responsável": c.responsavel, "Instalação": c.instalacao, "Manutenção": c.manutencao, Stream: c.stream }));
}
function writeXlsx(rows, name) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Câmeras"); XLSX.writeFile(wb, name); }
function download(text, name, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$("btnData").onclick = () => { $("resetBox").innerHTML = `<button class="btn danger" id="btnReset">Voltar aos dados de exemplo</button>`; $("dbBox").hidden = !remote || readonly || !(store.get("cams") || []).length; $("dlgData").showModal(); };
$("dataClose").onclick = () => $("dlgData").close();
$("btnImport").onclick = () => $("file").click();
$("btnTemplate").onclick = () => writeXlsx(exportRows(cams.slice(0, 3)), "modelo-cameras.xlsx");
$("btnXlsx").onclick = () => writeXlsx(exportRows(cams), "cameras.xlsx");
$("file").addEventListener("change", async e => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    let wb;
    if (/\.csv$/i.test(file.name)) { // CSV: UTF-8, ou Windows-1252 (padrão do Excel em português)
      let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder("windows-1252").decode(buf); }
      wb = XLSX.read(text.replace(/^﻿/, ""), { type: "string" });
    } else wb = XLSX.read(buf);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
    const res = mapRows(rows, true);
    if (!res.cams.length) return toast("Nenhuma linha com Latitude e Longitude válidas. Confira os nomes das colunas no modelo.");
    $("dlgData").close(); previewImport(res);
  } catch (err) { console.error(err); toast("Não consegui ler esse arquivo. Use .xlsx, .xls ou .csv."); }
});

/* ---------- Importar com prévia: atualizar por ID ou substituir tudo ---------- */
const IMPORT_FIELDS = ["nome", "setor", "tipo", "modelo", "lat", "lon", "altura", "heading", "tilt", "hfov", "alcance", "status", "motivo", "ip", "firmware", "nvr", "instalacao", "manutencao", "responsavel", "stream"];
let pendingImport = null;
function planImport(res, base) { // compara a planilha com as câmeras atuais
  const cur = Object.fromEntries(base.map(c => [c.id, c]));
  const merge = base.length > 0 && res.cams.every(c => c._has.includes("id")); // sem ID em todas as linhas, não dá para casar com as atuais
  const nuevas = [], alteradas = []; let iguais = 0, orfas = 0;
  for (const n of res.cams) {
    const o = cur[n.id]; if (!o) { n._nocoords ? orfas++ : nuevas.push(n); continue; }
    const campos = n._has.filter(k => IMPORT_FIELDS.includes(k) && String(o[k]) !== String(n[k]));
    campos.length ? alteradas.push({ id: n.id, campos }) : iguais++;
  }
  const ausentes = base.filter(c => !res.cams.some(n => n.id === c.id)).length;
  return { merge, nuevas, alteradas, iguais, ausentes, orfas, comCoords: res.cams.filter(c => !c._nocoords).length };
}
function previewImport(res) {
  const base = isSample ? [] : cams, p = planImport(res, base);
  if (!p.comCoords && !(p.merge && p.alteradas.length + p.iguais)) return toast(p.merge ? "Nenhuma linha da planilha casou com as câmeras atuais (confira a coluna ID)." : "Nenhuma linha com Latitude e Longitude válidas. Confira os nomes das colunas no modelo.");
  pendingImport = { res, p };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  $("impSummary").textContent = p.merge
    ? `${plural(p.nuevas.length, "câmera nova", "câmeras novas")} · ${plural(p.alteradas.length, "alterada", "alteradas")} · ${plural(p.iguais, "igual", "iguais")} · ${plural(p.ausentes, "câmera atual fora da planilha", "câmeras atuais fora da planilha")}`
    : base.length ? `A planilha tem ${plural(p.comCoords, "câmera", "câmeras")} e vai substituir as ${base.length} atuais.` : `${plural(p.comCoords, "câmera será adicionada", "câmeras serão adicionadas")}.`;
  $("impChanges").innerHTML = p.merge ? p.alteradas.slice(0, 6).map(a => `<li>${esc(a.id)}: ${esc(a.campos.join(", "))}</li>`).join("") + (p.alteradas.length > 6 ? `<li>…e mais ${p.alteradas.length - 6}</li>` : "") : "";
  $("impModes").hidden = !p.merge;
  document.querySelector('input[name=impMode][value=merge]').checked = true;
  $("impNote").textContent = [base.length && !p.merge ? "A planilha precisa ter a coluna ID em todas as linhas para atualizar por ID; por isso só dá para substituir." : "", res.skipped + (p.merge ? p.orfas : res.cams.length - p.comCoords) ? `${res.skipped + (p.merge ? p.orfas : res.cams.length - p.comCoords)} linhas ignoradas (sem coordenadas válidas ou sem câmera com esse ID).` : ""].filter(Boolean).join(" ");
  $("dlgImport").showModal();
}
async function applyImport({ res, p }, mode) {
  if (editing) cancelEdit();
  selected = null; $("card").hidden = true;
  const clean = c => { delete c._has; delete c._nocoords; return c; };
  if (mode === "merge") {
    const cur = Object.fromEntries(cams.map(c => [c.id, c]));
    for (const n of res.cams) { const o = cur[n.id]; if (o) n._has.filter(k => IMPORT_FIELDS.includes(k)).forEach(k => o[k] = n[k]); else if (!n._nocoords) cams.push(clean(n)); }
  } else cams = res.cams.filter(c => !c._nocoords).map(clean);
  index(); await sampleGround(cams); rebuildEntities(); save(); renderSetores(); $("fSetor").value = "";
  render(); computeCoverage(); flyHome();
  toast(mode === "merge" ? `Importado: ${p.nuevas.length} novas, ${p.alteradas.length} atualizadas.` : `${cams.length} câmeras importadas${res.skipped ? `, ${res.skipped} linhas ignoradas (sem coordenadas válidas)` : ""}.`);
}
$("impCancel").onclick = () => { pendingImport = null; $("dlgImport").close(); };
$("impOk").onclick = async () => {
  const job = pendingImport; pendingImport = null; $("dlgImport").close(); if (!job) return;
  await applyImport(job, job.p.merge && document.querySelector("input[name=impMode]:checked").value === "merge" ? "merge" : "replace");
};
$("resetBox").addEventListener("click", async e => {
  if (e.target.id === "btnReset") return $("resetBox").innerHTML = `<span style="grid-column:1/-1;font-size:13px">${remote ? "Isso apaga as câmeras e áreas do banco de dados." : "Isso apaga as câmeras e áreas atuais deste navegador."}</span><button class="btn danger solid" id="resetOk">Apagar e restaurar</button><button class="btn" id="resetNo">Manter</button>`;
  if (e.target.id === "resetNo") return $("resetBox").innerHTML = `<button class="btn danger" id="btnReset">Voltar aos dados de exemplo</button>`;
  if (e.target.id !== "resetOk") return;
  store.set("cams", null); store.set("areas", null);
  cams = sampleCams(); areas = []; isSample = true; $("tagSample").hidden = false;
  selected = null; editing = null; $("card").hidden = true;
  index(); await sampleGround(cams); rebuildEntities(); rebuildAreaEntities(); renderSetores(); render(); computeCoverage(); flyHome();
  $("dlgData").close(); pushRemote(); toast("Dados de exemplo restaurados.");
});

$("btnKml").onclick = () => {
  const x = s => String(s ?? "").replace(/[&<>]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m]);
  const bgr = h => h.slice(5, 7) + h.slice(3, 5) + h.slice(1, 3);
  const styles = Object.entries(STATUS).map(([k, v]) => `<Style id="${k}"><IconStyle><color>ff${bgr(v.color)}</color><Icon><href>http://maps.google.com/mapfiles/kml/shapes/camera.png</href></Icon></IconStyle><LineStyle><color>ff${bgr(v.color)}</color><width>1.5</width></LineStyle><PolyStyle><color>55${bgr(v.color)}</color></PolyStyle></Style>`).join("");
  const marks = visible().map(c => {
    const ring = footLL(c).map(([lo, la]) => `${lo.toFixed(7)},${la.toFixed(7)},0`); ring.push(ring[0]);
    const desc = `${x(c.nome)}<br>Status: ${STATUS[c.status].label}${c.motivo ? " — " + x(c.motivo) : ""}<br>${x(c.tipo)} · ${x(c.modelo)}<br>IP ${x(c.ip)} · ${x(c.nvr)}<br>Altura ${c.altura} m · azimute ${Math.round(c.heading)}° · inclinação ${Math.abs(c.tilt)}° · FOV ${c.hfov}° · alcance ${c.alcance} m`;
    return `<Placemark><name>${x(c.id)}</name><description><![CDATA[${desc}]]></description><styleUrl>#${c.status}</styleUrl><MultiGeometry><Point><altitudeMode>relativeToGround</altitudeMode><coordinates>${c.lon.toFixed(7)},${c.lat.toFixed(7)},${c.altura}</coordinates></Point><Polygon><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${ring.join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark>`;
  }).join("\n");
  const areaMarks = areas.map(a => `<Placemark><name>${x(a.nome)}</name><Style><LineStyle><color>ffe6c85c</color><width>2.5</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style><Polygon><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${[...a.pts, a.pts[0]].map(p => p.join(",") + ",0").join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`).join("\n");
  download(`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Mapa de Câmeras 3D</name>${styles}\n${marks}\n${areaMarks}\n</Document></kml>`, "cameras.kml", "application/vnd.google-earth.kml+xml");
  toast(`KML com ${visible().length} câmeras gerado. No Google Earth: Projetos → Abrir → Importar arquivo KML.`);
};

/* ---------- Relatório (imprimir / salvar em PDF) ---------- */
function availChart(days) { // barras por dia (0–100%), em SVG para imprimir bem
  const W = 720, H = 150, L = 36, B = 18, T = 6, bw = (W - L) / days.length, h = H - B - T;
  const col = p => p >= 95 ? "#2e9e6b" : p >= 80 ? "#c58f1c" : "#d14343", fd = s => s.slice(8) + "/" + s.slice(5, 7);
  const bars = days.map((d, i) => d.pct == null ? "" : `<rect x="${(L + i * bw + 1).toFixed(1)}" y="${(T + h * (1 - d.pct / 100)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(h * d.pct / 100).toFixed(1)}" fill="${col(d.pct)}"><title>${esc(d.day)}: ${d.pct}%</title></rect>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Disponibilidade por dia" font-family="sans-serif" font-size="10" fill="#555">
    <line x1="${L}" x2="${W}" y1="${T}" y2="${T}" stroke="#ddd"/><line x1="${L}" x2="${W}" y1="${T + h}" y2="${T + h}" stroke="#999"/>
    <text x="${L - 4}" y="${T + 3}" text-anchor="end">100%</text><text x="${L - 4}" y="${T + h + 3}" text-anchor="end">0%</text>
    ${bars}<text x="${L}" y="${H - 4}">${fd(days[0].day)}</text><text x="${W}" y="${H - 4}" text-anchor="end">${fd(days[days.length - 1].day)}</text></svg>`;
}
$("btnReport").onclick = async () => {
  viewer.render();
  let img = ""; try { img = viewer.canvas.toDataURL("image/jpeg", 0.85); } catch (e) {}
  let av = null; // disponibilidade vem do histórico no banco; sem login/banco o relatório sai sem esta seção
  if (remote) try { const r = await fetch("/api/availability"); if (r.ok) av = await r.json(); } catch (e) {}
  const k = counts(), inst = cams.length - k.planejada, now = new Date();
  const row = c => `<tr><td>${esc(c.id)}</td><td>${esc(c.nome)}</td><td>${esc(c.setor)}</td><td>${esc(c.tipo)}</td><td>${STATUS[c.status].label}</td><td>${esc(c.motivo)}</td><td>${esc(c.ip)}</td></tr>`;
  const head = `<tr><th>ID</th><th>Nome</th><th>Setor</th><th>Tipo</th><th>Status</th><th>Motivo</th><th>IP</th></tr>`;
  const probs = cams.filter(c => c.status === "offline" || c.status === "alerta").sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  $("report").innerHTML = `
    <h1>Relatório de câmeras</h1>
    <div class="meta">Gerado em ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${isSample ? " · dados de exemplo" : ""}</div>
    <div class="rk"><div><b>${inst}</b>instaladas</div><div><b>${k.online}</b>online</div><div><b>${k.alerta}</b>em alerta</div><div><b>${k.offline}</b>offline</div><div><b>${k.planejada}</b>planejadas</div>
      <div><b>${inst ? ((k.online + k.alerta) / inst * 100).toFixed(1).replace(".", ",") : "–"}%</b>disponibilidade</div></div>
    ${img ? `<img src="${img}" alt="Mapa das câmeras">` : ""}
    ${areas.length ? `<h2>Cobertura das áreas</h2><table><tr><th>Área</th><th>Tamanho</th><th>Coberto</th><th>Ponto cego</th></tr>${areas.map(a => `<tr><td>${esc(a.nome)}</td><td>${Math.round(a.total || 0).toLocaleString("pt-BR")} m²</td><td>${(a.pct ?? 0).toFixed(0)}%</td><td>${(100 - (a.pct ?? 0)).toFixed(0)}%</td></tr>`).join("")}</table>` : ""}
    ${av && av.days.length ? `<h2>Disponibilidade nos últimos 30 dias</h2>${availChart(av.days)}${(() => { const low = av.cameras.filter(c => c.pct < 100); return low.length ? `<table><tr><th>Câmera</th><th>Nome</th><th>Disponibilidade</th></tr>${low.map(c => `<tr><td>${esc(c.id)}</td><td>${esc(byId[c.id]?.nome)}</td><td>${String(c.pct).replace(".", ",")}%</td></tr>`).join("")}</table>` : "<p>Todas as câmeras com 100% no período.</p>"; })()}` : ""}
    <h2>Câmeras com problema (${probs.length})</h2>${probs.length ? `<table>${head}${probs.map(row).join("")}</table>` : "<p>Nenhuma câmera offline ou em alerta.</p>"}
    <h2>Inventário completo (${cams.length})</h2><table>${head}${[...cams].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(row).join("")}</table>`;
  window.print();
};

/* ---------- Início ---------- */
renderSetores(); rebuildAreaEntities(); render(); renderAreas();
const start = C.BoundingSphere.fromPoints(cams.length ? cams.map(camPos) : [C.Cartesian3.fromDegrees(-46.6545, -23.5632, 0)]);
viewer.camera.flyToBoundingSphere(start, { offset: new C.HeadingPitchRange(0, -60 * D2R, Math.max(4000, start.radius * 8)), duration: 0 });
setTimeout(() => flyHome(2), 300); // o movimento também recalcula os agrupamentos depois que os ícones carregam
const savedMode = store.get("mode3d");
if (token && savedMode && savedMode !== "plano") applyMode(savedMode); else computeCoverage();

/* ---------- Login e banco de dados ---------- */
function openLogin() { if (!$("dlgLogin").open) $("dlgLogin").showModal(); }
async function applyState(c, a) {
  if (editing) cancelEdit();
  cams = c; areas = a; selected = null; $("card").hidden = true;
  index(); await sampleGround(cams); rebuildEntities(); rebuildAreaEntities(); renderSetores(); $("fSetor").value = ""; render(); computeCoverage(); flyHome();
}
function saveTokenRemote() {
  if (remote && !readonly) fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cesiumToken: token }) }).catch(() => {});
}
function syncToken(dbToken) { // o token do banco vale para todos; se o banco está vazio e este navegador tem um, o editor o envia
  if (dbToken && dbToken !== token) {
    token = dbToken; store.set("ionToken", token); C.Ion.defaultAccessToken = token;
    const m = store.get("mode3d"); if (m && m !== "plano") applyMode(m);
  } else if (!dbToken && token) saveTokenRemote();
}
async function loadRemote() {
  let r;
  try { r = await fetch("/api/cameras"); } catch (e) { return remote ? toast("Sem conexão com o banco.") : loadLocal(); } // arquivo aberto do disco ou sem rede
  try {
    if (r.status === 401) return openLogin();
    if (!r.ok) return remote ? toast("Não consegui recarregar do banco.") : loadLocal(); // sem /api (ex.: servidor local de testes): usa os dados do navegador
    const d = await r.json();
    remote = true; rev = d.rev; readonly = d.role !== "edit"; document.body.classList.toggle("readonly", readonly); isSample = false; $("tagSample").hidden = true;
    base = structuredClone({ cams: d.cams, areas: d.areas }); // antes do applyState, que mexe nos objetos
    $("geoForm").hidden = false;
    $("userEmail").textContent = d.email + (readonly ? " · somente leitura" : ""); $("userBox").hidden = false;
    await applyState(d.cams, d.areas);
    syncToken(d.cesiumToken);
    toast(readonly ? "Acesso somente leitura." : d.cams.length ? `${d.cams.length} câmeras carregadas do banco.` : "Banco vazio. Importe uma planilha em Dados.");
  } catch (e) { console.error(e); } // nunca cai para os dados do navegador depois de usar o banco: a próxima gravação os mandaria para lá
}
function loadLocal() {
  isSample = !store.get("cams"); $("tagSample").hidden = !isSample;
  return applyState(store.get("cams") || sampleCams(), store.get("areas") || []);
}
async function doLogin(signup) {
  $("loginMsg").textContent = "";
  const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: $("lEmail").value.trim(), password: $("lPass").value, signup }) }).catch(() => null);
  if (!r) return $("loginMsg").textContent = "Sem conexão.";
  if (!r.ok) return $("loginMsg").textContent = (await r.json().catch(() => ({}))).error || "Não consegui entrar.";
  $("lPass").value = ""; $("dlgLogin").close(); loadRemote();
}
$("loginForm").addEventListener("submit", e => { e.preventDefault(); doLogin(false); });
$("btnSignup").onclick = () => { if ($("loginForm").reportValidity()) doLogin(true); };
$("dlgLogin").addEventListener("cancel", e => e.preventDefault()); // sem login não há como fechar
$("btnLogout").onclick = async () => { await fetch("/api/logout", { method: "POST" }); location.reload(); };
$("btnPushLocal").onclick = async () => {
  if (!confirm("Isso substitui as câmeras e áreas do banco pelas deste navegador. Continuar?")) return;
  $("dlgData").close(); await applyState(store.get("cams") || [], store.get("areas") || []); save();
  toast("Dados do navegador enviados ao banco.");
};
loadRemote();
