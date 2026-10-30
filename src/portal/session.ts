import type { Config } from "../config.js";
import { Pace } from "./pace.js";
import { PortalError } from "./types.js";

type Json = Record<string, unknown>;

// cookie Max-Age is 3600 and I treat that as a hard expiry, not a sliding one
export class PortalSession {
  private cookie: string | null = null;
  private expiresAtMs = 0;
  private loginFlight: Promise<void> | null = null;
  readonly pace: Pace;

  constructor(
    private readonly config: Pick<Config, "portalBaseUrl" | "portalEmail" | "portalPassword" | "pacePerMinute">,
    private readonly fetchImpl: typeof fetch = fetch,
    pace?: Pace,
  ) {
    this.pace = pace ?? new Pace(config.pacePerMinute);
  }

  sessionExpiresAt(): Date | null {
    return this.expiresAtMs ? new Date(this.expiresAtMs) : null;
  }

  async requestJson(path: string, headers: Record<string, string> = {}, rateRetry = true): Promise<Json> {
    await this.pace.take();
    const response = await this.fetchImpl(`${this.config.portalBaseUrl}${path}`, {
      headers: {
        cookie: this.cookie ?? "",
        accept: "application/json",
        ...headers,
      },
    });
    const text = await response.text();
    const json = parseJson(text);
    if (response.status === 429 && rateRetry) {
      await delay(2_000);
      return this.requestJson(path, headers, false);
    }
    if (response.status === 401) {
      throw new PortalError(401, "unauthorized", messageOf(json) ?? "Portal session rejected");
    }
    if (response.status === 404) {
      throw new PortalError(404, "not_found", messageOf(json) ?? "Portal resource was not found");
    }
    if (!response.ok || !json) {
      throw new PortalError(response.status || 502, "upstream", messageOf(json) ?? `Portal returned ${response.status}`);
    }
    return json;
  }

  async withSession<T>(fn: () => Promise<T>, retry = true): Promise<T> {
    await this.ensure();
    try {
      return await fn();
    } catch (error) {
      if (retry && error instanceof PortalError && error.status === 401) {
        this.cookie = null;
        this.expiresAtMs = 0;
        await this.login();
        return this.withSession(fn, false);
      }
      throw error;
    }
  }

  private async ensure(): Promise<void> {
    if (!this.cookie || Date.now() > this.expiresAtMs - 60_000) await this.login();
  }

  private async login(): Promise<void> {
    if (this.loginFlight) return this.loginFlight;
    this.loginFlight = this.doLogin().finally(() => {
      this.loginFlight = null;
    });
    return this.loginFlight;
  }

  private async doLogin(): Promise<void> {
    await this.pace.take();
    const response = await this.fetchImpl(`${this.config.portalBaseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        origin: this.config.portalBaseUrl,
        "x-sveltekit-action": "true",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: this.config.portalEmail,
        password: this.config.portalPassword,
      }),
    });
    const cookies = readSetCookie(response);
    const session = cookies.find((cookie) => cookie.startsWith("__Secure-better-auth.session_token="));
    if (!session || response.status >= 400) {
      throw new PortalError(502, "login_failed", "Portal login did not return a session");
    }
    this.cookie = session.split(";")[0] ?? session;
    const maxAge = /Max-Age=(\d+)/i.exec(session);
    const seconds = maxAge ? Number(maxAge[1]) : 3600;
    this.expiresAtMs = Date.now() + seconds * 1000;
  }
}

function readSetCookie(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function parseJson(text: string): Json | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" ? (value as Json) : null;
  } catch {
    return null;
  }
}

function messageOf(json: Json | null): string | null {
  const message = json?.message;
  return typeof message === "string" ? message : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
