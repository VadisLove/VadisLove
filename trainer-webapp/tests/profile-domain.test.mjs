import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PROFILE_PHOTO_BYTES,
  buildClubMemberships,
  buildEligibleFederations,
  parseDisciplines,
  validateProfileDetails,
  validateProfilePhoto,
} from "../src/domain/profile.ts";

test("validiert und normalisiert eine Profilaktualisierung", () => {
  const disciplines = parseDisciplines(" Street, Park\nStreet, Bowl ");
  assert.deepEqual(disciplines, ["Street", "Park", "Bowl"]);
  assert.equal(validateProfileDetails({
    firstName: "Lea",
    lastName: "Muster",
    phone: "",
    location: "München",
    bio: "Skateboarderin",
    disciplines,
    visibility: "contacts",
  }), null);
  assert.match(validateProfileDetails({
    firstName: "",
    lastName: "Muster",
    phone: "",
    location: "",
    bio: "",
    disciplines: [],
    visibility: "private",
  }), /Vor- und Nachname/);
});

test("akzeptiert nur erlaubte Profilfoto-Typen bis 5 MB", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(validateProfilePhoto({ type, size: MAX_PROFILE_PHOTO_BYTES }), null);
  }
  assert.match(
    validateProfilePhoto({ type: "image/gif", size: 100 }),
    /JPG-, PNG- oder WebP/,
  );
  assert.match(
    validateProfilePhoto({ type: "image/jpeg", size: MAX_PROFILE_PHOTO_BYTES + 1 }),
    /höchstens 5 MB/,
  );
});

test("bewahrt mehrere parallele Vereinsmitgliedschaften und Rollen", () => {
  const memberships = [
    { organization_id: "club-by", role: "athlete", created_at: "2026-01-02T00:00:00Z" },
    { organization_id: "club-by", role: "club_trainer", created_at: "2026-02-02T00:00:00Z" },
    { organization_id: "club-nrw", role: "athlete", created_at: "2026-03-02T00:00:00Z" },
  ];
  const organizations = [
    { id: "club-by", name: "Verein Bayern", level: "club", parent_id: "by" },
    { id: "club-nrw", name: "Verein NRW", level: "club", parent_id: "nrw" },
    { id: "by", name: "Verband Bayern", level: "state", parent_id: "federal" },
    { id: "nrw", name: "Verband NRW", level: "state", parent_id: "federal" },
  ];

  const clubs = buildClubMemberships(memberships, organizations);
  assert.equal(clubs.length, 2);
  assert.deepEqual(clubs.find((club) => club.organizationId === "club-by")?.roles, [
    "athlete",
    "club_trainer",
  ]);

  const federations = buildEligibleFederations(clubs);
  assert.deepEqual(federations.map((federation) => federation.id).sort(), ["by", "nrw"]);
  assert.deepEqual(
    federations.find((federation) => federation.id === "by")?.qualifyingClubs,
    ["Verein Bayern"],
  );
});
