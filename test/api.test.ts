import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SyncService } from "../src/catalog/sync.js";
import { createApp } from "../src/server.js";
import type { Upstream } from "../src/portal/types.js";
import { ensureIndexes } from "../src/store/mongo.js";
import { fleetMeters, fleetTransformers, sampleReadings } from "./fleet.js";

class FakeUpstream implements Upstream {
  failFleet = false;
  readingCalls = 0;
  meters = fleetMeters();

  sessionExpiresAt(): Date {
    return new Date("2026-10-30T12:00:00.000Z");
  }

  async fetchFleet() {
    if (this.failFleet) throw new Error("portal down");
    return this.meters;
  }

  async fetchTransformers() {
    return fleetTransformers();
  }

  async fetchReadings() {
    this.readingCalls += 1;
    return sampleReadings;
  }
}

describe("catalog HTTP API", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  const upstream = new FakeUpstream();
  let sync: SyncService;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db("urja_catalog");
    await ensureIndexes(db);
    sync = new SyncService({ db, upstream, ttlSeconds: 3600 });
    app = createApp({
      db,
      sync,
      upstream,
      registerTtlSeconds: 600,
      portalOffsetMinutes: 330,
    });
    await sync.ensureFresh(true);
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  it("serves health, a cursor page, and the repaired meter", async () => {
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok" });

    const page = await request(app).get("/v1/meters").query({ limit: 2 });
    expect(page.status).toBe(200);
    expect(page.body.items.map((item: { meterId: string }) => item.meterId)).toEqual(["J100001", "J100006"]);
    expect(page.body.stale).toBe(false);
    expect(page.body.nextCursor).toBeTypeOf("string");

    const next = await request(app).get("/v1/meters").query({ limit: 2, cursor: page.body.nextCursor });
    expect(next.body.items.map((item: { meterId: string }) => item.meterId)).toEqual(["J100011", "J100021"]);

    const detail = await request(app).get("/v1/meters/J100011");
    expect(detail.status).toBe(200);
    expect(detail.body.item.network.circle.code).toBe("C-01");
    expect(detail.body.item.networkRaw.circle.code).toBeNull();
    expect(detail.body.item.location.type).toBe("Point");
  });

  it("rejects a bad meter id and a reversed register window", async () => {
    const badId = await request(app).get("/v1/meters/J12");
    expect(badId.status).toBe(422);
    expect(badId.headers["content-type"]).toMatch(/application\/problem\+json/);

    const missing = await request(app).get("/v1/meters/J100777");
    expect(missing.status).toBe(404);

    const reversed = await request(app).get("/v1/meters/J100001/registers").query({ from: "2026-06-12", to: "2026-06-10" });
    expect(reversed.status).toBe(422);
  });

  it("derives interval energy and caches the portal call", async () => {
    const first = await request(app).get("/v1/meters/J100001/registers").query({ from: "2026-06-10", to: "2026-06-10" });
    expect(first.status).toBe(200);
    expect(first.body.cadence).toBe("half_hourly");
    expect(first.body.points[1].intervalKwh).toBe(0.5);
    expect(first.body.points[2].registerReset).toBe(true);
    const second = await request(app).get("/v1/meters/J100001/registers").query({ from: "2026-06-10", to: "2026-06-10" });
    expect(second.status).toBe(200);
    expect(upstream.readingCalls).toBe(1);
  });

  it("filters by network path, lists a node, and finds nearby meters", async () => {
    const path = "Z-01/C-01/D-01/SD-01/SS-01/F-001/DT-001";
    const under = await request(app).get("/v1/meters").query({ networkPath: path });
    expect(under.body.items.map((item: { meterId: string }) => item.meterId).sort()).toEqual(["J100001", "J100011", "J100021"]);

    const zone = await request(app).get("/v1/network/Z-01");
    expect(zone.status).toBe(200);
    expect(zone.body.item.code).toBe("Z-01");
    expect(zone.body.item.meters.total).toBeGreaterThan(0);

    const places = await request(app).get("/v1/places").query({ lng: 75.8, lat: 26.91, radiusM: 3000 });
    expect(places.status).toBe(200);
    expect(places.body.items.map((item: { meterId: string }) => item.meterId).sort()).toEqual(["J100001", "J100011", "J100021"]);
    expect(places.body.items[0].distanceM).toBeLessThan(3000);
  });

  it("reports alias, unrepaired hierarchy, and a faulty cluster", async () => {
    const signals = await request(app).get("/v1/signals");
    expect(signals.status).toBe(200);
    const kinds = signals.body.items.map((item: { kind: string; meterId?: string; transformerCode?: string }) =>
      [item.kind, item.meterId ?? item.transformerCode].join(":"),
    );
    expect(kinds).toContain("unrepaired_hierarchy:J100099");
    expect(kinds).toContain("transformer_name_clash:DT-007");
    expect(kinds).toContain("faulty_cluster:DT-007");

    const transformer = await request(app).get("/v1/transformers/DT-007");
    expect(transformer.body.item.aliases).toEqual(["Old Malviya Nagar Xfmr"]);
    expect(transformer.body.item.capacityKva).toBe(63);
  });

  it("keeps the previous generation when a rebuild fails, then swaps when it succeeds", async () => {
    upstream.failFleet = true;
    const failed = await request(app).post("/v1/catalog/rebuild");
    expect(failed.status).toBe(200);
    expect(failed.body.stale).toBe(true);
    expect(failed.body.lastError).toMatch(/portal down/);
    const stillThere = await request(app).get("/v1/meters/J100001");
    expect(stillThere.status).toBe(200);

    upstream.failFleet = false;
    upstream.meters = fleetMeters().filter((meter) => meter.meterId !== "J100001");
    upstream.meters.push({
      ...fleetMeters()[0]!,
      meterId: "J100777",
      serialNo: "SE777",
    });
    const rebuilt = await request(app).post("/v1/catalog/rebuild");
    expect(rebuilt.body.stale).toBe(false);
    expect((await request(app).get("/v1/meters/J100001")).status).toBe(404);
    expect((await request(app).get("/v1/meters/J100777")).status).toBe(200);
    const leftover = await db.collection("meters").countDocuments({ meterId: "J100001" });
    expect(leftover).toBe(0);
  });

  it("publishes the OpenAPI document", async () => {
    const spec = await request(app).get("/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe("3.1.0");
    expect(spec.body.paths["/v1/meters/{meterId}/registers"]).toBeTruthy();
    expect(spec.body.paths["/v1/places"]).toBeTruthy();
    expect(spec.body.paths["/v1/signals"]).toBeTruthy();
  });
});
