import { describe, expect, test } from "vitest";

import { hashPassword, verifyPassword } from "../src/auth/password.js";

describe("auth password helpers", () => {
  test("hashes passwords with bcrypt and never returns plaintext", async () => {
    const hash = await hashPassword("admin123");

    expect(hash).not.toBe("admin123");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  test("verifies valid and invalid passwords", async () => {
    const hash = await hashPassword("admin123");

    await expect(verifyPassword("admin123", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
