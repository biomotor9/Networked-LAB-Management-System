import assert from "node:assert/strict";
import test from "node:test";
import { generateTemporaryPassword, hashPassword, validatePassword, verifyPassword } from "../app/lib/auth/password";

test("password hashes verify only the original password", async () => {
  const encoded = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
  assert.equal(encoded.includes("correct horse battery staple"), false);
});

test("password policy and generated temporary passwords", () => {
  assert.match(validatePassword("too-short") ?? "", /12/);
  assert.equal(validatePassword("a sufficiently long password"), null);
  assert.equal(validatePassword(generateTemporaryPassword()), null);
});
