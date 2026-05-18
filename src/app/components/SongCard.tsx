import { Media } from "../../media";
import type { SortChoice } from "../../sorter";
import type { Song } from "../../songs";
import type { Settings } from "../types";

type SongCardProps = {
  song: Song;
  side: SortChoice;
  settings: Settings;
  scoreEnabled: boolean;
  score: string;
  onPick(choice: SortChoice): void;
  onScoreChange(score: string): void;
};

export function SongCard({ song, side, settings, scoreEnabled, score, onPick, onScoreChange }: SongCardProps) {
  return (
    <div className={`music-card${scoreEnabled ? " music-card--scored" : ""}`}>
      <div data-slot="media">
        <Media key={`${song.id}:${settings.mediaFormat}:${settings.region}`} song={song} settings={settings} />
      </div>
      <div className="anime">{song.anime}</div>
      <div className="song">{song.name}</div>
      {scoreEnabled ? (
        <label className="score-field">
          <span>Score</span>
          <input
            type="number"
            min="0"
            max="10"
            value={score}
            onChange={(event) => onScoreChange(event.currentTarget.value)}
          />
        </label>
      ) : null}
      <button type="button" onClick={() => onPick(side)}>
        PICK
      </button>
    </div>
  );
}
