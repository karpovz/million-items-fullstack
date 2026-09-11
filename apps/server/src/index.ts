import { createServer } from "node:http";
import { createService } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const service = createService(process.env.STATIC_DIR);
const server = createServer(service.app);
server.listen(port, "0.0.0.0", () =>
  console.log(`Million Items listening on :${port}`),
);
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: flushing queues`);
  const hardTimeout = setTimeout(() => process.exit(1), 12_000);
  hardTimeout.unref();
  const drain = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  try {
    await Promise.all([drain(), service.close()]);
    clearTimeout(hardTimeout);
    process.exit(0);
  } catch (error) {
    console.error("Graceful shutdown failed", error);
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
