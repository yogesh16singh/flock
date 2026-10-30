import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const emptyToUndefined = (value: unknown) => (value === "" || value == null ? undefined : value);

function optionalString(max: number): z.ZodType<string | undefined, z.ZodTypeDef, unknown> {
  return z.preprocess(emptyToUndefined, z.string().max(max).optional());
}

function optionalEnum<T extends string>(values: readonly [T, ...T[]]): z.ZodType<T | undefined, z.ZodTypeDef, unknown> {
  return z.preprocess(emptyToUndefined, z.enum(values).optional());
}

function defaultInt(fallback: number, max: number): z.ZodType<number, z.ZodTypeDef, unknown> {
  return z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : value),
    z.coerce.number().int().min(1).max(max),
  );
}

export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const isoDate = z.string().refine(isIsoDate, "Use a real YYYY-MM-DD date");

export const meterIdSchema = z.string().regex(/^J\d{6}$/, "Meter id looks like J100000");
export const transformerCodeSchema = z.string().regex(/^DT-\d{3}$/, "Transformer code looks like DT-001");

export const meterListQuery = z.object({
  cursor: optionalString(200),
  q: optionalString(100),
  phase: optionalEnum(["single", "three"] as const),
  status: optionalEnum(["installed", "faulty", "decommissioned"] as const),
  make: optionalString(40),
  transformer: z.preprocess(emptyToUndefined, transformerCodeSchema.optional()) as z.ZodType<string | undefined, z.ZodTypeDef, unknown>,
  networkPath: optionalString(200),
  limit: defaultInt(50, 200),
});

export const registerQuery = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((value) => value.from <= value.to, { message: "from must be on or before to", path: ["from"] });

export const placeQuery = z.object({
  lng: z.coerce.number().gte(-180).lte(180),
  lat: z.coerce.number().gte(-90).lte(90),
  radiusM: z.coerce.number().int().min(1).max(50_000),
  limit: defaultInt(50, 200),
});

export const networkQuery = z.object({
  parentPath: optionalString(200),
  depth: defaultInt(1, 7),
});

const levelNode = z.object({ code: z.string().nullable(), name: z.string().nullable() }).openapi("LevelNode");

const network = z
  .object({
    zone: levelNode,
    circle: levelNode,
    division: levelNode,
    subdivision: levelNode,
    substation: levelNode,
    feeder: levelNode,
    dt: levelNode,
  })
  .openapi("NetworkLevels");

const point = z
  .object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  })
  .openapi("GeoJsonPoint");

const frame = {
  asOf: z.string(),
  stale: z.boolean(),
};

export const problemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .openapi("Problem");

export const catalogSchema = z
  .object({
    generation: z.number().int().nullable(),
    asOf: z.string().nullable(),
    stale: z.boolean(),
    ageSeconds: z.number(),
    meterCount: z.number().int(),
    transformerCount: z.number().int(),
    sessionExpiresAt: z.string().nullable(),
    lastError: z.string().nullable(),
  })
  .openapi("Catalog");

export const meterSummarySchema = z
  .object({
    meterId: z.string(),
    serialNumber: z.string().nullable(),
    make: z.string().nullable(),
    phase: z.string().nullable(),
    status: z.string().nullable(),
    installType: z.string().nullable(),
    transformerCode: z.string().nullable(),
    path: z.string().nullable(),
  })
  .openapi("MeterSummary");

export const meterDetailSchema = meterSummarySchema
  .extend({
    build: z.string().nullable(),
    location: point.nullable(),
    networkRaw: network,
    network,
    issues: z.array(z.string()),
  })
  .openapi("MeterDetail");

export const meterListSchema = z
  .object({
    ...frame,
    items: z.array(meterSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("MeterList");

export const meterDetailResponseSchema = z.object({ ...frame, item: meterDetailSchema }).openapi("MeterDetailResponse");

const statusCounts = z.object({
  installed: z.number().int(),
  faulty: z.number().int(),
  decommissioned: z.number().int(),
  other: z.number().int(),
});

export const transformerSummarySchema = z
  .object({
    code: z.string(),
    name: z.string(),
    feederCode: z.string().nullable(),
    capacityKva: z.number().nullable(),
    meterCount: z.number().int(),
    ancestryPath: z.string().nullable(),
  })
  .openapi("TransformerSummary");

export const transformerDetailSchema = transformerSummarySchema
  .extend({
    statusCounts,
    aliases: z.array(z.string()),
    meterIds: z.array(z.string()),
  })
  .openapi("TransformerDetail");

export const transformerListSchema = z
  .object({ ...frame, items: z.array(transformerSummarySchema), nextCursor: z.null() })
  .openapi("TransformerList");

export const transformerDetailResponseSchema = z
  .object({ ...frame, item: transformerDetailSchema })
  .openapi("TransformerDetailResponse");

export const networkNodeSchema = z
  .object({
    path: z.string(),
    parentPath: z.string().nullable(),
    level: z.string(),
    code: z.string(),
    name: z.string().nullable(),
    depth: z.number().int(),
    childCount: z.number().int(),
    meters: statusCounts.extend({ total: z.number().int() }),
  })
  .openapi("NetworkNode");

export const networkListSchema = z
  .object({ ...frame, items: z.array(networkNodeSchema), nextCursor: z.null() })
  .openapi("NetworkList");

export const networkNodeResponseSchema = z.object({ ...frame, item: networkNodeSchema }).openapi("NetworkNodeResponse");

export const readingPointSchema = z
  .object({
    at: z.string(),
    registerKwh: z.number().nullable(),
    registerKvah: z.number().nullable(),
    voltageR: z.number().nullable(),
    intervalKwh: z.number().nullable(),
    registerReset: z.boolean(),
  })
  .openapi("RegisterPoint");

export const registersSchema = z
  .object({
    ...frame,
    meterId: z.string(),
    from: z.string(),
    to: z.string(),
    cadence: z.enum(["half_hourly", "daily", "unknown"]),
    points: z.array(readingPointSchema),
  })
  .openapi("Registers");

export const placeSchema = z
  .object({
    meterId: z.string(),
    serialNumber: z.string().nullable(),
    status: z.string().nullable(),
    transformerCode: z.string().nullable(),
    distanceM: z.number(),
    location: point,
  })
  .openapi("Place");

export const placeListSchema = z.object({ ...frame, items: z.array(placeSchema), nextCursor: z.null() }).openapi("PlaceList");

export const signalSchema = z
  .object({
    kind: z.enum(["unrepaired_hierarchy", "transformer_name_clash", "faulty_cluster"]),
    meterId: z.string().optional(),
    issues: z.array(z.string()).optional(),
    transformerCode: z.string().optional(),
    registryName: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    faulty: z.number().int().optional(),
    meterCount: z.number().int().optional(),
    share: z.number().optional(),
  })
  .openapi("Signal");

export const signalListSchema = z.object({ ...frame, items: z.array(signalSchema), nextCursor: z.null() }).openapi("SignalList");

export const healthSchema = z.object({ status: z.literal("ok") }).openapi("Health");
