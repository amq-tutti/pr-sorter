import { useEffect, useRef, useState } from 'react';
import { currentBattle, type SortChoice, type SortState } from '../../sorter';
import { songEntryId, songEntrySongs, songWithTypeLabel, type ResolvedSongEntry } from '../../songs';
import type { AppConfig, Settings, SongScoresById } from '../types';
import { projectedSongSortInfo } from '../internal/projectedSortInfo';
import { SongCard } from './SongCard';

type DuelProps = {
    config: AppConfig;
    songs: ResolvedSongEntry[];
    sort: SortState;
    settings: Settings;
    scoreEnabled: boolean;
    scoresBySongId: SongScoresById;
    autoPlaySide: SortChoice | null;
    autoPlayKey: number;
    onAutoPlaySideActivate(side: SortChoice): void;
    onAutoPlayEnded(side: SortChoice): void;
    onPick(choice: SortChoice): void;
    onScoreChange(songId: number, score: string): void;
};

type ActiveDuelPlayer = {
    side: SortChoice;
    index: number;
};

export function Duel({
    config,
    songs,
    sort,
    settings,
    scoreEnabled,
    scoresBySongId,
    autoPlaySide,
    autoPlayKey,
    onAutoPlaySideActivate,
    onAutoPlayEnded,
    onPick,
    onScoreChange,
}: DuelProps) {
    const [activePlayer, setActivePlayer] = useState<ActiveDuelPlayer | null>(null);
    const battle = currentBattle(sort);

    useEffect(() => {
        setActivePlayer(null);
    }, [battle?.[0], battle?.[1], settings.mediaFormat, settings.region]);

    if (battle === null) {
        return null;
    }

    const [leftIndex, rightIndex] = battle;
    const leftEntry = songs[leftIndex];
    const rightEntry = songs[rightIndex];
    if (leftEntry === undefined || rightEntry === undefined) {
        throw new Error('Sorter state references a song index outside the configured song list.');
    }

    function mediaStarted(side: SortChoice, index: number): void {
        setActivePlayer({side, index});
    }

    function mediaStopped(side: SortChoice, index: number): void {
        setActivePlayer((current) => current?.side === side && current.index === index ? null : current);
    }

    return (
        <>
            <DuelEntry
                config={config}
                entry={leftEntry}
                entryIndex={leftIndex}
                side="left"
                songs={songs}
                sort={sort}
                settings={settings}
                scoreEnabled={scoreEnabled}
                scoresBySongId={scoresBySongId}
                autoPlay={autoPlaySide === 'left'}
                autoPlayKey={autoPlayKey}
                activePlayer={activePlayer}
                onMediaPlay={mediaStarted}
                onMediaStop={mediaStopped}
                onAutoPlaySideActivate={onAutoPlaySideActivate}
                onAutoPlayEnded={onAutoPlayEnded}
                onPick={onPick}
                onScoreChange={onScoreChange}
            />
            <DuelEntry
                config={config}
                entry={rightEntry}
                entryIndex={rightIndex}
                side="right"
                songs={songs}
                sort={sort}
                settings={settings}
                scoreEnabled={scoreEnabled}
                scoresBySongId={scoresBySongId}
                autoPlay={autoPlaySide === 'right'}
                autoPlayKey={autoPlayKey}
                activePlayer={activePlayer}
                onMediaPlay={mediaStarted}
                onMediaStop={mediaStopped}
                onAutoPlaySideActivate={onAutoPlaySideActivate}
                onAutoPlayEnded={onAutoPlayEnded}
                onPick={onPick}
                onScoreChange={onScoreChange}
            />
        </>
    );
}

type DuelEntryProps = {
    config: AppConfig;
    entry: ResolvedSongEntry;
    entryIndex: number;
    side: SortChoice;
    songs: ResolvedSongEntry[];
    sort: SortState;
    settings: Settings;
    scoreEnabled: boolean;
    scoresBySongId: SongScoresById;
    autoPlay: boolean;
    autoPlayKey: number;
    activePlayer: ActiveDuelPlayer | null;
    onMediaPlay(side: SortChoice, index: number): void;
    onMediaStop(side: SortChoice, index: number): void;
    onAutoPlaySideActivate(side: SortChoice): void;
    onAutoPlayEnded(side: SortChoice): void;
    onPick(choice: SortChoice): void;
    onScoreChange(songId: number, score: string): void;
};

