import type { Settings } from "../../app/types";

export function normalizeAmqUrl(url: string, settings: Settings): string {
  if (!url.includes("animemusicquiz")) {
    return url;
  }

  const fileName = url.split("/").pop();
  return fileName ? `https://${settings.region}dist.animemusicquiz.com/${fileName}` : url;
}

export function mediaType(url: string, fallback: string): string {
  const extension = urlExtension(url);
  if (extension === ".mp4") {
    return "video/mp4";
  }

  if (extension === ".webm") {
    return "video/webm";
  }

  if (extension === ".mp3") {
    return "audio/mp3";
  }

  return fallback;
}

export function urlExtension(url: string): string {
  const path = urlPath(url).toLowerCase();
  const dotIndex = path.lastIndexOf(".");
  return dotIndex === -1 ? "" : path.slice(dotIndex);
}

function urlPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/, 1)[0];
  }
}

export function youtubeEmbedUrl(url: string, options?: { autoplay?: boolean }): string | null {
  const id = youtubeVideoId(url);
  if (!id) {
    return null;
  }

  const params = new URLSearchParams();
  if (options?.autoplay) {
    params.set("autoplay", "1");
  }

  const query = params.toString();
  return `https://www.youtube-nocookie.com/embed/${id}${query ? `?${query}` : ""}`;
}

export function visibleUrl(url: string): string {
  const id = youtubeVideoId(url);
  return id ? `https://music.youtube.com/watch?v=${id}` : url;
}

export function youtubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      return parsed.pathname.slice(1).split("/")[0] || null;
    }

    if (hostname.endsWith("youtube.com")) {
      if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null;
      }

      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }

  return null;
}
