import { Media } from "../../media";
import type { CurrentSongSortInfo, SortChoice } from "../../sorter";
import type { ResolvedSong } from "../../songs";
import type { Settings } from "../types";

type SongCardProps = {
  song: ResolvedSong;
  side: SortChoice;
  settings: Settings;
  scoreEnabled: boolean;
  score: string;
  sortInfo: CurrentSongSortInfo | null;
  onPick(choice: SortChoice): void;
  onScoreChange(score: string): void;
};

export function SongCard({ song, side, settings, scoreEnabled, score, sortInfo, onPick, onScoreChange }: SongCardProps) {
  return (
    <div className={`music-card${scoreEnabled ? " music-card--scored" : ""}`}>
      <div data-slot="media">
        <Media key={`${song.id}:${settings.mediaFormat}:${settings.region}`} song={song} settings={settings} />
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
      {scoreEnabled ? (
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
      <button type="button" onClick={() => onPick(side)}>
        PICK
      </button>
    </div>
  );
}

function sortInfoTooltip(info: CurrentSongSortInfo): string {
  return `Whole-set estimate: #${info.minRank}-#${info.maxRank} of ${info.songCount}.`;
}
