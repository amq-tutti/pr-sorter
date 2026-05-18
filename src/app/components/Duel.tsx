import { currentBattle, type SortChoice, type SortState } from "../../sorter";
import type { Song } from "../../songs";
import type { Settings, SongScoresById } from "../types";
import { SongCard } from "./SongCard";

type DuelProps = {
  songs: Song[];
  sort: SortState;
  settings: Settings;
  scoreEnabled: boolean;
  scoresBySongId: SongScoresById;
  onPick(choice: SortChoice): void;
  onScoreChange(songId: number, score: string): void;
};

export function Duel({ songs, sort, settings, scoreEnabled, scoresBySongId, onPick, onScoreChange }: DuelProps) {
  const battle = currentBattle(sort);
  if (battle === null) {
    return null;
  }

  const [leftIndex, rightIndex] = battle;
  const leftSong = songs[leftIndex];
  const rightSong = songs[rightIndex];
  if (leftSong === undefined || rightSong === undefined) {
    throw new Error("Sorter state references a song index outside the configured song list.");
  }

  return (
    <>
      <SongCard
        song={leftSong}
        side="left"
        settings={settings}
        scoreEnabled={scoreEnabled}
        score={scoresBySongId[leftSong.id] ?? ""}
        onPick={onPick}
        onScoreChange={(score) => onScoreChange(leftSong.id, score)}
      />
      <SongCard
        song={rightSong}
        side="right"
        settings={settings}
        scoreEnabled={scoreEnabled}
        score={scoresBySongId[rightSong.id] ?? ""}
        onPick={onPick}
        onScoreChange={(score) => onScoreChange(rightSong.id, score)}
      />
    </>
  );
}
