import { describe, expect, it } from "vitest";
import { ENVELLO_SIGNATURE_HEADER, verifyWebhook } from "./webhooks.js";

// Shared test vector from the T24 spec, produced by the API's signer.
const SECRET = "whsec_test_secret";
const OLD_SECRET = "whsec_old";
const TIMESTAMP = 1795000000;
const BODY = '{"type":"email.delivered","data":{"id":"e_1"}}';
const SIGNATURE = "01fd7cd18054befb25b082d367dca85a0494a916825e50896c202a70daf7d20c";
const OLD_SIGNATURE = "2dd8bb6eb3a2f5b581fa0fa9b72bbc243b42fad944b73591035a7c34d521c271";
const HEADER = `t=${TIMESTAMP},v1=${SIGNATURE}`;
const ROTATION_HEADER = `t=${TIMESTAMP},v1=${SIGNATURE},v1=${OLD_SIGNATURE}`;
const AT_SIGNING_TIME = { now: TIMESTAMP };

describe("verifyWebhook", () => {
  it("accepts the shared test vector", () => {
    expect(verifyWebhook(SECRET, BODY, HEADER, AT_SIGNING_TIME)).toBe(true);
  });

  it("exports the lowercase header name Node uses", () => {
    expect(ENVELLO_SIGNATURE_HEADER).toBe("envello-signature");
  });

  it("accepts a rotation header for either secret", () => {
    expect(verifyWebhook(SECRET, BODY, ROTATION_HEADER, AT_SIGNING_TIME)).toBe(true);
    expect(verifyWebhook(OLD_SECRET, BODY, ROTATION_HEADER, AT_SIGNING_TIME)).toBe(true);
  });

  it("accepts the old secret's signature when it's listed first", () => {
    const header = `t=${TIMESTAMP},v1=${OLD_SIGNATURE},v1=${SIGNATURE}`;
    expect(verifyWebhook(SECRET, BODY, header, AT_SIGNING_TIME)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(verifyWebhook("whsec_wrong", BODY, HEADER, AT_SIGNING_TIME)).toBe(false);
    expect(verifyWebhook(OLD_SECRET, BODY, HEADER, AT_SIGNING_TIME)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const tampered = BODY.replace("e_1", "e_2");
    expect(verifyWebhook(SECRET, tampered, HEADER, AT_SIGNING_TIME)).toBe(false);
  });

  it("rejects re-serialized JSON that differs from the raw bytes", () => {
    const reserialized = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyWebhook(SECRET, reserialized, HEADER, AT_SIGNING_TIME)).toBe(false);
  });

  it("accepts a timestamp exactly at the tolerance edge", () => {
    expect(verifyWebhook(SECRET, BODY, HEADER, { now: TIMESTAMP + 300 })).toBe(true);
    expect(verifyWebhook(SECRET, BODY, HEADER, { now: TIMESTAMP - 300 })).toBe(true);
  });

  it("rejects a stale timestamp", () => {
    expect(verifyWebhook(SECRET, BODY, HEADER, { now: TIMESTAMP + 301 })).toBe(false);
  });

  it("rejects a timestamp too far in the future", () => {
    expect(verifyWebhook(SECRET, BODY, HEADER, { now: TIMESTAMP - 301 })).toBe(false);
  });

  it("honours a custom tolerance", () => {
    expect(verifyWebhook(SECRET, BODY, HEADER, { now: TIMESTAMP + 600, toleranceSeconds: 600 })).toBe(true);
    expect(verifyWebhook(SECRET, BODY, HEADER, { now: TIMESTAMP + 11, toleranceSeconds: 10 })).toBe(false);
  });

  it("rejects a non-finite or negative tolerance or clock instead of passing everything", () => {
    expect(verifyWebhook(SECRET, BODY, HEADER, { now: TIMESTAMP, toleranceSeconds: Number.NaN })).toBe(false);
    expect(verifyWebhook(SECRET, BODY, HEADER, { now: TIMESTAMP, toleranceSeconds: -1 })).toBe(false);
    expect(verifyWebhook(SECRET, BODY, HEADER, { now: Number.NaN })).toBe(false);
  });

  it.each([
    ["empty string", ""],
    ["non-numeric t", "t=abc,v1=x"],
    ["v1 with no t", `v1=${SIGNATURE}`],
    ["t with no v1", `t=${TIMESTAMP}`],
    ["exponent t", `t=1.795e9,v1=${SIGNATURE}`],
    ["zero t", `t=0,v1=${SIGNATURE}`],
    ["negative t", `t=-${TIMESTAMP},v1=${SIGNATURE}`],
    ["short v1", `t=${TIMESTAMP},v1=${SIGNATURE.slice(0, 10)}`],
    ["non-hex v1", `t=${TIMESTAMP},v1=${"z".repeat(64)}`],
    ["garbage", "not a signature header"],
  ])("returns false without throwing for a malformed header (%s)", (_label, header) => {
    expect(() => verifyWebhook(SECRET, BODY, header, AT_SIGNING_TIME)).not.toThrow();
    expect(verifyWebhook(SECRET, BODY, header, AT_SIGNING_TIME)).toBe(false);
  });

  it("returns false for a missing header", () => {
    expect(verifyWebhook(SECRET, BODY, null, AT_SIGNING_TIME)).toBe(false);
    expect(verifyWebhook(SECRET, BODY, undefined, AT_SIGNING_TIME)).toBe(false);
  });

  it("returns false for wrong runtime types instead of throwing", () => {
    // Plain-JS callers can pass these; Node gives duplicate headers as string[].
    const asHeader = (value: unknown) => value as string;
    expect(verifyWebhook(SECRET, BODY, asHeader([HEADER]), AT_SIGNING_TIME)).toBe(false);
    expect(verifyWebhook("", BODY, HEADER, AT_SIGNING_TIME)).toBe(false);
    expect(verifyWebhook(SECRET, { parsed: true } as unknown as string, HEADER, AT_SIGNING_TIME)).toBe(false);
  });

  it("gives the same result for Buffer, Uint8Array and string bodies", () => {
    const buffer = Buffer.from(BODY, "utf8");
    const bytes = new TextEncoder().encode(BODY);
    expect(verifyWebhook(SECRET, buffer, HEADER, AT_SIGNING_TIME)).toBe(true);
    expect(verifyWebhook(SECRET, bytes, HEADER, AT_SIGNING_TIME)).toBe(true);
    const tampered = Buffer.from(BODY.replace("e_1", "e_2"), "utf8");
    expect(verifyWebhook(SECRET, tampered, HEADER, AT_SIGNING_TIME)).toBe(false);
  });
});
