import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import type { MediaFormat, Settings } from '../app/types';
import type { SongData } from '../songs';
import { mediaType, normalizeAmqUrl, urlExtension, youtubeVideoId } from './internal/urls';

type MediaField = 'video' | 'mp3' | 'full';

const mediaPriorities: Record<MediaFormat, MediaField[]> = {
    video: ['video', 'mp3', 'full'],
    audio: ['mp3', 'video', 'full'],
    full: ['full', 'video', 'mp3'],
};

type MediaProps = {
    song: SongData;
    settings: Settings;
    autoPlay?: boolean;
    paused?: boolean;
    onPlay?: () => void;
    onPause?: () => void;
    onEnded?: () => void;
};

export function Media({song, settings, autoPlay = false, paused = false, onPlay, onPause, onEnded}: MediaProps): ReactElement {
    if (!song.video && !song.mp3 && !song.full) {
        return <div>Media not available</div>;
    }

    for (const field of mediaPriorities[settings.mediaFormat]) {
        const url = song[field];
        if (!url) {
            continue;
        }

        const media = renderMedia(url, song, settings, {autoPlay, paused, onPlay, onPause, onEnded});
        if (media !== null) {
            return media;
        }
    }

    return <div>Media not available</div>;
}

function renderMedia(
    url: string,
    song: SongData,
    settings: Settings,
    options: Pick<MediaProps, 'autoPlay' | 'paused' | 'onPlay' | 'onPause' | 'onEnded'>,
): ReactElement | null {
    const youtubeId = youtubeVideoId(url);
    if (youtubeId !== null) {
        return (
            <YouTubePlayer
                videoId={youtubeId}
                title={`${song.name} video`}
                autoPlay={options.autoPlay}
                paused={options.paused}
                onPlay={options.onPlay}
                onPause={options.onPause}
                onEnded={options.onEnded}
            />
        );
    }

    const extension = urlExtension(url);
    if (extension === '.webm' || extension === '.mp4') {
        const src = normalizeAmqUrl(url, settings);
        return (
            <NativeMedia
                kind="video"
                src={src}
                type={mediaType(src, 'video/webm')}
                autoPlay={options.autoPlay}
                paused={options.paused}
                onPlay={options.onPlay}
                onPause={options.onPause}
                onEnded={options.onEnded}
            />
        );
    }

    if (extension === '.mp3') {
        const src = normalizeAmqUrl(url, settings);
        return (
            <NativeMedia
                kind="audio"
                src={src}
                type={mediaType(src, 'audio/mp3')}
                autoPlay={options.autoPlay}
                paused={options.paused}
                title={`${song.name} audio`}
                onPlay={options.onPlay}
                onPause={options.onPause}
                onEnded={options.onEnded}
            />
        );
    }

    return null;
}

type YouTubePlayerProps = {
    videoId: string;
    title: string;
    autoPlay?: boolean;
    paused?: boolean;
    onPlay?: () => void;
    onPause?: () => void;
    onEnded?: () => void;
};

type YouTubePlayerInstance = {
    destroy(): void;
    playVideo(): void;
    pauseVideo(): void;
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
        PLAYING: number;
        PAUSED: number;
    };
};

