# Database Monitoring

## Streaming CSV ingestion

A pipeline de ingestão agora processa arquivos CSV em **streaming**, lendo linha a linha e montando lotes para inserção assíncrona no MySQL. O fluxo mantém baixo uso de memória, inicia as inserções antes do fim da leitura e registra logs por lote.

### Variáveis de ambiente

- `BATCH_SIZE` – quantidade de linhas por lote (padrão: 10000).
- `INSERT_CONCURRENCY` – número de lotes inseridos em paralelo por arquivo (padrão: 2).
- `BATCH_QUEUE_HIGH_WATERMARK` – lotes em voo para pausar a leitura (padrão: INSERT_CONCURRENCY * 2).
- `BATCH_QUEUE_LOW_WATERMARK` – limite para retomar a leitura (padrão: INSERT_CONCURRENCY).
- `FILES_CONCURRENCY` – quantidade de arquivos processados simultaneamente (padrão: 10).

Defina-as conforme o tamanho dos arquivos e a capacidade do banco para ajustar throughput e backpressure.

### Concorrência

Ajuste `INSERT_CONCURRENCY` para controlar quantos lotes de um mesmo arquivo podem ser inseridos em paralelo. Use `FILES_CONCURRENCY` para limitar quantos arquivos são processados ao mesmo tempo. Comece com `INSERT_CONCURRENCY=2` e `FILES_CONCURRENCY` entre 5 e 10 e monitore o uso de CPU e I/O do MySQL, aumentando apenas se o servidor suportar.
