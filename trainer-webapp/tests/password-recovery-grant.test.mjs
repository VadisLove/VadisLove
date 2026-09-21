import assert from "node:assert/strict";
import test from "node:test";
import {
  createPasswordRecoveryGrant,
  verifyPasswordRecoveryGrant,
} from "../src/lib/password-recovery-grant.ts";

const secret = "synthetic-test-secret-with-more-than-32-characters";
const issuedAt = Date.UTC(2026, 8, 21, 12, 0, 0);

test("Recovery-Berechtigung ist kurzlebig und an den Auth-Nutzer gebunden", () => {
  const grant = createPasswordRecoveryGrant("user-a", issuedAt, secret);
  assert.equal(
    verifyPasswordRecoveryGrant(grant, "user-a", issuedAt + 60_000, secret),
    true,
  );
  assert.equal(
    verifyPasswordRecoveryGrant(grant, "user-b", issuedAt + 60_000, secret),
    false,
  );
  assert.equal(
    verifyPasswordRecoveryGrant(grant, "user-a", issuedAt + 11 * 60_000, secret),
    false,
  );
});

test("manipulierte Recovery-Cookies werden verworfen", () => {
  const grant = createPasswordRecoveryGrant("user-a", issuedAt, secret);
  assert.equal(
    verifyPasswordRecoveryGrant(`${grant}x`, "user-a", issuedAt, secret),
    false,
  );
  assert.equal(verifyPasswordRecoveryGrant("frei.erfunden.cookie", "frei", issuedAt, secret), false);
});
