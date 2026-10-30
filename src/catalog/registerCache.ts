import type { Db } from "mongodb";
import type { Upstream } from "../portal/types.js";
import { parseReadings, type ParsedSeries } from "./readings.js";

type CacheDeps = {
  db: Db;
  upstream: Upstream;
  registerTtlSeconds: number;
  portalOffsetMinutes: number;
};

const flights = new Map<string, Promise<ParsedSeries>>();

export function loadReadings(deps: CacheDeps, meterId: string, from: string, to: string): Promise<ParsedSeries> {
  const key = `${meterId}|${from}|${to}`;
  const existing = flights.get(key);
  if (existing) return existing;
  const pending = readThrough(deps, meterId, from, to).finally(() => {
    flights.delete(key);
  });
  flights.set(key, pending);
  return pending;
}

async function readThrough(deps: CacheDeps, meterId: string, from: string, to: string): Promise<ParsedSeries> {
  const cache = deps.db.collection("register_cache");
  const cached = await cache.findOne({ meterId, from, to, expireAt: { $gt: new Date() } });
  if (cached && Array.isArray(cached.points) && typeof cached.cadence === "string") {
    return { cadence: cached.cadence as ParsedSeries["cadence"], points: cached.points as ParsedSeries["points"] };
  }
  const rows = await deps.upstream.fetchReadings(meterId, from, to);
  const parsed = parseReadings(rows, deps.portalOffsetMinutes);
  const now = new Date();
  await cache.updateOne(
    { meterId, from, to },
    {
      $set: {
        meterId,
        from,
        to,
        cadence: parsed.cadence,
        points: parsed.points,
        fetchedAt: now,
        expireAt: new Date(now.getTime() + deps.registerTtlSeconds * 1000),
      },
    },
    { upsert: true },
  );
  return parsed;
}
