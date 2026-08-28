import { useState } from 'react';
import { ranksBySongId, type SortState } from '../../sorter';
import { songEntryAnime, songEntryId, songEntryName, type ResolvedSongEntry } from '../../songs';
import { compareScores, compareText, type SortDirection } from '../internal/tableSorting';
import type { SongScoresById } from '../types';

type ResultsProps = {
    songs: ResolvedSongEntry[];
    sort: SortState;
    scoreEnabled: boolean;
    scoresBySongId: SongScoresById;
};

type SortColumn = 'id' | 'anime' | 'song' | 'rank' | 'score';

type ResultRow = {
    id: number;
    anime: string;
    name: string;
    rank: number;
};

export function Results({songs, sort, scoreEnabled, scoresBySongId}: ResultsProps) {
    const [sortColumn, setSortColumn] = useState<SortColumn>('id');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const ranks = ranksBySongId(songs, sort);
    const rows = songs
        .map((song): ResultRow => {
            const id = songEntryId(song);
            const rank = ranks.get(id);
            if (rank === undefined) {
                throw new Error(`Missing rank for song id ${id}.`);
            }

            return {id, anime: songEntryAnime(song), name: songEntryName(song), rank};
        })
        .sort((left, right) => compareRows(left, right, sortColumn, sortDirection, scoresBySongId));

    function changeSort(column: SortColumn): void {
        if (column === sortColumn) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
            return;
        }

        setSortColumn(column);
        setSortDirection('asc');
    }

    return (
        <div className="table-container">
            <table>
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
                    <SortableHeader column="rank" activeColumn={sortColumn} direction={sortDirection} onSort={changeSort}>
                        Rank
                    </SortableHeader>
                    {scoreEnabled ? (
                        <SortableHeader column="score" activeColumn={sortColumn} direction={sortDirection} onSort={changeSort}>
                            Score
                        </SortableHeader>
                    ) : null}
                </tr>
                </thead>
                <tbody>
                {rows.map((row) => (
                    <tr key={row.id}>
                        <td>{row.id}</td>
                        <td title={row.anime}>{row.anime}</td>
                        <td title={row.name}>{row.name}</td>
                        <td>{row.rank}</td>
                        {scoreEnabled ? <td>{scoresBySongId[row.id] ?? ''}</td> : null}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
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
                className={`table-sort-header${active ? ' table-sort-header--active' : ''}`}
                type="button"
                onClick={() => onSort(column)}
            >
                <span>{children}</span>
                <span className="table-sort-header__indicator">{active ? (direction === 'asc' ? '^' : 'v') : ''}</span>
            </button>
        </th>
    );
}

function compareRows(
    left: ResultRow,
    right: ResultRow,
    column: SortColumn,
    direction: SortDirection,
    scoresBySongId: SongScoresById,
): number {
    const multiplier = direction === 'asc' ? 1 : -1;
    const compared = compareByColumn(left, right, column, scoresBySongId);
    return (compared || left.id - right.id) * multiplier;
}

function compareByColumn(
    left: ResultRow,
    right: ResultRow,
    column: SortColumn,
    scoresBySongId: SongScoresById,
): number {
    if (column === 'id') {
        return left.id - right.id;
    }

    if (column === 'anime') {
        return compareText(left.anime, right.anime);
    }

    if (column === 'song') {
        return compareText(left.name, right.name);
    }

    if (column === 'rank') {
        return left.rank - right.rank;
    }

    return compareScores(scoresBySongId[left.id], scoresBySongId[right.id]);
}
