import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const urls = {
  input: new URL("../src/components/forms/password-input.tsx", import.meta.url),
  reset: new URL(
    "../src/app/passwort-zuruecksetzen/reset-password-form.tsx",
    import.meta.url,
  ),
  profile: new URL(
    "../src/features/profile/password-security-card.tsx",
    import.meta.url,
  ),
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(urls).map(async ([name, url]) => [name, await readFile(url, "utf8")]),
  ),
);

test("Passwortfelder lassen sich lokal und zugänglich anzeigen", () => {
  assert.match(sources.input, /type="button"/);
  assert.match(sources.input, /aria-label=\{actionLabel\}/);
  assert.match(sources.input, /aria-pressed=\{isVisible\}/);
  assert.match(sources.input, /isVisible \? "text" : "password"/);
  assert.match(sources.reset, /PasswordInput/g);
  assert.match(sources.profile, /PasswordInput/g);
});
