import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/catalog/build.js";
import { fleetMeters, fleetTransformers } from "./fleet.js";

describe("catalog build", () => {
  const built = buildCatalog(fleetMeters(), fleetTransformers());
  const byId = new Map(built.meters.map((meter) => [meter.meterId, meter]));

  it("fills a blank circle code from the other meters on the transformer and keeps the raw blank", () => {
    const meter = byId.get("J100011");
    expect(meter?.networkRaw.circle).toEqual({ code: null, name: "Circle 1" });
    expect(meter?.network.circle).toEqual({ code: "C-01", name: "Circle 1" });
    expect(meter?.issues).toContain("repaired:circle");
    expect(meter?.path).toBe("Z-01/C-01/D-01/SD-01/SS-01/F-001/DT-001");
    expect(meter?.ancestors).toContain("Z-01/C-01");
  });

  it("fills a blank feeder name the same way", () => {
    const meter = byId.get("J100021");
    expect(meter?.networkRaw.feeder.name).toBeNull();
    expect(meter?.network.feeder).toEqual({ code: "F-001", name: "Feeder 1" });
    expect(meter?.issues).toContain("repaired:feeder");
  });

  it("keeps the registry transformer name and the nameplate alias", () => {
    const meter = byId.get("J100400");
    expect(meter?.networkRaw.dt.name).toBe("Old Malviya Nagar Xfmr");
    expect(meter?.network.dt.name).toBe("Sanganer DT 7");
    expect(meter?.issues).toContain("transformer_alias");
    const transformer = built.transformers.find((item) => item.code === "DT-007");
    expect(transformer?.name).toBe("Sanganer DT 7");
    expect(transformer?.aliases).toEqual(["Old Malviya Nagar Xfmr"]);
    expect(transformer?.capacityKva).toBe(63);
    expect(transformer?.statusCounts).toMatchObject({ installed: 1, faulty: 1 });
    expect(transformer?.meterCount).toBe(2);
  });

  it("does not invent a circle when the transformer has no complete example", () => {
    const meter = byId.get("J100099");
    expect(meter?.issues).toContain("missing:circle");
    expect(meter?.path).toBeNull();
    expect(meter?.network.circle.code).toBeNull();
  });
});
