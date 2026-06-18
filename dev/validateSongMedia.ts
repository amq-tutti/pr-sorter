import { config } from "../customize/config.js";
import { songList } from "../customize/songList.js";
import type { AppConfig } from "../src/app/types.js";
import { youtubeVideoId } from "../src/media/internal/urls.js";
import type { SongData } from '../src/songs';

type MediaField = "video" | "mp3" | "full";

type MediaCandidate = {
  song: SongData;
  songType?: string;
  field: MediaField;
  url: string;
};

type SongListEntryForValidation = SongData | readonly SongData[];

type MediaFailure = MediaCandidate & {
  reason: string;
};

const requestTimeoutMs = 15_000;
const validationConcurrency = 5;
const songTypes = (config as AppConfig).songTypes;

export async function validateSongMedia(): Promise<void> {
  const candidates = mediaCandidates(songList);
  const failures = await mapWithConcurrency(candidates, validationConcurrency, validateMedia);
  const invalidMedia = failures.filter((failure): failure is MediaFailure => failure !== null);

  if (!invalidMedia.length) {
    return;
  }

  throw new Error(formatMediaFailures(invalidMedia));
}

function mediaCandidates(entries: readonly SongListEntryForValidation[]): MediaCandidate[] {
  return entries.flatMap((entry) => {
    const songs = Array.isArray(entry) ? entry : [entry];
    return songs.flatMap((song, index) =>
      mediaFields.flatMap((field) => {
        const url = song[field]?.trim();
        return url ? [{ song, songType: songTypeForEntry(entry, index), field, url }] : [];
      }),
    );
  });
}

const mediaFields = ["video", "mp3", "full"] as const satisfies readonly MediaField[];

function songTypeForEntry(entry: SongListEntryForValidation, index: number): string | undefined {
  if (!Array.isArray(entry)) {
    return undefined;
  }

  return songTypes?.[index];
}

async function validateMedia(candidate: MediaCandidate): Promise<MediaFailure | null> {
  const youtubeId = youtubeVideoId(candidate.url);

  try {
    if (youtubeId) {
      await validateYoutubeVideo(youtubeId);
      return null;
    }

    await validateDirectMedia(candidate.url);
    return null;
  } catch (error) {
    return {
      ...candidate,
      reason: mediaErrorReason(error),
    };
  }
}

async function validateYoutubeVideo(videoId: string): Promise<void> {
  const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    headers: browserHeaders(),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }

  const html = await response.text();
  const playerResponse = parseYoutubePlayerResponse(html);

  if (!playerResponse) {
    throw new Error("Could not parse YouTube player response");
  }

  if (playerResponse.playabilityStatus?.status !== "OK") {
    const status = playerResponse.playabilityStatus?.status ?? "unknown";
    const reason = playerResponse.playabilityStatus?.reason;
    throw new Error(`YouTube status ${status}${reason ? `: ${reason}` : ""}`);
  }
}

async function validateDirectMedia(url: string): Promise<void> {
  const response = await fetch(url, {
    headers: {
      ...browserHeaders(),
      Range: "bytes=0-0",
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  response.body?.cancel().catch(() => undefined);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }
}

function browserHeaders(): Record<string, string> {
  return {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  };
}

type YoutubePlayerResponse = {
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
};

function parseYoutubePlayerResponse(html: string): YoutubePlayerResponse | null {
  const json = jsonAfterMarker(html, "var ytInitialPlayerResponse = ");

  if (!json) {
    return null;
  }

  try {
    return JSON.parse(json) as YoutubePlayerResponse;
  } catch {
    return null;
  }
}

function jsonAfterMarker(text: string, marker: string): string | null {
  const markerIndex = text.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  let jsonStart = markerIndex + marker.length;
  while (jsonStart < text.length && /\s/.test(text[jsonStart])) {
    jsonStart += 1;
  }

  if (text[jsonStart] !== "{") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = jsonStart; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(jsonStart, index + 1);
      }
    }
  }

  return null;
}

function mediaErrorReason(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `Timed out after ${requestTimeoutMs}ms`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  mapper: (input: Input) => Promise<Output>,
): Promise<Output[]> {
  const outputs = new Array<Output>(inputs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < inputs.length) {
      const index = nextIndex;
      nextIndex += 1;
      outputs[index] = await mapper(inputs[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker()),
  );

  return outputs;
}

function formatMediaFailures(failures: readonly MediaFailure[]): string {
  return [
    `Media validation failed for ${failures.length} URL(s):`,
    ...failures.map(
      (failure) =>
        `- [${failure.song.id}] ${failure.song.name}${failure.songType ? ` (${failure.songType})` : ""} ${failure.field}: ${failure.url}\n  ${failure.reason}`,
    ),
  ].join("\n");
}
