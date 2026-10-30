import { LEVELS, type CatalogMeter, type LevelName } from "./model.js";
import type { PortalTransformer } from "../portal/types.js";

// only fill a blank when the other meters on that DT agree. raw values stay as exported.
export function repairMeters(meters: CatalogMeter[], registry: Map<string, PortalTransformer>): void {
  const groups = new Map<string, CatalogMeter[]>();
  for (const meter of meters) {
    const key = meter.transformerCode ?? "";
    const list = groups.get(key) ?? [];
    list.push(meter);
    groups.set(key, list);
  }

  for (const [code, group] of groups) {
    repairGroup(group);
    const registryName = text(registry.get(code)?.name);
    if (!registryName) continue;
    for (const meter of group) {
      const rawName = meter.networkRaw.dt.name;
      if (rawName && rawName !== registryName) {
        meter.issues.push("transformer_alias");
        meter.network.dt.name = registryName;
      }
    }
  }

  for (const meter of meters) assignPath(meter);
}

function repairGroup(group: CatalogMeter[]): void {
  for (const level of LEVELS) {
    const complete = new Map<string, { code: string; name: string }>();
    for (const meter of group) {
      const node = meter.network[level];
      if (node.code && node.name) complete.set(`${node.code}\0${node.name}`, { code: node.code, name: node.name });
    }
    const only = complete.size === 1 ? [...complete.values()][0] : undefined;
    for (const meter of group) {
      const node = meter.network[level];
      if (node.code && node.name) continue;
      if (!only || (node.code && node.code !== only.code) || (node.name && node.name !== only.name)) {
        meter.issues.push(`missing:${level}`);
        continue;
      }
      node.code = only.code;
      node.name = only.name;
      meter.issues.push(`repaired:${level}`);
    }
  }
}

function assignPath(meter: CatalogMeter): void {
  const codes: string[] = [];
  for (const level of LEVELS) {
    const code = meter.network[level].code;
    if (!code) {
      meter.path = null;
      meter.ancestors = [];
      return;
    }
    codes.push(code);
  }
  const ancestors: string[] = [];
  for (let index = 0; index < codes.length; index += 1) ancestors.push(codes.slice(0, index + 1).join("/"));
  meter.path = ancestors[ancestors.length - 1] ?? null;
  meter.ancestors = ancestors;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function levelIssue(issue: string): LevelName | null {
  const [, level] = issue.split(":");
  return LEVELS.find((item) => item === level) ?? null;
}
