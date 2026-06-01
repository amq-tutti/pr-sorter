import type { Song } from "../../songs";
import { sortedSongIndexes, type SortState } from "./mergeSort";

export const ranksBySongId = (songs: Song[], sort: SortState): Map<number, number> => {
  const sorted = sortedSongIndexes(sort);
  return new Map(songs.map((song, index) => [song.id, sorted.indexOf(index) + 1]));
};
