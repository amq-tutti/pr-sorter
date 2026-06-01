import { Media } from "../../media";
import type { ResolvedSong } from "../../songs";
import type { Settings, SongScoresById } from "../types";

export type PlaylistMode = "in-order" | "random";
export type PlaylistScoreFilter = "all" | "unscored";

type PlaylistProps = {
  songs: ResolvedSong[];
  currentSong: ResolvedSong | null;
  currentPosition: number;
  orderLength: number;
  scoredSongCount: number;
  totalSongCount: number;
  mode: PlaylistMode;
  scoreFilter: PlaylistScoreFilter;
  settings: Settings;
  scoreEnabled: boolean;
  scoresBySongId: SongScoresById;
  onModeChange(mode: PlaylistMode): void;
  onScoreFilterChange(filter: PlaylistScoreFilter): void;
  onPrevious(): void;
  onNext(): void;
  onAutoNext(): void;
  onScoreChange(songId: number, score: string): void;
};

export function Playlist({
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
  onModeChange,
  onScoreFilterChange,
  onPrevious,
  onNext,
  onAutoNext,
  onScoreChange,
}: PlaylistProps) {
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
            onModeChange={onModeChange}
            onScoreFilterChange={onScoreFilterChange}
          />
        </div>
        <div className="playlist-empty">All songs have scores.</div>
      </div>
    );
  }

  return (
    <div className="playlist">
      <div className="playlist-toolbar">
        <div className="playlist-position">
          {scoreFilter === "unscored"
            ? `${scoredSongCount} / ${totalSongCount} scored · ID ${currentSong.id}`
            : `${currentPosition + 1} / ${orderLength}`}
        </div>
        <PlaylistToolbarControls
          mode={mode}
          scoreFilter={scoreFilter}
          scoreEnabled={scoreEnabled}
          onModeChange={onModeChange}
          onScoreFilterChange={onScoreFilterChange}
        />
      </div>

      <div className={`playlist-card${scoreEnabled ? " playlist-card--scored" : ""}`}>
        <div className="playlist-media">
          <Media
            key={`${currentSong.id}:${settings.mediaFormat}:${settings.region}`}
            song={currentSong}
            settings={settings}
            autoPlay
            onEnded={onAutoNext}
          />
        </div>
        <div className="playlist-song-meta">
          <div className="playlist-anime">{currentSong.anime}</div>
          <div className="playlist-song">{currentSong.name}</div>
        </div>
        {scoreEnabled ? (
          <label className="score-field playlist-score-field">
            <span>Score</span>
            <input
              type="number"
              min="0"
              max="10"
              step="0.01"
              value={scoresBySongId[currentSong.id] ?? ""}
              onChange={(event) => onScoreChange(currentSong.id, event.currentTarget.value)}
            />
          </label>
        ) : null}
        <div className="playlist-actions">
          <button type="button" onClick={onPrevious}>
            Previous
          </button>
          <button type="button" onClick={onNext}>
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
  onModeChange(mode: PlaylistMode): void;
  onScoreFilterChange(filter: PlaylistScoreFilter): void;
};

function PlaylistToolbarControls({
  mode,
  scoreFilter,
  scoreEnabled,
  onModeChange,
  onScoreFilterChange,
}: PlaylistToolbarControlsProps) {
  return (
    <div className="playlist-toolbar-controls">
      <div className="playlist-mode" aria-label="Playlist order">
        <button
          className={`playlist-mode__button${mode === "in-order" ? " playlist-mode__button--active" : ""}`}
          type="button"
          onClick={() => onModeChange("in-order")}
        >
          In order
        </button>
        <button
          className={`playlist-mode__button${mode === "random" ? " playlist-mode__button--active" : ""}`}
          type="button"
          onClick={() => onModeChange("random")}
        >
          Random
        </button>
      </div>
      {scoreEnabled ? (
        <div className="playlist-mode" aria-label="Playlist score filter">
          <button
            className={`playlist-mode__button${scoreFilter === "all" ? " playlist-mode__button--active" : ""}`}
            type="button"
            onClick={() => onScoreFilterChange("all")}
          >
            All songs
          </button>
          <button
            className={`playlist-mode__button${scoreFilter === "unscored" ? " playlist-mode__button--active" : ""}`}
            type="button"
            onClick={() => onScoreFilterChange("unscored")}
          >
            No score
          </button>
        </div>
      ) : null}
    </div>
  );
}
