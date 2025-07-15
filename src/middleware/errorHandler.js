import loggerMaster, { errorReceiver } from "./logger";

export default function chokidarErrorHandler(error, metadados) {
  errorReceiver(error)
}
