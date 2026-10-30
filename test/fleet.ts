import type { PortalMeter, PortalTransformer } from "../src/portal/types.js";

type Node = { code?: string; name?: string };

function levels(overrides: Partial<Record<string, Node>> = {}): PortalMeter["hierarchy"] {
  return {
    zone: { code: "Z-01", name: "Jaipur Zone 1" },
    circle: { code: "C-01", name: "Circle 1" },
    division: { code: "D-01", name: "Division 1" },
    subdivision: { code: "SD-01", name: "Subdivision 1" },
    substation: { code: "SS-01", name: "Substation 1" },
    feeder: { code: "F-001", name: "Feeder 1" },
    dt: { code: "DT-001", name: "Malviya Nagar DT 1" },
    ...overrides,
  };
}

function meter(partial: Partial<PortalMeter> & Pick<PortalMeter, "meterId">): PortalMeter {
  return {
    serialNo: `SE${partial.meterId.slice(1)}`,
    make: "HPL",
    phaseType: "single",
    installStatus: "Installed",
    installType: "Whole Current",
    build: "legacy",
    dtCode: "DT-001",
    hierarchy: levels(),
    geo: { lat: 26.91, lng: 75.8 },
    ...partial,
  };
}

export function fleetMeters(): PortalMeter[] {
  return [
    meter({ meterId: "J100001", geo: { lat: 26.91, lng: 75.8 } }),
    meter({
      meterId: "J100011",
      geo: { lat: 26.912, lng: 75.801 },
      hierarchy: levels({ circle: { code: "", name: "Circle 1" } }),
    }),
    meter({
      meterId: "J100021",
      geo: { lat: 26.911, lng: 75.802 },
      hierarchy: levels({ feeder: { code: "F-001", name: "" } }),
    }),
    meter({
      meterId: "J100006",
      dtCode: "DT-007",
      geo: { lat: 27.02, lng: 75.9 },
      hierarchy: levels({
        feeder: { code: "F-007", name: "Feeder 7" },
        dt: { code: "DT-007", name: "Sanganer DT 7" },
      }),
    }),
    meter({
      meterId: "J100400",
      dtCode: "DT-007",
      installStatus: "Faulty",
      make: "L&T",
      geo: { lat: 27.021, lng: 75.901 },
      hierarchy: levels({
        feeder: { code: "F-007", name: "Feeder 7" },
        dt: { code: "DT-007", name: "Old Malviya Nagar Xfmr" },
      }),
    }),
    meter({
      meterId: "J100099",
      dtCode: "DT-099",
      geo: null,
      hierarchy: levels({
        circle: { code: "", name: "Circle 9" },
        dt: { code: "DT-099", name: "Unlisted DT 99" },
      }),
    }),
  ];
}

export function fleetTransformers(): PortalTransformer[] {
  return [
    { code: "DT-001", name: "Malviya Nagar DT 1", feederCode: "F-001", capacityKva: 100 },
    { code: "DT-007", name: "Sanganer DT 7", feederCode: "F-007", capacityKva: 63 },
  ];
}

export const sampleReadings = [
  { timestamp: "10/06/2026 00:30", kwh: "10.5", kvah: "11.6", voltR: "229" },
  { timestamp: "10/06/2026 00:00", kwh: "10.0", kvah: "11.0", voltR: "230" },
  { timestamp: "10/06/2026 01:00", kwh: "10.2", kvah: "11.7", voltR: "" },
];
