import fs from "fs/promises";

export async function readHeadOnce(filePath, sampleBytes = 64 * 1024) {
  const fileHandle = await fs.open(filePath, "r");
  try {
    const buf = Buffer.allocUnsafe(sampleBytes);
    const { bytesRead } = await fileHandle.read(buf, 0, sampleBytes, 0);
    return { headBuf: buf.subarray(0, bytesRead) };
  } finally {
    await fileHandle.close();
  }
}
