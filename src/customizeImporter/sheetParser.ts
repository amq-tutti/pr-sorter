import type { SheetGridCell } from '../google/sheetsClient';
import type { Song } from '../songs';

export type ParsedSheetCustomize = {
    songs: Song[];
    rankColumnHeader: string;
    scoreColumnHeader?: string;
};

export type SheetColumnKey = 'id' | 'anime' | 'song' | 'video' | 'mp3' | 'full' | 'rank' | 'score';

export type SheetColumnMapping = Partial<Record<SheetColumnKey, string>>;

export type SheetHeaders = {
    headerRowIndex: number;
    headers: string[];
    detected: SheetColumnMapping;
};

const HEADER_ALIASES: Record<SheetColumnKey, readonly string[]> = {
    id: ['ID', 'Id', 'id'],
    anime: ['Anime Name', 'Anime', 'Series', 'Show'],
    song: ['Song', 'Song Name', 'Title', 'Song Info', 'Name'],
    video: ['Video', 'Video Link', 'Video Link (if exists)', 'Link'],
    mp3: ['MP3', 'MP3 Link', 'mp3 Links', 'Audio', 'Audio Link', 'Song Link'],
    full: ['Full', 'Full Song', 'Full Link'],
    rank: ['Rank', 'rank'],
    score: ['Score (optional)', 'Score', 'score'],
};

export function inspectSheetHeaders(rows: SheetGridCell[][]): SheetHeaders {
    const headerRowIndex = rows.findIndex((row) => row.some((cell) => cell.value.trim().toLowerCase() === 'id'));
    if (headerRowIndex === -1) {
        throw new Error('Could not find a header row containing "ID".');
    }

    const headers = (rows[headerRowIndex] ?? []).map((cell) => cell.value.trim());

    return {
        headerRowIndex,
        headers,
        detected: {
            id: findHeaderName(headers, HEADER_ALIASES.id) ?? undefined,
            anime: findHeaderName(headers, HEADER_ALIASES.anime) ?? undefined,
            song: findHeaderName(headers, HEADER_ALIASES.song) ?? undefined,
            video: findHeaderName(headers, HEADER_ALIASES.video) ?? undefined,
            mp3: findHeaderName(headers, HEADER_ALIASES.mp3) ?? undefined,
            full: findHeaderName(headers, HEADER_ALIASES.full) ?? undefined,
            rank: findHeaderName(headers, HEADER_ALIASES.rank) ?? undefined,
            score: findHeaderName(headers, HEADER_ALIASES.score) ?? undefined,
        },
    };
}

export function parseSheetGrid(
    rows: SheetGridCell[][],
    headers: SheetHeaders,
    mapping: SheetColumnMapping,
): ParsedSheetCustomize {
    const columns = {
        id: requireColumn(headers.headers, mapping.id, 'ID'),
        anime: optionalColumn(headers.headers, mapping.anime),
        song: requireColumn(headers.headers, mapping.song, 'Song'),
        video: optionalColumn(headers.headers, mapping.video),
        mp3: optionalColumn(headers.headers, mapping.mp3),
        full: optionalColumn(headers.headers, mapping.full),
        rank: requireColumn(headers.headers, mapping.rank, 'Rank'),
        score: optionalColumn(headers.headers, mapping.score),
    };

    const songs: Song[] = [];
    const seenIds = new Set<number>();

    for (let rowIndex = headers.headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] ?? [];
        const rawId = getCell(row, columns.id);
        if (!rawId) {
            continue;
        }

        if (!/^\d+$/.test(rawId)) {
            throw new Error(`Row ${rowIndex + 1} has a non-numeric ID.`);
        }

        const id = Number.parseInt(rawId, 10);
        if (seenIds.has(id)) {
            throw new Error(`Row ${rowIndex + 1} repeats ID ${id}.`);
        }

        const songCell = row[columns.song];
        const anime = columns.anime === null ? null : getCell(row, columns.anime) || null;
        const videoCell = columns.video === null ? songCell : row[columns.video];
        const mp3Cell = columns.mp3 === null ? null : row[columns.mp3];
        const fullCell = columns.full === null ? null : row[columns.full];
        const video = linkFromCell(videoCell);
        const mp3 = linkFromCell(mp3Cell);
        const full = linkFromCell(fullCell);
        const songName = songCell?.value.trim() || video || mp3 || full || '';

        if (!songName) {
            throw new Error(`Row ${rowIndex + 1} is missing a song name.`);
        }

        if (!video && !mp3 && !full) {
            throw new Error(`Row ${rowIndex + 1} is missing a video, mp3, or full link.`);
        }

        seenIds.add(id);
        songs.push({
            id,
            anime,
            name: songName,
            video,
            mp3,
            full,
        });
    }

    if (songs.length === 0) {
        throw new Error('No songs were found under the header row.');
    }

    return {
        songs: [...songs].sort((left, right) => left.id - right.id),
        rankColumnHeader: mapping.rank ?? 'Rank',
        scoreColumnHeader: mapping.score || undefined,
    };
}

function findHeaderName(headers: string[], names: readonly string[]): string | null {
    const normalizedNames = new Set(names.map((name) => name.trim().toLowerCase()));
    return headers.find((header) => normalizedNames.has(header.trim().toLowerCase())) ?? null;
}

function requireColumn(headers: string[], headerName: string | undefined, label: string): number {
    const index = optionalColumn(headers, headerName);
    if (index === null) {
        throw new Error(`Missing required header: ${label}.`);
    }

    return index;
}

function optionalColumn(headers: string[], headerName: string | undefined): number | null {
    if (!headerName) {
        return null;
    }

    const normalizedHeaderName = headerName.trim().toLowerCase();
    const index = headers.findIndex((header) => header.trim().toLowerCase() === normalizedHeaderName);
    return index === -1 ? null : index;
}

function getCell(row: SheetGridCell[], index: number): string {
    return row[index]?.value.trim() ?? '';
}

function linkFromCell(cell: SheetGridCell | null | undefined): string | null {
    return cell?.hyperlink ?? normalizeOptionalUrl(cell?.value.trim() ?? '');
}

function normalizeOptionalUrl(value: string): string | null {
    return /^https?:\/\//i.test(value) ? value : null;
}
