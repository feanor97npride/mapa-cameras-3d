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
let cams = store.get("cams") || sampleCams();
let isSample = !store.get("cams");
let areas = store.get("areas") || [];
let byId = {};
let selected = null, coneMode = "all", mode3d = "plano", token = store.get("ionToken") || "";
const statusOn = { online: true, alerta: true, offline: true, planejada: true };
function index() { byId = Object.fromEntries(cams.map(c => [c.id, c])); }
let remote = false, readonly = false, pushTimer = 0, rev = 0, pushQueue = Promise.resolve(); // rev: versão do banco que este navegador carregou // remote: logado, dados no banco Neon (via /api) em vez do navegador
const snapshotState = () => ({ cams: cams.map(({ entity, _new, ...r }) => r), areas: areas.map(({ pct, total, label, ...r }) => r) });
function save() {
  if (!remote) { store.set("cams", snapshotState().cams); store.set("areas", snapshotState().areas); }
  isSample = false; $("tagSample").hidden = true;
  pushRemote();
}
function pushRemote() {
  if (!remote || readonly) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushQueue = pushQueue.then(sendState); }, 600);
}
async function sendState() { // uma gravação por vez, para a versão (rev) nunca ficar defasada
  pushTimer = 0;
  try {
    const r = await fetch("/api/cameras", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...snapshotState(), rev }) });
    if (r.ok) rev = (await r.json()).rev;
    else if (r.status === 401) { remote = false; openLogin(); }
    else if (r.status === 409) { toast("Outra pessoa alterou os dados. Recarregando a versão mais nova (sua última mudança não foi salva)."); loadRemote(); }
    else toast("Não consegui salvar no banco: " + ((await r.json().catch(() => ({}))).error || r.status));
  } catch (e) { toast("Sem conexão: as mudanças não foram salvas no banco."); }
}
index(); $("tagSample").hidden = !isSample;

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
handler.setInputAction(ev => { if (pickMode === "area") { const ll = pickLL(ev.endPosition); mouseLL = ll ? [ll.lon, ll.lat] : null; } }, C.ScreenSpaceEventType.MOUSE_MOVE);
handler.setInputAction(() => { if (pickMode === "area") finishArea(); }, C.ScreenSpaceEventType.RIGHT_CLICK);
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (pickMode) setPickMode(null); else if (editing) cancelEdit(); else if (selected) select(null);
});

