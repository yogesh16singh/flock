import type { Db } from "mongodb";
import { buildCatalog } from "./build.js";
import type { Upstream } from "../portal/types.js";
import { deleteOtherGenerations, insertCatalog, readSyncState, writeSyncState, type SyncState } from "../store/mongo.js";

export type { SyncState };

type SyncDeps = {
  db: Db;
  upstream: Upstream;
  ttlSeconds: number;
};

export class SyncService {
  private flight: Promise<SyncState> | null = null;
  private sequence = 0;

  constructor(private readonly deps: SyncDeps) {}

  ensureFresh(force = false): Promise<SyncState> {
    if (this.flight) return this.flight;
    this.flight = this.run(force).finally(() => {
      this.flight = null;
    });
    return this.flight;
  }

  private async run(force: boolean): Promise<SyncState> {
    const current = await readSyncState(this.deps.db);
    if (!force && current && shouldKeep(current, this.deps.ttlSeconds)) return current;
    try {
      return await this.rebuild();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Catalog sync failed";
      if (current) return writeSyncState(this.deps.db, { ...current, stale: true, lastError: message, lastAttemptAt: new Date().toISOString() });
      return writeSyncState(this.deps.db, {
        generation: null,
        asOf: null,
        stale: true,
        lastError: message,
        lastAttemptAt: new Date().toISOString(),
        meterCount: 0,
        transformerCount: 0,
        sessionExpiresAt: null,
      });
    }
  }

  private async rebuild(): Promise<SyncState> {
    const [fleet, transformers] = await Promise.all([this.deps.upstream.fetchFleet(), this.deps.upstream.fetchTransformers()]);
    const built = buildCatalog(fleet, transformers);
    const generation = Date.now() * 1000 + (this.sequence % 1000);
    this.sequence += 1;
    await insertCatalog(this.deps.db, generation, built);
    const now = new Date().toISOString();
    const state: SyncState = {
      generation,
      asOf: now,
      stale: false,
      lastError: null,
      lastAttemptAt: now,
      meterCount: built.meters.length,
      transformerCount: built.transformers.length,
      sessionExpiresAt: this.deps.upstream.sessionExpiresAt()?.toISOString() ?? null,
    };
    await writeSyncState(this.deps.db, state);
    await deleteOtherGenerations(this.deps.db, generation);
    return state;
  }
}

function shouldKeep(state: SyncState, ttlSeconds: number): boolean {
  const sinceAttempt = ageSeconds(state.lastAttemptAt);
  const dataIsFresh = state.generation != null && !state.stale && state.asOf != null && ageSeconds(state.asOf) < ttlSeconds;
  const recentlyFailed = sinceAttempt < ttlSeconds && (state.stale || state.generation == null);
  return dataIsFresh || recentlyFailed;
}

export function ageSeconds(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - parsed) / 1000);
}
