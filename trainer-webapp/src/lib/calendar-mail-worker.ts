import "server-only";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { deliverCalendarMail, type CalendarMailJob } from "@/lib/calendar-mail-delivery";

/** Separater Kalender-Worker mit derselben Lease-/Retry-Strategie wie Fahrtenmails. */
export async function runCalendarMailWorker() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!url || !serviceKey || !apiKey || !from || !baseUrl) {
    throw new Error("CALENDAR_MAIL_NOT_CONFIGURED");
  }
  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("CALENDAR_MAIL_INVALID_ORIGIN");
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("calendar_claim_mail");
  if (error) throw new Error("CALENDAR_MAIL_CLAIM_FAILED");
  const resend = new Resend(apiKey);
  return deliverCalendarMail(
    (data || []) as CalendarMailJob[],
    async (job, key) => {
      if (!/^\/(?:kalender\?event=[0-9a-f-]{36}|postfach)$/i.test(job.link)) return false;
      const { error: sendError } = await resend.emails.send({
        from,
        to: job.email,
        subject: job.subject,
        text: `${job.body}\n\n${new URL(job.link, origin).toString()}`,
      }, { idempotencyKey: key });
      return !sendError;
    },
    async (job, success) => {
      const { error: finishError } = await client.rpc("calendar_finish_mail", {
        target: job.id,
        lease: job.lease_id,
        success,
      });
      if (finishError) throw new Error("CALENDAR_MAIL_FINISH_FAILED");
    },
  );
}
