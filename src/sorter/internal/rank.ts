import { songEntryId, type ResolvedSongEntry } from '../../songs';
import { sortedSongIndexes, type SortState } from './mergeSort';

export const ranksBySongId = (songs: ResolvedSongEntry[], sort: SortState): Map<number, number> => {
    const sorted = sortedSongIndexes(sort);
    return new Map(songs.map((song, index) => [songEntryId(song), sorted.indexOf(index) + 1]));
};
