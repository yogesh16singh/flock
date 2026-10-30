import { Router } from "express";
import { problem } from "../problem.js";
import { catalogDocument, requireCatalog, route, type AppDeps } from "./common.js";

export function catalogRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(
    "/v1/catalog",
    route(async (_req, res) => {
      const state = await requireCatalog(deps, res);
      if (!state) return;
      res.json(catalogDocument(state));
    }),
  );

  router.post(
    "/v1/catalog/rebuild",
    route(async (_req, res) => {
      const state = await deps.sync.ensureFresh(true);
      if (state.generation == null || state.asOf == null) {
        problem(res, 503, "Catalog unavailable", state.lastError ?? "Rebuild did not produce a catalog.");
        return;
      }
      res.json(catalogDocument(state));
    }),
  );

  return router;
}
