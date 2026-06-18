export type AccountType =
  | "unspecified"
  | "athlete"
  | "trainer"
  | "medical"
  | "guardian"
  | "organization_staff";

export interface CurrentUser {
  displayName: string;
  initials: string;
  accountType: AccountType;
}
