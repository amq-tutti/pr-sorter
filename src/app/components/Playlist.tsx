import { useEffect, useState } from 'react';
import { Media } from '../../media';
import { songEntryId, songEntrySongs, songWithTypeLabel, type ResolvedSongEntry } from '../../songs';
import type { AppConfig, Settings, SongScoresById } from '../types';

export type PlaylistMode = 'in-order' | 'random';
export type PlaylistScoreFilter = 'all' | 'unscored';

type PlaylistProps = {
    config: AppConfig;
    songs: ResolvedSongEntry[];
    currentSong: ResolvedSongEntry | null;
    currentPosition: number;
    orderLength: number;
    scoredSongCount: number;
    totalSongCount: number;
    mode: PlaylistMode;
    scoreFilter: PlaylistScoreFilter;
    settings: Settings;
    scoreEnabled: boolean;
    scoresBySongId: SongScoresById;
    canWriteSheetScores: boolean;
    sheetScoresSetupReason: string | null;
    isWritingSheetScores: boolean;
    onModeChange(mode: PlaylistMode): void;
    onScoreFilterChange(filter: PlaylistScoreFilter): void;
    onPrevious(): void;
    onNext(): void;
    onAutoNext(): void;
    onScoreChange(songId: number, score: string): void;
    onWriteSheetScores(): void;
    onSetupGoogleSheet(): void;
};

