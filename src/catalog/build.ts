import { LEVELS, type BuiltCatalog, type CatalogTransformer, type NetworkNode, type StatusCounts } from "./model.js";
import { normalizeMeter } from "./normalize.js";
import { repairMeters } from "./repair.js";
import type { PortalMeter, PortalTransformer } from "../portal/types.js";

export function buildCatalog(rawMeters: PortalMeter[], rawTransformers: PortalTransformer[]): BuiltCatalog {
  const meters = rawMeters.map(normalizeMeter).filter((meter) => meter.meterId.length > 0);
  const registry = new Map(rawTransformers.filter((item) => item.code).map((item) => [item.code, item]));
  repairMeters(meters, registry);
  return {
    meters,
    nodes: buildNodes(meters),
    transformers: buildTransformers(meters, registry),
  };
}

function buildNodes(meters: BuiltCatalog["meters"]): NetworkNode[] {
  const nodes = new Map<string, NetworkNode>();
  for (const meter of meters) {
    const parts: string[] = [];
    let parentPath: string | null = null;
    for (const level of LEVELS) {
      const node = meter.network[level];
      if (!node.code) break;
      parts.push(node.code);
      const path = parts.join("/");
      if (!nodes.has(path)) {
        nodes.set(path, {
          path,
          parentPath,
          level,
          code: node.code,
          name: node.name,
          depth: parts.length,
        });
      }
      parentPath = path;
    }
  }
  return [...nodes.values()];
}

function buildTransformers(
  meters: BuiltCatalog["meters"],
  registry: Map<string, PortalTransformer>,
): CatalogTransformer[] {
  const codes = new Set<string>([...registry.keys(), ...meters.map((meter) => meter.transformerCode).filter(isString)]);
  const transformers: CatalogTransformer[] = [];
  for (const code of [...codes].sort()) {
    const rows = meters.filter((meter) => meter.transformerCode === code);
    const registered = registry.get(code);
    const resolvedNames = rows.map((meter) => meter.network.dt.name).filter(isString);
    const rawNames = rows.map((meter) => meter.networkRaw.dt.name).filter(isString);
    const name = text(registered?.name) ?? mode(resolvedNames) ?? mode(rawNames) ?? code;
    const aliases = [...new Set(rawNames.filter((rawName) => rawName !== name))].sort();
    transformers.push({
      code,
      name,
      feederCode: text(registered?.feederCode),
      capacityKva: typeof registered?.capacityKva === "number" ? registered.capacityKva : null,
      ancestryPath: mode(rows.map((meter) => meter.path).filter(isString)),
      meterCount: rows.length,
      statusCounts: countStatus(rows),
      aliases,
      meterIds: rows.map((meter) => meter.meterId).sort(),
    });
  }
  return transformers;
}

function countStatus(rows: BuiltCatalog["meters"]): StatusCounts {
  const counts: StatusCounts = { installed: 0, faulty: 0, decommissioned: 0, other: 0 };
  for (const row of rows) {
    if (row.status === "installed" || row.status === "faulty" || row.status === "decommissioned") counts[row.status] += 1;
    else counts.other += 1;
  }
  return counts;
}

function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
