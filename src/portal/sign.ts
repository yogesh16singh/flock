import { createHmac } from "node:crypto";

// same bytes the Export button signs: method, path, query, unix time
export function signExport(secret: string, query: string, unixSeconds: number): { timestamp: string; signature: string } {
  const timestamp = String(unixSeconds);
  const payload = ["GET", "/portal/export", query, timestamp].join("\n");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return { timestamp, signature };
}
