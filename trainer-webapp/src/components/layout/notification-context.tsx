"use client";

import { createContext, useContext } from "react";
import type { NotificationPreview } from "@/data/notification-repository";

const emptyPreview: NotificationPreview = { items: [], unreadCount: 0 };
const NotificationContext = createContext<NotificationPreview>(emptyPreview);

/** Teilt die serverseitig geladene Vorschau mit Desktop- und Mobile-Kopfzeile. */
export function NotificationProvider({
  preview,
  children,
}: {
  preview: NotificationPreview;
  children: React.ReactNode;
}) {
  return (
    <NotificationContext.Provider value={preview}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationPreview() {
  return useContext(NotificationContext);
}
