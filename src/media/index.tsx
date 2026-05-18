import type { ReactElement } from "react";
import type { Settings } from "../app/types";
import type { Song } from "../songs";
import { mediaType, normalizeAmqUrl, youtubeEmbedUrl } from "./internal/urls";

export function Media({ song, settings }: { song: Song; settings: Settings }): ReactElement {
  if (!song.video && !song.mp3 && !song.full) {
    return <div>Media not available</div>;
  }

  if (settings.mediaFormat === "full") {
    return song.full ? renderMedia(song.full, song, settings) ?? <div>Full song not available</div> : renderVideoPreference(song, settings);
  }

  if (settings.mediaFormat === "video") {
    return renderVideoPreference(song, settings);
  }

  return renderAudioPreference(song, settings);
}

function renderVideoPreference(song: Song, settings: Settings): ReactElement {
  if (song.video) {
    return renderVideo(song.video, song, settings);
  }

  if (song.mp3) {
    return renderAudio(song.mp3, song, settings);
  }

  return <div>Video not available</div>;
}

function renderAudioPreference(song: Song, settings: Settings): ReactElement {
  if (song.mp3) {
    return renderAudio(song.mp3, song, settings);
  }

  if (song.video) {
    return renderVideo(song.video, song, settings);
  }

  return <div>Audio not available</div>;
}

function renderVideo(url: string, song: Song, settings: Settings): ReactElement {
  const media = renderMedia(url, song, settings);
  return media ?? <div>Video not available</div>;
}

function renderMedia(url: string, song: Song, settings: Settings): ReactElement | null {
  const youtubeUrl = youtubeEmbedUrl(url);
  if (youtubeUrl !== null) {
    return <iframe src={youtubeUrl} allowFullScreen title={`${song.name} video`} />;
  }

  if (url.endsWith(".webm") || url.endsWith(".mp4")) {
    const src = normalizeAmqUrl(url, settings);
    return (
      <video controls>
        <source src={src} type={mediaType(src, "video/webm")} />
      </video>
    );
  }

  if (url.endsWith(".mp3")) {
    return renderAudio(url, song, settings);
  }

  return null;
}

function renderAudio(url: string, song: Song, settings: Settings): ReactElement {
  const src = normalizeAmqUrl(url, settings);
  return (
    <audio controls title={`${song.name} audio`}>
      <source src={src} type={mediaType(src, "audio/mp3")} />
    </audio>
  );
}
