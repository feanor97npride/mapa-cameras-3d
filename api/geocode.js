import { requireUser } from "./_lib.js";

// Busca de endereço pelo Nominatim (OpenStreetMap). Passa pelo servidor para identificar o app (exigência do serviço) e só atender quem está logado.
export default async function handler(req, res) {
  if (!requireUser(req, res)) return;
  if (req.method !== "GET") return res.status(405).end();
  const q = String(req.query.q || "").trim();
  if (q.length < 3 || q.length > 200) return res.status(400).json({ error: "Digite entre 3 e 200 caracteres." });
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + new URLSearchParams({ format: "jsonv2", limit: "5", "accept-language": "pt-BR", q }), {
      headers: { "user-agent": "mapa-cameras-3d/1.0 (painel de cameras; contato: dono do projeto)" }, signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return res.status(502).json({ error: "A busca de endereços não respondeu. Tente de novo." });
    const found = (await r.json()).map(x => ({ label: String(x.display_name || ""), lat: Number(x.lat), lon: Number(x.lon), bbox: Array.isArray(x.boundingbox) ? x.boundingbox.map(Number) : null }))
      .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    res.json(found);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "A busca de endereços não respondeu. Tente de novo." });
  }
}
