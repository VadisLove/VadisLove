import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createPersonalCalendarIcs, type CalendarFeedEvent } from "@/lib/calendar-ics";

export const runtime = "nodejs";

/** Öffentlicher Feed-Zugriff ausschließlich über ein starkes, gehasht gespeichertes Token. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response("Not found", { status: 404 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return new Response("Unavailable", { status: 503 });

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: subscription } = await client
    .from("calendar_feed_tokens")
    .select("id, user_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (!subscription) return new Response("Not found", { status: 404 });

  const { data: profile } = await client
    .from("profiles")
    .select("email")
    .eq("id", subscription.user_id)
    .maybeSingle();
  const normalizedEmail = profile?.email?.trim().toLowerCase() || "";
  // Getrennte parametrisierte Filter vermeiden, dass Sonderzeichen einer
  // legitimen E-Mail-Adresse als PostgREST-Filtersyntax interpretiert werden.
  const [userParticipants, emailParticipants] = await Promise.all([
    client.from("event_participants").select("event_id, status")
      .eq("user_id", subscription.user_id),
    normalizedEmail
      ? client.from("event_participants").select("event_id, status")
        .eq("invited_email", normalizedEmail)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (userParticipants.error || emailParticipants.error) {
    return new Response("Unavailable", { status: 503 });
  }
  const attendanceByEvent = new Map(
    [...(emailParticipants.data || []), ...(userParticipants.data || [])]
      .map((row) => [row.event_id, row.status]),
  );
  const participantIds = [...attendanceByEvent.keys()];
  const eventSelect = "id, created_by, title, description, starts_at, ends_at, location, status, cancelled_feed_until, communication_revision, event_information_links(id,label,url,sort_order)";
  const [createdEvents, participatingEvents] = await Promise.all([
    client.from("events").select(eventSelect).eq("created_by", subscription.user_id),
    participantIds.length
      ? client.from("events").select(eventSelect).in("id", participantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (createdEvents.error || participatingEvents.error) {
    return new Response("Unavailable", { status: 503 });
  }
  const rows = [...new Map(
    [...(createdEvents.data || []), ...(participatingEvents.data || [])]
      .map((row) => [row.id, row]),
  ).values()].sort((left, right) => left.starts_at.localeCompare(right.starts_at));

  const now = Date.now();
  const events: CalendarFeedEvent[] = rows
    .filter((row) => {
      const attendance = attendanceByEvent.get(row.id);
      if (row.created_by !== subscription.user_id && attendance === "declined") return false;
      if (row.status === "cancelled") {
        return row.cancelled_feed_until && new Date(row.cancelled_feed_until).getTime() >= now;
      }
      return row.created_by === subscription.user_id || attendance === "open" || attendance === "confirmed";
    })
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      location: row.location,
      status: row.status as "scheduled" | "cancelled",
      revision: row.communication_revision,
      attendanceStatus: attendanceByEvent.get(row.id),
      isCreator: row.created_by === subscription.user_id,
      informationLinks: (row.event_information_links || [])
        .map((link) => ({
          id: link.id,
          label: link.label,
          url: link.url,
          sortOrder: link.sort_order,
        }))
        .sort((left, right) => left.sortOrder - right.sortOrder),
    }));

  await client.from("calendar_feed_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", subscription.id);

  return new Response(createPersonalCalendarIcs(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="trainer-hub.ics"',
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
