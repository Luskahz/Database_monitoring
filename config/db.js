import mysql from "mysql2/promise";

const schema = "diretorio";

const connection = await mysql.createPool({
  host: "192.168.0.112",
  user: "lucas",
  password: "Lucas_7276",
  database: "diretorio",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export { connection as default, schema };
