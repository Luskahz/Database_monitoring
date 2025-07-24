export default function mapearTipo(tipoSql) {
  if (["int", "bigint", "smallint", "mediumint"].includes(tipoSql))
    return "int";
  if (["decimal", "float", "double"].includes(tipoSql)) return "decimal";
  if (["date"].includes(tipoSql)) return "date";
  if (["time"].includes(tipoSql)) return "time";
  if (["datetime"].includes(tipoSql)) return "datetime";
  return "string";
}