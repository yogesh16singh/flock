import express, { type NextFunction, type Request, type Response } from "express";
import { apiReference } from "@scalar/express-api-reference";
import { PortalError } from "./portal/types.js";
import { problem } from "./problem.js";
import { buildOpenApi } from "./openapi.js";
import { catalogRouter } from "./http/catalog.js";
import type { AppDeps } from "./http/common.js";
import { meterRouter } from "./http/meters.js";
import { networkRouter } from "./http/network.js";
import { placeRouter } from "./http/places.js";
import { registerRouter } from "./http/registers.js";
import { signalRouter } from "./http/signals.js";
import { transformerRouter } from "./http/transformers.js";
import { route } from "./http/common.js";

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.get(
    "/health",
    route(async (_req, res) => {
      try {
        await deps.db.command({ ping: 1 });
        res.json({ status: "ok" });
      } catch {
        problem(res, 503, "Database unavailable", "MongoDB did not answer a ping.");
      }
    }),
  );

  app.get("/openapi.json", (_req, res) => {
    res.json(buildOpenApi());
  });

  app.use(
    "/docs",
    apiReference({
      url: "/openapi.json",
    }),
  );

  app.use(catalogRouter(deps));
  app.use(networkRouter(deps));
  app.use(transformerRouter(deps));
  app.use(registerRouter(deps));
  app.use(meterRouter(deps));
  app.use(placeRouter(deps));
  app.use(signalRouter(deps));

  app.use((req, res) => {
    problem(res, 404, "Not found", `${req.method} ${req.path} is not a catalog route.`);
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof PortalError) {
      const status = error.status === 429 ? 503 : error.status === 404 ? 404 : 502;
      problem(res, status, "Portal request failed", error.message);
      return;
    }
    console.error(error);
    problem(res, 500, "Internal error", "The catalog failed while handling the request.");
  });

  return app;
}
