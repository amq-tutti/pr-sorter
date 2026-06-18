import type { config } from '../../customize/config';

export type SongData = {
    id: number;
    anime?: string | null;
    name: string;
    video?: string | null;
    mp3?: string | null;
    full?: string | null;
};

type SongTupleForTypes<SongTypes extends readonly string[]> = {
    readonly [Index in keyof SongTypes]: SongData;
};

type SongEntryForConfig<Config> =
    Config extends { songTypes: infer SongTypes extends readonly string[] }
        ? SongTupleForTypes<SongTypes>
        : SongData;

export type Song = SongEntryForConfig<typeof config>;
export type SongEntry = Song;

export type ResolvedSong = Omit<SongData, 'anime'> & {
    anime: string;
};

export type ResolvedSongEntry = ResolvedSong | readonly ResolvedSong[];

export function resolveSongAnime(song: SongData, fallbackAnimeName: string): ResolvedSong {
    return {
        ...song,
        anime: song.anime ?? fallbackAnimeName,
    };
}

export function resolveSongEntry(entry: SongEntry, fallbackAnimeName: string): ResolvedSongEntry {
    return isSongGroup(entry)
        ? entry.map((song) => resolveSongAnime(song, fallbackAnimeName))
        : resolveSongAnime(entry, fallbackAnimeName);
}

export function songEntrySongs(entry: ResolvedSongEntry): ResolvedSong[] {
    return isResolvedSongGroup(entry) ? [...entry] : [entry];
}

export function songEntryPrimary(entry: ResolvedSongEntry): ResolvedSong {
    const primary = songEntrySongs(entry)[0];
    if (!primary) {
        throw new Error('Song groups must contain at least one song.');
    }

    return primary;
}

export function songEntryId(entry: SongEntry | ResolvedSongEntry): number {
    const primary = isSongGroup(entry) || isResolvedSongGroup(entry) ? entry[0] : entry;
    if (!primary) {
        throw new Error('Song groups must contain at least one song.');
    }

    return primary.id;
}

export function songEntryAnime(entry: ResolvedSongEntry): string {
    const songs = songEntrySongs(entry);
    if (songs.length === 1) {
        return songs[0].anime;
    }

    return songs.map((song) => song.anime).join(' | ');
}

export function songEntryName(entry: ResolvedSongEntry): string {
    const songs = songEntrySongs(entry);
    if (songs.length === 1) {
        return songs[0].name;
    }

    return songs.map((song) => `${song.anime} / ${song.name}`).join(' | ');
}

export function songWithTypeLabel(song: ResolvedSong, type: string | undefined): ResolvedSong {
    const trimmedType = type?.trim();
    if (!trimmedType) {
        return song;
    }

    return {
        ...song,
        anime: `${song.anime} (${trimmedType})`,
    };
}

function isSongGroup(entry: SongEntry | ResolvedSongEntry): entry is Extract<SongEntry, readonly SongData[]> | readonly ResolvedSong[] {
    return Array.isArray(entry);
}

function isResolvedSongGroup(entry: SongEntry | ResolvedSongEntry): entry is readonly ResolvedSong[] {
    return Array.isArray(entry);
}
