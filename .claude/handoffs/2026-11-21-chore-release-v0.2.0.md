# Handoff: release v0.2.0

**Goal.** Ship the webhook verifier and security fixes merged since July, and move off the schemas versions that still exported internal KRA types.

**What changed.**
- `package.json`: version 0.2.0; `@envello/schemas` ^0.1.0 to ^0.2.0 (0.2.0 drops the internal kra* exports, which this SDK never used).
- `pnpm-lock.yaml`: resolves schemas 0.2.0.
- `pnpm-workspace.yaml`: `minimumReleaseAgeExclude` now names `@envello/schemas@0.2.0` (our own package, published 2026-11-21, younger than the age gate).

**Decisions.** Minor bump: new public API (verifyWebhook) under 0.x.

**State.** PR open. After merge: tag `v0.2.0` on master; publish.yml publishes via npm OIDC trusted publishing (aktailtd/envello-node, publish.yml). "Allow npm publish" must be ticked on the npm connection, or the version lands in staging and needs approval.

**Verify.** `pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm test`: 55 passed. After tagging, `npm view envello version` shows 0.2.0 and the tarball downloads.

**Gotchas.** On 2026-11-21 the staged schemas 0.2.0 tarball returned 404 for ~3 minutes after approval. Wait before assuming a failed publish. Repo history was rewritten that day; never push the old history (`envello-node-archive`) back.
