import { ranksBySongId, type SortState } from "../../sorter";
import type { ResolvedSong } from "../../songs";
import type { SongScoresById } from "../types";

type ResultsProps = {
  songs: ResolvedSong[];
  sort: SortState;
  scoreEnabled: boolean;
  scoresBySongId: SongScoresById;
};

export function Results({ songs, sort, scoreEnabled, scoresBySongId }: ResultsProps) {
  const ranks = ranksBySongId(songs, sort);

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Anime</th>
            <th>Song</th>
            <th>Rank</th>
            {scoreEnabled ? <th>Score</th> : null}
          </tr>
        </thead>
        <tbody>
          {songs.map((song) => {
            const rank = ranks.get(song.id);
            if (rank === undefined) {
              throw new Error(`Missing rank for song id ${song.id}.`);
            }

            return (
              <tr key={song.id}>
                <td>{song.id}</td>
                <td title={song.anime}>{song.anime}</td>
                <td title={song.name}>{song.name}</td>
                <td>{rank}</td>
                {scoreEnabled ? <td>{scoresBySongId[song.id] ?? ""}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
