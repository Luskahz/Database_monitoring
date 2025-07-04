// models/database.js
import mysql from 'mysql2';

// Configuração da conexão com o banco de dados
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'sua_senha',
  database: 'seu_banco_de_dados',
});

connection.connect();

export function insertDataToDatabase(filePath) {
  // Lógica para inserir dados no banco (exemplo)
  const query = 'INSERT INTO sua_tabela (campo1, campo2) VALUES (?, ?)';
  const data = [ 'valor1', 'valor2' ]; // Processar o arquivo para pegar os dados
  connection.query(query, data, (err, results) => {
    if (err) {
      console.error('Erro ao inserir dados:', err);
      return;
    }
    console.log('Dados inseridos com sucesso:', results);
  });
}

export function updateDataInDatabase(filePath) {
  // Lógica para atualizar dados no banco (exemplo)
  const query = 'UPDATE sua_tabela SET campo1 = ? WHERE id = ?';
  const data = ['novo_valor', 1];  // Processar o arquivo para pegar os dados
  connection.query(query, data, (err, results) => {
    if (err) {
      console.error('Erro ao atualizar dados:', err);
      return;
    }
    console.log('Dados atualizados com sucesso:', results);
  });
}
