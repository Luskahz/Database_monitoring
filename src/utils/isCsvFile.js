import path from "path"

export default function isCsvFile(filePath) {
  const fileName = path.basename(filePath).toLowerCase();

  const isValidExtension =
    fileName.endsWith(".csv") || fileName.endsWith(".csv.inf");
  const isExcluded = fileName.startsWith("~$") || fileName.endsWith(".tmp");

  return isValidExtension && !isExcluded;
}