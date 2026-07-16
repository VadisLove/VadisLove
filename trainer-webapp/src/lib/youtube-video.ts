const youtubeHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;

export type YoutubeVideoParseResult =
  | {
      ok: true;
      provider: "youtube";
      videoId: string;
      canonicalUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

export function isYoutubeVideoId(videoId: string) {
  return youtubeVideoIdPattern.test(videoId);
}

/**
 * Erzeugt externe Adressen ausschliesslich aus einer bereits geprueften ID.
 * Dadurch gelangt keine rohe Nutzereingabe in Links oder gespeicherte Daten.
 */
export function buildYoutubeVideoUrl(videoId: string) {
  return isYoutubeVideoId(videoId)
    ? `https://www.youtube.com/watch?v=${videoId}`
    : null;
}

/**
 * Prueft YouTube-Links ohne Netzwerkzugriff oder Weiterleitungsverfolgung.
 * Es werden nur exakte Hosts, HTTPS und bekannte Video-Pfade akzeptiert.
 */
export function parseYoutubeVideoUrl(input: string): YoutubeVideoParseResult {
  const rawValue = input.trim();
  if (!rawValue || rawValue.length > 2_048) {
    return { ok: false, error: "Bitte einen vollständigen YouTube-Link eingeben." };
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    return { ok: false, error: "Der YouTube-Link ist nicht gültig." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "YouTube-Links müssen HTTPS verwenden." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Links mit eingebetteten Zugangsdaten sind nicht erlaubt." };
  }
  if (!youtubeHosts.has(url.hostname) || url.port) {
    return { ok: false, error: "Diese YouTube-Domain wird nicht unterstützt." };
  }

  let videoId: string | null = null;
  if (url.hostname === "youtu.be") {
    const pathMatch = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);
    videoId = pathMatch?.[1] ?? null;
  } else if (url.pathname === "/watch") {
    const videoIds = url.searchParams.getAll("v");
    videoId = videoIds.length === 1 ? videoIds[0] : null;
  } else {
    // Geteilte Shorts-, Live- und Embed-Links enthalten dieselbe unveraenderte Video-ID.
    const pathMatch = url.pathname.match(
      /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/,
    );
    videoId = pathMatch?.[1] ?? null;
  }

  if (!videoId || !isYoutubeVideoId(videoId)) {
    return { ok: false, error: "Der Link enthält keine gültige YouTube-Video-ID." };
  }

  return {
    ok: true,
    provider: "youtube",
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
