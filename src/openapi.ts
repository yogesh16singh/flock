import { OpenApiGeneratorV31, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  catalogSchema,
  healthSchema,
  meterDetailResponseSchema,
  meterIdSchema,
  meterListQuery,
  meterListSchema,
  networkListSchema,
  networkNodeResponseSchema,
  networkQuery,
  placeListSchema,
  placeQuery,
  problemSchema,
  registerQuery,
  registersSchema,
  signalListSchema,
  transformerCodeSchema,
  transformerDetailResponseSchema,
  transformerListSchema,
} from "./schemas.js";

const registry = new OpenAPIRegistry();

const problemResponse = {
  description: "Request failed",
  content: { "application/problem+json": { schema: problemSchema } },
};

registry.registerPath({
  method: "get",
  path: "/health",
  summary: "Process and database liveness",
  responses: {
    200: { description: "MongoDB answered a ping", content: { "application/json": { schema: healthSchema } } },
    503: problemResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/catalog",
  summary: "Current catalog generation",
  responses: {
    200: { description: "Catalog freshness", content: { "application/json": { schema: catalogSchema } } },
    503: problemResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/v1/catalog/rebuild",
  summary: "Reload the fleet from the portal",
  responses: {
    200: { description: "Catalog after the reload", content: { "application/json": { schema: catalogSchema } } },
    503: problemResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/network",
  summary: "Children of a network path",
  request: { query: networkQuery },
  responses: {
    200: { description: "Network nodes", content: { "application/json": { schema: networkListSchema } } },
    404: problemResponse,
    422: problemResponse,
    503: problemResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/network/{path}",
  summary: "One network node and the meters under it",
  description: "Path is the full code chain, for example Z-01/C-01/D-01. Encode slashes as %2F.",
  request: { params: z.object({ path: z.string() }) },
  responses: {
    200: { description: "Network node", content: { "application/json": { schema: networkNodeResponseSchema } } },
    404: problemResponse,
    503: problemResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/transformers",
  summary: "Distribution transformers",
  responses: {
    200: { description: "Transformer registry joined with meter rollups", content: { "application/json": { schema: transformerListSchema } } },
    503: problemResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/transformers/{code}",
  summary: "One distribution transformer",
  request: { params: z.object({ code: transformerCodeSchema }) },
  responses: {
    200: { description: "Transformer", content: { "application/json": { schema: transformerDetailResponseSchema } } },
    404: problemResponse,
    422: problemResponse,
    503: problemResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/meters",
  summary: "Search meters",
  request: { query: meterListQuery },
  responses: {
    200: { description: "Meters", content: { "application/json": { schema: meterListSchema } } },
    422: problemResponse,
    503: problemResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/meters/{meterId}",
  summary: "Meter nameplate, hierarchy, and location",
  request: { params: z.object({ meterId: meterIdSchema }) },
  responses: {
    200: { description: "Meter", content: { "application/json": { schema: meterDetailResponseSchema } } },
    404: problemResponse,
    422: problemResponse,
    503: problemResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/meters/{meterId}/registers",
  summary: "Cumulative registers and derived interval energy",
  request: {
    params: z.object({ meterId: meterIdSchema }),
    query: registerQuery,
  },
  responses: {
    200: { description: "Register series", content: { "application/json": { schema: registersSchema } } },
    404: problemResponse,
    422: problemResponse,
    502: problemResponse,
    503: problemResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/places",
  summary: "Meters near a point",
  request: { query: placeQuery },
  responses: {
    200: { description: "Meters inside the radius, nearest first", content: { "application/json": { schema: placeListSchema } } },
    422: problemResponse,
    503: problemResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/signals",
  summary: "Catalog issues the portal does not surface",
  responses: {
    200: { description: "Hierarchy gaps, name clashes, and faulty clusters", content: { "application/json": { schema: signalListSchema } } },
    503: problemResponse,
  },
});

export function buildOpenApi() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Urja Catalog API",
      version: "1.0.0",
      description:
        "Read-only catalog over the Urja Meter Ops portal. Fleet data is synced from the portal export into MongoDB. Register series are fetched per meter.",
    },
    servers: [{ url: "http://127.0.0.1:8080" }],
  });
}
