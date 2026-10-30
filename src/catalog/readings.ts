import type { PortalReading } from "../portal/types.js";

export type Cadence = "half_hourly" | "daily" | "unknown";

export type ReadingPoint = {
  at: string;
  registerKwh: number | null;
  registerKvah: number | null;
  voltageR: number | null;
  intervalKwh: number | null;
  registerReset: boolean;
};

export type ParsedSeries = {
  cadence: Cadence;
  points: ReadingPoint[];
};

// kwh on the portal is the register, not the usage in that slot
export function parseReadings(rows: PortalReading[], offsetMinutes: number): ParsedSeries {
  const points: ReadingPoint[] = [];
  for (const row of rows) {
    const at = parsePortalTimestamp(row.timestamp ?? "", offsetMinutes);
    if (!at) continue;
    points.push({
      at,
      registerKwh: finiteNumber(row.kwh),
      registerKvah: finiteNumber(row.kvah),
      voltageR: finiteNumber(row.voltR),
      intervalKwh: null,
      registerReset: false,
    });
  }
  points.sort((left, right) => left.at.localeCompare(right.at));
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]?.registerKwh;
    const current = points[index]?.registerKwh;
    if (previous == null || current == null) continue;
    if (current + 1e-9 < previous) {
      points[index]!.registerReset = true;
      continue;
    }
    points[index]!.intervalKwh = round4(current - previous);
  }
  return { cadence: cadenceOf(points), points };
}

export function parsePortalTimestamp(value: string, offsetMinutes: number): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offsetHour = String(Math.floor(absolute / 60)).padStart(2, "0");
  const offsetMinute = String(absolute % 60).padStart(2, "0");
  return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00${sign}${offsetHour}:${offsetMinute}`;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function cadenceOf(points: ReadingPoint[]): Cadence {
  const gaps: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = Date.parse(points[index - 1]!.at);
    const current = Date.parse(points[index]!.at);
    if (Number.isFinite(previous) && Number.isFinite(current)) gaps.push((current - previous) / 60_000);
  }
  if (gaps.length === 0) return "unknown";
  gaps.sort((left, right) => left - right);
  const median = gaps[Math.floor(gaps.length / 2)] ?? 0;
  if (median >= 20 && median <= 40) return "half_hourly";
  if (median >= 20 * 60 && median <= 28 * 60) return "daily";
  return "unknown";
}
