import Image from "next/image";
import { redirect } from "next/navigation";
import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";
import { restoreAccount } from "@/app/profil/actions";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

export default async function RecoverAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) redirect("/login?next=/konto-wiederherstellen");

  const [{ data: deletion }, params] = await Promise.all([
    supabase
      .from("account_deletion_requests")
      .select("status, scheduled_for")
      .eq("user_id", userId)
      .maybeSingle(),
    searchParams,
  ]);

  if (deletion?.status !== "scheduled") redirect("/profil");

  const scheduledDate = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(deletion.scheduled_for));

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <Image
            src="/brand/sksb-logo.webp"
            alt="Skateboard Deutschland SKSB"
            width={64}
            height={64}
            priority
          />
          <div>
            <span>Trainer Hub</span>
            <h1>Profil deaktiviert</h1>
          </div>
        </div>

        <div className={styles.warning}>
          <AlertTriangle size={22} />
          <div>
            <strong>Wiederherstellung bis {scheduledDate}</strong>
            <p>
              Bis zu diesem Datum bleiben deine Profilangaben sicher gesperrt.
              Danach werden personenbezogene Daten endgültig gelöscht oder
              rechtskonform anonymisiert.
            </p>
          </div>
        </div>

        {params.error ? <p className={styles.error} role="alert">{params.error}</p> : null}

        <div className={styles.explanation}>
          <ShieldCheck size={22} />
          <p>
            Mit der Wiederherstellung werden Profil, Vereinsmitgliedschaften und
            Berechtigungen sofort wieder aktiviert. Deine bisherigen Daten wurden
            während der Frist nicht verändert.
          </p>
        </div>

        <form action={restoreAccount}>
          <button type="submit">
            <RotateCcw size={19} />
            Profil jetzt wiederherstellen
          </button>
        </form>
      </section>
    </main>
  );
}
