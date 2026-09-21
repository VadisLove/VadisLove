import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRegistrationAge } from "../src/domain/registration-age.ts";

test("unter 16 benötigen auch mit 13 eine Elternfreigabe", () => {
  assert.deepEqual(evaluateRegistrationAge("2013-09-01", "2026-09-01"), {
    age: 13,
    requiresGuardianApproval: true,
    guardianRequiredUntil: "2029-09-01",
  });
});

test("unter 13 folgt derselben Elternfreigabelogik", () => {
  assert.deepEqual(evaluateRegistrationAge("2014-09-02", "2026-09-01"), {
    age: 11,
    requiresGuardianApproval: true,
    guardianRequiredUntil: "2030-09-02",
  });
  assert.equal(evaluateRegistrationAge("2020-02-31", "2026-09-01"), null);
});

test("ab dem 16. Geburtstag ist keine Elternfreigabe erforderlich", () => {
  assert.deepEqual(evaluateRegistrationAge("2010-09-01", "2026-09-01"), {
    age: 16,
    requiresGuardianApproval: false,
    guardianRequiredUntil: null,
  });
});
