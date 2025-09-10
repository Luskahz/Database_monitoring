ALTER TABLE log_ingestao
  ADD COLUMN file_size_bytes BIGINT UNSIGNED NULL AFTER hash_arquivo,
  ADD COLUMN total_linhas INT UNSIGNED NULL AFTER file_size_bytes;

CREATE INDEX idx_log_ing_meta
  ON log_ingestao (tabela_destino, file_size_bytes, total_linhas);
