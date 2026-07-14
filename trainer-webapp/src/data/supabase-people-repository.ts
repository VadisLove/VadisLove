import type {
  OrganizationRole,
  Person,
  RelationshipType,
} from "@/domain/models";
import { createClient } from "@/lib/supabase/server";

interface PeopleDirectoryRow {
  id: string;
  display_name: string;
  email: string;
  account_type: string;
  roles: OrganizationRole[] | null;
  states: string[] | null;
  clubs: string[] | null;
  active_relationships: RelationshipType[] | null;
  pending_sent: RelationshipType[] | null;
  pending_received: RelationshipType[] | null;
}

interface AssignableProfileFallbackRow {
  id: string;
  display_name: string;
  email: string;
  account_type: string;
}

function isMissingRpcFunction(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST202" ||
    error.message?.toLowerCase().includes("schema cache") ||
    error.message?.toLowerCase().includes("could not find the function")
  );
}

function createInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getPrimaryRole(
  accountType: string,
  roles: OrganizationRole[],
): Person["role"] {
  if (roles.includes("athlete") || accountType === "athlete") {
    return "Athlet";
  }

  if (roles.includes("medical") || accountType === "medical") {
    return "Medizinische Fachkraft";
  }

  return "Trainer";
}

function mapPerson(row: PeopleDirectoryRow): Person {
  const roles = row.roles || [];
  const states = row.states || [];
  const clubs = row.clubs || [];
  const region = [...states, ...clubs].join(" · ") || "Noch nicht zugeordnet";

  return {
    id: row.id,
    name: row.display_name,
    email: row.email,
    accountType: row.account_type,
    role: getPrimaryRole(row.account_type, roles),
    region,
    initials: createInitials(row.display_name) || "TH",
    roles,
    states,
    clubs,
    activeRelationships: row.active_relationships || [],
    pendingSent: row.pending_sent || [],
    pendingReceived: row.pending_received || [],
  };
}

/**
 * Lädt das echte Personenverzeichnis aus Supabase.
 *
 * Der Fallback nutzt die ältere Account-Verwaltungsfunktion, solange die neue
 * Verzeichnis-RPC noch nicht in die produktive Datenbank eingespielt wurde.
 */
export async function getPeopleDirectory(): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_people_directory");

  if (!error) {
    return ((data || []) as PeopleDirectoryRow[]).map(mapPerson);
  }

  if (!isMissingRpcFunction(error)) {
    throw new Error(`Personen konnten nicht geladen werden: ${error.message}`);
  }

  const { data: fallbackData, error: fallbackError } = await supabase.rpc(
    "get_assignable_profiles",
  );

  if (fallbackError) {
    if (isMissingRpcFunction(fallbackError)) {
      return [];
    }

    throw new Error(
      `Registrierte Konten konnten nicht geladen werden: ${fallbackError.message}`,
    );
  }

  return ((fallbackData || []) as AssignableProfileFallbackRow[]).map((profile) =>
    mapPerson({
      ...profile,
      roles: [],
      states: [],
      clubs: [],
      active_relationships: [],
      pending_sent: [],
      pending_received: [],
    }),
  );
}
