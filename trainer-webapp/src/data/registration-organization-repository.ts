import { createClient } from "@/lib/supabase/server";

export interface RegistrationOrganization {
  id: string;
  name: string;
  level: "state" | "club";
  stateCode: string;
  regionName: string;
  parentName: string;
}

interface RegistrationOrganizationRow {
  id: string;
  name: string;
  level: "state" | "club";
  state_code: string | null;
  region_name: string | null;
  parent_name: string | null;
}

/**
 * Lädt die bewusst öffentliche Organisationsauswahl für die Registrierung.
 * Die Datenbankfunktion gibt keine internen Felder oder Mitgliedschaften aus.
 */
export async function getRegistrationOrganizations(): Promise<RegistrationOrganization[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_registration_organizations");

  if (error || !data) return [];

  return (data as RegistrationOrganizationRow[]).map((organization) => ({
    id: organization.id,
    name: organization.name,
    level: organization.level,
    stateCode: organization.state_code || "",
    regionName: organization.region_name || "",
    parentName: organization.parent_name || "",
  }));
}
