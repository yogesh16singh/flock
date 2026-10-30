import { LEVELS, type CatalogMeter, type GeoPoint, type LevelName, type LevelNode } from "./model.js";
import type { PortalMeter } from "../portal/types.js";

const KNOWN_STATUS = new Set(["installed", "faulty", "decommissioned"]);

export function normalizeMeter(raw: PortalMeter): CatalogMeter {
  const issues: string[] = [];
  const networkRaw = emptyNetwork();
  for (const level of LEVELS) {
    const node = raw.hierarchy?.[level];
    networkRaw[level] = {
      code: text(node?.code),
      name: text(node?.name),
    };
  }
  const status = statusOf(text(raw.installStatus));
  if (status.issue) issues.push(status.issue);
  const geo = point(raw.geo);
  if (geo.bad) issues.push("bad_geo");
  return {
    meterId: text(raw.meterId) ?? "",
    serialNumber: text(raw.serialNo),
    make: text(raw.make),
    makeKey: text(raw.make)?.toLowerCase() ?? null,
    phase: text(raw.phaseType)?.toLowerCase() ?? null,
    status: status.status,
    installType: slug(text(raw.installType)),
    build: text(raw.build),
    transformerCode: text(raw.dtCode),
    location: geo.point,
    networkRaw,
    network: cloneNetwork(networkRaw),
    path: null,
    ancestors: [],
    issues,
  };
}

export function emptyNetwork(): Record<LevelName, LevelNode> {
  return {
    zone: blank(),
    circle: blank(),
    division: blank(),
    subdivision: blank(),
    substation: blank(),
    feeder: blank(),
    dt: blank(),
  };
}

export function cloneNetwork(network: Record<LevelName, LevelNode>): Record<LevelName, LevelNode> {
  const copy = emptyNetwork();
  for (const level of LEVELS) copy[level] = { ...network[level] };
  return copy;
}

function blank(): LevelNode {
  return { code: null, name: null };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function slug(value: string | null): string | null {
  if (!value) return null;
  const result = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return result || null;
}

function statusOf(value: string | null): { status: string | null; issue?: string } {
  if (!value) return { status: null };
  const status = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (KNOWN_STATUS.has(status)) return { status };
  return { status, issue: "unknown_status" };
}

function point(geo: PortalMeter["geo"]): { point: GeoPoint | null; bad: boolean } {
  if (!geo) return { point: null, bad: false };
  const lat = typeof geo.lat === "number" ? geo.lat : Number.NaN;
  const lng = typeof geo.lng === "number" ? geo.lng : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { point: null, bad: true };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { point: null, bad: true };
  return { point: { type: "Point", coordinates: [lng, lat] }, bad: false };
}
