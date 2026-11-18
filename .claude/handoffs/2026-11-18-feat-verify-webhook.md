# feat/verify-webhook

## Goal
T24: add `verifyWebhook(secret, rawBody, header, options?)` to the Node SDK so customers can check the `Envello-Signature` header the API sends (`apps/api/src/modules/events/webhook-signing.ts`).

## What changed
- `src/webhooks.ts`: `verifyWebhook`, `ENVELLO_SIGNATURE_HEADER` (`"envello-signature"`), `DEFAULT_WEBHOOK_TOLERANCE_SECONDS` (300), `VerifyWebhookOptions`.
- `src/index.ts`: named re-exports of the above.
- `src/webhooks.test.ts`: 25 tests, built on the T24 spec's shared test vector.
- `README.md`: "Verifying webhooks" section with an `express.raw()` example, plus a line in "What's real vs. aspirational".
- `package.json`, `pnpm-lock.yaml`: `@types/node@^22` as a devDependency.

## Decisions
- Stricter than the API's own parser, per the spec: each part is split on the first `=`, `t` must be plain digits and a positive safe integer (`Number()` would accept `1e9` or `0x..`), and each `v1` has to be 64 hex chars before it's decoded (`timingSafeEqual` throws on a length mismatch).
- HMAC is fed `"<t>."` and then the body bytes. No template string, so non-UTF-8 bodies still verify.
- Every `v1` is compared with no early exit.
- A NaN or negative `toleranceSeconds`, or a NaN `now`, returns false. It doesn't throw: the contract is "never throws", and `Math.abs(x) > NaN` would otherwise let every timestamp through. If you'd rather a config error fail loudly, switch this to a throw.
- An empty secret, a non-string header (Node gives duplicate headers as `string[]`) or a non-string, non-bytes body all return false.
- The header constant is lowercase because Node lowercases incoming header names, so `req.headers[ENVELLO_SIGNATURE_HEADER]` works.
- `@types/node` is dev-only and needed for `node:crypto` and `Buffer` to typecheck. The public `.d.ts` types `rawBody` as `string | Uint8Array` (Buffer is a subclass), so consumers don't need Node types.

## State
Done. No CHANGELOG exists in this repo, so there's no entry. No version bump, nothing published, no PR opened (the parent session opens it).

## Verify
`pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build`. Expect 55 tests passing, 25 of them in `webhooks.test.ts`.

## Gotchas
- `tsconfig.json` excludes `*.test.ts`, so `pnpm typecheck` doesn't check the tests. Vitest strips types without checking them.
- Every test passes `now` explicitly. The vector's `t` (1795000000) falls in November 2026, so a test that used the real clock would pass or fail depending on the day it ran.
- Local `master` tracks `aktai-old/master`. Branch from `origin/master`.
