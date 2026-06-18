import { useEffect, useMemo, useState } from 'react';
import { visibleUrl } from '../../media/internal/urls';
import { type SortState } from '../../sorter';
import {
    songEntryAnime,
    songEntryId,
    songEntryName,
    songEntrySongs,
    type ResolvedSong,
    type ResolvedSongEntry,
} from '../../songs';
import { projectedSongSortInfos } from '../internal/projectedSortInfo';
import type { GoogleSpreadsheetSelection, Settings, SongScoresById } from '../types';

type SheetScoreStatus =
    | { state: 'unavailable'; message: string }
    | { state: 'loading'; message: string }
    | { state: 'ready'; message: string }
    | { state: 'error'; message: string };

type SongListModalProps = {
    open: boolean;
    songs: ResolvedSongEntry[];
    sort: SortState | null;
    settings: Settings;
    scoreEnabled: boolean;
    scoresBySongId: SongScoresById;
    sheetScoresBySongId: SongScoresById;
    sheetScoreStatus: SheetScoreStatus;
    googleSpreadsheetSelection: GoogleSpreadsheetSelection | null;
    canWriteSheetScores: boolean;
    isWritingSheetScores: boolean;
    onScoreChange(songId: number, score: string): void;
    onWriteSheetScores(): void;
    onClose(): void;
};

type SortColumn = 'id' | 'anime' | 'song' | 'score' | 'sheetScore';
type SortDirection = 'asc' | 'desc';

