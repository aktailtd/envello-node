import { describe, expect, it, vi } from "vitest";
import { Envello } from "./client.js";
import { EnvelloApiError } from "./errors.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Envello client construction", () => {
  it("accepts an options object", () => {
    const envello = new Envello({ apiKey: "env_test_abc123456789" });
    expect(envello.emails).toBeDefined();
  });

  it("accepts a bare API key string, Resend-style", () => {
    const envello = new Envello("env_test_abc123456789");
    expect(envello.emails).toBeDefined();
  });

  it("throws if no API key is provided", () => {
    // @ts-expect-error - intentionally omitting the required field
    expect(() => new Envello({})).toThrow(/apiKey/);
  });
});

describe("Envello request plumbing", () => {
  it("sends the Authorization header and hits the configured baseUrl", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { id: "11111111-1111-1111-1111-111111111111", status: "queued" }));
    const envello = new Envello({
      apiKey: "env_test_abc123456789",
      baseUrl: "https://api.example.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });

    await envello.emails.send({ from: "a@example.com", to: "b@example.com", subject: "hi", text: "hello" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer env_test_abc123456789");
  });

  it("strips a trailing slash from a custom baseUrl", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { id: "11111111-1111-1111-1111-111111111111", status: "queued" }));
    const envello = new Envello({
      apiKey: "env_test_abc123456789",
      baseUrl: "https://api.example.test/",
      fetch: fetchImpl as unknown as typeof fetch,
    });

    await envello.emails.send({ from: "a@example.com", to: "b@example.com", subject: "hi", text: "hello" });
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toBe("https://api.example.test/emails");
  });

  it("throws EnvelloApiError with the parsed body on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(429, { error: "rate_limited", message: "Too many send requests", limit: 100 }),
    );
    const envello = new Envello({
      apiKey: "env_test_abc123456789",
      fetch: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      envello.emails.send({ from: "a@example.com", to: "b@example.com", subject: "hi", text: "hello" }),
    ).rejects.toMatchObject({
      name: "EnvelloApiError",
      statusCode: 429,
      code: "rate_limited",
    });
  });

  it("EnvelloApiError carries the full response body as `details`", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(422, { error: "recipient_suppressed", suppressed_count: 2 }));
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    let caught: unknown;
    try {
      await envello.emails.send({ from: "a@example.com", to: "b@example.com", subject: "hi", text: "hello" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvelloApiError);
    expect((caught as EnvelloApiError).details).toMatchObject({ suppressed_count: 2 });
  });
});
