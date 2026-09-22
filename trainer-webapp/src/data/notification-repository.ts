import type {
  CalendarFeedSubscription,
  NotificationItem,
  NotificationPreferences,
  NotificationType,
} from "@/domain/models";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export interface NotificationPreview {
  items: NotificationItem[];
  unreadCount: number;
}

const defaultPreferences: NotificationPreferences = {
  relationshipRequests: true,
  requestUpdates: true,
  groupActivity: true,
  newEvents: true,
  trainingPlans: true,
  guardianActivity: true,
};

function isMissingNotificationSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.message?.toLowerCase().includes("schema cache") ||
    error.message?.toLowerCase().includes("does not exist")
  );
}

/** Laedt die neuesten Hinweise und die exakte Zahl ungelesener Eintraege. */
export async function getNotificationPreview(limit = 6): Promise<NotificationPreview> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!currentUserId) return { items: [], unreadCount: 0 };

  const [itemsResult, countResult] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, message, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  if (
    isMissingNotificationSchema(itemsResult.error) ||
    isMissingNotificationSchema(countResult.error)
  ) {
    return { items: [], unreadCount: 0 };
  }

  if (itemsResult.error || countResult.error) {
    throw new Error(
      `Benachrichtigungen konnten nicht geladen werden: ${
        itemsResult.error?.message || countResult.error?.message
      }`,
    );
  }

  return {
    items: (itemsResult.data || []).map((item) => ({
      id: item.id,
      type: item.type as NotificationType,
      title: item.title,
      message: item.message,
      link: item.link,
      readAt: item.read_at,
      createdAt: item.created_at,
    })),
    unreadCount: countResult.count || 0,
  };
}

/** Liefert fuer noch nicht migrierte Projekte sichere Standardwerte. */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!currentUserId) return defaultPreferences;

  const { data, error } = await supabase
    .from("notification_preferences")
    .select(
      "relationship_requests, request_updates, group_activity, new_events, training_plans, guardian_activity",
    )
    .eq("user_id", currentUserId)
    .maybeSingle();

  if (isMissingNotificationSchema(error)) return defaultPreferences;
  if (error) {
    throw new Error(`Einstellungen konnten nicht geladen werden: ${error.message}`);
  }

  return data
    ? {
        relationshipRequests: data.relationship_requests,
        requestUpdates: data.request_updates,
        groupActivity: data.group_activity,
        newEvents: data.new_events,
        trainingPlans: data.training_plans,
        guardianActivity: data.guardian_activity,
      }
    : defaultPreferences;
}

/** Gibt nur Metadaten zurück; der geheime Feed-Token ist nicht rekonstruierbar. */
export async function getCalendarFeedSubscription(): Promise<CalendarFeedSubscription | null> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return null;
  const { data, error } = await supabase
    .from("calendar_feed_tokens")
    .select("id, created_at, last_used_at")
    .eq("user_id", currentUserId)
    .is("revoked_at", null)
    .maybeSingle();
  if (isMissingNotificationSchema(error)) return null;
  if (error) throw new Error(`Kalender-Abo konnte nicht geladen werden: ${error.message}`);
  return data ? { id: data.id, createdAt: data.created_at, lastUsedAt: data.last_used_at || undefined } : null;
}
