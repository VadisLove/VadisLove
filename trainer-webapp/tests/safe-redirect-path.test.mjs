import assert from "node:assert/strict";
import test from "node:test";

import { getSafeRedirectPath } from "../src/lib/safe-redirect-path.ts";

for (const path of [
  "/",
  "/auswertung",
  "/auswertung?mode=compare#ranking",
  "/einladung?token=a%2Fb",
  "/profil/%C3%BCbersicht",
  "/?next=//attacker.example",
  "/#//attacker.example",
]) {
  test(`akzeptiert internes Redirect-Ziel ${path}`, () => {
    assert.equal(getSafeRedirectPath(path), path);
  });
}

for (const path of [
  "",
  "https://attacker.example",
  "javascript:alert(1)",
  "//attacker.example/path",
  "///attacker.example/path",
  "/\\attacker.example/path",
  "/%2f%2fattacker.example/path",
  "/%5cattacker.example/path",
  "/%252f%252fattacker.example/path",
  "/%25%32%66%25%32%66attacker.example/path",
  "/%25%35%63%25%35%63attacker.example/path",
  "/%09/attacker.example/path",
  "/ok%25%30%64%25%30%61Location:attacker.example",
  "/auswertung\nLocation: https://attacker.example",
  "/%0d%0aLocation:https://attacker.example",
]) {
  test(`lehnt unsicheres Redirect-Ziel ${JSON.stringify(path)} ab`, () => {
    assert.equal(getSafeRedirectPath(path), "/");
  });
}

test("verwendet den angegebenen Fallback für fehlende Werte", () => {
  assert.equal(getSafeRedirectPath(null, "/login"), "/login");
});
