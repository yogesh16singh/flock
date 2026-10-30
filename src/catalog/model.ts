export const LEVELS = ["zone", "circle", "division", "subdivision", "substation", "feeder", "dt"] as const;
export type LevelName = (typeof LEVELS)[number];

export type LevelNode = { code: string | null; name: string | null };

export type GeoPoint = { type: "Point"; coordinates: [number, number] };

export type CatalogMeter = {
  meterId: string;
  serialNumber: string | null;
  make: string | null;
  makeKey: string | null;
  phase: string | null;
  status: string | null;
  installType: string | null;
  build: string | null;
  transformerCode: string | null;
  location: GeoPoint | null;
  networkRaw: Record<LevelName, LevelNode>;
  network: Record<LevelName, LevelNode>;
  path: string | null;
  ancestors: string[];
  issues: string[];
};

export type StatusCounts = {
  installed: number;
  faulty: number;
  decommissioned: number;
  other: number;
};

export type CatalogTransformer = {
  code: string;
  name: string;
  feederCode: string | null;
  capacityKva: number | null;
  ancestryPath: string | null;
  meterCount: number;
  statusCounts: StatusCounts;
  aliases: string[];
  meterIds: string[];
};

export type NetworkNode = {
  path: string;
  parentPath: string | null;
  level: LevelName;
  code: string;
  name: string | null;
  depth: number;
};

export type BuiltCatalog = {
  meters: CatalogMeter[];
  transformers: CatalogTransformer[];
  nodes: NetworkNode[];
};

export const FAULTY_SHARE = 0.4;
