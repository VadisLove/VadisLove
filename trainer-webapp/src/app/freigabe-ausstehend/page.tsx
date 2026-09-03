import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, LogOut, Mail, RotateCw, ShieldAlert } from "lucide-react";
import { resendGuardianApprovalEmail } from "@/app/elternfreigabe/actions";
import { logout } from "@/app/login/actions";
import { getOwnGuardianApproval } from "@/data/guardian-approval-repository";
import styles from "./page.module.css";

export default async function PendingGuardianApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ mail?: string }>;
}) {
  const { mail } = await searchParams;
  const approval = await getOwnGuardianApproval();
  if (!approval || approval.status === "approved") redirect("/");

  const rejected = approval.status === "rejected";

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.brand}>
          <Image src="/brand/sksb-logo.webp" alt="Skateboard Deutschland SKSB" width={58} height={58} />
          <div><span>Trainer Hub</span><h1>Freigabe erforderlich</h1></div>
        </header>

        <div className={rejected ? styles.rejectedIcon : styles.icon}>
          {rejected ? <ShieldAlert size={34} /> : <Clock3 size={34} />}
        </div>
        <h2>{rejected ? "Registrierung wurde abgelehnt" : "Wir warten auf die Elternfreigabe"}</h2>
        <p>
          {rejected
            ? "Die angegebene erziehungsberechtigte Person hat die Anfrage abgelehnt. Das Konto bleibt gesperrt."
            : `Der Freigabelink wurde an ${approval.guardianEmail} gesendet. Bis zur Bestätigung bleiben Vereins-, Verbands- und Trainingsdaten geschützt.`}
        </p>

        {mail === "sent" ? (
          <div className={styles.success}><Mail size={18} /> Freigabelink wurde versendet.</div>
        ) : null}
        {mail === "failed" ? (
          <div className={styles.error}>
            Der Mailversand ist noch nicht konfiguriert oder vorübergehend fehlgeschlagen.
          </div>
        ) : null}
        {approval.expired && !rejected ? (
          <div className={styles.error}>Der bisherige Link ist abgelaufen. Bitte versende einen neuen.</div>
        ) : null}

        {!rejected ? (
          <form action={resendGuardianApprovalEmail}>
            <button type="submit" className={styles.primaryButton}>
              <RotateCw size={18} /> Freigabelink erneut senden
            </button>
          </form>
        ) : null}

        <form action={logout}>
          <button type="submit" className={styles.logoutButton}>
            <LogOut size={18} /> Abmelden
          </button>
        </form>

        <footer>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/nutzungsbedingungen">Nutzungsbedingungen</Link>
          <Link href="/impressum">Impressum</Link>
        </footer>
      </section>
    </main>
  );
}
