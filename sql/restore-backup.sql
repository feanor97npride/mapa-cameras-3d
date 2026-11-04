-- Restaura câmeras, áreas e histórico de um backup. Rode no SQL Editor do Neon (ou peça ao Claude).
-- 1) Veja os backups:   SELECT id, at, jsonb_array_length(data->'cameras') AS cameras FROM backups ORDER BY at DESC;
-- 2) Troque 123 pelo id escolhido e rode TUDO de uma vez (é uma transação só). Isso substitui os dados atuais.
-- Depois, quem estiver com o painel aberto vê o aviso de conflito e recarrega (a revisão sobe).
BEGIN;
DELETE FROM cameras;  -- apaga também o histórico (cascata); ele volta do backup abaixo
INSERT INTO cameras SELECT * FROM jsonb_populate_recordset(NULL::cameras, (SELECT data->'cameras' FROM backups WHERE id = 123));
DELETE FROM areas;
INSERT INTO areas (nome, pts) SELECT nome, pts FROM jsonb_populate_recordset(NULL::areas, (SELECT data->'areas' FROM backups WHERE id = 123));
DELETE FROM status_history;  -- o INSERT de cameras acima gerou linhas "novas"; troca pelo histórico original
INSERT INTO status_history SELECT * FROM jsonb_populate_recordset(NULL::status_history, (SELECT data->'status_history' FROM backups WHERE id = 123));
SELECT setval(pg_get_serial_sequence('status_history', 'id'), coalesce(max(id), 1)) FROM status_history;  -- ids vieram do backup
UPDATE app_state SET rev = rev + 1;
COMMIT;
