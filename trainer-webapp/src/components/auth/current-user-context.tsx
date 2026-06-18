"use client";

import { createContext, useContext } from "react";
import type { CurrentUser } from "@/domain/current-user";

const CurrentUserContext = createContext<CurrentUser | null>(null);

/**
 * Stellt das serverseitig geladene Profil allen Oberflächen zur Verfügung.
 */
export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser | null;
  children: React.ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={user}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
