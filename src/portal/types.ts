export class PortalError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PortalError";
  }
}

export type PortalLevel = { code?: string | null; name?: string | null };

export type PortalMeter = {
  meterId: string;
  serialNo?: string | null;
  make?: string | null;
  phaseType?: string | null;
  installStatus?: string | null;
  installType?: string | null;
  build?: string | null;
  dtCode?: string | null;
  hierarchy?: Partial<Record<string, PortalLevel | null>> | null;
  geo?: { lat?: number | null; lng?: number | null } | null;
};

export type PortalTransformer = {
  code: string;
  name?: string | null;
  feederCode?: string | null;
  capacityKva?: number | null;
};

export type PortalReading = {
  timestamp?: string | null;
  kwh?: string | number | null;
  kvah?: string | number | null;
  voltR?: string | number | null;
};

export interface Upstream {
  sessionExpiresAt(): Date | null;
  fetchFleet(): Promise<PortalMeter[]>;
  fetchTransformers(): Promise<PortalTransformer[]>;
  fetchReadings(meterId: string, from: string, to: string): Promise<PortalReading[]>;
}
