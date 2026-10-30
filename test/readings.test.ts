import { describe, expect, it } from "vitest";
import { parseReadings } from "../src/catalog/readings.js";
import { sampleReadings } from "./fleet.js";

describe("register parsing", () => {
  it("sorts portal timestamps, derives interval kWh, and flags a register reset", () => {
    const series = parseReadings(sampleReadings, 330);
    expect(series.cadence).toBe("half_hourly");
    expect(series.points.map((point) => point.registerKwh)).toEqual([10, 10.5, 10.2]);
    expect(series.points.map((point) => point.intervalKwh)).toEqual([null, 0.5, null]);
    expect(series.points.map((point) => point.registerReset)).toEqual([false, false, true]);
    expect(series.points[0]?.at).toBe("2026-06-10T00:00:00+05:30");
    expect(series.points[2]?.voltageR).toBeNull();
  });

  it("calls a midnight series daily", () => {
    const series = parseReadings(
      [
        { timestamp: "01/06/2026 00:00", kwh: "1", kvah: "1", voltR: "230" },
        { timestamp: "02/06/2026 00:00", kwh: "2", kvah: "2", voltR: "230" },
        { timestamp: "03/06/2026 00:00", kwh: "4", kvah: "4", voltR: "230" },
      ],
      330,
    );
    expect(series.cadence).toBe("daily");
    expect(series.points.map((point) => point.intervalKwh)).toEqual([null, 1, 2]);
  });

  it("drops a timestamp that is not a real calendar day", () => {
    const series = parseReadings([{ timestamp: "31/02/2026 00:00", kwh: "1", kvah: "1", voltR: "1" }], 330);
    expect(series.points).toEqual([]);
    expect(series.cadence).toBe("unknown");
  });
});
