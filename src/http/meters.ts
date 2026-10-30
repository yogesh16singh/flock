import { Router } from "express";
import type { Document } from "mongodb";
import { problem } from "../problem.js";
import { meterIdSchema, meterListQuery } from "../schemas.js";
import { decodeCursor, encodeCursor, escapeRegex, frame, parse, requireCatalog, route, type AppDeps } from "./common.js";

export function meterRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(
    "/v1/meters",
    route(async (req, res) => {
      const state = await requireCatalog(deps, res);
      const query = parse(meterListQuery, req.query, res) as
        | {
            cursor?: string;
            q?: string;
            phase?: "single" | "three";
            status?: "installed" | "faulty" | "decommissioned";
            make?: string;
            transformer?: string;
            networkPath?: string;
            limit: number;
          }
        | undefined;
      if (!state || !query) return;
      let cursor: string | undefined;
      if (query.cursor) {
        const decoded = decodeCursor(query.cursor);
        if (!decoded) {
          problem(res, 422, "Invalid request", "cursor is not a meter id from this catalog.");
          return;
        }
        cursor = decoded;
      }
      const clauses: Document[] = [{ generation: state.generation }];
      if (cursor) clauses.push({ meterId: { $gt: cursor } });
      if (query.phase) clauses.push({ phase: query.phase });
      if (query.status) clauses.push({ status: query.status });
      if (query.make) clauses.push({ makeKey: query.make.toLowerCase() });
      if (query.transformer) clauses.push({ transformerCode: query.transformer });
      if (query.networkPath) clauses.push({ ancestors: query.networkPath });
      if (query.q) {
        const pattern = new RegExp(escapeRegex(query.q), "i");
        clauses.push({ $or: [{ meterId: pattern }, { serialNumber: pattern }] });
      }
      const rows = await deps.db
        .collection("meters")
        .find({ $and: clauses })
        .sort({ meterId: 1 })
        .limit(query.limit + 1)
        .toArray();
      const page = rows.slice(0, query.limit);
      const last = page[page.length - 1];
      res.json({
        ...frame(state),
        items: page.map(summary),
        nextCursor: rows.length > query.limit && last ? encodeCursor(String(last.meterId)) : null,
      });
    }),
  );

  router.get(
    "/v1/meters/:meterId",
    route(async (req, res) => {
      const state = await requireCatalog(deps, res);
      const meterId = parse(meterIdSchema, req.params.meterId, res);
      if (!state || !meterId) return;
      const row = await deps.db.collection("meters").findOne({ generation: state.generation, meterId });
      if (!row) {
        problem(res, 404, "Meter not found", `No meter ${meterId} is in the catalog.`);
        return;
      }
      res.json({ ...frame(state), item: detail(row) });
    }),
  );

  return router;
}

function summary(row: Record<string, unknown>) {
  return {
    meterId: row.meterId,
    serialNumber: row.serialNumber ?? null,
    make: row.make ?? null,
    phase: row.phase ?? null,
    status: row.status ?? null,
    installType: row.installType ?? null,
    transformerCode: row.transformerCode ?? null,
    path: row.path ?? null,
  };
}

function detail(row: Record<string, unknown>) {
  return {
    ...summary(row),
    build: row.build ?? null,
    location: row.location ?? null,
    networkRaw: row.networkRaw,
    network: row.network,
    issues: row.issues ?? [],
  };
}
