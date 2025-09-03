# Database Monitoring

## Streaming CSV ingestion

A pipeline de ingestão agora processa arquivos CSV em **streaming**, lendo linha a linha e montando lotes para inserção assíncrona no MySQL. O fluxo mantém baixo uso de memória, inicia as inserções antes do fim da leitura e registra logs por lote.

### Variáveis de ambiente

- `BATCH_SIZE` – quantidade de linhas por lote (padrão: 10000).
- `MAX_CONCURRENT_INSERTS` – número máximo de inserções concorrentes (padrão: 1).
- `QUEUE_HIGH_WATERMARK` – número de lotes em voo para pausar a leitura (padrão: 2).
- `QUEUE_LOW_WATERMARK` – limite para retomar a leitura após pausa (padrão: 1).

Defina-as conforme o tamanho dos arquivos e a capacidade do banco para ajustar throughput e backpressure.
