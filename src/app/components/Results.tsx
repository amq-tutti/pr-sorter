import { ranksBySongId, type SortState } from '../../sorter';
import { songEntryAnime, songEntryId, songEntryName, type ResolvedSongEntry } from '../../songs';
import type { SongScoresById } from '../types';

type ResultsProps = {
    songs: ResolvedSongEntry[];
    sort: SortState;
    scoreEnabled: boolean;
    scoresBySongId: SongScoresById;
};

export function Results({songs, sort, scoreEnabled, scoresBySongId}: ResultsProps) {
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
                    const id = songEntryId(song);
                    const anime = songEntryAnime(song);
                    const name = songEntryName(song);
                    const rank = ranks.get(id);
                    if (rank === undefined) {
                        throw new Error(`Missing rank for song id ${id}.`);
                    }

                    return (
                        <tr key={id}>
                            <td>{id}</td>
                            <td title={anime}>{anime}</td>
                            <td title={name}>{name}</td>
                            <td>{rank}</td>
                            {scoreEnabled ? <td>{scoresBySongId[id] ?? ''}</td> : null}
                        </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    );
}
