"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  controlClassName: string;
  toggleClassName: string;
}

/**
 * Bietet für sensible Passwortfelder eine bewusst lokale Sichtbarkeitsumschaltung.
 * Der eingegebene Wert bleibt ausschließlich im Browserfeld und wird weder
 * gespeichert noch an einen zusätzlichen Dienst weitergegeben.
 */
export function PasswordInput({
  controlClassName,
  toggleClassName,
  ...inputProps
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const actionLabel = isVisible ? "Passwort verbergen" : "Passwort anzeigen";

  return (
    <span className={controlClassName}>
      <input {...inputProps} type={isVisible ? "text" : "password"} />
      <button
        type="button"
        className={toggleClassName}
        aria-label={actionLabel}
        aria-pressed={isVisible}
        title={actionLabel}
        onClick={() => setIsVisible((visible) => !visible)}
      >
        {isVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  );
}
