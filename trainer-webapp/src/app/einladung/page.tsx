import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import type { OrganizationRole } from "@/domain/models";
import { getTranslations } from "@/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

interface InvitationLookup {
  email: string;
  target_role: OrganizationRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
}

async function loadInvitation(token: string): Promise<InvitationLookup | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_account_invitation", { invitation_token: token })
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as InvitationLookup;
}

/**
 * Zeigt eine noch nicht eingelöste Konto-Einladung an.
 *
 * Die eigentliche Kontoanlage passiert weiterhin über Supabase Auth. Dadurch
 * entsteht das Profil erst, wenn die eingeladene Person sich wirklich anmeldet
 * oder registriert.
 */
export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { t } = await getTranslations();
  const { token = "" } = await searchParams;
  const invitation = token ? await loadInvitation(token) : null;
  const nextPath = `/einladung?token=${encodeURIComponent(token)}`;

  return (
    <>
      <PageHeader
        title={t("invitation.title")}
        description={t("invitation.description")}
      />
      <section className={styles.panel}>
        {invitation ? (
          <>
            <h2>{t("invitation.validTitle")}</h2>
            <p>{t("invitation.validDescription")}</p>
            <dl className={styles.details}>
              <div>
                <dt>{t("auth.email")}</dt>
                <dd>{invitation.email}</dd>
              </div>
              <div>
                <dt>{t("invitation.role")}</dt>
                <dd>{t(`organization.roles.${invitation.target_role}`)}</dd>
              </div>
            </dl>
            <div className={styles.actions}>
              <Link href={`/login?mode=register&next=${encodeURIComponent(nextPath)}`}>
                {t("auth.createAccount")}
              </Link>
              <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>
                {t("auth.login")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2>{t("invitation.invalidTitle")}</h2>
            <p>{t("invitation.invalidDescription")}</p>
            <div className={styles.actions}>
              <Link href="/login">{t("auth.login")}</Link>
            </div>
          </>
        )}
      </section>
    </>
  );
}
