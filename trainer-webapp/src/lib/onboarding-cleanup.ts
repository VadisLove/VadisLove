export interface OnboardingCleanupResult {
  claimed: number;
  deleted: number;
  failed: number;
}

/**
 * Löscht bereits atomar beanspruchte Auth-Konten nacheinander.
 *
 * Die Funktion kennt weder Schlüssel noch E-Mail-Adressen und eignet sich
 * dadurch für deterministische Tests mit synthetischen IDs. Fehlgeschlagene
 * Löschungen bleiben in `deletion_due` und werden beim nächsten Lauf erneut
 * beansprucht.
 */
export async function deleteClaimedOnboardingAccounts(
  userIds: string[],
  deleteUser: (userId: string) => Promise<boolean>,
): Promise<OnboardingCleanupResult> {
  let deleted = 0;

  for (const userId of userIds) {
    if (await deleteUser(userId)) deleted += 1;
  }

  return {
    claimed: userIds.length,
    deleted,
    failed: userIds.length - deleted,
  };
}
