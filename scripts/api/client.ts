import { randomUUID } from "node:crypto";
import type { ActionName } from "./registry.ts";
import { ACTIONS } from "./registry.ts";
import type { BaiduEnvelope, Credentials } from "./types.ts";

export class BaiduApiError extends Error {
  readonly status: number;
  readonly failures: unknown[];
  readonly traceId?: string;

  constructor(
    message: string,
    status: number,
    failures: unknown[],
    traceId?: string,
  ) {
    super(message);
    this.status = status;
    this.failures = failures;
    if (traceId) this.traceId = traceId;
  }
}

export class BaiduApiClient {
  private readonly credentials: Credentials;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    credentials: Credentials,
    baseUrl = process.env.BAIDU_API_BASE_URL || "https://api.baidu.com",
    timeoutMs = Number(process.env.BAIDU_HTTP_TIMEOUT_MS || 30_000),
  ) {
    this.credentials = credentials;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  async call<TBody, TResult>(
    action: ActionName,
    userName: string,
    body: TBody,
  ): Promise<{ data: TResult; partial: boolean; traceId?: string }> {
    if (!userName.trim()) throw new Error("A concrete advertising userName is required.");
    const definition = ACTIONS[action];
    if ("write" in definition && definition.write) {
      throw new Error(`Write action ${action} requires the guarded executor.`);
    }
    return this.send<TResult>(action, definition, userName, body);
  }

  /** Reserved for scripts/api/writes.ts: runs write actions after its own plan/confirm/audit flow. */
  async callWrite<TBody, TResult>(
    action: ActionName,
    userName: string,
    body: TBody,
  ): Promise<{ data: TResult; partial: boolean; traceId?: string }> {
    if (!userName.trim()) throw new Error("A concrete advertising userName is required.");
    const definition = ACTIONS[action];
    if (!("write" in definition && definition.write)) {
      throw new Error(`Action ${action} is not a write action; use call().`);
    }
    return this.send<TResult>(action, definition, userName, body);
  }

  private async send<TResult>(
    action: ActionName,
    definition: { endpoint: string; method: "POST" },
    userName: string,
    body: unknown,
  ): Promise<{ data: TResult; partial: boolean; traceId?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${definition.endpoint}`, {
        method: definition.method,
        headers: {
          "content-type": "application/json",
          "x-client-trace-id": randomUUID(),
        },
        body: JSON.stringify({
          header: {
            userName,
            accessToken: this.credentials.accessToken,
          },
          body,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const result = await response.json() as BaiduEnvelope<TResult>;
    const status = result.header?.status;
    const failures = result.header?.failures || [];
    const traceId = result.header?.traceid || response.headers.get("x-b3-traceid") || undefined;
    if (!response.ok || status === 2 || status === 3) {
      throw new BaiduApiError(
        result.header?.desc || `Baidu API request failed with HTTP ${response.status}`,
        status ?? -1,
        failures,
        traceId,
      );
    }
    if (!result.body) throw new Error(`Baidu API returned no body for ${action}.`);
    return {
      data: result.body,
      partial: status === 1,
      ...(traceId ? { traceId } : {}),
    };
  }
}

