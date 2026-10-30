import type { Config } from "../config.js";
import { fetchFleet, fetchTransformers } from "./catalogSource.js";
import { Pace } from "./pace.js";
import { fetchReadings } from "./registers.js";
import { PortalSession } from "./session.js";
import type { PortalMeter, PortalReading, PortalTransformer, Upstream } from "./types.js";

export class PortalUpstream implements Upstream {
  private readonly session: PortalSession;

  constructor(
    config: Pick<Config, "portalBaseUrl" | "portalEmail" | "portalPassword" | "pacePerMinute">,
    fetchImpl: typeof fetch = fetch,
    pace?: Pace,
  ) {
    this.session = new PortalSession(config, fetchImpl, pace);
  }

  sessionExpiresAt(): Date | null {
    return this.session.sessionExpiresAt();
  }

  fetchFleet(): Promise<PortalMeter[]> {
    return fetchFleet(this.session);
  }

  fetchTransformers(): Promise<PortalTransformer[]> {
    return fetchTransformers(this.session);
  }

  fetchReadings(meterId: string, from: string, to: string): Promise<PortalReading[]> {
    return fetchReadings(this.session, meterId, from, to);
  }
}
