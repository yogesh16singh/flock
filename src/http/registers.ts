import { Router } from "express";
import { loadReadings } from "../catalog/registerCache.js";
import { PortalError } from "../portal/types.js";
import { problem } from "../problem.js";
import { meterIdSchema, registerQuery } from "../schemas.js";
import { frame, parse, requireCatalog, route, type AppDeps } from "./common.js";

export function registerRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(
    "/v1/meters/:meterId/registers",
    route(async (req, res) => {
      const state = await requireCatalog(deps, res);
      const meterId = parse(meterIdSchema, req.params.meterId, res);
      const query = parse(registerQuery, req.query, res);
      if (!state || !meterId || !query) return;
      const meter = await deps.db.collection("meters").findOne({ generation: state.generation, meterId });
      if (!meter) {
        problem(res, 404, "Meter not found", `No meter ${meterId} is in the catalog.`);
        return;
      }
      try {
        const series = await loadReadings(
          {
            db: deps.db,
            upstream: deps.upstream,
            registerTtlSeconds: deps.registerTtlSeconds,
            portalOffsetMinutes: deps.portalOffsetMinutes,
          },
          meterId,
          query.from,
          query.to,
        );
        res.json({ ...frame(state), meterId, from: query.from, to: query.to, ...series });
      } catch (error) {
        if (error instanceof PortalError) {
          const status = error.status === 429 ? 503 : 502;
          problem(res, status, "Portal request failed", error.message);
          return;
        }
        throw error;
      }
    }),
  );

  return router;
}
