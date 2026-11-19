export { Envello, DEFAULT_BASE_URL, type EnvelloOptions } from "./client.js";
export { EnvelloApiError, EnvelloValidationError } from "./errors.js";
export { EmailsResource, type SendEmailPayload, type SendOptions } from "./resources/emails.js";
export {
  verifyWebhook,
  ENVELLO_SIGNATURE_HEADER,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  type VerifyWebhookOptions,
} from "./webhooks.js";

// Re-exported for convenience so callers don't need a separate dependency on
// @envello/schemas just to reference request/response types.
export type {
  BatchSendResponse,
  BatchSendResultItem,
  EmailStatus,
  GetEmailResponse,
  SendEmailRequest,
  SendEmailResponse,
  ValidateEmailResponse,
} from "@envello/schemas";
