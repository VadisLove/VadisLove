"use server";
import { getLocale } from "@/i18n/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import {
  carpoolErrorCode,
  carpoolOperations,
  isCarpoolId,
  type RideOperation,
} from "@/domain/carpools";

/** Die RPC prüft jeden Befehl erneut und schreibt Zustand + Versandauftrag atomar. */
export async function changeCarpool(
  commandId: string,
  operation: RideOperation,
  payload: Record<string, unknown>,
): Promise<{ error?: string }> {
  if (
    !isCarpoolId(commandId) ||
    !carpoolOperations.has(operation) ||
    !payload ||
    JSON.stringify(payload).length > 16000
  )
    return { error: "invalid" };
  const client = await createClient();
  if (!(await getAuthenticatedUserId(client))) return { error: "forbidden" };
  const { error } = await client.rpc("carpool_command", {
    command_id: commandId,
    operation,
    payload: { ...payload, locale: await getLocale() },
  });
  if (error) return { error: carpoolErrorCode(error) };
  revalidatePath("/fahrgemeinschaften");
  revalidatePath("/kalender");
  revalidatePath("/einstellungen");
  revalidatePath("/", "layout");
  return {};
}