export function SongListModal({
    open,
    songs,
    sort,
    settings,
    scoreEnabled,
    scoresBySongId,
    sheetScoresBySongId,
    sheetScoreStatus,
    googleSpreadsheetSelection,
    canWriteSheetScores,
    isWritingSheetScores,
    onScoreChange,
    onWriteSheetScores,
    onClose,
}: SongListModalProps) {
    const [sortColumn, setSortColumn] = useState<SortColumn>('id');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    useEffect(() => {
        if (open) {
            setSortColumn('id');
            setSortDirection('asc');
        }
    }, [open]);

    const projectedRanges = useMemo(
        () => open && sort ? projectedSongSortInfos(sort, songs.length, {songs, scoresBySongId, settings, scoreEnabled}) : new Map(),
        [open, scoreEnabled, scoresBySongId, settings, songs, sort],
    );

    if (!open) {
        return null;
    }

    const rows = songs
        .map((song, index) => ({song, index}))
        .sort((left, right) =>
            compareRows(left, right, sortColumn, sortDirection, scoresBySongId, sheetScoresBySongId),
        );

    function changeSort(column: SortColumn): void {
        if (column === sortColumn) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
            return;
        }

        setSortColumn(column);
        setSortDirection('asc');
    }

    return (
        <>
            <div className="modal-overlay" onClick={onClose}/>
            <div className="modal song-list-modal">
                <h2>
                    Song List
                    {googleSpreadsheetSelection ? (
                        <>
                            {' for '}
                            <a
                                className="song-list-title-link"
                                href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(googleSpreadsheetSelection.id)}/edit`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {googleSpreadsheetSelection.name}
                            </a>
                        </>
                    ) : null}
                </h2>
                <div className={`song-list-status song-list-status--${sheetScoreStatus.state}`}>
                    {sheetScoreStatus.message}
                </div>
                <div className="song-list-table-wrap">
                    <table className="song-list-table">
                        <thead>
                        <tr>
                            <SortableHeader column="id" activeColumn={sortColumn} direction={sortDirection} onSort={changeSort}>
                                ID
                            </SortableHeader>
                            <SortableHeader column="anime" activeColumn={sortColumn} direction={sortDirection} onSort={changeSort}>
                                Anime
                            </SortableHeader>
                            <SortableHeader column="song" activeColumn={sortColumn} direction={sortDirection} onSort={changeSort}>
                                Song
                            </SortableHeader>
                            <th>Links</th>
                            <SortableHeader column="score" activeColumn={sortColumn} direction={sortDirection} onSort={changeSort}>
                                Score
                            </SortableHeader>
                            <SortableHeader column="sheetScore" activeColumn={sortColumn} direction={sortDirection} onSort={changeSort}>
                                Sheet score
                            </SortableHeader>
                            <th>
                  <span className="song-list-header-with-help">
                    Current range
                    <span
                        className="help-icon"
                        data-tooltip="Estimated possible final rank range for this song from the current sort state. A range like 2-30 means the song can still end anywhere from rank 2 through rank 30."
                        aria-label="Current range help"
                        tabIndex={0}
                    >
                      ?
                    </span>
                  </span>
                            </th>
                        </tr>
                        </thead>
                        <tbody>
                        {rows.map(({song, index}) => {
                            const id = songEntryId(song);
                            const anime = songEntryAnime(song);
                            const name = songEntryName(song);
                            const range = sort ? projectedRanges.get(index) ?? null : null;

                            return (
                                <tr key={id}>
                                    <td>{id}</td>
                                    <td title={anime}>{anime}</td>
                                    <td title={name}>{name}</td>
                                    <td>
                                        <SongLinks song={song}/>
                                    </td>
                                    <td>
                                        <input
                                            className="song-list-score-input"
                                            type="number"
                                            min="0"
                                            max="10"
                                            step="0.01"
                                            value={scoresBySongId[id] ?? ''}
                                            disabled={!scoreEnabled}
                                            onChange={(event) => onScoreChange(id, event.currentTarget.value)}
                                        />
                                    </td>
                                    <td>{sheetScoresBySongId[id] ?? ''}</td>
                                    <td>{range ? formatRankRange(range.minRank, range.maxRank) : ''}</td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
                <div className="song-list-actions">
                    <button
                        className="song-list-write-button"
                        type="button"
                        onClick={onWriteSheetScores}
                        disabled={!canWriteSheetScores || isWritingSheetScores}
                    >
                        {isWritingSheetScores ? 'Writing to spreadsheet...' : 'Write to spreadsheet'}
                    </button>
                    <button className="close-button" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </>
    );
}

function SortableHeader({
    column,
    activeColumn,
    direction,
    children,
    onSort,
}: {
    column: SortColumn;
    activeColumn: SortColumn;
    direction: SortDirection;
    children: string;
    onSort(column: SortColumn): void;
}) {
    const active = column === activeColumn;

    return (
        <th>
            <button
                className={`song-list-sort-header${active ? ' song-list-sort-header--active' : ''}`}
                type="button"
                onClick={() => onSort(column)}
            >
                <span>{children}</span>
                <span className="song-list-sort-header__indicator">{active ? (direction === 'asc' ? '^' : 'v') : ''}</span>
            </button>
        </th>
    );
}

function compareRows(
    left: { song: ResolvedSongEntry; index: number },
    right: { song: ResolvedSongEntry; index: number },
    column: SortColumn,
    direction: SortDirection,
    scoresBySongId: SongScoresById,
    sheetScoresBySongId: SongScoresById,
): number {
    const multiplier = direction === 'asc' ? 1 : -1;
    const compared = compareByColumn(left, right, column, scoresBySongId, sheetScoresBySongId);
    return (compared || songEntryId(left.song) - songEntryId(right.song)) * multiplier;
}

function compareByColumn(
    left: { song: ResolvedSongEntry; index: number },
    right: { song: ResolvedSongEntry; index: number },
    column: SortColumn,
    scoresBySongId: SongScoresById,
    sheetScoresBySongId: SongScoresById,
): number {
    const leftId = songEntryId(left.song);
    const rightId = songEntryId(right.song);

    if (column === 'id') {
        return leftId - rightId;
    }

    if (column === 'anime') {
        return compareText(songEntryAnime(left.song), songEntryAnime(right.song));
    }

    if (column === 'song') {
        return compareText(songEntryName(left.song), songEntryName(right.song));
    }

    if (column === 'score') {
        return compareScores(scoresBySongId[leftId], scoresBySongId[rightId]);
    }

    return compareScores(sheetScoresBySongId[leftId], sheetScoresBySongId[rightId]);
}

function compareText(left: string, right: string): number {
    return left.localeCompare(right, undefined, {numeric: true, sensitivity: 'base'});
}

function compareScores(left: string | undefined, right: string | undefined): number {
    const leftScore = parseScore(left);
    const rightScore = parseScore(right);

    if (leftScore === null && rightScore === null) {
        return compareText(left ?? '', right ?? '');
    }

    if (leftScore === null) {
        return 1;
    }

    if (rightScore === null) {
        return -1;
    }

    return leftScore - rightScore;
}

function parseScore(score: string | undefined): number | null {
    if (!score?.trim()) {
        return null;
    }

    const parsed = Number.parseFloat(score);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatRankRange(minRank: number, maxRank: number): string {
    return minRank === maxRank ? String(minRank) : `${minRank}-${maxRank}`;
}

function SongLinks({song}: { song: ResolvedSongEntry }) {
    const links = songEntrySongs(song).flatMap((entrySong: ResolvedSong, index) =>
        [
            {label: linkLabel('video', index, song), href: entrySong.video},
            {label: linkLabel('mp3', index, song), href: entrySong.mp3},
            {label: linkLabel('full', index, song), href: entrySong.full},
        ].filter((link): link is { label: string; href: string } => Boolean(link.href)),
    );

    if (links.length === 0) {
        return <span className="song-list-links__empty">No link</span>;
    }

    return (
        <div className="song-list-links">
            {links.map((link) => (
                <a key={`${link.label}-${link.href}`} href={visibleUrl(link.href)} target="_blank" rel="noreferrer">
                    {link.label}
                </a>
            ))}
        </div>
    );
}

function linkLabel(label: string, index: number, song: ResolvedSongEntry): string {
    return Array.isArray(song) ? `${label} ${index + 1}` : label;
}
