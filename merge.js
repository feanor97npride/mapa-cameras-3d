// Combina três versões do estado (base = último estado sincronizado com o banco, mine = meu, theirs = o do banco agora),
// câmera por câmera e campo por campo. Conflito = os dois lados mudaram o mesmo campo (ou um excluiu o que o outro editou): vale o do banco, exceto uma câmera
// que eu editei e outra pessoa excluiu (mantenho a minha, para não perder trabalho).
// shortcut: áreas são comparadas inteiras (nome + pontos); se as duas pessoas renomearem a mesma área, ficam as duas versões. Servem de aviso, não perdem dados.
function mergeState(base, mine, theirs) {
  const SKIP = ["ground", "ultimoSinal"]; // derivados do mapa/relevo, não são edição de ninguém
  const idx = list => Object.fromEntries(list.map(c => [c.id, c]));
  const B = idx(base.cams), M = idx(mine.cams), T = idx(theirs.cams);
  const fields = (...cs) => [...new Set(cs.flatMap(c => Object.keys(c || {})))].filter(k => !SKIP.includes(k));
  const differs = (a, b, k) => String(a?.[k]) !== String(b?.[k]);
  const diff = (a, b) => fields(a, b).filter(k => differs(a, b, k));
  const conflicts = [], cams = [];
  for (const id of new Set([...Object.keys(B), ...Object.keys(M), ...Object.keys(T)])) {
    const b = B[id], m = M[id], t = T[id];
    if (!b) { // nova em um lado (ou nos dois, com o mesmo ID)
      if (m && t) { const d = diff(m, t); if (d.length) conflicts.push({ id, fields: d }); cams.push(t); } else cams.push(m || t);
    } else if (m && t) { // existe nos três: campo a campo
      const out = { ...t }, bad = [];
      for (const k of fields(b, m, t)) {
        if (differs(m, b, k) && !differs(t, b, k)) out[k] = m[k];
        else if (differs(m, b, k) && differs(m, t, k)) bad.push(k);
      }
      if (bad.length) conflicts.push({ id, fields: bad });
      cams.push(out);
    } else if (!m && t) { // eu excluí
      if (diff(b, t).length) { conflicts.push({ id, fields: [], deleted: "mine" }); cams.push(t); } // alguém mexeu: fica
    } else if (m && !t) { // outra pessoa excluiu
      if (diff(b, m).length) { conflicts.push({ id, fields: [], deleted: "theirs" }); cams.push(m); } // eu mexi: fica
    }
  }
  const key = a => JSON.stringify({ nome: a.nome, pts: a.pts });
  const bA = new Set(base.areas.map(key)), mA = mine.areas.map(key), removed = [...bA].filter(k => !mA.includes(k));
  const areaKeys = theirs.areas.map(key).filter(k => !removed.includes(k));
  mA.filter(k => !bA.has(k) && !areaKeys.includes(k)).forEach(k => areaKeys.push(k));
  const areas = areaKeys.map(k => JSON.parse(k));
  const tCams = Object.values(T);
  const dirty = cams.length !== tCams.length || cams.some(c => !T[c.id] || diff(c, T[c.id]).length) || areaKeys.join() !== theirs.areas.map(key).join();
  return { cams, areas, conflicts, dirty };
}
