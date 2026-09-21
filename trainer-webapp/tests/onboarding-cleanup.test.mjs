import assert from "node:assert/strict";
import test from "node:test";
import { deleteClaimedOnboardingAccounts } from "../src/lib/onboarding-cleanup.ts";

test("Bereinigung zählt erfolgreiche und fehlgeschlagene Auth-Löschungen", async () => {
  const attempted = [];
  const result = await deleteClaimedOnboardingAccounts(
    ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
    async (userId) => {
      attempted.push(userId);
      return userId.endsWith("1");
    },
  );

  assert.deepEqual(attempted, [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ]);
  assert.deepEqual(result, { claimed: 2, deleted: 1, failed: 1 });
});