export function Playlist({
    config,
    songs,
    currentSong,
    currentPosition,
    orderLength,
    scoredSongCount,
    totalSongCount,
    mode,
    scoreFilter,
    settings,
    scoreEnabled,
    scoresBySongId,
    canWriteSheetScores,
    sheetScoresSetupReason,
    isWritingSheetScores,
    onModeChange,
    onScoreFilterChange,
    onPrevious,
    onNext,
    onAutoNext,
    onScoreChange,
    onWriteSheetScores,
    onSetupGoogleSheet,
}: PlaylistProps) {
    const [activeSongIndex, setActiveSongIndex] = useState(0);
    const [playingSongIndex, setPlayingSongIndex] = useState<number | null>(null);
    const currentSongId = currentSong ? songEntryId(currentSong) : null;

    useEffect(() => {
        setActiveSongIndex(0);
        setPlayingSongIndex(null);
    }, [currentPosition, currentSongId, settings.mediaFormat, settings.region]);

    const writeScoresButton = scoreEnabled ? (
        <button
            className="playlist-mode__button"
            type="button"
            onClick={sheetScoresSetupReason ? onSetupGoogleSheet : onWriteSheetScores}
            disabled={scoredSongCount === 0 || isWritingSheetScores || (!canWriteSheetScores && !sheetScoresSetupReason)}
            title={sheetScoresSetupReason ?? undefined}
        >
            {isWritingSheetScores ? 'Writing...' : sheetScoresSetupReason ? 'Choose sheet' : 'Write scores'}
        </button>
    ) : null;

    if (songs.length === 0) {
        return (
            <div className="playlist">
                <div className="playlist-empty">No songs are configured.</div>
            </div>
        );
    }

    if (!currentSong) {
        return (
            <div className="playlist">
                <div className="playlist-toolbar">
                    <div className="playlist-position">
                        {scoredSongCount} / {totalSongCount} scored
                    </div>
                    <PlaylistToolbarControls
                        mode={mode}
                        scoreFilter={scoreFilter}
                        scoreEnabled={scoreEnabled}
                        writeScoresButton={writeScoresButton}
                        onModeChange={onModeChange}
                        onScoreFilterChange={onScoreFilterChange}
                    />
                </div>
                <div className="playlist-empty">All songs have scores.</div>
            </div>
        );
    }

    if (currentSongId === null) {
        return null;
    }

    const currentSongs = songEntrySongs(currentSong);
    const clampedActiveSongIndex = Math.min(activeSongIndex, currentSongs.length - 1);

    function mediaStarted(index: number): void {
        setPlayingSongIndex(index);
        setActiveSongIndex(index);
    }

    function mediaPaused(index: number): void {
        setPlayingSongIndex((current) => (current === index ? null : current));
    }

    function mediaEnded(index: number): void {
        setPlayingSongIndex((current) => (current === index ? null : current));
        if (index < currentSongs.length - 1) {
            setActiveSongIndex(index + 1);
            return;
        }

        setActiveSongIndex(0);
        onAutoNext();
    }

    function previousEntry(): void {
        setActiveSongIndex(0);
        setPlayingSongIndex(null);
        onPrevious();
    }

    function nextEntry(): void {
        setActiveSongIndex(0);
        setPlayingSongIndex(null);
        onNext();
    }

    return (
        <div className="playlist">
            <div className="playlist-toolbar">
                <div className="playlist-position">
                    {scoreFilter === 'unscored'
                        ? `${scoredSongCount} / ${totalSongCount} scored · ID ${currentSongId}`
                        : `${currentPosition + 1} / ${orderLength}`}
                </div>
                <PlaylistToolbarControls
                    mode={mode}
                    scoreFilter={scoreFilter}
                    scoreEnabled={scoreEnabled}
                    writeScoresButton={writeScoresButton}
                    onModeChange={onModeChange}
                    onScoreFilterChange={onScoreFilterChange}
                />
            </div>

            <div className={`playlist-card${scoreEnabled ? ' playlist-card--scored' : ''}${currentSongs.length > 1 ? ' playlist-card--group' : ''}`}>
                <div className={currentSongs.length > 1 ? 'playlist-media-grid' : 'playlist-media'}>
                    {currentSongs.map((song, index) => {
                        const labelledSong = songWithTypeLabel(song, config.songTypes?.[index]);
                        const shouldAutoPlay = index === clampedActiveSongIndex;
                        const isPlaying = currentSongs.length > 1 && index === playingSongIndex;

                        return (
                            <div className={`playlist-media-entry${isPlaying ? ' playlist-media-entry--active' : ''}`} key={`${song.id}-${index}`}>
                                <div className="playlist-media">
                                    <Media
                                        key={`${currentSongId}:${index}:${clampedActiveSongIndex}:${settings.mediaFormat}:${settings.region}`}
                                        song={song}
                                        settings={settings}
                                        autoPlay={shouldAutoPlay}
                                        onPlay={() => mediaStarted(index)}
                                        onPause={() => mediaPaused(index)}
                                        onEnded={() => mediaEnded(index)}
                                    />
                                </div>
                                <div className="playlist-song-meta">
                                    <div className="playlist-anime" title={labelledSong.anime}>{labelledSong.anime}</div>
                                    <div className="playlist-song" title={labelledSong.name}>{labelledSong.name}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {scoreEnabled ? (
                    <label className="score-field playlist-score-field">
                        <span>Score</span>
                        <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.01"
                            value={scoresBySongId[currentSongId] ?? ''}
                            onChange={(event) => onScoreChange(currentSongId, event.currentTarget.value)}
                        />
                    </label>
                ) : null}
                <div className="playlist-actions">
                    <button type="button" onClick={previousEntry}>
                        Previous
                    </button>
                    <button type="button" onClick={nextEntry}>
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}

type PlaylistToolbarControlsProps = {
    mode: PlaylistMode;
    scoreFilter: PlaylistScoreFilter;
    scoreEnabled: boolean;
    writeScoresButton: React.ReactNode;
    onModeChange(mode: PlaylistMode): void;
    onScoreFilterChange(filter: PlaylistScoreFilter): void;
};

function PlaylistToolbarControls({
    mode,
    scoreFilter,
    scoreEnabled,
    writeScoresButton,
    onModeChange,
    onScoreFilterChange,
}: PlaylistToolbarControlsProps) {
    return (
        <div className="playlist-toolbar-controls">
            {writeScoresButton ? (
                <div className="playlist-mode" aria-label="Playlist score writeback">
                    {writeScoresButton}
                </div>
            ) : null}
            <div className="playlist-mode" aria-label="Playlist order">
                <button
                    className={`playlist-mode__button${mode === 'in-order' ? ' playlist-mode__button--active' : ''}`}
                    type="button"
                    onClick={() => onModeChange('in-order')}
                >
                    In order
                </button>
                <button
                    className={`playlist-mode__button${mode === 'random' ? ' playlist-mode__button--active' : ''}`}
                    type="button"
                    onClick={() => onModeChange('random')}
                >
                    Random
                </button>
            </div>
            {scoreEnabled ? (
                <div className="playlist-mode" aria-label="Playlist score filter">
                    <button
                        className={`playlist-mode__button${scoreFilter === 'all' ? ' playlist-mode__button--active' : ''}`}
                        type="button"
                        onClick={() => onScoreFilterChange('all')}
                    >
                        All songs
                    </button>
                    <button
                        className={`playlist-mode__button${scoreFilter === 'unscored' ? ' playlist-mode__button--active' : ''}`}
                        type="button"
                        onClick={() => onScoreFilterChange('unscored')}
                    >
                        No score
                    </button>
                </div>
            ) : null}
        </div>
    );
}
