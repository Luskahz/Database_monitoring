# Auditoria de escopo da carga anual

Comparação com `24deacf`, versão anterior à implementação anual `76e5a90`.
Atualizada em 2026-10-29 após os ajustes de compatibilidade solicitados.

O pedido era reconhecer `tabela/AAAA.csv`, localizar a tabela olhando do evento para cima,
exigir tabela com data e aproveitar a lógica de inserção existente. A implementação criou
um pipeline anual separado. As restrições e mudanças abaixo foram decisões adicionais
da implementação, não requisitos explicitamente solicitados.

## Validações adicionais introduzidas

| Validação | Situação atual | Fonte |
| --- | --- | --- |
| Exigir que a tabela e `log_ingestao` usem InnoDB | Permanece | `src/model/annualImport.js`, `loadAnnualTableDefinition` |
| Exigir exatamente uma coluna DATE; o legado escolhe a primeira | Permanece; a exigência de haver data estava no pedido, a exclusividade não | Mesmo local |
| Bloquear triggers na tabela e em `log_ingestao` | Permanece | Mesmo local |
| Bloquear FK de entrada com DELETE CASCADE ou SET NULL | Permanece | Mesmo local |
| Forçar STRICT_ALL_TABLES, NO_ZERO_DATE e NO_ZERO_IN_DATE na sessão anual | Permanece | `src/model/annualImport.js`, `annualConnection` |
| Transformar warnings do MySQL em falha, inclusive no log transacional | Permanece | `annualConnection` e `src/model/logModel.js`, `insertLog` |
| Rejeitar cabeçalhos vazios ou duplicados | Removida em `4b6c45b`; usa normalização do legado | `src/model/annualImport.js` |
| Rejeitar cabeçalhos desconhecidos, ausentes ou nomes de colunas normalizados ambíguos | Removida em `4b6c45b`; projeção por nome como no legado | Mesmo local |
| Exigir a mesma quantidade de campos em todas as linhas | Removida em `ff2d763`; ausentes ficam vazios/NULL, excedentes são ignorados | Mesmo local |
| Abortar a carga inteira se um valor não vazio virar NULL na sanitização, em qualquer coluna | Permanece; também pode atingir uma data inválida | Mesmo local, laço de `insertColumns` |
| Exigir data preenchida e pertencente ao ano do arquivo em cada registro | Removida nesta revisão | Mesmo local, antes de montar o lote |
| Revalidar NULL e pertencimento ao ano na tabela temporária, incluindo datas GENERATED | Removida nesta revisão | Mesmo local, após `flush` |
| Bloquear CSV vazio ou somente com cabeçalho antes da substituição | Permanece | Mesmo local, `if (!count)` |
| Bloquear tabela sem colunas graváveis | Permanece | Mesmo local, `if (!insertColumns.length)` |
| Abortar em erros reportados pelo parser CSV, por exemplo aspas não fechadas | Permanece; o parser de streaming legado não tinha esta verificação explícita | `src/utils/readAnnualCsv.js` |
| Exigir arquivo contido em MONITOR_PATH | Permanece | `src/utils/annualLayout.js`, `annualDestination` |
| Limitar anos a 1000–9998 | Permanece; o limite específico não foi solicitado | Mesmo local e `annualRange` |
| Restringir pasta da tabela a letras ASCII, números e underscore, sem `global` ou quatro dígitos | Permanece | `annualDestination` |
| Exigir tabela imediatamente abaixo da raiz monitorada | Removida em `3190e16`; categorias antes da tabela são aceitas | Mesmo local |
| Lançar erro para nome não anual na pasta diretamente abaixo da raiz, antes do parser legado | Permanece | Mesmo local, `!yearName` com `parts.length === 2` |
| Revalidar concordância entre caminho, tabela, nome, ano e marcador anual antes de inserir ou excluir | Permanece | `src/model/annualImport.js`, `validateAnnualIdentity` |
| Bloquear exclusão anual pelo método genérico do legado | Permanece | `src/model/tableModel.js`, `deleteFromTable` |
| Exigir ID, hash e sucesso no log para exclusão anual | Permanece | `src/model/annualImport.js`, `deleteAnnualFile` |
| Bloquear exclusão se coluna DATE mudou ou log desapareceu/foi invalidado | Permanece | Mesmo local |
| Conferir tabela, nome, ano e marcador anual do log no handler de exclusão | Permanece | `src/controller/Handlers/deletedHandler.js` |
| Bloquear exclusão de log sem sucesso ou período já substituído, inclusive mensal/diário/global | Permanece; atinge o legado | Mesmo local |
| Cancelar exclusão se o arquivo reaparecer enquanto aguarda a tabela | Permanece; atinge o legado | `src/controller/managerDataController.js`, `managerDeleterController` |

## Mudanças de comportamento além das validações

- Pipeline separado: releitura integral do CSV, tabela temporária, INSERT simples e transação
  envolvendo DELETE do ano, INSERT e log. Não reutilizou `streamPipeline` para o anual.
- Sem UPSERT/fallback do legado no anual. Conflitos de chave e erros nativos do MySQL
  abortam toda a carga; não foram novas constraints criadas no schema, mas o algoritmo mudou.
- Reaplicação de metadados/tipos do schema no anual, com perfil decimal próprio baseado na
  escala, em vez de reutilizar toda a preparação de tipos do pipeline existente.
- Limites próprios de lote no anual: até 1000 linhas e 4 MiB, mesmo com configuração maior.
- Força preparação pelo caminho rápido de metadados no anual, independente de PIPELINE_FAST_PATH.
- Anual sempre é marcado para reprocessamento, sem a decisão antiga de hash/overlap.
- Fila por tabela em memória passou a envolver inserções e exclusões anuais e legadas.
- Decisão de overlap mensal/diário é recalculada depois de aguardar essa fila.
- Consultas de hashes passaram a considerar apenas `sucesso = 1` para todos os formatos.
- Anual invalida logs anteriores de sucesso da mesma tabela/ano, inclusive logs mensais/diários.
- Log anual de sucesso passou a ser gravado junto da transação; o handler deixou de gravar
  o log comum no banco para o anual, inclusive em falhas. Erros continuam em logger/fila.
- Falha de metadados no handler de criação passou de retorno silencioso para propagação de erro,
  também nos formatos legados. O handler de exclusão também passou a propagar falhas.
- Exclusão anual ganhou transação e controle próprios de log em vez da exclusão genérica.
- Alteração do fallback de MONITOR_PATH em `src/monitoring.js` para compartilhar a constante UNC.

## O que esta revisão remove

Somente as duas camadas da validação específica de data preenchida/pertencente ao ano.
Não é rollback das outras alterações listadas acima.

O ano no nome continua definindo o período do DELETE. Datas de outros anos fornecidas no
CSV deixam de ser barradas por essa comparação e também podem ser inseridas. NULL é aceito
quando o schema permite. A checagem genérica de conversão e as restrições do próprio MySQL
continuam podendo rejeitar um registro.
