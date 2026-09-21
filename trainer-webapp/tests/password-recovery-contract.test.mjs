import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const urls = {
  callback: new URL("../src/app/auth/callback/route.ts", import.meta.url),
  requestForm: new URL(
    "../src/app/passwort-vergessen/recovery-request-form.tsx",
    import.meta.url,
  ),
  resetAction: new URL(
    "../src/app/passwort-zuruecksetzen/actions.ts",
    import.meta.url,
  ),
  recoveryGrant: new URL(
    "../src/lib/password-recovery-grant.ts",
    import.meta.url,
  ),
  profileAction: new URL("../src/app/profil/actions.ts", import.meta.url),
  proxy: new URL("../src/lib/supabase/proxy.ts", import.meta.url),
  appShell: new URL("../src/components/layout/app-shell.tsx", import.meta.url),
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(urls).map(async ([name, url]) => [name, await readFile(url, "utf8")]),
  ),
);

test("öffentliche Recovery-Antworten geben keine Kontoexistenz preis", () => {
  assert.match(sources.requestForm, /neutralConfirmation/);
  assert.match(sources.requestForm, /finally/);
  assert.doesNotMatch(sources.requestForm, /error\.message/);
  assert.match(sources.requestForm, /resetPasswordForEmail/);
});

test("nur ein eingelöster Recovery-Code öffnet die eigene Reset-Seite", () => {
  assert.match(sources.callback, /passwordRecoveryCookieName/);
  assert.match(sources.callback, /httpOnly: true/);
  assert.match(sources.callback, /nextPath === passwordResetPath/);
  assert.match(sources.callback, /createPasswordRecoveryGrant/);
  assert.match(sources.resetAction, /verifyPasswordRecoveryGrant/);
  assert.match(sources.recoveryGrant, /timingSafeEqual/);
  assert.match(sources.resetAction, /cookieStore\.delete\(passwordRecoveryCookieName\)/);
});

test("Recovery widerruft alle Sitzungen und Profiländerung nur die anderen", () => {
  assert.match(sources.resetAction, /signOut\(\{ scope: "global" \}\)/);
  assert.match(sources.profileAction, /current_password: currentPassword/);
  assert.match(sources.profileAction, /password, nonce/);
  assert.match(sources.profileAction, /signOut\(\{ scope: "others" \}\)/);
});

test("Recovery-Anfrage ist öffentlich, die Reset-Seite bleibt sitzungspflichtig", () => {
  assert.match(sources.proxy, /startsWith\("\/passwort-vergessen"\)/);
  assert.doesNotMatch(
    sources.proxy,
    /isPublicAuthRoute[\s\S]{0,500}startsWith\("\/passwort-zuruecksetzen"\)/,
  );
  assert.match(sources.appShell, /startsWith\("\/passwort-vergessen"\)/);
  assert.match(sources.appShell, /startsWith\("\/passwort-zuruecksetzen"\)/);
});
