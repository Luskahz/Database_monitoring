export default function mapearTipo(tipoSql) {
  const tipo = tipoSql?.toLowerCase?.();

  switch (true) {
    case ["int", "bigint", "smallint", "mediumint", "tinyint"].includes(tipo):
      return "int";

    case ["decimal", "float", "double", "numeric"].includes(tipo):
      return "decimal";

    case ["date"].includes(tipo):
      return "date";

    case ["datetime", "timestamp"].includes(tipo):
      return "datetime";

    case ["time"].includes(tipo):
      return "time";

    default:
      return "string";
  }
}