function DuelEntry({
    config,
    entry,
    entryIndex,
    side,
    songs,
    sort,
    settings,
    scoreEnabled,
    scoresBySongId,
    autoPlay,
    autoPlayKey,
    activePlayer,
    onMediaPlay,
    onMediaStop,
    onAutoPlaySideActivate,
    onAutoPlayEnded,
    onPick,
    onScoreChange,
}: DuelEntryProps) {
    const entryId = songEntryId(entry);
    const sortInfo = projectedSongSortInfo(sort, entryIndex, {songs, scoresBySongId, settings, scoreEnabled});
    const entrySongs = songEntrySongs(entry);
    const [autoPlaySongIndex, setAutoPlaySongIndex] = useState(0);
    const [playingSongIndex, setPlayingSongIndex] = useState<number | null>(null);
    const songCardRefs = useRef<Array<HTMLDivElement | null>>([]);

    useEffect(() => {
        setAutoPlaySongIndex(0);
        setPlayingSongIndex(null);
    }, [autoPlayKey, entryId, settings.mediaFormat, settings.region]);

    function mediaStarted(index: number): void {
        setPlayingSongIndex(index);
        setAutoPlaySongIndex(index);
        onMediaPlay(side, index);
        onAutoPlaySideActivate(side);
    }

    useEffect(() => {
        const activeIndex = playingSongIndex ?? (autoPlay ? autoPlaySongIndex : null);
        if (activeIndex === null) {
            return;
        }

        songCardRefs.current[activeIndex]?.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
            behavior: 'smooth',
        });
    }, [autoPlay, autoPlaySongIndex, playingSongIndex]);

    function mediaPaused(index: number): void {
        setPlayingSongIndex((current) => (current === index ? null : current));
        onMediaStop(side, index);
    }

    function groupedAutoPlayEnded(index: number): void {
        setPlayingSongIndex((current) => (current === index ? null : current));
        onMediaStop(side, index);
        if (index < entrySongs.length - 1) {
            setAutoPlaySongIndex(index + 1);
            return;
        }

        setAutoPlaySongIndex(0);
        if (autoPlay) {
            onAutoPlayEnded(side);
        }
    }

    if (entrySongs.length === 1) {
        return (
            <SongCard
                song={entrySongs[0]}
                side={side}
                settings={settings}
                scoreEnabled={scoreEnabled}
                score={scoresBySongId[entryId] ?? ''}
                sortInfo={sortInfo}
                autoPlay={autoPlay}
                autoPlayKey={autoPlayKey}
                paused={activePlayer !== null && !(activePlayer.side === side && activePlayer.index === 0)}
                playing={activePlayer?.side === side && activePlayer.index === 0}
                onMediaPlay={() => {
                    onMediaPlay(side, 0);
                    onAutoPlaySideActivate(side);
                }}
                onMediaPause={() => onMediaStop(side, 0)}
                onMediaEnded={() => {
                    onMediaStop(side, 0);
                    if (autoPlay) {
                        onAutoPlayEnded(side);
                    }
                }}
                onAutoPlayEnded={onAutoPlayEnded}
                onPick={onPick}
                onScoreChange={(score) => onScoreChange(entryId, score)}
            />
        );
    }

    return (
        <div className={`music-card-wrapper grid-${entrySongs.length}`}>
            <div className="music-card-wrapper__songs">
                {entrySongs.map((song, index) => (
                    <div
                        className="music-card-wrapper__song-anchor"
                        key={`${song.id}-${index}`}
                        ref={(element) => {
                            songCardRefs.current[index] = element;
                        }}
                    >
                        <SongCard
                            song={songWithTypeLabel(song, config.songTypes?.[index])}
                            side={side}
                            settings={settings}
                            scoreEnabled={false}
                            score=""
                            sortInfo={index === 0 ? sortInfo : null}
                            autoPlay={autoPlay && index === autoPlaySongIndex}
                            autoPlayKey={autoPlayKey}
                            paused={activePlayer !== null && !(activePlayer.side === side && activePlayer.index === index)}
                            pickVisible={false}
                            compact
                            playing={index === playingSongIndex && activePlayer?.side === side}
                            onMediaPlay={() => mediaStarted(index)}
                            onMediaPause={() => mediaPaused(index)}
                            onMediaEnded={() => groupedAutoPlayEnded(index)}
                            onAutoPlayEnded={() => groupedAutoPlayEnded(index)}
                            onPick={onPick}
                            onScoreChange={() => undefined}
                        />
                    </div>
                ))}
            </div>
            <div className="music-card-wrapper__controls">
                {scoreEnabled ? (
                    <label className="score-field music-card-wrapper__score">
                        <span>Score</span>
                        <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.01"
                            value={scoresBySongId[entryId] ?? ''}
                            onChange={(event) => onScoreChange(entryId, event.currentTarget.value)}
                        />
                    </label>
                ) : null}
                <button type="button" onClick={() => onPick(side)}>
                    PICK
                </button>
            </div>
        </div>
    );
}
