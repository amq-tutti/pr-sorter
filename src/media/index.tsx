import { useEffect, useId, useRef, type ReactElement } from "react";
import type { MediaFormat, Settings } from "../app/types";
import type { Song } from "../songs";
import { mediaType, normalizeAmqUrl, urlExtension, youtubeVideoId } from "./internal/urls";

type MediaField = "video" | "mp3" | "full";

const mediaPriorities: Record<MediaFormat, MediaField[]> = {
  video: ["video", "mp3", "full"],
  audio: ["mp3", "video", "full"],
  full: ["full", "video", "mp3"],
};

type MediaProps = {
  song: Song;
  settings: Settings;
  autoPlay?: boolean;
  onEnded?: () => void;
};

export function Media({ song, settings, autoPlay = false, onEnded }: MediaProps): ReactElement {
  if (!song.video && !song.mp3 && !song.full) {
    return <div>Media not available</div>;
  }

  for (const field of mediaPriorities[settings.mediaFormat]) {
    const url = song[field];
    if (!url) {
      continue;
    }

    const media = renderMedia(url, song, settings, { autoPlay, onEnded });
    if (media !== null) {
      return media;
    }
  }

  return <div>Media not available</div>;
}

function renderMedia(url: string, song: Song, settings: Settings, options: Pick<MediaProps, "autoPlay" | "onEnded">): ReactElement | null {
  const youtubeId = youtubeVideoId(url);
  if (youtubeId !== null) {
    return <YouTubePlayer videoId={youtubeId} title={`${song.name} video`} autoPlay={options.autoPlay} onEnded={options.onEnded} />;
  }

  const extension = urlExtension(url);
  if (extension === ".webm" || extension === ".mp4") {
    const src = normalizeAmqUrl(url, settings);
    return (
      <video controls autoPlay={options.autoPlay} onEnded={options.onEnded}>
        <source src={src} type={mediaType(src, "video/webm")} />
      </video>
    );
  }

  if (extension === ".mp3") {
    const src = normalizeAmqUrl(url, settings);
    return (
      <audio controls autoPlay={options.autoPlay} onEnded={options.onEnded} title={`${song.name} audio`}>
        <source src={src} type={mediaType(src, "audio/mp3")} />
      </audio>
    );
  }

  return null;
}

type YouTubePlayerProps = {
  videoId: string;
  title: string;
  autoPlay?: boolean;
  onEnded?: () => void;
};

type YouTubePlayerInstance = {
  destroy(): void;
  playVideo(): void;
};

type YouTubePlayerEvent = {
  data: number;
};

type YouTubeConstructor = new (
  element: HTMLElement,
  options: {
    videoId: string;
    playerVars: {
      autoplay: 0 | 1;
      modestbranding: 1;
      rel: 0;
    };
    events: {
      onReady(event: { target: YouTubePlayerInstance }): void;
      onStateChange(event: YouTubePlayerEvent): void;
    };
  },
) => YouTubePlayerInstance;

type YouTubeApi = {
  Player: YouTubeConstructor;
  PlayerState: {
    ENDED: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function YouTubePlayer({ videoId, title, autoPlay = false, onEnded }: YouTubePlayerProps): ReactElement {
  const reactId = useId();
  const domId = `youtube-player-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    let canceled = false;
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    const playerElement = document.createElement("div");
    mount.replaceChildren(playerElement);

    void loadYouTubeApi().then((api) => {
      if (canceled) {
        return;
      }

      playerRef.current = new api.Player(playerElement, {
        videoId,
        playerVars: {
          autoplay: autoPlay ? 1 : 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady(event) {
            if (autoPlay) {
              event.target.playVideo();
            }
          },
          onStateChange(event) {
            if (event.data === api.PlayerState.ENDED) {
              onEndedRef.current?.();
            }
          },
        },
      });
    });

    return () => {
      canceled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      mount.replaceChildren();
    };
  }, [autoPlay, videoId]);

  return <div id={domId} className="youtube-player" ref={mountRef} aria-label={title} />;
}

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) {
        resolve(window.YT);
      }
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}
