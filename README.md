# envello

Official Node.js / TypeScript SDK for the [Envello](https://envello.dev) transactional email API. Ergonomics are deliberately Resend-SDK-shaped, so switching from Resend is mostly a find-and-replace.

## Install

```bash
pnpm add envello
```

## Usage

```ts
import { Envello } from "envello";

const envello = new Envello({ apiKey: "env_live_..." });

const { id, status } = await envello.emails.send({
  from: "Acme <hello@acme.eu>",
  to: "user@example.com",
  subject: "Welcome!",
  html: "<p>Hallo Svenja</p>",
});
```

A bare API key string also works, the same as `new Resend(apiKey)`:

```ts
const envello = new Envello("env_live_...");
```

### Sending

`from`, `to`, `subject`, and at least one of `html`/`text` are required. `to`/`cc`/`bcc` accept either a single address or an array (up to 50 per field). The full request shape (attachments, headers, `send_at` scheduling) is defined in the [`@envello/schemas`](https://www.npmjs.com/package/@envello/schemas) package this SDK depends on.

```ts
await envello.emails.send({
  from: "Acme <hello@acme.eu>",
  to: ["a@example.com", "b@example.com"],
  subject: "Welcome!",
  text: "Hello there",
  send_at: "2026-08-01T09:00:00Z", // optional - schedule instead of sending now
});
```

Pass `idempotencyKey` to make a retry safe - a repeated call with the same key and body replays the original response instead of sending twice (A3 in the API):

```ts
await envello.emails.send(payload, { idempotencyKey: "order-4821-confirmation" });
```

### Batch sending

`envello.emails.batch()` sends up to 100 emails in a single request against `POST /emails/batch` - it's one network call, not a client-side loop of sequential sends. The API processes each item independently and reports partial failure per index:

```ts
const { results } = await envello.emails.batch([
  { from: "hello@acme.eu", to: "a@example.com", subject: "Hi", text: "..." },
  { from: "hello@acme.eu", to: "b@example.com", subject: "Hi", text: "..." },
]);

for (const result of results) {
  if (result.status === "failed") {
    console.error(`item ${result.index} failed: ${result.error}`);
  }
}
```

### Checking send status / canceling a scheduled send

```ts
const email = await envello.emails.get(id);
// email.status: "queued" | "scheduled" | "sent" | "send_error" | "canceled"

await envello.emails.cancel(id); // only works while status === "scheduled"
```

### Address validation

`envello.emails.validate()` calls the real, free-on-every-plan `POST /emails/validate` deliverability check (syntax, disposable-domain, and MX-record checks - A7 in the API). This is a live API call, distinct from the request-shape validation described below.

```ts
const result = await envello.emails.validate("someone@example.com");
// { email, valid, syntax_valid, disposable, mx_found, reason? }
```

### Local payload validation

`send()` and `batch()` validate the request shape against the same Zod schema `apps/api` enforces (`sendEmailRequestSchema` in `packages/schemas/src/email.ts`) *before* making a network call, so a malformed request throws immediately instead of round-tripping to the API:

```ts
import { EnvelloValidationError } from "envello";

try {
  await envello.emails.send({ from: "acme.eu", to: "x@example.com", subject: "Hi" }); // no html/text
} catch (error) {
  if (error instanceof EnvelloValidationError) {
    console.error(error.issues); // Zod issue array
  }
}
```

### Error handling

Any non-2xx response from the API throws `EnvelloApiError`, with `statusCode`, `code` (the response's `error` field, e.g. `"rate_limited"`, `"recipient_suppressed"`, `"invalid_api_key"`), and `details` (the full parsed response body):

```ts
import { EnvelloApiError } from "envello";

try {
  await envello.emails.send(payload);
} catch (error) {
  if (error instanceof EnvelloApiError && error.code === "rate_limited") {
    // back off and retry
  }
}
```

### Verifying webhooks

Envello signs every webhook delivery with an `Envello-Signature` header (`t=<unix-seconds>,v1=<hex hmac-sha256>`). `verifyWebhook()` checks it against your endpoint's secret (the full `whsec_...` string) and returns `true` or `false`. It never throws on a bad or missing header; it just returns `false`.

**Pass the raw request body**, exactly the bytes Envello sent. If your framework has already parsed the JSON, re-serializing it with `JSON.stringify` will not match the signature. With Express, use `express.raw()` on the webhook route, verify, and only then parse:

```ts
import express from "express";
import { verifyWebhook, ENVELLO_SIGNATURE_HEADER } from "envello";

const app = express();

app.post("/webhooks/envello", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.get(ENVELLO_SIGNATURE_HEADER);
  if (!verifyWebhook(process.env.ENVELLO_WEBHOOK_SECRET!, req.body, signature)) {
    return res.status(400).send("invalid signature");
  }
  const event = JSON.parse(req.body.toString("utf8"));
  // handle event.type ...
  res.sendStatus(200);
});
```

Timestamps more than 300 seconds from your clock are rejected to block replays. Change that with `verifyWebhook(secret, body, header, { toleranceSeconds: 600 })`. During a secret rotation the header carries one `v1` per active secret, and a match on any of them passes, so a receiver on either the old or new secret keeps working.

### Configuration

```ts
new Envello({
  apiKey: "env_live_...",
  baseUrl: "http://localhost:3000", // defaults to https://api.envello.dev; https only, except localhost
  timeoutMs: 10_000,                // defaults to 30_000; pass 0 to disable
  fetch: myFetchImpl,               // defaults to the global fetch (Node 22+)
});
```

## What's real vs. aspirational

This SDK covers `POST /emails`, `POST /emails/batch`, `GET /emails/:id`, `DELETE /emails/:id`, and `POST /emails/validate`. It also verifies webhook signatures locally with `verifyWebhook()` (no API call). There is currently no `/v1` prefix on the live routes - `DEFAULT_BASE_URL` in this package points at the unversioned root. `react`/JSX email bodies aren't supported yet - render your React Email template to an HTML string yourself and pass it as `html` for now.

## Development

```bash
pnpm install
pnpm build      # -> dist/
pnpm typecheck
pnpm test
```
