"use client";

import { createContext, useContext } from "react";
import { words, type HubWords } from "./plan-hub-model";

/**
 * Wort-Tabelle (m/w/d) für alle Ansichten des Planbereichs. `PlanHub` füllt sie
 * mit der eigenen Anrede und der Anrede der Trainer*in; ohne Provider gilt „d“.
 */
export const HubWordsContext = createContext<HubWords>(words());

export function useWords() {
  return useContext(HubWordsContext);
}
