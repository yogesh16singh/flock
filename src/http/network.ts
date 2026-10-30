import { Router } from "express";
import type { StatusCounts } from "../catalog/model.js";
import { problem } from "../problem.js";
import { networkQuery } from "../schemas.js";
import { escapeRegex, frame, parse, requireCatalog, route, type AppDeps } from "./common.js";

export function networkRouter(deps: AppDeps): Router {
  const router = Router();

  router.get(
    "/v1/network",
    route(async (req, res) => {
      const state = await requireCatalog(deps, res);
      const query = parse(networkQuery, req.query, res) as { parentPath?: string; depth: number } | undefined;
      if (!state || !query) return;
      if (query.parentPath) {
        const parent = await deps.db.collection("network_nodes").findOne({ generation: state.generation, path: query.parentPath });
        if (!parent) {
          problem(res, 404, "Network node not found", `No catalog node has path ${query.parentPath}.`);
          return;
        }
      }
      const parentDepth = query.parentPath ? query.parentPath.split("/").length : 0;
      const filter: Record<string, unknown> = {
        generation: state.generation,
        depth: { $gt: parentDepth, $lte: parentDepth + query.depth },
      };
      if (query.parentPath) filter.path = new RegExp(`^${escapeRegex(query.parentPath)}/`);
      const nodes = await deps.db.collection("network_nodes").find(filter).sort({ path: 1 }).toArray();
      const items = [];
      for (const node of nodes) items.push(await presentNode(deps, state.generation!, String(node.path), node));
      res.json({ ...frame(state), items, nextCursor: null });
    }),
  );

  router.get(
    "/v1/network/*",
    route(async (req, res) => {
      const state = await requireCatalog(deps, res);
      if (!state) return;
      const path = decodePath(req.params[0] ?? "");
      if (!path) {
        problem(res, 404, "Network node not found", "Network path is missing.");
        return;
      }
      const node = await deps.db.collection("network_nodes").findOne({ generation: state.generation, path });
      if (!node) {
        problem(res, 404, "Network node not found", `No catalog node has path ${path}.`);
        return;
      }
      res.json({ ...frame(state), item: await presentNode(deps, state.generation!, path, node) });
    }),
  );

  return router;
}

async function presentNode(
  deps: AppDeps,
  generation: number,
  path: string,
  node: Record<string, unknown>,
) {
  const grouped = await deps.db
    .collection("meters")
    .aggregate<{ _id: string | null; n: number }>([
      { $match: { generation, ancestors: path } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ])
    .toArray();
  const meters: StatusCounts & { total: number } = { installed: 0, faulty: 0, decommissioned: 0, other: 0, total: 0 };
  for (const row of grouped) {
    const count = row.n;
    meters.total += count;
    if (row._id === "installed" || row._id === "faulty" || row._id === "decommissioned") meters[row._id] += count;
    else meters.other += count;
  }
  const childCount = await deps.db.collection("network_nodes").countDocuments({ generation, parentPath: path });
  return {
    path,
    parentPath: (node.parentPath as string | null) ?? null,
    level: node.level,
    code: node.code,
    name: (node.name as string | null) ?? null,
    depth: node.depth,
    childCount,
    meters,
  };
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value).replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}
