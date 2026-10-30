import { MongoClient, type Db, type Document } from "mongodb";
import type { BuiltCatalog, CatalogMeter } from "../catalog/model.js";

export type SyncState = {
  generation: number | null;
  asOf: string | null;
  stale: boolean;
  lastError: string | null;
  lastAttemptAt: string;
  meterCount: number;
  transformerCount: number;
  sessionExpiresAt: string | null;
};

const STATE_ID = "current";

export async function connectMongo(uri: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  await ensureIndexes(db);
  return { client, db };
}

export async function ensureIndexes(db: Db): Promise<void> {
  const meters = db.collection("meters");
  await meters.createIndex({ generation: 1, meterId: 1 }, { unique: true });
  await meters.createIndex({ location: "2dsphere" });
  await meters.createIndex({ generation: 1, ancestors: 1 });
  await meters.createIndex({ generation: 1, transformerCode: 1 });
  await meters.createIndex({ generation: 1, status: 1, makeKey: 1 });
  await db.collection("transformers").createIndex({ generation: 1, code: 1 }, { unique: true });
  await db.collection("network_nodes").createIndex({ generation: 1, path: 1 }, { unique: true });
  await db.collection("network_nodes").createIndex({ generation: 1, parentPath: 1 });
  await db.collection("register_cache").createIndex({ meterId: 1, from: 1, to: 1 }, { unique: true });
  await db.collection("register_cache").createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
}

export async function insertCatalog(db: Db, generation: number, built: BuiltCatalog): Promise<void> {
  if (built.meters.length > 0) {
    await db.collection("meters").insertMany(built.meters.map((meter) => meterDocument(meter, generation)));
  }
  if (built.nodes.length > 0) {
    await db.collection("network_nodes").insertMany(built.nodes.map((node) => ({ ...node, generation })));
  }
  if (built.transformers.length > 0) {
    await db.collection("transformers").insertMany(built.transformers.map((transformer) => ({ ...transformer, generation })));
  }
}

export async function deleteOtherGenerations(db: Db, generation: number): Promise<void> {
  const filter = { generation: { $ne: generation } };
  await db.collection("meters").deleteMany(filter);
  await db.collection("network_nodes").deleteMany(filter);
  await db.collection("transformers").deleteMany(filter);
}

export async function readSyncState(db: Db): Promise<SyncState | null> {
  const doc = await db.collection<SyncState & { _id: string }>("sync_state").findOne({ _id: STATE_ID });
  if (!doc) return null;
  return {
    generation: doc.generation ?? null,
    asOf: doc.asOf ?? null,
    stale: Boolean(doc.stale),
    lastError: doc.lastError ?? null,
    lastAttemptAt: doc.lastAttemptAt,
    meterCount: doc.meterCount ?? 0,
    transformerCount: doc.transformerCount ?? 0,
    sessionExpiresAt: doc.sessionExpiresAt ?? null,
  };
}

export async function writeSyncState(db: Db, state: SyncState): Promise<SyncState> {
  await db
    .collection<SyncState & { _id: string }>("sync_state")
    .updateOne({ _id: STATE_ID }, { $set: state }, { upsert: true });
  return state;
}

function meterDocument(meter: CatalogMeter, generation: number): Document {
  const doc: Document = { ...meter, generation };
  if (!meter.location) delete doc.location;
  return doc;
}
