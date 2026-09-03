import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";
import { getPublicGuardianApproval } from "@/data/guardian-approval-repository";
import { GuardianApprovalForm } from "./guardian-approval-form";
import styles from "./page.module.css";

interface GuardianApprovalPageProps {
  searchParams: Promise<{ token?: string; result?: string }>;
}

export default async function GuardianApprovalPage({
  searchParams,
}: GuardianApprovalPageProps) {
  const { token = "", result = "" } = await searchParams;
  const approval = await getPublicGuardianApproval(token);
  const completedResult = result === "approved" || approval?.status === "approved"
    ? "approved"
    : result === "rejected" || approval?.status === "rejected"
      ? "rejected"
      : null;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.brand}>
          <Image src="/brand/sksb-logo.webp" alt="Skateboard Deutschland SKSB" width={62} height={62} />
          <div><span>Trainer Hub</span><h1>Elternfreigabe</h1></div>
        </header>

        {completedResult === "approved" ? (
          <div className={styles.result}>
            <CheckCircle2 size={42} />
            <h2>Registrierung freigegeben</h2>
            <p>Das Konto kann jetzt nach der E-Mail-Bestätigung genutzt werden.</p>
          </div>
        ) : completedResult === "rejected" ? (
          <div className={`${styles.result} ${styles.rejected}`}>
            <XCircle size={42} />
            <h2>Anfrage abgelehnt</h2>
            <p>Das minderjährige Konto bleibt gesperrt.</p>
          </div>
        ) : !approval ? (
          <div className={`${styles.result} ${styles.rejected}`}>
            <XCircle size={42} />
            <h2>Link nicht gefunden</h2>
            <p>Der Freigabelink ist ungültig oder wurde ersetzt.</p>
          </div>
        ) : approval.expired ? (
          <div className={styles.result}>
            <Clock3 size={42} />
            <h2>Link abgelaufen</h2>
            <p>{approval.minorDisplayName} kann nach der Anmeldung einen neuen Link versenden.</p>
          </div>
        ) : (
          <>
            <div className={styles.intro}>
              <ShieldCheck size={28} />
              <div>
                <h2>Registrierung von {approval.minorDisplayName}</h2>
                <p>
                  Bitte prüfe die Anfrage. Ohne deine Bestätigung bleibt der
                  Zugang zu Vereins-, Verbands- und Trainingsdaten gesperrt.
                </p>
              </div>
            </div>
            {result === "invalid" || result === "error" ? (
              <p className={styles.error}>
                Die Antwort konnte nicht gespeichert werden. Bitte prüfe alle Angaben und versuche es erneut.
              </p>
            ) : null}
            <GuardianApprovalForm token={token} />
          </>
        )}

        <footer>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/nutzungsbedingungen">Nutzungsbedingungen</Link>
          <Link href="/impressum">Impressum</Link>
        </footer>
      </section>
    </main>
  );
}
