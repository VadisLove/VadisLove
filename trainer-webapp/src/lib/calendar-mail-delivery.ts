export interface CalendarMailJob {
  id: string;
  email: string;
  subject: string;
  body: string;
  link: string;
  lease_id: string;
}

/** Der stabile Schlüssel verhindert Doppelversand bei Timeout und Worker-Neustart. */
export async function deliverCalendarMail(
  jobs: CalendarMailJob[],
  send: (job: CalendarMailJob, idempotencyKey: string) => Promise<boolean>,
  finish: (job: CalendarMailJob, success: boolean) => Promise<void>,
) {
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    let success = false;
    try {
      success = await send(job, `calendar-${job.id}`);
    } catch {
      // Die Datenbank-Lease stellt denselben Job mit demselben Schlüssel erneut bereit.
    }
    try {
      await finish(job, success);
    } catch {
      success = false;
    }
    if (success) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}
