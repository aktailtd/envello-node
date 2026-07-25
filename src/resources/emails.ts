// Mirrors the real routes in apps/api/src/modules/emails/index.ts. Request/
// response shapes come straight from @envello/schemas so this can't drift
// from what the API actually accepts - do not hand-roll parallel types here.
import {
  batchSendResponseSchema,
  getEmailResponseSchema,
  sendEmailRequestSchema,
  sendEmailResponseSchema,
  validateEmailRequestSchema,
  validateEmailResponseSchema,
  type BatchSendResponse,
  type GetEmailResponse,
  type SendEmailRequest,
  type SendEmailResponse,
  type ValidateEmailResponse,
} from "@envello/schemas";
import { EnvelloValidationError } from "../errors.js";
import type { HttpClient } from "../http.js";

/** Same input shape POST /emails accepts. */
export type SendEmailPayload = SendEmailRequest;

export interface SendOptions {
  /** Sets the `Idempotency-Key` header (A3 in the API) - retry-safe: a
   * repeated call with the same key and body replays the original response
   * instead of sending twice. */
  idempotencyKey?: string;
}

function parseOrThrow(payload: unknown): SendEmailRequest {
  const result = sendEmailRequestSchema.safeParse(payload);
  if (!result.success) {
    throw new EnvelloValidationError(
      "Invalid email payload - see `issues` for details",
      result.error.issues,
    );
  }
  return result.data;
}

export class EmailsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Send a single email. Validates the payload locally against the same
   * schema apps/api enforces (packages/schemas/src/email.ts) before making
   * a network call, so malformed requests fail fast without a round trip.
   */
  async send(payload: SendEmailPayload, options: SendOptions = {}): Promise<SendEmailResponse> {
    const body = parseOrThrow(payload);
    const response = await this.http.request<unknown>({
      method: "POST",
      path: "/emails",
      body,
      headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    });
    return sendEmailResponseSchema.parse(response);
  }

  /**
   * Send up to MAX_BATCH_SIZE (100) emails in one call via the real
   * POST /emails/batch endpoint (apps/api already implements batch sending
   * server-side with per-item partial failure) - this is a single request,
   * not a client-side loop of sequential `.send()` calls.
   */
  async batch(payloads: SendEmailPayload[]): Promise<BatchSendResponse> {
    const emails = payloads.map((payload) => parseOrThrow(payload));
    const response = await this.http.request<unknown>({
      method: "POST",
      path: "/emails/batch",
      body: { emails },
    });
    return batchSendResponseSchema.parse(response);
  }

  /** Fetch the current status of a previously-sent (or scheduled) email. */
  async get(id: string): Promise<GetEmailResponse> {
    const response = await this.http.request<unknown>({ method: "GET", path: `/emails/${encodeURIComponent(id)}` });
    return getEmailResponseSchema.parse(response);
  }

  /** Cancel a scheduled (not-yet-fired) send. Throws EnvelloApiError(409) if
   * it already sent or was already canceled. */
  async cancel(id: string): Promise<{ id: string; status: string }> {
    return this.http.request<{ id: string; status: string }>({
      method: "DELETE",
      path: `/emails/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Check whether an address is well-formed, non-disposable, and has an MX
   * record, and flag role accounts (support@, admin@, ...) - the
   * free-on-every-plan deliverability check at POST /emails/validate (A7).
   * `role_account` is informational only and never affects `valid`. This is
   * a live API call, distinct from the local payload-shape validation
   * `send`/`batch` do before every request.
   */
  async validate(email: string): Promise<ValidateEmailResponse> {
    const body = validateEmailRequestSchema.parse({ email });
    const response = await this.http.request<unknown>({
      method: "POST",
      path: "/emails/validate",
      body,
    });
    return validateEmailResponseSchema.parse(response);
  }
}
