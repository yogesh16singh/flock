import { Router } from "express";
import { FAULTY_SHARE } from "../catalog/model.js";
import { frame, requireCatalog, route, type AppDeps } from "./common.js";

export function signalRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(
    "/v1/signals",
    route(async (_req, res) => {
      const state = await requireCatalog(deps, res);
      if (!state) return;
      const items: Record<string, unknown>[] = [];
      const meters = await deps.db
        .collection("meters")
        .find({ generation: state.generation, issues: /^missing:/ })
        .sort({ meterId: 1 })
        .toArray();
      for (const meter of meters) {
        const issues = Array.isArray(meter.issues) ? meter.issues.filter((issue) => String(issue).startsWith("missing:")) : [];
        items.push({ kind: "unrepaired_hierarchy", meterId: meter.meterId, issues });
      }
      const transformers = await deps.db.collection("transformers").find({ generation: state.generation }).sort({ code: 1 }).toArray();
      for (const transformer of transformers) {
        const aliases = Array.isArray(transformer.aliases) ? transformer.aliases.map(String) : [];
        if (aliases.length > 0) {
          items.push({
            kind: "transformer_name_clash",
            transformerCode: transformer.code,
            registryName: transformer.name,
            aliases,
          });
        }
        const faulty = Number(transformer.statusCounts?.faulty ?? 0);
        const meterCount = Number(transformer.meterCount ?? 0);
        const share = meterCount > 0 ? faulty / meterCount : 0;
        if (meterCount > 0 && share >= FAULTY_SHARE) {
          items.push({
            kind: "faulty_cluster",
            transformerCode: transformer.code,
            faulty,
            meterCount,
            share: Math.round(share * 1000) / 1000,
          });
        }
      }
      res.json({ ...frame(state), items, nextCursor: null });
    }),
  );

  return router;
}
