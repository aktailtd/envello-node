import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Header Envello signs every webhook delivery with. Node lowercases incoming
 * header names, so this is lowercase and works as `req.headers[ENVELLO_SIGNATURE_HEADER]`.
 */
export const ENVELLO_SIGNATURE_HEADER = "envello-signature";

export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export interface VerifyWebhookOptions {
  /** Max allowed |now - t| in seconds. Defaults to 300. */
  toleranceSeconds?: number;
  /** Current time in unix seconds. Defaults to the system clock; set it in tests. */
  now?: number;
}

const TIMESTAMP_PATTERN = /^\d+$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;

interface ParsedSignatureHeader {
  timestamp: number;
  timestampText: string;
  signatures: string[];
}

function parseSignatureHeader(header: string): ParsedSignatureHeader | undefined {
  let timestampText: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key === "t") timestampText = value;
    else if (key === "v1") signatures.push(value);
  }
  // `Number()` alone accepts "1e9", "0x10" and floats, so require plain digits.
  if (timestampText === undefined || !TIMESTAMP_PATTERN.test(timestampText)) return undefined;
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return undefined;
  if (signatures.length === 0) return undefined;
  return { timestamp, timestampText, signatures };
}

function isByteBody(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

/**
 * Verifies an `Envello-Signature` header (`t=<unix>,v1=<hex>[,v1=<hex>...]`)
 * against the raw request body. Returns false for anything malformed, stale or
 * unsigned; never throws on bad input. Pass the exact bytes received: a
 * re-serialized JSON object will not match.
 */
export function verifyWebhook(
  secret: string,
  rawBody: string | Uint8Array,
  header: string | null | undefined,
  options: VerifyWebhookOptions = {},
): boolean {
  // Runtime guards: JS callers can pass anything, and Node hands duplicate
  // headers over as string[].
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (typeof header !== "string") return false;
  if (typeof rawBody !== "string" && !isByteBody(rawBody)) return false;

  const toleranceSeconds = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  // `Math.abs(x) > NaN` is false, so a NaN tolerance or clock would pass every
  // timestamp. Reject instead of throwing, per the "never throws" contract.
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) return false;
  if (!Number.isFinite(now)) return false;

  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(now - parsed.timestamp) > toleranceSeconds) return false;

  // Feed bytes, not a template string, so non-UTF-8 bodies sign correctly.
  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestampText}.`)
    .update(rawBody)
    .digest();

  // Check every v1 with no early exit, so timing doesn't reveal which matched.
  let matched = false;
  for (const signature of parsed.signatures) {
    if (!SIGNATURE_PATTERN.test(signature)) continue;
    if (timingSafeEqual(expected, Buffer.from(signature, "hex"))) matched = true;
  }
  return matched;
}
