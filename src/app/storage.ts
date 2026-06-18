import type { SortState } from '../sorter';
import { z } from 'zod';
import type { AppConfig, GoogleSpreadsheetSelection, Settings, SongScoresById } from './types';
import { isSortState } from './internal/savedSortValidation';
import { isScoreEnabled } from './internal/songScores';
import { findLegacySorterSave, migrateLegacySorterSave, type LegacySorterSaveInfo } from './legacySorterMigration';

type StorageFacade = {
    loadSort(): SortState | null;
    saveSort(sort: SortState): void;
    loadScores(): SongScoresById;
    saveScores(scores: SongScoresById): void;
    clearScores(): void;
    loadSettings(): Settings;
    saveSettings(settings: Settings): void;
    loadGoogleSpreadsheetSelection(): GoogleSpreadsheetSelection | null;
    saveGoogleSpreadsheetSelection(selection: GoogleSpreadsheetSelection): void;
    clearGoogleSpreadsheetSelection(): void;
    exportSorterState(): SorterStorageSnapshot;
    importSorterState(snapshot: SorterStorageSnapshot): SorterStorageImportResult;
    findLegacySorterSave(): LegacySorterSaveInfo | null;
    migrateLegacySorterSave(): LegacySorterSaveInfo | null;
};

export type SorterStorageSnapshot = {
    version: 1;
    prefix: string;
    exportedAt: string;
    entries: Record<string, string>;
};

export type SorterStorageImportResult = {
    importedKeys: string[];
    removedKeys: string[];
};

const settingsSchema = z.object({
    mediaFormat: z.enum(['video', 'audio', 'full']),
    region: z.enum(['eu', 'naw', 'nae']),
    sorterAutoPlayMode: z.enum(['off', 'left', 'right', 'both', 'picked', 'higher-score']).default('off'),
    autoSkipScoreDifference: z.number().min(0).max(10).default(10),
});

const scoresSchema = z.record(z.string(), z.string());

const googleSpreadsheetSelectionSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
});

