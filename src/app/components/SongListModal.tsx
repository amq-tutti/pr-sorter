import { useEffect, useState } from "react";
import { visibleUrl } from "../../media/internal/urls";
import { songSortInfo, type SortState } from "../../sorter";
import type { ResolvedSong } from "../../songs";
import type { GoogleSpreadsheetSelection, SongScoresById } from "../types";

type SheetScoreStatus =
  | { state: "unavailable"; message: string }
  | { state: "loading"; message: string }
  | { state: "ready"; message: string }
  | { state: "error"; message: string };

type SongListModalProps = {
  open: boolean;
  songs: ResolvedSong[];
  sort: SortState | null;
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

type SortColumn = "id" | "anime" | "song" | "score" | "sheetScore";
type SortDirection = "asc" | "desc";

export function SongListModal({
  open,
  songs,
  sort,
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
  const [sortColumn, setSortColumn] = useState<SortColumn>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    if (open) {
      setSortColumn("id");
      setSortDirection("asc");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const rows = songs
    .map((song, index) => ({ song, index }))
    .sort((left, right) =>
      compareRows(left, right, sortColumn, sortDirection, scoresBySongId, sheetScoresBySongId),
    );

  function changeSort(column: SortColumn): void {
    if (column === sortColumn) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortColumn(column);
    setSortDirection("asc");
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal song-list-modal">
        <h2>
          Song List
          {googleSpreadsheetSelection ? (
            <>
              {" for "}
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
              {rows.map(({ song, index }) => {
                const range = sort ? songSortInfo(sort, index) : null;

                return (
                  <tr key={song.id}>
                    <td>{song.id}</td>
                    <td title={song.anime}>{song.anime}</td>
                    <td title={song.name}>{song.name}</td>
                    <td>
                      <SongLinks song={song} />
                    </td>
                    <td>
                      <input
                        className="song-list-score-input"
                        type="number"
                        min="0"
                        max="10"
                        step="0.01"
                        value={scoresBySongId[song.id] ?? ""}
                        disabled={!scoreEnabled}
                        onChange={(event) => onScoreChange(song.id, event.currentTarget.value)}
                      />
                    </td>
                    <td>{sheetScoresBySongId[song.id] ?? ""}</td>
                    <td>{range ? `${range.minRank}-${range.maxRank}` : ""}</td>
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
            {isWritingSheetScores ? "Writing sheet scores..." : "Write sheet scores"}
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
        className={`song-list-sort-header${active ? " song-list-sort-header--active" : ""}`}
        type="button"
        onClick={() => onSort(column)}
      >
        <span>{children}</span>
        <span className="song-list-sort-header__indicator">{active ? (direction === "asc" ? "^" : "v") : ""}</span>
      </button>
    </th>
  );
}

function compareRows(
  left: { song: ResolvedSong; index: number },
  right: { song: ResolvedSong; index: number },
  column: SortColumn,
  direction: SortDirection,
  scoresBySongId: SongScoresById,
  sheetScoresBySongId: SongScoresById,
): number {
  const multiplier = direction === "asc" ? 1 : -1;
  const compared = compareByColumn(left, right, column, scoresBySongId, sheetScoresBySongId);
  return (compared || left.song.id - right.song.id) * multiplier;
}

function compareByColumn(
  left: { song: ResolvedSong; index: number },
  right: { song: ResolvedSong; index: number },
  column: SortColumn,
  scoresBySongId: SongScoresById,
  sheetScoresBySongId: SongScoresById,
): number {
  if (column === "id") {
    return left.song.id - right.song.id;
  }

  if (column === "anime") {
    return compareText(left.song.anime, right.song.anime);
  }

  if (column === "song") {
    return compareText(left.song.name, right.song.name);
  }

  if (column === "score") {
    return compareScores(scoresBySongId[left.song.id], scoresBySongId[right.song.id]);
  }

  return compareScores(sheetScoresBySongId[left.song.id], sheetScoresBySongId[right.song.id]);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function compareScores(left: string | undefined, right: string | undefined): number {
  const leftScore = parseScore(left);
  const rightScore = parseScore(right);

  if (leftScore === null && rightScore === null) {
    return compareText(left ?? "", right ?? "");
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

function SongLinks({ song }: { song: ResolvedSong }) {
  const links = [
    { label: "video", href: song.video },
    { label: "mp3", href: song.mp3 },
    { label: "full", href: song.full },
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));

  if (links.length === 0) {
    return <span className="song-list-links__empty">No link</span>;
  }

  return (
    <div className="song-list-links">
      {links.map((link) => (
        <a key={link.label} href={visibleUrl(link.href)} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      ))}
    </div>
  );
}
