import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { legalDocumentsAreDrafts } from "@/lib/legal-documents";
import styles from "./legal-page.module.css";

interface LegalPageProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

/** Einheitlicher, jederzeit oeffentlich erreichbarer Rahmen fuer Rechtstexte. */
export function LegalPage({ eyebrow, title, description, children }: LegalPageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/login" className={styles.brand}>
          <Image
            src="/brand/sksb-logo.webp"
            alt="Skateboard Deutschland SKSB"
            width={48}
            height={48}
          />
          <span>Trainer Hub</span>
        </Link>
        <Link href="/login" className={styles.backLink}>
          <ArrowLeft size={17} /> Zur Anmeldung
        </Link>
      </header>

      <main className={styles.main}>
        <header className={styles.hero}>
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>

        {legalDocumentsAreDrafts ? (
          <aside className={styles.draftNotice} role="status">
            <AlertTriangle size={22} />
            <div>
              <strong>Noch nicht zur Veröffentlichung freigegeben</strong>
              <p>
                Der rechtliche Betreiber und dessen Kontaktdaten stehen noch nicht
                fest. Dieser Entwurf muss vor dem Produktionsstart vervollständigt
                und fachlich geprüft werden.
              </p>
            </div>
          </aside>
        ) : null}

        <article className={styles.document}>{children}</article>
      </main>

      <footer className={styles.footer}>
        <Link href="/impressum">Impressum</Link>
        <Link href="/datenschutz">Datenschutz</Link>
        <Link href="/nutzungsbedingungen">Nutzungsbedingungen</Link>
      </footer>
    </div>
  );
}