export function createStorage(config: AppConfig, songIds: number[]): StorageFacade {
    const keyPrefix = `${config.localStoragePrefix}:`;
    const sortKey = `${config.localStoragePrefix}:sort`;
    const scoresKey = `${config.localStoragePrefix}:scores`;
    const settingsKey = `${config.localStoragePrefix}:settings`;
    const googleSpreadsheetSelectionKey = `${config.localStoragePrefix}:google-spreadsheet-selection`;
    const scoreEnabled = isScoreEnabled(config);
    const currentSongIds = new Set(songIds);
    const songCount = songIds.length;

    function loadSort(): SortState | null {
        const raw = localStorage.getItem(sortKey);
        if (!raw) {
            return null;
        }

        try {
            const parsed: unknown = JSON.parse(raw);
            if (isSortState(parsed, songCount)) {
                return parsed;
            }
        } catch {
            // Invalid progress is removed below.
        }

        localStorage.removeItem(sortKey);
        return null;
    }

    function saveSort(sort: SortState): void {
        localStorage.setItem(sortKey, JSON.stringify(sort));
    }

    function loadScores(): SongScoresById {
        if (!scoreEnabled) {
            return {};
        }

        const raw = localStorage.getItem(scoresKey);
        if (!raw) {
            return {};
        }

        try {
            const parsed: unknown = JSON.parse(raw);
            const result = scoresSchema.safeParse(parsed);
            if (result.success) {
                return Object.fromEntries(
                    Object.entries(result.data)
                        .filter(([songId]) => /^\d+$/.test(songId) && currentSongIds.has(Number.parseInt(songId, 10)))
                        .map(([songId, score]) => [Number.parseInt(songId, 10), score]),
                ) as SongScoresById;
            }
        } catch {
            // Invalid score storage is removed below.
        }

        localStorage.removeItem(scoresKey);
        return {};
    }

    function saveScores(scores: SongScoresById): void {
        if (!scoreEnabled) {
            return;
        }

        const filtered = Object.fromEntries(
            Object.entries(scores).filter(([songId]) => /^\d+$/.test(songId) && currentSongIds.has(Number.parseInt(songId, 10))),
        );
        localStorage.setItem(scoresKey, JSON.stringify(filtered));
    }

    function clearScores(): void {
        if (!scoreEnabled) {
            return;
        }

        localStorage.removeItem(scoresKey);
    }

    function loadSettings(): Settings {
        const fallback: Settings = {
            mediaFormat: config.defaultMediaFormat ?? 'video',
            region: 'eu',
            sorterAutoPlayMode: 'off',
            autoSkipScoreDifference: 10,
        };
        const raw = localStorage.getItem(settingsKey);
        if (!raw) {
            return fallback;
        }

        try {
            const parsed: unknown = JSON.parse(raw);
            const result = settingsSchema.safeParse(parsed);
            if (result.success) {
                return {
                    ...result.data,
                    sorterAutoPlayMode: result.data.sorterAutoPlayMode === 'both' ? 'left' : result.data.sorterAutoPlayMode,
                };
            }
        } catch {
            // Invalid settings fall back to defaults.
        }

        localStorage.removeItem(settingsKey);
        return fallback;
    }

    function saveSettings(settings: Settings): void {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    }

    function loadGoogleSpreadsheetSelection(): GoogleSpreadsheetSelection | null {
        const raw = localStorage.getItem(googleSpreadsheetSelectionKey);
        if (!raw) {
            return null;
        }

        try {
            const parsed: unknown = JSON.parse(raw);
            const result = googleSpreadsheetSelectionSchema.safeParse(parsed);
            if (result.success) {
                return result.data;
            }
        } catch {
            // Invalid Google Sheet selection is removed below.
        }

        localStorage.removeItem(googleSpreadsheetSelectionKey);
        return null;
    }

    function saveGoogleSpreadsheetSelection(selection: GoogleSpreadsheetSelection): void {
        localStorage.setItem(googleSpreadsheetSelectionKey, JSON.stringify(selection));
    }

    function clearGoogleSpreadsheetSelection(): void {
        localStorage.removeItem(googleSpreadsheetSelectionKey);
    }

    function exportSorterState(): SorterStorageSnapshot {
        const entries: Record<string, string> = {};

        for (const key of sorterLocalStorageKeys()) {
            const value = localStorage.getItem(key);
            if (value !== null) {
                entries[key] = value;
            }
        }

        return {
            version: 1,
            prefix: config.localStoragePrefix,
            exportedAt: new Date().toISOString(),
            entries,
        };
    }

    function importSorterState(snapshot: SorterStorageSnapshot): SorterStorageImportResult {
        if (snapshot.prefix !== config.localStoragePrefix) {
            throw new Error(`This file is for sorter "${snapshot.prefix}", not "${config.localStoragePrefix}".`);
        }

        const importedKeys = Object.keys(snapshot.entries).sort();
        for (const key of importedKeys) {
            if (!key.startsWith(keyPrefix)) {
                throw new Error(`Import contains a key outside this sorter: "${key}".`);
            }
        }

        const removedKeys = sorterLocalStorageKeys();
        for (const key of removedKeys) {
            localStorage.removeItem(key);
        }

        for (const key of importedKeys) {
            localStorage.setItem(key, snapshot.entries[key]);
        }

        return {importedKeys, removedKeys};
    }

    function findLegacySave(): LegacySorterSaveInfo | null {
        return findLegacySorterSave(config.localStoragePrefix, songCount);
    }

    function migrateLegacySave(): LegacySorterSaveInfo | null {
        const result = migrateLegacySorterSave(config.localStoragePrefix, songCount);
        if (!result) {
            return null;
        }

        localStorage.setItem(sortKey, JSON.stringify(result.sort));
        return {
            legacyPrefix: result.legacyPrefix,
            keyCount: result.keyCount,
            complete: result.complete,
            compatible: result.compatible,
        };
    }

    function sorterLocalStorageKeys(): string[] {
        const keys: string[] = [];

        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(keyPrefix)) {
                keys.push(key);
            }
        }

        return keys.sort();
    }

    return {
        loadSort,
        saveSort,
        loadScores,
        saveScores,
        clearScores,
        loadSettings,
        saveSettings,
        loadGoogleSpreadsheetSelection,
        saveGoogleSpreadsheetSelection,
        clearGoogleSpreadsheetSelection,
        exportSorterState,
        importSorterState,
        findLegacySorterSave: findLegacySave,
        migrateLegacySorterSave: migrateLegacySave,
    };
}

export function parseSorterStorageSnapshot(snapshot: unknown): SorterStorageSnapshot {
    if (!isRecord(snapshot)) {
        throw new Error('Import file must contain a sorter storage snapshot.');
    }

    if (snapshot.version !== 1) {
        throw new Error('Import file uses an unsupported sorter storage version.');
    }

    if (typeof snapshot.prefix !== 'string' || snapshot.prefix.length === 0) {
        throw new Error('Import file is missing a sorter prefix.');
    }

    if (typeof snapshot.exportedAt !== 'string' || snapshot.exportedAt.length === 0) {
        throw new Error('Import file is missing an export timestamp.');
    }

    if (!isRecord(snapshot.entries)) {
        throw new Error('Import file is missing localStorage entries.');
    }

    const entries: Record<string, string> = {};
    for (const [key, value] of Object.entries(snapshot.entries)) {
        if (typeof value !== 'string') {
            throw new Error(`Import value for "${key}" must be a string.`);
        }

        entries[key] = value;
    }

    return {
        version: 1,
        prefix: snapshot.prefix,
        exportedAt: snapshot.exportedAt,
        entries,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
