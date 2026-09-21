import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPasswordIdentity,
  minimumPasswordLength,
  validateNewPassword,
} from "../src/domain/password-security.ts";

test("Passwortregeln bleiben in allen Abläufen identisch", () => {
  assert.equal(minimumPasswordLength, 8);
  assert.match(validateNewPassword("kurz", "kurz") || "", /mindestens 8/);
  assert.match(
    validateNewPassword("sicheres-passwort", "abweichend") || "",
    /stimmen nicht überein/,
  );
  assert.equal(
    validateNewPassword("sicheres-passwort", "sicheres-passwort"),
    null,
  );
});

test("nur eine bestätigte Auth-Identity vom Provider email gilt als Passwortweg", () => {
  assert.equal(hasPasswordIdentity(undefined), false);
  assert.equal(hasPasswordIdentity([{ provider: "google" }]), false);
  assert.equal(
    hasPasswordIdentity([{ provider: "apple" }, { provider: "email" }]),
    true,
  );
});
