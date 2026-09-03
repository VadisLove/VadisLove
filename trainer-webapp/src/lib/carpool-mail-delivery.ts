/** Transportunabhängiger Versand: feste Idempotenzschlüssel überleben Timeouts
 * und Neustarts. Ein Versandfehler verändert niemals die eigentliche Buchung. */
export interface CarpoolMailJob {
  id: string;
  email: string;
  subject: string;
  body: string;
  link: string;
  lease_id: string;
}
export async function deliverCarpoolMail(
  jobs: CarpoolMailJob[],
  send: (job: CarpoolMailJob, idempotencyKey: string) => Promise<boolean>,
  finish: (job: CarpoolMailJob, success: boolean) => Promise<void>,
) {
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    let success = false;
    try {
      success = await send(job, `carpool-${job.id}`);
    } catch {
      /* Die Lease wird für einen späteren Versuch freigegeben. */
    }
    try {
      await finish(job, success);
    } catch {
      /* Bei DB-Ausfall läuft die Lease ab; derselbe Versand-Key bleibt erhalten. */ success = false;
    }
    if (success) sent++;
    else failed++;
  }
  return { sent, failed };
}
