export type Song = {
  id: number;
  anime?: string | null;
  name: string;
  video?: string | null;
  mp3?: string | null;
  full?: string | null;
};

export type ResolvedSong = Omit<Song, "anime"> & {
  anime: string;
};

export function resolveSongAnime(song: Song, fallbackAnimeName: string): ResolvedSong {
  return {
    ...song,
    anime: song.anime ?? fallbackAnimeName,
  };
}
