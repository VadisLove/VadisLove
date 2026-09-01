const internalRedirectBase = new URL("https://trainer-hub.invalid");
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const maximumDecodePasses = 8;

/**
 * Prüft jede Dekodierungsstufe, damit auch kodierte Hex-Ziffern wie
 * `%25%32%66` nicht später von einem Proxy in einen Slash umgewandelt werden.
 */
function hasUnsafeDecodedPath(path: string): boolean {
  let candidate = path;

  for (let pass = 0; pass < maximumDecodePasses; pass += 1) {
    if (
      candidate.startsWith("//") ||
      candidate.includes("\\") ||
      controlCharacterPattern.test(candidate)
    ) {
      return true;
    }

    if (!candidate.includes("%")) return false;

    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return false;
      candidate = decoded;
    } catch {
      return true;
    }
  }

  // Extrem verschachtelte Kodierungen werden konservativ verworfen.
  return candidate.includes("%");
}

/**
 * Gibt ausschließlich anwendungsinterne Redirect-Ziele zurück.
 *
 * Der ursprüngliche Wert bleibt erhalten, damit Query-Parameter und Fragmente
 * funktionieren. Mehrfach kodierte Pfadtrenner werden trotzdem abgelehnt, weil
 * vorgeschaltete Proxies oder Browser sie sonst später als externe URL deuten könnten.
 */
export function getSafeRedirectPath(
  value: unknown,
  fallback = "/",
): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;

  const pathOnly = value.split(/[?#]/, 1)[0];
  if (
    value.startsWith("//") ||
    controlCharacterPattern.test(value) ||
    hasUnsafeDecodedPath(pathOnly)
  ) {
    return fallback;
  }

  try {
    const resolved = new URL(value, internalRedirectBase);
    return resolved.origin === internalRedirectBase.origin ? value : fallback;
  } catch {
    return fallback;
  }
}
