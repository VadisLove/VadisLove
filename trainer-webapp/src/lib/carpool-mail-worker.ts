import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  deliverCarpoolMail,
  type CarpoolMailJob,
} from "./carpool-mail-delivery";

/** Ausschließlich vom geheimnisgeschützten Worker aufrufen. Der Dienstschlüssel
 * wird niemals mit dem Benutzerclient oder an den Browser weitergegeben. */
export async function runCarpoolMailWorker() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!url || !serviceKey || !apiKey || !from || !baseUrl)
    throw new Error("CARPOOL_MAIL_NOT_CONFIGURED");
  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:" && process.env.NODE_ENV === "production")
    throw new Error("CARPOOL_MAIL_INVALID_ORIGIN");
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("carpool_claim_mail");
  if (error) throw new Error("CARPOOL_MAIL_CLAIM_FAILED");
  const resend = new Resend(apiKey);
  return deliverCarpoolMail(
    (data || []) as CarpoolMailJob[],
    async (job, key) => {
      // Ein Datenbankeintrag darf weder externe Links noch fremde Pfade einschleusen.
      if (!/^\/fahrgemeinschaften\?ride=[0-9a-f-]{36}$/i.test(job.link))
        return false;
      const { error: sendError } = await resend.emails.send(
        {
          from,
          to: job.email,
          subject: job.subject,
          text: `${job.body}\n\n${new URL(job.link, origin).toString()}`,
        },
        { idempotencyKey: key },
      );
      return !sendError;
    },
    async (job, success) => {
      const { error: finishError } = await client.rpc("carpool_finish_mail", {
        target: job.id,
        lease: job.lease_id,
        success,
      });
      if (finishError) throw new Error("CARPOOL_MAIL_FINISH_FAILED");
    },
  );
}
