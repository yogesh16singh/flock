import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { Pace } from "../src/portal/pace.js";
import { signExport } from "../src/portal/sign.js";

describe("portal helpers", () => {
  it("signs the export the way the transformers page does", () => {
    const signed = signExport("test-secret", "page=1", 1_700_000_000);
    const expected = createHmac("sha256", "test-secret")
      .update("GET\n/portal/export\npage=1\n1700000000")
      .digest("hex");
    expect(signed).toEqual({ timestamp: "1700000000", signature: expected });
  });

  it("waits once the per-minute budget is full", async () => {
    let now = 0;
    const waits: number[] = [];
    const pace = new Pace(
      2,
      1_000,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
      () => now,
    );
    await pace.take();
    await pace.take();
    await pace.take();
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(0);
  });
});
