import type { Response } from "express";

export function problem(
  res: Response,
  status: number,
  title: string,
  detail: string,
  extra?: Record<string, unknown>,
): void {
  res
    .status(status)
    .type("application/problem+json")
    .json({
      type: "about:blank",
      title,
      status,
      detail,
      ...extra,
    });
}
