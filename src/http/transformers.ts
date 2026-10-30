import { Router } from "express";
import { problem } from "../problem.js";
import { transformerCodeSchema } from "../schemas.js";
import { frame, parse, requireCatalog, route, type AppDeps } from "./common.js";

export function transformerRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(
    "/v1/transformers",
    route(async (_req, res) => {
      const state = await requireCatalog(deps, res);
      if (!state) return;
      const rows = await deps.db.collection("transformers").find({ generation: state.generation }).sort({ code: 1 }).toArray();
      res.json({
        ...frame(state),
        items: rows.map(summary),
        nextCursor: null,
      });
    }),
  );

  router.get(
    "/v1/transformers/:code",
    route(async (req, res) => {
      const state = await requireCatalog(deps, res);
      const code = parse(transformerCodeSchema, req.params.code, res);
      if (!state || !code) return;
      const row = await deps.db.collection("transformers").findOne({ generation: state.generation, code });
      if (!row) {
        problem(res, 404, "Transformer not found", `No transformer ${code} is in the catalog.`);
        return;
      }
      res.json({ ...frame(state), item: detail(row) });
    }),
  );

  return router;
}

function summary(row: Record<string, unknown>) {
  return {
    code: row.code,
    name: row.name,
    feederCode: row.feederCode ?? null,
    capacityKva: row.capacityKva ?? null,
    meterCount: row.meterCount ?? 0,
    ancestryPath: row.ancestryPath ?? null,
  };
}

function detail(row: Record<string, unknown>) {
  return {
    ...summary(row),
    statusCounts: row.statusCounts,
    aliases: row.aliases ?? [],
    meterIds: row.meterIds ?? [],
  };
}