/* ---------- Filtros, lista e indicadores ---------- */
for (const t in TIPOS) $("fTipo").add(new Option(t, t));
function visible() {
  const q = $("q").value.trim().toLowerCase(), st = $("fSetor").value, tp = $("fTipo").value;
  return cams.filter(c => statusOn[c.status] && (!st || c.setor === st) && (!tp || c.tipo === tp) &&
    (!q || [c.id, c.nome, c.ip, c.modelo, c.setor].join(" ").toLowerCase().includes(q)));
}
function since(min) { return min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)} h ${min % 60} min`; }
function renderSetores() {
  const cur = $("fSetor").value, setores = [...new Set(cams.map(c => c.setor))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("fSetor").innerHTML = `<option value="">Todos</option>` + setores.map(s => `<option${s === cur ? " selected" : ""}>${esc(s)}</option>`).join("");
}
function counts() { const k = { online: 0, alerta: 0, offline: 0, planejada: 0 }; cams.forEach(c => k[c.status]++); return k; }
function render() {
  const vis = visible(), visSet = new Set(vis.map(c => c.id));
  for (const c of cams) if (c.entity) c.entity.show = visSet.has(c.id) || c.id === selected;
  camDS.clustering.pixelRange = camDS.clustering.pixelRange; // força reagrupar
  const sorted = [...vis].sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.id).localeCompare(String(b.id)));
  $("list").innerHTML = sorted.length ? sorted.map(c => `<li><button data-id="${esc(c.id)}" aria-current="${c.id === selected}">
    <i class="dot ${c.status}"></i><span class="cid">${esc(c.id)}</span><span class="ctype">${esc(c.tipo)}</span>
    <span class="cname">${esc(c.nome)}${c.motivo && c.status !== "online" ? " · " + esc(c.motivo) : ""}</span></button></li>`).join("")
    : `<li class="empty">Nenhuma câmera com esses filtros.</li>`;
  $("count").textContent = `${vis.length} de ${cams.length} câmeras`;
  const k = counts(), inst = cams.length - k.planejada;
  $("kTotal").textContent = cams.length; $("kOnline").textContent = k.online; $("kAlerta").textContent = k.alerta; $("kOffline").textContent = k.offline; $("kPlan").textContent = k.planejada;
  $("kPct").textContent = inst ? ((k.online + k.alerta) / inst * 100).toFixed(1).replace(".", ",") + "%" : "–";
  $("bar").innerHTML = inst ? ["online", "alerta", "offline"].map(s => `<i style="width:${k[s] / inst * 100}%;background:${STATUS[s].color}"></i>`).join("") : "";
  buildCones();
}
$("q").addEventListener("input", render);
$("fSetor").addEventListener("change", render);
$("fTipo").addEventListener("change", render);
$("kpis").addEventListener("click", e => {
  const b = e.target.closest(".kpi"); if (!b) return;
  if (b.dataset.k === "all") Object.keys(statusOn).forEach(s => statusOn[s] = true); else statusOn[b.dataset.k] = !statusOn[b.dataset.k];
  document.querySelectorAll(".kpi").forEach(el => el.setAttribute("aria-pressed", el.dataset.k === "all" ? Object.values(statusOn).every(Boolean) : statusOn[el.dataset.k]));
  render();
});
$("list").addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b && !editing) select(b.dataset.id, true); });
function showTab(t) {
  $("tabCams").setAttribute("aria-selected", t === "cams"); $("tabAreas").setAttribute("aria-selected", t === "areas");
  $("paneCams").hidden = t !== "cams"; $("paneAreas").hidden = t !== "areas";
}
$("tabCams").onclick = () => showTab("cams");
$("tabAreas").onclick = () => showTab("areas");

/* ---------- Ficha técnica ---------- */
function geUrl(c) { return `https://earth.google.com/web/@${c.lat.toFixed(6)},${c.lon.toFixed(6)},${Math.round(c.ground || 0)}a,250d,35y,${Math.round(c.heading)}h,60t,0r`; }
const isHttp = u => /^https?:\/\//i.test(String(u || "").trim());
function select(id, fly) {
  if (selected && byId[selected]?.entity) byId[selected].entity.billboard.image = ICONS[byId[selected].status];
  selected = id || null;
  const c = selected && byId[selected];
  if (!c) { $("card").hidden = true; render(); return; }
  c.entity.billboard.image = ICONS[c.status + "_sel"];
  const pos = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"][Math.round(c.heading / 45) % 8];
  $("card").innerHTML = `
    <div class="card-h">
      <button class="close" data-act="close" aria-label="Fechar ficha">×</button>
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
    <div class="sec" id="histSec" hidden><h3>Histórico · 30 dias</h3><div id="histBody"></div></div>
    <div class="actions">
      <button class="btn" data-act="fly">Centralizar</button>
      <button class="btn" data-act="pov">Ver da câmera</button>
      ${isHttp(c.stream) ? `<a class="btn wide" href="${esc(c.stream.trim())}" target="_blank" rel="noopener">Vídeo ao vivo ↗</a>` : ""}
      <a class="btn" href="${geUrl(c)}" target="_blank" rel="noopener">Google Earth ↗</a>
      <button class="btn primary" data-act="edit">Editar</button>
    </div>`;
  $("card").hidden = false;
  render(); loadHistory(c.id);
  if (fly) flyTo(c);
  document.querySelector(`#list button[data-id="${CSS.escape(c.id)}"]`)?.scrollIntoView({ block: "nearest" });
}
async function loadHistory(id) {
  if (!remote) return;
  if (pushTimer) await new Promise(r => setTimeout(r, 700)); // deixa a gravação pendente entrar na fila...
  await pushQueue; // ...e espera ela chegar ao banco
  try {
    const r = await fetch("/api/history?id=" + encodeURIComponent(id));
    if (!r.ok || selected !== id || editing || !$("histBody")) return;
    const { events, availability } = await r.json();
    const fmt = t => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    $("histBody").innerHTML = `<p class="asub">Disponibilidade: <b>${availability == null ? "–" : availability.toFixed(1).replace(".", ",") + "%"}</b></p>` +
      `<dl>${events.slice(0, 8).map(e => `<dt>${fmt(e.at)}</dt><dd><i class="dot ${esc(e.status)}"></i> ${esc(STATUS[e.status]?.label || e.status)}${e.motivo ? " · " + esc(e.motivo) : ""}</dd>`).join("")}</dl>`;
    $("histSec").hidden = false;
  } catch (e) { console.error(e); }
}
function flyTo(c) {
  viewer.camera.flyToBoundingSphere(new C.BoundingSphere(camPos(c), Math.max(60, c.alcance * 1.4)), {
    offset: new C.HeadingPitchRange((c.heading + 180) * D2R, -35 * D2R, Math.max(180, c.alcance * 3)), duration: 1.4 });
}

