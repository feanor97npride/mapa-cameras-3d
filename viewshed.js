// Visada real de uma câmera: de cada ponto do terreno/prédios dentro do alcance, a câmera o enxerga?
// Funções puras (sem Cesium): vsSamples() diz onde medir a altura da superfície; vsAnalyze() decide o que é visível.
// Método do "horizonte": ao longo de cada raio, um ponto só é visível se o ângulo de elevação até ele não é menor que o de nenhum ponto mais perto.
// shortcut: amostra a ~3 m e ~1,5°; um poste ou muro fino pode passar entre as amostras. Aumente nD/nR se precisar de mais detalhe (custa mais medições).
const VS_D2R = Math.PI / 180, VS_MAX = 6000; // no máximo 6000 medições de altura por câmera

function vsSamples(c) {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const nD = clamp(Math.round(c.alcance / 3), 10, 100);
  let nR = clamp(Math.round(c.hfov / 1.5) + 1, 21, 91);
  if (nR * nD > VS_MAX) nR = Math.floor(VS_MAX / nD);
  const step = c.alcance / nD, kLon = 111320 * Math.cos(c.lat * VS_D2R), pts = [], az = [];
  for (let k = 0; k < nR; k++) {
    const a = (c.heading - c.hfov / 2 + (c.hfov * k) / (nR - 1)) * VS_D2R; az.push(a);
    for (let i = 1; i <= nD; i++) { const d = i * step; pts.push({ lon: c.lon + (Math.sin(a) * d) / kLon, lat: c.lat + (Math.cos(a) * d) / 111320, d }); }
  }
  return { nR, nD, step, az, pts };
}

// h0: altura absoluta da lente; H: altura da superfície em cada ponto de S.pts (undefined = sem dado).
// status por ponto: 1 visível · 2 escondido (atrás de prédio ou relevo) · 0 fora do ângulo vertical da câmera · -1 sem dado.
function vsAnalyze(c, S, h0, H) {
  const vf = c.hfov * 0.5625 / 2, lo = c.tilt - vf, hi = c.tilt + vf, status = new Int8Array(S.pts.length), EPS = 1e-4;
  let seen = 0, hidden = 0;
  for (let k = 0; k < S.nR; k++) {
    let horizon = -Infinity;
    for (let i = 0; i < S.nD; i++) {
      const j = k * S.nD + i, h = H[j];
      if (!Number.isFinite(h)) { status[j] = -1; continue; } // sem dado: não vira obstáculo nem entra na conta
      const ang = Math.atan2(h - h0, S.pts[j].d) / VS_D2R, w = S.pts[j].d; // peso: área da célula cresce com a distância
      const visible = ang >= horizon - EPS; horizon = Math.max(horizon, ang);
      if (ang < lo || ang > hi) { status[j] = 0; continue; }
      status[j] = visible ? 1 : 2; if (visible) seen += w; else hidden += w;
    }
  }
  return { status, seen, hidden, pct: seen + hidden > 0 ? (seen / (seen + hidden)) * 100 : null };
}

// Quatro cantos (lon, lat) da célula do raio k, amostra i, para desenhar o mapa de visibilidade.
function vsCell(c, S, k, i) {
  const kLon = 111320 * Math.cos(c.lat * VS_D2R), da = S.nR > 1 ? (S.az[1] - S.az[0]) / 2 : 0, d0 = i * S.step, d1 = d0 + S.step; // i começa em 0: o primeiro ponto está a 1 passo, e a célula vai de i a i+1 passos
  return [[S.az[k] - da, d0], [S.az[k] + da, d0], [S.az[k] + da, d1], [S.az[k] - da, d1]].map(([a, d]) => [c.lon + (Math.sin(a) * d) / kLon, c.lat + (Math.cos(a) * d) / 111320]);
}
