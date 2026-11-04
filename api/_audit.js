// Compara as câmeras que estão no banco com as que serão gravadas e lista o que mudou (para o audit_log).
const FIELDS = ["status", "nome", "setor", "tipo", "modelo", "motivo", "ip", "firmware", "nvr", "retencao", "instalacao", "manutencao", "responsavel", "stream", "lat", "lon", "altura", "heading", "tilt", "hfov", "alcance"]; // 'ground' e 'ultimo_sinal' são derivados, não são edição de ninguém
const NUM = new Set(["lat", "lon", "altura", "heading", "tilt", "hfov", "alcance"]);
const MAX = 1000; // uma importação enorme não pode virar milhares de linhas de uma vez
const val = v => (v == null ? null : String(v).slice(0, 200));

export function diffCameras(oldRows, newRows) {
  const O = new Map(oldRows.map(c => [c.id, c])), N = new Map(newRows.map(c => [c.id, c])), out = [];
  for (const [id, n] of N) {
    const o = O.get(id);
    if (!o) { out.push({ camera_id: id, action: "create", field: null, old_value: null, new_value: val(n.nome) }); continue; }
    for (const f of FIELDS) if (NUM.has(f) ? !Object.is(Number(o[f]), Number(n[f])) && Number(o[f]) !== Number(n[f]) : String(o[f] ?? "") !== String(n[f] ?? "")) out.push({ camera_id: id, action: "update", field: f, old_value: val(o[f]), new_value: val(n[f]) });
  }
  for (const [id, o] of O) if (!N.has(id)) out.push({ camera_id: id, action: "delete", field: null, old_value: val(o.nome), new_value: null });
  if (out.length > MAX) { const extra = out.length - MAX; out.length = MAX; out.push({ camera_id: "*", action: "update", field: null, old_value: null, new_value: `+${extra} mudanças não detalhadas` }); }
  return out;
}
