import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";

import { createWebhookVerifier } from "../src/http/webhookVerifier.js";

const SECRET = "this-is-a-test-secret-at-least-32-chars";

function sign(secret, body) {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("createWebhookVerifier", () => {
  describe("without a configured secret (development mode)", () => {
    test("accepts any request regardless of signature", () => {
      const verifier = createWebhookVerifier({ secret: null });
      expect(verifier.verify(Buffer.from("anything"), undefined)).toEqual({
        valid: true,
        reason: null
      });
    });

    test("treats an empty-string secret as unconfigured", () => {
      const verifier = createWebhookVerifier({ secret: "" });
      expect(verifier.verify(Buffer.from("x"), "sha256=deadbeef").valid).toBe(true);
    });
  });

  describe("with a configured secret", () => {
    const body = Buffer.from(JSON.stringify({ externalRef: "EXT-1", records: [] }));

    test("accepts a correctly signed body", () => {
      const verifier = createWebhookVerifier({ secret: SECRET });
      const result = verifier.verify(body, sign(SECRET, body));
      expect(result).toEqual({ valid: true, reason: null });
    });

    test("rejects a missing signature header", () => {
      const verifier = createWebhookVerifier({ secret: SECRET });
      const result = verifier.verify(body, undefined);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/Missing/);
    });

    test("rejects a signature without the sha256= prefix", () => {
      const verifier = createWebhookVerifier({ secret: SECRET });
      const raw = createHmac("sha256", SECRET).update(body).digest("hex");
      const result = verifier.verify(body, raw);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/format/);
    });

    test("rejects a signature of the wrong length", () => {
      const verifier = createWebhookVerifier({ secret: SECRET });
      const result = verifier.verify(body, "sha256=abcd");
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/length/);
    });

    test("rejects a valid-length but incorrect signature", () => {
      const verifier = createWebhookVerifier({ secret: SECRET });
      const wrong = sign("a-different-secret-that-is-also-32-chars", body);
      const result = verifier.verify(body, wrong);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/mismatch/i);
    });

    test("rejects when the body has been tampered with", () => {
      const verifier = createWebhookVerifier({ secret: SECRET });
      const signature = sign(SECRET, body);
      const tampered = Buffer.from(body.toString() + " ");
      expect(verifier.verify(tampered, signature).valid).toBe(false);
    });
  });
});
