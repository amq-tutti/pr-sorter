import type { SortPickEntry } from "../../sorter";
import type { Song } from "../../songs";
import type { SongScoresById } from "../types";

type HistoryModalProps = {
  open: boolean;
  picks: SortPickEntry[];
  songs: Song[];
  scoresBySongId: SongScoresById;
  onClose(): void;
};

export function HistoryModal({ open, picks, songs, scoresBySongId, onClose }: HistoryModalProps) {
  if (!open) {
    return null;
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal history-modal">
        <h2>Pick History</h2>
        {picks.length === 0 ? (
          <p className="history-empty">No picks yet.</p>
        ) : (
          <div className="history-list">
            {picks.map((pick, index) => {
              const leftSong = songs[pick.leftIndex];
              const rightSong = songs[pick.rightIndex];

              return (
                <div className="history-entry" key={`${pick.battleNo}-${index}`}>
                  <div className="history-entry__meta">
                    <span>#{index + 1}</span>
                    <span className={`history-entry__kind history-entry__kind--${pick.kind}`}>
                      {pick.kind === "automatic" ? "Automatic" : "Manual"}
                    </span>
                    <span>Battle {pick.battleNo}</span>
                  </div>
                  <div className="history-entry__matchup">
                    <HistorySongSide
                      song={leftSong}
                      side="Left"
                      picked={pick.choice === "left"}
                      score={formatScore(leftSong, scoresBySongId)}
                    />
                    <HistorySongSide
                      song={rightSong}
                      side="Right"
                      picked={pick.choice === "right"}
                      score={formatScore(rightSong, scoresBySongId)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button className="close-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}

type HistorySongSideProps = {
  song: Song | undefined;
  side: "Left" | "Right";
  picked: boolean;
  score: string;
};

function HistorySongSide({ song, side, picked, score }: HistorySongSideProps) {
  return (
    <div className={`history-song${picked ? " history-song--picked" : ""}`}>
      <div className="history-song__header">
        <span>{side}</span>
        {picked ? <span className="history-song__picked">Picked</span> : null}
      </div>
      <div className="history-song__anime">{song?.anime ?? "Unknown anime"}</div>
      <div className="history-song__name">{song?.name ?? "Unknown song"}</div>
      <div className="history-song__score">Score: {score}</div>
    </div>
  );
}

function formatScore(song: Song | undefined, scoresBySongId: SongScoresById): string {
  if (!song) {
    return "unknown";
  }

  const score = scoresBySongId[song.id];
  return score?.trim() ? score : "unscored";
}
