import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getSafeRedirectPath } from "../src/lib/safe-redirect-path.ts";

const loginActionsUrl = new URL("../src/app/login/actions.ts", import.meta.url);
const callbackUrl = new URL("../src/app/auth/callback/route.ts", import.meta.url);
const proxyUrl = new URL("../src/lib/supabase/proxy.ts", import.meta.url);
const proxyEntryUrl = new URL("../src/proxy.ts", import.meta.url);
const stepTwoMigrationUrl = new URL(
  "../supabase/migrations/20260921102535_step_2_auth_onboarding.sql",
  import.meta.url,
);

const [loginActions, callback, proxy, proxyEntry, stepTwoMigration] = await Promise.all([
  readFile(loginActionsUrl, "utf8"),
  readFile(callbackUrl, "utf8"),
  readFile(proxyUrl, "utf8"),
  readFile(proxyEntryUrl, "utf8"),
  readFile(stepTwoMigrationUrl, "utf8"),
]);

test("sichere Redirects behalten ausschließlich interne Ziele", () => {
  assert.equal(getSafeRedirectPath("/kalender?view=month#heute"), "/kalender?view=month#heute");

  // OAuth- und E-Mail-Callbacks dürfen niemals ein fremdes Ziel übernehmen.
  for (const unsafePath of [
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/%2f%2fattacker.example",
    "/%252f%252fattacker.example",
    "/kalender%00https://attacker.example",
  ]) {
    assert.equal(getSafeRedirectPath(unsafePath), "/", unsafePath);
  }
});

test("der geheimnisgeschützte Cleanup-Worker wird nicht vom Login-Proxy abgefangen", () => {
  assert.match(proxyEntry, /api\/onboarding\/cleanup\$/);
  assert.match(proxyEntry, /api\/calendar-communications\/mail\$/);
  assert.match(proxyEntry, /api\/calendar\/\[\^\/\]\+\$/);
});

test("persönlicher Modus benötigt keine Organisationsauswahl", () => {
  assert.doesNotMatch(loginActions, /!organizationId/);
  assert.match(loginActions, /if \(organizationId\)/);
});

test("die Alters- und RLS-Grenze liegt bei 16 und nutzt keine Metadatenrechte", () => {
  assert.match(stepTwoMigration, /interval '16 years'/);
  assert.match(stepTwoMigration, /onboarding_accounts/);
  assert.match(stepTwoMigration, /approval\.status <> 'approved'/);
  assert.doesNotMatch(stepTwoMigration, /raw_user_meta_data[\s\S]{0,120}account_is_active/);
});

test("Anmeldung, Callback und Proxy verwenden denselben Redirect-Schutz", () => {
  assert.match(loginActions, /getSafeRedirectPath\(formData\.get\("next"\)\)/);
  assert.match(callback, /getSafeRedirectPath\(\s*request\.nextUrl\.searchParams\.get\("next"\)/);
  assert.match(proxy, /getSafeRedirectPath\(\s*request\.nextUrl\.searchParams\.get\("next"\)/);
});

test("ein unvollständiges Minderjährigen-Onboarding bleibt serverseitig gesperrt", () => {
  // Der Datenbanktest prueft diesen Vertrag mit einer authentifizierten Rolle
  // gegen echte RLS-Policies. Dieser Test stellt sicher, dass der Proxy den
  // gesperrten Zustand zusaetzlich auf die Warteseite leitet.
  assert.match(proxy, /guardianApprovalRequired/);
  assert.match(proxy, /pathname = "\/freigabe-ausstehend"/);
  assert.match(proxy, /guardianApproval\.status !== "approved"/);
});

test("doppelte E-Mail-Sign-ups werden nicht als neue Identität behandelt", () => {
  // Supabase kann bei bestehender, bestätigter E-Mail eine User-Antwort ohne
  // neue Identity liefern. Der Ablauf darf dann weder einen Elternmail-Token
  // ausstellen noch aus Metadaten eine zweite fachliche Identität ableiten.
  assert.match(loginActions, /user && user\.identities\?\.length/);
  assert.match(loginActions, /issueGuardianApprovalEmail/);
  assert.match(loginActions, /if \(session\)/);
});
