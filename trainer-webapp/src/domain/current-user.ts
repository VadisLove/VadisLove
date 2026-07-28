export type AccountType =
  | "unspecified"
  | "athlete"
  | "trainer"
  | "medical"
  | "guardian"
  | "organization_staff";

export interface CurrentUser {
  /** Supabase-Profil-ID; wird für eindeutige Zuordnungen in Fachansichten benötigt. */
  id: string;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  accountType: AccountType;
}
