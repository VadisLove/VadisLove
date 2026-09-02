import styles from "./loading.module.css";

/** Zeigt bei dynamischen Seitenwechseln sofort eine stabile Vorschau im App-Rahmen. */
export default function Loading() {
  return (
    <section className={styles.loading} role="status" aria-live="polite" aria-label="Seite wird geladen">
      <span className={styles.srOnly}>Seite wird geladen …</span>
      <div className={`${styles.block} ${styles.heading}`} />
      <div className={`${styles.block} ${styles.subheading}`} />
      <div className={styles.grid}>
        <div className={`${styles.card} ${styles.cardWide}`}>
          <div className={`${styles.block} ${styles.cardTitle}`} />
          <div className={`${styles.block} ${styles.cardLine}`} />
          <div className={`${styles.block} ${styles.cardLineShort}`} />
        </div>
        <div className={styles.card}>
          <div className={`${styles.block} ${styles.cardTitle}`} />
          <div className={`${styles.block} ${styles.cardMetric}`} />
        </div>
        <div className={`${styles.card} ${styles.cardWide}`}>
          <div className={`${styles.block} ${styles.cardTitle}`} />
          <div className={`${styles.block} ${styles.cardLine}`} />
          <div className={`${styles.block} ${styles.cardLine}`} />
        </div>
      </div>
    </section>
  );
}
