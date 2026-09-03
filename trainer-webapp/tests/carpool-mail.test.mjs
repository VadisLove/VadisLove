import test from "node:test";
import assert from "node:assert/strict";
import { deliverCarpoolMail } from "../src/lib/carpool-mail-delivery.ts";
import { carpoolErrorCode } from "../src/domain/carpools.ts";
const job = {
  id: "abc",
  email: "test@example.invalid",
  subject: "Test",
  body: "Test",
  link: "/fahrgemeinschaften",
  lease_id: "lease",
};
test("Versandfehler werden freigegeben, Retry verwendet denselben Resend-Key", async () => {
  const keys = [],
    states = [];
  const first = await deliverCarpoolMail(
    [job],
    async (_, key) => {
      keys.push(key);
      throw Error("timeout");
    },
    async (_, success) => states.push(success),
  );
  const second = await deliverCarpoolMail(
    [job],
    async (_, key) => {
      keys.push(key);
      return true;
    },
    async (_, success) => states.push(success),
  );
  assert.deepEqual(keys, ["carpool-abc", "carpool-abc"]);
  assert.deepEqual(states, [false, true]);
  assert.equal(first.failed, 1);
  assert.equal(second.sent, 1);
});
test("Fehler beim Speichern des Versandstatus bleibt für erneute Zustellung erkennbar", async () => {
  const result = await deliverCarpoolMail(
    [job],
    async () => true,
    async () => {
      throw Error("db offline");
    },
  );
  assert.equal(result.failed, 1);
});
test("Fehlermeldungen geben keine internen Datenbankdetails preis", () => {
  assert.equal(
    carpoolErrorCode({ message: "secret database host unreachable" }),
    "failed",
  );
  assert.equal(carpoolErrorCode({ code: "23505" }), "duplicate");
  assert.equal(carpoolErrorCode({ message: "CARPOOL_FULL" }), "full");
});
