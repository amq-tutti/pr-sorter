import type { config } from '../../customize/config';

export type SongId = number;

export type SongData = {
    id: SongId;
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

// Saved sort progress is keyed by song id, so a duplicate id would silently merge two songs into one
// ranking slot. The sheet importer rejects duplicates, but customize/songList.ts can be hand-edited.
export type SongCatalog = {
    entries: ResolvedSongEntry[];
    ids: SongId[];
    byId: ReadonlyMap<SongId, ResolvedSongEntry>;
};

export function createSongCatalog(songs: SongEntry[], fallbackAnimeName: string): SongCatalog {
    const entries = songs.map((song) => resolveSongEntry(song, fallbackAnimeName));
    const ids = entries.map((entry) => songEntryId(entry));
    const byId = new Map<SongId, ResolvedSongEntry>();
    const duplicates: SongId[] = [];

    for (const [index, id] of ids.entries()) {
        if (byId.has(id)) {
            duplicates.push(id);
            continue;
        }

        byId.set(id, entries[index]);
    }

    if (duplicates.length > 0) {
        throw new Error(`This sorter's song list repeats song id(s): ${[...new Set(duplicates)].join(', ')}.`);
    }

    return {entries, ids, byId};
}

export function songEntryId(entry: SongEntry | ResolvedSongEntry): SongId {
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
