# Database Monitoring

## Streaming CSV ingestion

A pipeline de ingestão agora processa arquivos CSV em **streaming**, lendo linha a linha e montando lotes para inserção assíncrona no MySQL. O fluxo mantém baixo uso de memória, inicia as inserções antes do fim da leitura e registra logs por lote.

### Variáveis de ambiente

- `BATCH_SIZE` – quantidade de linhas por lote (padrão: 1000).
- `INSERT_MAX_CONCURRENT` – número de lotes inseridos em paralelo por arquivo (padrão: 2, limitado pelo pool).
- `QUEUE_HIGH_WATERMARK` – lotes em voo para pausar a leitura (padrão: 4).
- `QUEUE_LOW_WATERMARK` – limite para retomar a leitura (padrão: 2).
- `FILES_MAX_CONCURRENT` – quantidade de arquivos processados simultaneamente (padrão: 4, ajustado pelo pool).

Defina-as conforme o tamanho dos arquivos e a capacidade do banco para ajustar throughput e backpressure.

### Concorrência

Ajuste `INSERT_MAX_CONCURRENT` para controlar quantos lotes de um mesmo arquivo podem ser inseridos em paralelo. Use `FILES_MAX_CONCURRENT` para limitar quantos arquivos são processados ao mesmo tempo. Comece com `INSERT_MAX_CONCURRENT=2` e `FILES_MAX_CONCURRENT` entre 4 e 6 e monitore o uso de CPU e I/O do MySQL, aumentando apenas se o servidor suportar.
