import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRegistrationAge } from "../src/domain/registration-age.ts";

test("13-jaehrige duerfen sich selbst registrieren und brauchen eine Freigabe", () => {
  assert.deepEqual(evaluateRegistrationAge("2013-09-01", "2026-09-01"), {
    age: 13,
    requiresGuardianApproval: true,
    guardianRequiredUntil: "2031-09-01",
  });
});

test("unter 13 und unplausible Datumswerte werden abgelehnt", () => {
  assert.equal(evaluateRegistrationAge("2013-09-02", "2026-09-01"), null);
  assert.equal(evaluateRegistrationAge("2020-02-31", "2026-09-01"), null);
});

test("ab dem 18. Geburtstag ist keine Elternfreigabe erforderlich", () => {
  assert.deepEqual(evaluateRegistrationAge("2008-09-01", "2026-09-01"), {
    age: 18,
    requiresGuardianApproval: false,
    guardianRequiredUntil: null,
  });
});
