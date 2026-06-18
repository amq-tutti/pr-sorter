import { useState } from 'react';
import { Media } from '../../media';
import type { CurrentSongSortInfo, SortChoice } from '../../sorter';
import type { ResolvedSong } from '../../songs';
import type { Settings } from '../types';

type SongCardProps = {
    song: ResolvedSong;
    side: SortChoice;
    settings: Settings;
    scoreEnabled: boolean;
    score: string;
    sortInfo: CurrentSongSortInfo | null;
    autoPlay: boolean;
    autoPlayKey: number;
    paused?: boolean;
    pickVisible?: boolean;
    compact?: boolean;
    playing?: boolean;
    onMediaPlay?(): void;
    onMediaPause?(): void;
    onMediaEnded?(): void;
    onAutoPlayEnded(side: SortChoice): void;
    onPick(choice: SortChoice): void;
    onScoreChange(score: string): void;
};

export function SongCard({
    song,
    side,
    settings,
    scoreEnabled,
    score,
    sortInfo,
    autoPlay,
    autoPlayKey,
    paused = false,
    pickVisible = true,
    compact = false,
    playing = false,
    onMediaPlay,
    onMediaPause,
    onMediaEnded,
    onAutoPlayEnded,
    onPick,
    onScoreChange,
}: SongCardProps) {
    const [mediaRemountKey, setMediaRemountKey] = useState(0);

    return (
        <div className={`music-card${scoreEnabled ? ' music-card--scored' : ''}${compact ? ' music-card--compact' : ''}${playing ? ' music-card--playing' : ''}`}>
            <div data-slot="media">
                <Media
                    key={`${song.id}:${settings.mediaFormat}:${settings.region}:${autoPlayKey}:${mediaRemountKey}`}
                    song={song}
                    settings={settings}
                    autoPlay={autoPlay}
                    paused={paused}
                    onPlay={onMediaPlay}
                    onPause={onMediaPause}
                    onEnded={
                        autoPlay || onMediaEnded
                            ? () => {
                                if (onMediaEnded) {
                                    onMediaEnded();
                                } else if (autoPlay) {
                                    onAutoPlayEnded(side);
                                }
                            }
                            : undefined
                    }
                />
                <button
                    type="button"
                    className="media-remount-button"
                    onClick={() => setMediaRemountKey((key) => key + 1)}
                    aria-label={`Remount ${song.name} media player`}
                    title="Remount player"
                >
                    &#8635;
                </button>
            </div>
            <div className="anime">{song.anime}</div>
            <div className="song">
                <span className="song__name">{song.name}</span>
                {sortInfo ? (
                    <span
                        className="help-icon song__sort-help"
                        data-tooltip={sortInfoTooltip(sortInfo)}
                        aria-label="Song sort status"
                        tabIndex={0}
                    >
            ?
          </span>
                ) : null}
            </div>
            {scoreEnabled && !compact ? (
                <label className="score-field">
                    <span>Score</span>
                    <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.01"
                        value={score}
                        onChange={(event) => onScoreChange(event.currentTarget.value)}
                    />
                </label>
            ) : null}
            {pickVisible ? (
                <button type="button" onClick={() => onPick(side)}>
                    PICK
                </button>
            ) : null}
        </div>
    );
}

function sortInfoTooltip(info: CurrentSongSortInfo): string {
    const rank = info.minRank === info.maxRank ? `#${info.minRank}` : `#${info.minRank}-#${info.maxRank}`;
    return `Whole-set estimate: ${rank} of ${info.songCount}.`;
}
