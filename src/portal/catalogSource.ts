import { signExport } from "./sign.js";
import type { PortalSession } from "./session.js";
import { PortalError, type PortalMeter, type PortalTransformer } from "./types.js";

export async function fetchFleet(session: PortalSession): Promise<PortalMeter[]> {
  return session.withSession(async () => {
    const keys = await session.requestJson("/portal/keys");
    const data = keys.data;
    const secret =
      data && typeof data === "object" && typeof (data as { signingSecret?: unknown }).signingSecret === "string"
        ? (data as { signingSecret: string }).signingSecret
        : "";
    if (!secret) throw new PortalError(502, "bad_keys", "Portal did not return a signing secret");
    const query = "page=1";
    const signed = signExport(secret, query, Math.floor(Date.now() / 1000));
    const body = await session.requestJson(`/portal/export?${query}`, {
      "x-timestamp": signed.timestamp,
      "x-signature": signed.signature,
    });
    if (!Array.isArray(body.data)) throw new PortalError(502, "bad_export", "Export payload was not a meter list");
    return body.data as PortalMeter[];
  });
}

export async function fetchTransformers(session: PortalSession): Promise<PortalTransformer[]> {
  return session.withSession(async () => {
    const all: PortalTransformer[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const body = await session.requestJson(`/portal/dts?page=${page}`);
      const data = Array.isArray(body.data) ? (body.data as PortalTransformer[]) : [];
      if (data.length === 0) break;
      all.push(...data);
      const total = typeof body.total === "number" ? body.total : all.length;
      if (all.length >= total) break;
    }
    return all;
  });
}