declare global {
    interface Window {
        YT?: YouTubeApi;
        onYouTubeIframeAPIReady?: () => void;
    }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

type NativeMediaProps = {
    kind: 'video' | 'audio';
    src: string;
    type: string;
    autoPlay?: boolean;
    paused?: boolean;
    title?: string;
    onPlay?: () => void;
    onPause?: () => void;
    onEnded?: () => void;
};

function NativeMedia({kind, src, type, autoPlay = false, paused = false, title, onPlay, onPause, onEnded}: NativeMediaProps): ReactElement {
    const mediaRef = useRef<HTMLMediaElement | null>(null);

    useEffect(() => {
        if (paused) {
            mediaRef.current?.pause();
        }
    }, [paused]);

    useEffect(() => {
        if (!autoPlay || paused) {
            return;
        }

        void mediaRef.current?.play().catch(() => {
            // Browser autoplay policy can reject playback; the visible controls remain usable.
        });
    }, [autoPlay, paused]);

    const handleEnded = () => {
        onPause?.();
        onEnded?.();
    };

    if (kind === 'video') {
        return (
            <video
                ref={(element) => {
                    mediaRef.current = element;
                }}
                controls
                autoPlay={autoPlay}
                onPlay={onPlay}
                onPause={onPause}
                onEnded={handleEnded}
                title={title}
            >
                <source src={src} type={type}/>
            </video>
        );
    }

    return (
        <audio
            ref={(element) => {
                mediaRef.current = element;
            }}
            controls
            autoPlay={autoPlay}
            onPlay={onPlay}
            onPause={onPause}
            onEnded={handleEnded}
            title={title}
        >
            <source src={src} type={type}/>
        </audio>
    );
}

function YouTubePlayer({videoId, title, autoPlay = false, paused = false, onPlay, onPause, onEnded}: YouTubePlayerProps): ReactElement {
    const reactId = useId();
    const domId = `youtube-player-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const mountRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<YouTubePlayerInstance | null>(null);
    const onPlayRef = useRef(onPlay);
    const onPauseRef = useRef(onPause);
    const onEndedRef = useRef(onEnded);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        onPlayRef.current = onPlay;
    }, [onPlay]);

    useEffect(() => {
        onPauseRef.current = onPause;
    }, [onPause]);

    useEffect(() => {
        onEndedRef.current = onEnded;
    }, [onEnded]);

    useEffect(() => {
        if (paused) {
            safelyControlYouTubePlayer(playerRef.current, (player) => player.pauseVideo());
        }
    }, [paused]);

    useEffect(() => {
        let canceled = false;
        const mount = mountRef.current;
        if (!mount) {
            return undefined;
        }

        const playerElement = document.createElement('div');
        safelyReplaceChildren(mount, playerElement);

        setFailed(false);

        void loadYouTubeApi().then((api) => {
            if (canceled) {
                return;
            }

            try {
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
                                safelyControlYouTubePlayer(event.target, (player) => player.playVideo());
                            }
                        },
                        onStateChange(event) {
                            if (event.data === api.PlayerState.PLAYING) {
                                onPlayRef.current?.();
                            }

                            if (event.data === api.PlayerState.PAUSED) {
                                onPauseRef.current?.();
                            }

                            if (event.data === api.PlayerState.ENDED) {
                                onPauseRef.current?.();
                                onEndedRef.current?.();
                            }
                        },
                    },
                });
            } catch (error) {
                console.error('YouTube player failed to initialize:', error);
                setFailed(true);
            }
        }).catch((error: unknown) => {
            console.error('YouTube iframe API failed to load:', error);
            if (!canceled) {
                setFailed(true);
            }
        });

        return () => {
            canceled = true;
            safelyControlYouTubePlayer(playerRef.current, (player) => player.destroy());
            playerRef.current = null;
            safelyReplaceChildren(mount);
        };
    }, [autoPlay, videoId]);

    if (failed) {
        return <div>Media not available</div>;
    }

    return <div id={domId} className="youtube-player" ref={mountRef} aria-label={title}/>;
}

function safelyControlYouTubePlayer(player: YouTubePlayerInstance | null, action: (player: YouTubePlayerInstance) => void): void {
    if (!player) {
        return;
    }

    try {
        action(player);
    } catch (error) {
        console.error('YouTube player operation failed:', error);
    }
}

function safelyReplaceChildren(element: Element, ...nodes: Node[]): void {
    try {
        element.replaceChildren(...nodes);
    } catch (error) {
        console.error('YouTube player DOM cleanup failed:', error);
    }
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
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            script.async = true;
            document.head.appendChild(script);
        }
    });

    return youtubeApiPromise;
}
