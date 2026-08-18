import { songEntryId, type ResolvedSongEntry, type SongId } from '../../songs';
import { isComplete, sortedSongIds, type SortState } from './mergeSort';

const rankMap = (sort: SortState): Map<SongId, number> =>
    new Map(sortedSongIds(sort).map((songId, index) => [songId, index + 1]));

export const ranksBySongId = (songs: ResolvedSongEntry[], sort: SortState): Map<SongId, number> => {
    const rankById = rankMap(sort);

    return new Map(songs.map((song) => {
        const songId = songEntryId(song);
        const rank = rankById.get(songId);
        // Previously this produced rank 0 for songs the sort never covered, and 0 was written
        // straight into the spreadsheet. A gap here means the reconciler failed to run.
        if (rank === undefined) {
            throw new Error(`Sorter result has no rank for song id ${songId}; the sort does not cover the current song list.`);
        }

        return [songId, rank];
    }));
};

// Non-throwing companion for user-triggered exports, so an incomplete or uncovered ranking can be
// explained instead of crashing the render tree (this app has no error boundary).
export function completeRanking(songs: ResolvedSongEntry[], sort: SortState): Map<SongId, number> | null {
    if (!isComplete(sort)) {
        return null;
    }

    const rankById = rankMap(sort);
    const ranks = new Map<SongId, number>();

    for (const song of songs) {
        const songId = songEntryId(song);
        const rank = rankById.get(songId);
        if (rank === undefined) {
            return null;
        }

        ranks.set(songId, rank);
    }

    return ranks;
}
