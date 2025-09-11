````markdown
# 📊 Database Monitoring

> Monitore uma pasta de **CSVs** e mantenha seu **MySQL** sempre sincronizado, com **inserts**, **updates/substituições** e **deletes** automáticos — tudo em **streaming** para lidar com arquivos grandes sem estourar memória.

---

## 📚 Sumário

- [Descrição Geral](#-descrição-geral)
- [Tecnologias e Bibliotecas Utilizadas](#-tecnologias-e-bibliotecas-utilizadas)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação](#-instalação)
- [Configuração da Estrutura de Diretórios](#-configuração-da-estrutura-de-diretórios)
- [Execução do Projeto](#️-execução-do-projeto)
- [Lógica de Inserção de Dados](#-lógica-de-inserção-de-dados)
- [Exemplo de CSV Aceito](#-exemplo-de-csv-aceito)
- [Crescimento do Banco de Dados](#-crescimento-do-banco-de-dados)
- [Exemplo de Uso (Passo a Passo)](#-exemplo-de-uso-passo-a-passo)
- [Licença e Créditos](#-licença-e-créditos)

---

## 📝 Descrição Geral

**Database Monitoring** é um projeto **Node.js** cujo propósito é **monitorar um diretório de arquivos CSV** e sincronizá-los automaticamente com um banco de dados SQL. Ele observa em tempo real uma pasta definida pelo usuário e, ao detectar novos arquivos CSV com tipos específicos (**mensais**, **diários** ou **cadastrais**), realiza o parsing dos arquivos e insere os dados no banco de dados.

O sistema é capaz de fazer **inserções incrementais** e **exclusões** de registros de forma inteligente, garantindo que o banco reflita exatamente os dados fornecidos nos CSVs (evitando duplicações ou dados desatualizados). Tudo isso é feito de forma eficiente utilizando **processamento em streaming** para lidar com arquivos grandes sem sobrecarregar a memória.

---

## 🛠 Tecnologias e Bibliotecas Utilizadas

- **Node.js** – Ambiente de execução JavaScript utilizado para rodar o servidor.
- **Express** – Framework web usado para criar o servidor (API) da aplicação.
- **Chokidar** – Biblioteca para monitoramento de sistema de arquivos, utilizada para vigiar a pasta de diretórios CSV em tempo real.
- **PapaParse** – Biblioteca para fazer parsing de arquivos CSV em **streaming**, convertendo os dados de forma eficiente.
- **MySQL (mysql2)** – Banco de dados SQL usado para armazenar os dados; a biblioteca `mysql2` é utilizada para conexão e execução de queries.
- **Outras**: `dotenv` (carregamento de variáveis de ambiente), `p-limit` (controle de promessas simultâneas), `cli-progress` (barra de progresso no console), entre outras.

---

## 📋 Pré-requisitos

- **Node.js instalado** – Preferencialmente versão **LTS 14+** (ou mais recente) configurado em seu ambiente.
- **Banco de Dados SQL** – Ter acesso a um banco **MySQL** (ou compatível) configurado. Você precisará das credenciais de acesso e de um banco de dados criado.  
  > ⚠️ **Importante:** As tabelas correspondentes aos CSVs devem existir no banco e ter **esquema compatível** com as colunas dos arquivos CSV (mesmos nomes de coluna e tipos de dados esperados, incluindo uma **coluna de data** quando aplicável).
- **Diretório Monitorado** – Defina um diretório no sistema de arquivos que será monitorado pelo aplicativo. Esse diretório deverá conter subpastas organizadas conforme o tipo de dado (veja seção **Configuração da Estrutura de Diretórios**). Certifique-se de que o usuário que executa a aplicação tem **permissão de leitura** (e escrita, se for mover/excluir manualmente).
- **Permissões de Rede** – Caso o diretório monitorado seja um compartilhamento de rede (por exemplo, caminho UNC no Windows, como `\\servidor\pasta\...`), verifique se a máquina rodando o Node.js consegue acessar esse caminho.

---

## 🚀 Instalação

Siga os passos abaixo para instalar e configurar o projeto em seu ambiente local:

1) **Clonar o Repositório**
```bash
git clone https://github.com/Luskahz/Database_monitoring.git
cd Database_monitoring
````

2. **Instalar Dependências**

```bash
npm install
```

3. **Configurar Variáveis de Ambiente**
   Crie um arquivo **`.env`** na raiz do projeto com as configurações do banco de dados e parâmetros do sistema:

```ini
# Configurações de conexão com o banco de dados
DB_HOST=localhost
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=nome_do_banco

# Parâmetros opcionais de desempenho (valores padrão recomendados)
BATCH_SIZE=1000              # Quantidade de linhas por lote de inserção
INSERT_MAX_CONCURRENT=2      # Nº máx. de lotes inseridos em paralelo por arquivo
FILES_MAX_CONCURRENT=4       # Nº máx. de arquivos processados simultaneamente
QUEUE_HIGH_WATERMARK=4       # Lotes "em voo" para pausar leitura (backpressure)
QUEUE_LOW_WATERMARK=2        # Lotes pendentes para retomar leitura após pausa
```

**Explicação rápida**

* `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: credenciais do MySQL.
* `BATCH_SIZE`: nº de linhas por INSERT em lote.
* `INSERT_MAX_CONCURRENT`: nº de INSERTs de lotes em paralelo **por arquivo**.
* `FILES_MAX_CONCURRENT`: nº de **arquivos** processados em paralelo.
* `QUEUE_HIGH_WATERMARK` / `QUEUE_LOW_WATERMARK`: controlam **backpressure** na leitura em streaming.

> 💡 **Dica:** Comece com os valores padrão. Monitore CPU/IO do banco durante a ingestão e ajuste para otimizar.

4. **Diretório Monitorado**
   Se desejar alterar o diretório monitorado, edite `src/monitoring.js` e modifique a constante `monitorPath` para o caminho desejado (por exemplo, um UNC: `\\192.168.0.213\Files\...`).

5. **Estrutura das Pastas**
   Organize os arquivos conforme a seção seguinte (**Configuração da Estrutura de Diretórios**).

---

## 📁 Configuração da Estrutura de Diretórios

Para que o monitoramento e a ingestão funcionem corretamente, os arquivos CSV precisam estar organizados em uma estrutura que indique seu tipo (**diário**, **mensal** ou **cadastral**) e período.

```text
Diretorio_Monitorado/               📂 (pasta raiz monitorada)
├── vendas_diario/                  📂 (tabela de vendas diárias)
│   ├── 2023/                       📂 (ano)
│   │   ├── 01/                     📂 (mês Janeiro)
│   │   │   ├── 01.csv              📄 (dados do dia 01/01/2023)
│   │   │   ├── 02.csv              📄 (dados do dia 02/01/2023)
│   │   │   └── ...                 
│   │   ├── 02/                     📂 (Fevereiro)
│   │   │   └── 01.csv              📄 (dados do dia 01/02/2023)
│   │   └── ...                     
│   └── 2024/ ...                   
│
├── vendas_mensal/                  📂 (tabela de vendas mensais)
│   ├── 2023/
│   │   ├── jan.csv                 📄 (dados consolidados de Jan/2023)
│   │   ├── fev.csv                 📄 (dados consolidados de Fev/2023)
│   │   └── dez.csv                 📄 (dados de Dez/2023)
│   └── 2024/ ...
│
└── produtos_cadastral/             📂 (tabela de dados cadastrais)
    ├── 2023/
    │   └── cadastro.csv            📄 (carga completa em 2023)
    └── 2024/ ...
```

**Regras de organização e nomeação**

* Cada **tabela/dataset** deve ter sua própria subpasta na raiz monitorada (ex.: `vendas_diario`, `vendas_mensal`, `produtos_cadastral`). O **nome da pasta** é usado para identificar a **tabela de destino** no banco.
* Dentro de cada pasta de tabela, utilize subpastas para **anos** (`2023`, `2024`, ...).
* **Diário**: subpastas por **mês** (`01`–`12`). Dentro de cada mês, arquivos nomeados com o **dia** (`01.csv`, `02.csv`, ...).

  * Ex.: `vendas_diario/2023/05/15.csv` → dados de **15/05/2023**.
* **Mensal**: arquivos diretamente dentro do **ano**, nomeados pelo **mês** (`jan.csv`, `fev.csv`, ...).

  * Ex.: `vendas_mensal/2023/jan.csv` → consolidados de **Jan/2023**.
  * **Importante:** Evite nomes **puramente numéricos** para mensais (para diferenciar de diários).
* **Cadastral**: pelo menos subpasta de **ano** e um CSV de **carga completa** (ex.: `cadastro.csv`).

  * Ex.: `produtos_cadastral/2023/cadastro.csv`.

> **Atenção:** Mantenha os **nomes das colunas** nos CSVs **iguais** aos da tabela de destino (incluindo a **coluna de data** nos diários/mensais).

---

## ▶️ Execução do Projeto

**Ambiente de desenvolvimento (nodemon)**

```bash
npm run dev
```

Isso iniciará o servidor Express (porta padrão **3000**) e ativará o monitoramento do diretório configurado.

**Produção (Node)**

```bash
node src/server.js
```

**Verifique a inicialização**

```text
Servidor rodando na porta 3000
✅ Pronto! Monitorando alterações em: \\192.168.0.213\Files\Logistica\0.DPO\Diretórios_SQL
```

**Logs em tempo real**

* 🟢 **Arquivo adicionado** – novo CSV detectado → processar e inserir.
* 🟡 **Arquivo modificado** – CSV existente alterado → reprocessar/substituir período.
* 🔴 **Arquivo removido** – CSV deletado → remover registros correspondentes no banco.

Mensagens de erro (conexão, formato, etc.) aparecerão no console para facilitar o **debug**.

---

## ⚙️ Lógica de Inserção de Dados

**Parsing e Tipagem (streaming)**

* Leitura linha a linha com **PapaParse** (streaming).
* Header é **interpretado e normalizado** para bater com os nomes de coluna do banco.
* Conversão de tipos conforme o esquema da tabela (números, datas, strings…).
* Registros agrupados em **lotes** de tamanho `BATCH_SIZE` (ex.: 1000).
* Inserção de lotes **em paralelo** (assíncrona) enquanto a leitura continua.

**Identificação do tipo de arquivo**

* **Com coluna de data** (diário/mensal):

  * Determina o **intervalo de datas** do arquivo.
  * Se **já existem dados** no intervalo → **substituição**: **DELETE** do período e **INSERT** dos dados novos.
  * Se **não existem dados** → **inserção direta**.
* **Sem coluna de data** (cadastral):

  * Interpreta como **carga completa**: **DELETE total** da tabela e **INSERT** de todo o arquivo.

**Confirmação e Logs**

* Quantidade de linhas lidas/inseridas.
* Tempo de processamento.
* Avisos: colunas faltantes, discrepâncias, etc.

---

## 🗎 Exemplo de CSV Aceito

Supondo um dataset **diário** de vendas:

```csv
data_venda,id_venda,valor,cliente
2023-05-15,101,250.75,Cliente A
2023-05-15,102,100.00,Cliente B
```

**Notas**

* `data_venda` em **YYYY-MM-DD** (ISO).
* Delimitador **`,`** por padrão (detecção automática; `;` também suportado).
* **UTF-8** preferencial.
* Evite colunas duplicadas no header e mantenha nomes alinhados com a tabela.

Para arquivos **mensais**, o formato é similar (podem conter diversas datas dentro do mês). **Cadastrais** não precisam de coluna de data.

---

## 📈 Crescimento do Banco de Dados

* **Novos arquivos** → **inserção** de registros (o volume cresce com o histórico).
* **Arquivos atualizados** → **substituição** do período (DELETE + INSERT).
* **Remoção de arquivos** → **remoção** dos dados correspondentes no banco.
* **Cadastrais** → sempre **snapshot completo**: limpa a tabela e reinsere tudo do CSV.

> Assim, o banco espelha **exatamente** os arquivos presentes na pasta monitorada.

---

## 💡 Exemplo de Uso (Passo a Passo)

1. **Inicialização**

   ```text
   npm run dev
   Servidor rodando na porta 3000
   ✅ Pronto! Monitorando alterações em: C:\dados\Diretorio_Monitorado
   ```

2. **Adição de um arquivo diário**

   ```
   C:\dados\Diretorio_Monitorado\vendas_diario\2023\05\25.csv
   ```

   Logs:

   ```text
   🟢 Arquivo adicionado: ...\vendas_diario\2023\05\25.csv
   [Info] Novo arquivo detectado (25.csv) será processado e inserido na tabela vendas_diario.
   Montando lote... (leitura streaming do CSV)
   Inseridos: 450/450 registros
   ✅ Concluído - 450 registros inseridos na tabela vendas_diario.
   ```

3. **Atualização de um arquivo mensal**

   ```
   ...\vendas_mensal\2023\mai.csv
   ```

   Logs:

   ```text
   🟡 Arquivo modificado: ...\vendas_mensal\2023\mai.csv
   [Info] Arquivo existente modificado (mai.csv). Reprocessando dados...
   [Gerenciamento] substituição: período removido antes da reinserção.
   ✅ Concluído - 31 registros inseridos na tabela vendas_mensal.
   ```

4. **Remoção de um arquivo**

   ```
   ...\vendas_diario\2023\05\20.csv
   ```

   Logs:

   ```text
   🔴 Arquivo removido: ...\vendas_diario\2023\05\20.csv
   [Delete] Removidos 300 registros da tabela vendas_diario.
   ```

---

## 📜 Licença e Créditos

Este projeto é disponibilizado sob a licença **ISC**.

**Créditos:** Projeto desenvolvido por **Lucas Alves**.
Agradecimentos aos mantenedores das bibliotecas open-source utilizadas (Express, Chokidar, PapaParse, MySQL2, etc.).

---

**💻 Happy Monitoring!** 🚀

```
```
