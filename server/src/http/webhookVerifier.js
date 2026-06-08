import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

export function createWebhookVerifier({ secret }) {
  if (!secret) {
    return {
      verify() {
        return { valid: true, reason: null };
      }
    };
  }

  const key = Buffer.from(secret, "utf8");

  return {
    verify(bodyBuffer, signatureHeader) {
      if (!signatureHeader) {
        return { valid: false, reason: "Missing X-IDM-Signature header" };
      }

      if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
        return { valid: false, reason: "Invalid signature format" };
      }

      const providedSig = Buffer.from(signatureHeader.slice(SIGNATURE_PREFIX.length), "hex");
      const computedSig = createHmac("sha256", key).update(bodyBuffer).digest();

      if (providedSig.length !== computedSig.length) {
        return { valid: false, reason: "Signature length mismatch" };
      }

      if (!timingSafeEqual(providedSig, computedSig)) {
        return { valid: false, reason: "Signature mismatch" };
      }

      return { valid: true, reason: null };
    }
  };
}
