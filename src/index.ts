import "dotenv/config";
import { loadConfig } from "./config.js";
import { SyncService } from "./catalog/sync.js";
import { createApp } from "./server.js";
import { PortalUpstream } from "./portal/client.js";
import { connectMongo } from "./store/mongo.js";

const config = loadConfig();
const { client, db } = await connectMongo(config.mongodbUri);
const upstream = new PortalUpstream(config);
const sync = new SyncService({ db, upstream, ttlSeconds: config.ttlSeconds });
const app = createApp({
  db,
  sync,
  upstream,
  registerTtlSeconds: config.registerTtlSeconds,
  portalOffsetMinutes: config.portalOffsetMinutes,
});

const server = app.listen(config.port, () => {
  console.log(`Urja catalog listening on http://127.0.0.1:${config.port}`);
  console.log(`API docs at http://127.0.0.1:${config.port}/docs`);
});

void sync.ensureFresh().then(
  (state) => {
    if (state.generation == null) console.error(`Initial catalog sync failed: ${state.lastError}`);
    else console.log(`Catalog generation ${state.generation} with ${state.meterCount} meters`);
  },
  (error: unknown) => {
    console.error("Initial catalog sync failed", error instanceof Error ? error.message : error);
  },
);

function shutdown() {
  server.close();
  void client.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
