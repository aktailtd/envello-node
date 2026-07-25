import { HttpClient } from "./http.js";
import { EmailsResource } from "./resources/emails.js";

/** Production API base URL (envello.dev, per 00-executive-summary.md). No
 * `/v1` prefix yet - apps/api registers `/emails` etc. unversioned today
 * (see apps/api/src/app.ts); update this once the API is versioned. */
export const DEFAULT_BASE_URL = "https://api.envello.dev";

export interface EnvelloOptions {
  /** An Envello API key, `env_live_...` or `env_test_...`
   * (apps/api/src/modules/emails/auth.ts). */
  apiKey: string;
  /** Override the API base URL - useful for local dev (`http://localhost:3000`)
   * or testing against a staging deployment. */
  baseUrl?: string;
  /** Injectable fetch implementation, for tests or non-standard runtimes. */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 30s; pass 0 to disable. */
  timeoutMs?: number;
}

/**
 * Envello Node/TypeScript SDK client. Mirrors the Resend SDK's ergonomics
 * (`new Envello({ apiKey }).emails.send({...})`) per 02-product-strategy.md's
 * "Resend-SDK-compatible control plane" positioning.
 *
 * ```ts
 * const envello = new Envello({ apiKey: "env_live_..." });
 * await envello.emails.send({ from, to, subject, html });
 * ```
 *
 * A bare API key string is also accepted, matching Resend's `new Resend(apiKey)`:
 *
 * ```ts
 * const envello = new Envello("env_live_...");
 * ```
 */
export class Envello {
  readonly emails: EmailsResource;

  constructor(options: EnvelloOptions | string) {
    const resolved: EnvelloOptions = typeof options === "string" ? { apiKey: options } : options;
    if (!resolved.apiKey) {
      throw new Error("Envello: `apiKey` is required, e.g. new Envello({ apiKey: \"env_live_...\" })");
    }
    const http = new HttpClient({
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl ?? DEFAULT_BASE_URL,
      fetchImpl: resolved.fetch,
      timeoutMs: resolved.timeoutMs,
    });
    this.emails = new EmailsResource(http);
  }
}
