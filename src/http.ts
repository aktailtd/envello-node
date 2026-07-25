// Thin fetch wrapper shared by every resource. Not exported from the
// package's public surface (see src/index.ts) - it's an implementation
// detail of EmailsResource et al.
import { EnvelloApiError } from "./errors.js";

export interface HttpClientOptions {
  apiKey: string;
  baseUrl: string;
  /** Injectable for tests; defaults to the runtime global (Node 22 ships a
   * built-in `fetch`, same pattern as apps/api/src/modules/emails/attachments.ts). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout, in milliseconds. Set to 0 or undefined to disable. */
  timeoutMs?: number;
}

export interface RequestOptions {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  /** Extra headers, e.g. `Idempotency-Key` on POST /emails. */
  headers?: Record<string, string>;
}

function isPlainErrorBody(value: unknown): value is { error?: unknown; message?: unknown } {
  return typeof value === "object" && value !== null;
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${options.path}`;
    const controller = this.timeoutMs > 0 ? new AbortController() : undefined;
    const timer = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : undefined;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller?.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new EnvelloApiError(`Request to ${options.path} timed out after ${this.timeoutMs}ms`, 0, "timeout");
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }

    // 204/empty-body responses (none currently returned by /emails/*, but
    // guard against it rather than assume every response has a JSON body).
    // Also guard against a non-JSON body (e.g. an upstream proxy error page)
    // rather than let JSON.parse throw a confusing SyntaxError.
    const rawText = await response.text();
    let parsedBody: unknown;
    if (rawText.length > 0) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch {
        parsedBody = { message: rawText };
      }
    }

    if (!response.ok) {
      const code = isPlainErrorBody(parsedBody) && typeof parsedBody.error === "string" ? parsedBody.error : undefined;
      const message =
        (isPlainErrorBody(parsedBody) && typeof parsedBody.message === "string" ? parsedBody.message : undefined) ??
        code ??
        `Envello API request failed with status ${response.status}`;
      throw new EnvelloApiError(message, response.status, code, parsedBody);
    }

    return parsedBody as T;
  }
}
