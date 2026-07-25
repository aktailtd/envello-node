import { describe, expect, it, vi } from "vitest";
import { Envello } from "../client.js";
import { EnvelloValidationError } from "../errors.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const validSend = {
  from: "sender@example.com",
  to: "recipient@example.com",
  subject: "Hello",
  text: "Hello world",
};

describe("emails.send", () => {
  it("posts to /emails and returns the parsed response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { id: "11111111-1111-1111-1111-111111111111", status: "queued" }));
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    const result = await envello.emails.send(validSend);

    expect(result).toEqual({ id: "11111111-1111-1111-1111-111111111111", status: "queued" });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    // The shared schema normalizes a single recipient string into a 1-item
    // array before it's sent - the same shape apps/api's `to` column expects.
    expect(JSON.parse(init.body as string)).toMatchObject({ ...validSend, to: [validSend.to] });
  });

  it("sets the Idempotency-Key header when provided", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { id: "11111111-1111-1111-1111-111111111111", status: "queued" }));
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    await envello.emails.send(validSend, { idempotencyKey: "idem-1" });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-1");
  });

  it("rejects a payload missing both html and text before making a network call", async () => {
    const fetchImpl = vi.fn();
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    await expect(
      envello.emails.send({ from: "a@example.com", to: "b@example.com", subject: "hi" }),
    ).rejects.toBeInstanceOf(EnvelloValidationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a malformed `from` address before making a network call", async () => {
    const fetchImpl = vi.fn();
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    await expect(
      envello.emails.send({ ...validSend, from: "not-an-email" }),
    ).rejects.toBeInstanceOf(EnvelloValidationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("emails.batch", () => {
  it("posts a single request to /emails/batch, not N sequential sends", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(207, {
        results: [
          { index: 0, status: "queued", id: "11111111-1111-1111-1111-111111111111" },
          { index: 1, status: "failed", error: "one or more recipients are on the suppression list" },
        ],
      }),
    );
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    const result = await envello.emails.batch([
      { ...validSend, to: "ok@example.com" },
      { ...validSend, to: "blocked@example.com" },
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/emails/batch");
    expect(JSON.parse(init.body as string).emails).toHaveLength(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({ status: "queued" });
    expect(result.results[1]).toMatchObject({ status: "failed" });
  });

  it("validates every item locally before sending the batch request", async () => {
    const fetchImpl = vi.fn();
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    await expect(
      envello.emails.batch([validSend, { from: "a@example.com", to: "b@example.com", subject: "no body" }]),
    ).rejects.toBeInstanceOf(EnvelloValidationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("emails.get / emails.cancel", () => {
  it("fetches a send's status by id", async () => {
    const emailId = "11111111-1111-1111-1111-111111111111";
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        id: emailId,
        status: "sent",
        to: ["recipient@example.com"],
        subject: "Hello",
        send_at: null,
        sent_at: new Date().toISOString(),
        error: null,
        created_at: new Date().toISOString(),
      }),
    );
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    const result = await envello.emails.get(emailId);

    expect(result.id).toBe(emailId);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/emails/${emailId}`);
    expect(init.method).toBe("GET");
  });

  it("cancels a scheduled send", async () => {
    const emailId = "11111111-1111-1111-1111-111111111111";
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: emailId, status: "canceled" }));
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    const result = await envello.emails.cancel(emailId);

    expect(result).toEqual({ id: emailId, status: "canceled" });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
  });
});

describe("emails.validate", () => {
  it("posts to /emails/validate and returns the deliverability check result", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        email: "dev@example.com",
        valid: true,
        syntax_valid: true,
        disposable: false,
        role_account: false,
        mx_found: true,
      }),
    );
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    const result = await envello.emails.validate("dev@example.com");

    expect(result.valid).toBe(true);
    expect(result.role_account).toBe(false);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/emails/validate");
    expect(JSON.parse(init.body as string)).toEqual({ email: "dev@example.com" });
  });

  it("surfaces a disposable-domain result", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        email: "throwaway@mailinator.com",
        valid: false,
        syntax_valid: true,
        disposable: true,
        role_account: false,
        mx_found: true,
        reason: "disposable_domain",
      }),
    );
    const envello = new Envello({ apiKey: "env_test_abc123456789", fetch: fetchImpl as unknown as typeof fetch });

    const result = await envello.emails.validate("throwaway@mailinator.com");

    expect(result).toMatchObject({ valid: false, disposable: true });
  });
});
