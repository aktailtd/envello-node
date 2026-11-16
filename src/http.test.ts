import { describe, expect, it } from "vitest";
import { Envello } from "./client.js";
import { EnvelloValidationError } from "./errors.js";
import { normalizeBaseUrl } from "./http.js";

describe("normalizeBaseUrl", () => {
  it.each([
    ["https://api.envello.dev", "https://api.envello.dev"],
    ["https://api.envello.dev/", "https://api.envello.dev"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:3000/", "http://127.0.0.1:3000"],
    ["http://[::1]:3000", "http://[::1]:3000"],
    // A path prefix (e.g. an API behind a reverse proxy) is kept, only trailing slashes go.
    ["https://staging.example.test/api/", "https://staging.example.test/api"],
    // Query, hash and credentials can't survive `${baseUrl}${path}` anyway, so they're dropped.
    ["https://user:pass@api.example.test/v1?x=1#h", "https://api.example.test/v1"],
  ])("accepts %s -> %s", (raw, expected) => {
    expect(normalizeBaseUrl(raw)).toBe(expected);
  });

  it.each([
    "http://api.envello.dev",
    "http://localhost.evil.com",
    "http://10.0.0.5:3000",
    "ftp://api.envello.dev",
  ])("rejects %s", (raw) => {
    expect(() => normalizeBaseUrl(raw)).toThrow(EnvelloValidationError);
    expect(() => normalizeBaseUrl(raw)).toThrow(/must use https/);
  });

  it("rejects a string that is not a URL", () => {
    expect(() => normalizeBaseUrl("api.envello.dev")).toThrow(EnvelloValidationError);
    expect(() => normalizeBaseUrl("api.envello.dev")).toThrow(/not a valid URL/);
  });

  it("rejects a plain-http remote baseUrl at construction, before any request", () => {
    expect(() => new Envello({ apiKey: "env_test_abc123456789", baseUrl: "http://api.example.test" })).toThrow(
      EnvelloValidationError,
    );
  });
});
