import type { NextFunction, Request, Response } from "express";
import type { Db } from "mongodb";
import type { SyncService, SyncState } from "../catalog/sync.js";
import { ageSeconds } from "../catalog/sync.js";
import type { Upstream } from "../portal/types.js";
import { problem } from "../problem.js";
import type { ZodType } from "zod";

export type AppDeps = {
  db: Db;
  sync: SyncService;
  upstream: Upstream;
  registerTtlSeconds: number;
  portalOffsetMinutes: number;
};

export function route(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

export async function requireCatalog(deps: AppDeps, res: Response): Promise<SyncState | undefined> {
  const state = await deps.sync.ensureFresh();
  if (state.generation == null || state.asOf == null) {
    problem(res, 503, "Catalog unavailable", state.lastError ?? "The catalog has not been loaded from the portal.");
    return;
  }
  return state;
}

export function frame(state: SyncState): { asOf: string; stale: boolean } {
  return { asOf: state.asOf ?? new Date(0).toISOString(), stale: state.stale };
}

export function catalogDocument(state: SyncState) {
  return {
    generation: state.generation,
    asOf: state.asOf,
    stale: state.stale,
    ageSeconds: Math.round(ageSeconds(state.asOf)),
    meterCount: state.meterCount,
    transformerCount: state.transformerCount,
    sessionExpiresAt: state.sessionExpiresAt,
    lastError: state.lastError,
  };
}

export function parse<T>(schema: ZodType<T>, value: unknown, res: Response): T | undefined {
  const result = schema.safeParse(value);
  if (!result.success) {
    problem(res, 422, "Invalid request", "One or more parameters are invalid.", {
      errors: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }
  return result.data;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function encodeCursor(meterId: string): string {
  return Buffer.from(meterId, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): string | null {
  try {
    const meterId = Buffer.from(cursor, "base64url").toString("utf8");
    return /^J\d{6}$/.test(meterId) ? meterId : null;
  } catch {
    return null;
  }
}
