// Error types thrown by the SDK. Kept in their own module so callers can do
// `error instanceof EnvelloApiError` without pulling in the HTTP client.
import type { ZodIssue } from "zod";

/**
 * Thrown when the Envello API responds with a non-2xx/207 status. Mirrors
 * the `{ error, message, ... }` shape every apps/api error response uses
 * (see apps/api/src/modules/emails/index.ts) so callers can branch on
 * `error.code` (the `error` field) the same way they would on the raw JSON.
 */
export class EnvelloApiError extends Error {
  /** HTTP status code returned by the API. */
  readonly statusCode: number;
  /** Machine-readable error slug from the response body's `error` field,
   * e.g. "rate_limited", "recipient_suppressed", "invalid_api_key". */
  readonly code?: string;
  /** The full parsed JSON response body, for anything not surfaced above
   * (e.g. `issues` on 400s, `suppressed_count` on 422s). */
  readonly details?: unknown;

  constructor(message: string, statusCode: number, code?: string, details?: unknown) {
    super(message);
    this.name = "EnvelloApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, EnvelloApiError.prototype);
  }
}

/**
 * Thrown before any network call when a request payload fails local
 * validation against the shared `@envello/schemas` Zod schema. Failing fast
 * client-side avoids burning a round trip (and, for `send`, avoids the
 * appearance of a send attempt) on a request the API would reject anyway.
 */
export class EnvelloValidationError extends Error {
  readonly issues: ZodIssue[];

  constructor(message: string, issues: ZodIssue[]) {
    super(message);
    this.name = "EnvelloValidationError";
    this.issues = issues;
    Object.setPrototypeOf(this, EnvelloValidationError.prototype);
  }
}
