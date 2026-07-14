"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

/** Markiert einen einzelnen Hinweis als gelesen; RLS begrenzt das Update auf den Besitzer. */
export async function markNotificationRead(notificationId: string) {
  if (!notificationId) return;

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", currentUserId);

  revalidatePath("/", "layout");
}

/** Markiert alle aktuell ungelesenen Hinweise in einer einzigen Query. */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", currentUserId)
    .is("read_at", null);

  revalidatePath("/", "layout");
}
