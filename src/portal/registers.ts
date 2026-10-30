import type { PortalSession } from "./session.js";
import { PortalError, type PortalReading } from "./types.js";

export async function fetchReadings(
  session: PortalSession,
  meterId: string,
  from: string,
  to: string,
): Promise<PortalReading[]> {
  const query = new URLSearchParams({ from, to });
  return session.withSession(async () => {
    const body = await session.requestJson(`/portal/meters/${encodeURIComponent(meterId)}/energy?${query}`);
    if (!Array.isArray(body.data)) throw new PortalError(502, "bad_readings", "Energy payload was not a list");
    return body.data as PortalReading[];
  });
}
