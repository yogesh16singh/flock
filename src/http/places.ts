import { Router } from "express";
import { placeQuery } from "../schemas.js";
import { frame, parse, requireCatalog, route, type AppDeps } from "./common.js";

export function placeRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(
    "/v1/places",
    route(async (req, res) => {
      const state = await requireCatalog(deps, res);
      const query = parse(placeQuery, req.query, res);
      if (!state || !query) return;
      const rows = await deps.db
        .collection("meters")
        .aggregate<Record<string, unknown> & { distanceM?: number }>([
          {
            $geoNear: {
              near: { type: "Point", coordinates: [query.lng, query.lat] },
              distanceField: "distanceM",
              maxDistance: query.radiusM,
              spherical: true,
              query: { generation: state.generation },
              key: "location",
            },
          },
          { $limit: query.limit },
        ])
        .toArray();
      res.json({
        ...frame(state),
        items: rows.map((row) => {
          const location = row.location as { type: "Point"; coordinates: [number, number] };
          return {
            meterId: row.meterId,
            serialNumber: row.serialNumber ?? null,
            status: row.status ?? null,
            transformerCode: row.transformerCode ?? null,
            distanceM: Math.round(Number(row.distanceM ?? 0)),
            location,
          };
        }),
        nextCursor: null,
      });
    }),
  );

  return router;
}
