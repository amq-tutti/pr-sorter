import type { Settings } from "../../app/types";

export function normalizeAmqUrl(url: string, settings: Settings): string {
  if (!url.includes("animemusicquiz")) {
    return url;
  }

  const fileName = url.split("/").pop();
  return fileName ? `https://${settings.region}dist.animemusicquiz.com/${fileName}` : url;
}

export function mediaType(url: string, fallback: string): string {
  if (url.endsWith(".mp4")) {
    return "video/mp4";
  }

  if (url.endsWith(".webm")) {
    return "video/webm";
  }

  if (url.endsWith(".mp3")) {
    return "audio/mp3";
  }

  return fallback;
}

export function youtubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }

    if (parsed.hostname.endsWith("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}