/* ---------- Edição ---------- */
let editing = null, snapshot = null;
function edit(id) {
  if (readonly) return;
  const c = byId[id]; editing = c; snapshot = { ...c };
  const t = (label, f, full) => `<label class="fld${full ? " full" : ""}"><span>${label}</span><input data-f="${f}" value="${esc(c[f])}"></label>`;
  const n = (label, f, step) => `<label class="fld"><span>${label}</span><input data-f="${f}" type="number" step="${step}" value="${c[f]}"></label>`;
  const r = (label, f, min, max, unit) => { const v = Math.abs(c[f]); return `<label class="fld full"><span>${label}<output id="o_${f}">${v}${unit}</output></span><input data-f="${f}" data-unit="${unit}" type="range" min="${min}" max="${max}" step="1" value="${v}"></label>`; };
  const sel = (label, f, opts) => `<label class="fld"><span>${label}</span><select data-f="${f}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === c[f] ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const tipos = Object.keys(TIPOS).map(k => [k, k]); if (!TIPOS[c.tipo]) tipos.push([c.tipo, c.tipo]);
  $("card").innerHTML = `
    <div class="card-h"><button class="close" data-act="cancel" aria-label="Cancelar edição">×</button>
      <h2>${c._new ? "Nova câmera" : "Editar " + esc(c.id)}</h2><p>${c._new ? "Ajuste a direção e o alcance; o cone acompanha no mapa." : "As mudanças aparecem no mapa enquanto você edita."}</p></div>
    <div class="form">
      ${t("ID", "id")}${sel("Status", "status", Object.entries(STATUS).map(([k, v]) => [k, v.label]))}
      ${t("Nome", "nome", true)}
      ${t("Setor", "setor")}${sel("Tipo", "tipo", tipos)}
      ${r("Azimute (direção)", "heading", 0, 359, "°")}
      ${r("Inclinação para baixo", "tilt", 0, 89, "°")}
      ${r("Campo de visão horizontal", "hfov", 10, 180, "°")}
      ${r("Alcance", "alcance", 5, 300, " m")}
      ${r("Altura do solo", "altura", 1, 80, " m")}
      ${n("Latitude", "lat", "0.000001")}${n("Longitude", "lon", "0.000001")}
      ${t("Modelo", "modelo", true)}
      ${t("Endereço IP", "ip")}${t("NVR / gravador", "nvr")}
      ${t("Motivo / observação", "motivo", true)}
      ${t("Link do vídeo (http/https ou rtsp)", "stream", true)}
      ${t("Responsável", "responsavel")}${t("Instalada em", "instalacao")}
      <div class="confirm" id="delBox">${c._new ? "" : `<button class="btn danger" data-act="del">Excluir câmera</button>`}</div>
    </div>
    <div class="actions"><button class="btn" data-act="cancel">Cancelar</button><button class="btn primary" data-act="save">Salvar</button></div>`;
  $("card").hidden = false;
  scheduleCones();
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
$("card").addEventListener("click", e => {
  const act = e.target.closest("[data-act]")?.dataset.act; if (!act) return;
  const c = editing || byId[selected];
  if (act === "close") select(null);
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
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 4000); }

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
function mapRows(rows) {
  const out = []; let skipped = 0, n = 0;
  for (const row of rows) {
    const r = {}; for (const [k, v] of Object.entries(row)) { const key = KEYMAP[norm(k)]; if (key && v !== "" && r[key] == null) r[key] = v; }
    const lat = num(r.lat), lon = num(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { skipped++; continue; }
    n++;
    const tipo = Object.keys(TIPOS).find(t => norm(r.tipo || "").includes(norm(t))) || (r.tipo ? String(r.tipo) : "Bullet");
    const def = TIPOS[tipo] || TIPOS.Bullet, f = (v, d) => Number.isFinite(num(v)) ? num(v) : d;
    out.push({
      id: String(r.id ?? "CAM-" + String(n).padStart(3, "0")).trim(), nome: String(r.nome ?? `Câmera ${n}`), setor: String(r.setor ?? "Sem setor"),
      tipo, modelo: String(r.modelo ?? ""), lat, lon, ground: 0,
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

$("btnData").onclick = () => { $("resetBox").innerHTML = `<button class="btn danger" id="btnReset">Voltar aos dados de exemplo</button>`; $("dbBox").hidden = !remote; $("btnPushLocal").hidden = !(store.get("cams") || []).length; $("dlgData").showModal(); };
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
    const res = mapRows(rows);
    if (!res.cams.length) return toast("Nenhuma linha com Latitude e Longitude válidas. Confira os nomes das colunas no modelo.");
    $("dlgData").close();
    if (editing) cancelEdit();
    selected = null; $("card").hidden = true;
    cams = res.cams; index(); await sampleGround(cams); rebuildEntities(); save(); renderSetores(); $("fSetor").value = "";
    render(); computeCoverage(); flyHome();
    toast(`${res.cams.length} câmeras importadas${res.skipped ? `, ${res.skipped} linhas ignoradas (sem coordenadas válidas)` : ""}.`);
  } catch (err) { console.error(err); toast("Não consegui ler esse arquivo. Use .xlsx, .xls ou .csv."); }
});
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
  try {
    const r = await fetch("/api/cameras");
    if (r.status === 401) return openLogin();
    if (!r.ok) return; // sem /api (ex.: arquivo aberto direto do disco): segue com os dados do navegador
    const d = await r.json();
    remote = true; rev = d.rev; readonly = d.role !== "edit"; document.body.classList.toggle("readonly", readonly); isSample = false; $("tagSample").hidden = true;
    await applyState(d.cams, d.areas);
    syncToken(d.cesiumToken);
    toast(readonly ? "Acesso somente leitura." : d.cams.length ? `${d.cams.length} câmeras carregadas do banco.` : "Banco vazio. Importe uma planilha em Dados.");
  } catch (e) { console.error(e); }
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
