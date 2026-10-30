import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PortalUpstream } from "../src/portal/client.js";
import { signExport } from "../src/portal/sign.js";
import { PortalError } from "../src/portal/types.js";

const SECRET = "test-secret";

describe("portal client against a fake portal", () => {
  let server: Server;
  let baseUrl = "";
  let exportAttempts = 0;
  let logins = 0;
  let seenOrigin = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "POST" && url.pathname === "/login") {
        logins += 1;
        seenOrigin = String(req.headers.origin ?? "");
        if (req.headers["x-sveltekit-action"] !== "true" || !seenOrigin) {
          res.writeHead(403, { "content-type": "text/plain" });
          res.end("Cross-site POST form submissions are forbidden");
          return;
        }
        res.writeHead(200, {
          "content-type": "application/json",
          "set-cookie": "__Secure-better-auth.session_token=abc; Max-Age=3600; Path=/; HttpOnly; Secure",
        });
        res.end(JSON.stringify({ type: "redirect", status: 303, location: "/meters" }));
        return;
      }
      if (!String(req.headers.cookie ?? "").includes("session_token=abc")) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized", message: "A valid session is required." }));
        return;
      }
      if (url.pathname === "/portal/keys") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: { signingSecret: SECRET } }));
        return;
      }
      if (url.pathname === "/portal/export") {
        exportAttempts += 1;
        const timestamp = String(req.headers["x-timestamp"] ?? "");
        const signature = String(req.headers["x-signature"] ?? "");
        const expected = signExport(SECRET, url.search.slice(1), Number(timestamp));
        if (exportAttempts === 1 || signature !== expected.signature) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "unauthorized", message: "session" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ meterId: "J100001" }], total: 1 }));
        return;
      }
      if (url.pathname === "/portal/dts") {
        const page = url.searchParams.get("page");
        const data = page === "1" ? [{ code: "DT-001", name: "Malviya Nagar DT 1", feederCode: "F-001", capacityKva: 100 }] : [];
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data, total: 1, page: Number(page), pageSize: 20 }));
        return;
      }
      if (url.pathname === "/portal/meters/J100001/energy") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ timestamp: "10/06/2026 00:00", kwh: "1", kvah: "1", voltR: "230" }] }));
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found", message: "Meter not found" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fake portal did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it("logs in, retries a rejected export, and reads transformers and registers", async () => {
    const portal = new PortalUpstream({
      portalBaseUrl: baseUrl,
      portalEmail: "operator@urja.local",
      portalPassword: "secret",
      pacePerMinute: 100,
    });
    const fleet = await portal.fetchFleet();
    expect(seenOrigin).toBe(baseUrl);
    expect(logins).toBe(2);
    expect(fleet).toEqual([{ meterId: "J100001" }]);
    const transformers = await portal.fetchTransformers();
    expect(transformers.map((item) => item.code)).toEqual(["DT-001"]);
    const readings = await portal.fetchReadings("J100001", "2026-06-10", "2026-06-10");
    expect(readings).toHaveLength(1);
    await expect(portal.fetchReadings("J100999", "2026-06-10", "2026-06-10")).rejects.toBeInstanceOf(PortalError);
  });
});
