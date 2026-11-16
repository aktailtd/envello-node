# fix/https-base-url-pinned-actions

## Goal
Close T18 (SDK sent the API key over plain-http base URLs) and T19 (publish workflow with `id-token: write` ran unpinned actions and `npm@latest`).

## What changed
- `src/http.ts`: new `normalizeBaseUrl()`, called from the `HttpClient` constructor. https only, http allowed for `localhost`, `127.0.0.1`, `[::1]`. Throws `EnvelloValidationError` before any request.
- `src/http.test.ts`: tests for allowed/rejected URLs, path prefix kept, invalid URL, construction-time rejection.
- `src/client.ts`, `README.md`: document the https rule on `baseUrl`.
- `.github/workflows/publish.yml`: actions pinned to commit SHAs, npm pinned to `11.21.1`.

## Decisions
- Kept the path instead of `url.origin` (the CLI's rule). The SDK builds `${baseUrl}${path}`, so a path prefix (API behind a proxy) worked before and still does. Query, hash and userinfo are dropped.
- Error type is `EnvelloValidationError` with empty `issues`: it's the SDK's "failed local validation before any network call" error. `EnvelloApiError` needs a status code, which doesn't apply.
- `pnpm/action-setup` pinned to v4.3.0 (`b906aff`), which is what `@v4` resolved to on 2026-11-16, so behaviour doesn't change. v4.4.0 (`fc06bc1`) exists if you want to bump.
- npm `11.21.1` (2026-10-15). `11.21.2` was only 12 days old. Engines `^20.17.0 || >=22.9.0`, fine on Node 22.

## State
Done. Not released, no version bump.

## Verify
`pnpm install --frozen-lockfile && pnpm test && pnpm typecheck && pnpm build`. Expect 30 tests passing. `grep -nE '@v[0-9]|npm@latest' .github/workflows/publish.yml` should print nothing.

## Gotchas
- Breaking for anyone passing a non-loopback `http://` baseUrl (e.g. `http://192.168.x.x` or a docker service name). Intentional; call it out in the release notes.
- Still floating in the workflow, out of scope here: `pnpm version: 10` and `node-version: 22`.
- Local `master` tracks `aktai-old/master`; branch from `origin/master`.
- Pinned action tags: `pnpm/action-setup` v4.x tags are annotated, so `git ls-remote` shows the tag object first. Use the `^{}` commit SHA.
