// models/database.js
import mysql from 'mysql2/promise';

const connection = await mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'Diretorio',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default connection;