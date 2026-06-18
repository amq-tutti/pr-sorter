import { useEffect, useMemo, useRef, useState } from 'react';
import { canUndo, choose, chooseAutomatic, createSort, currentBattle, isComplete, pickHistory, progressPercentage, ranksBySongId, type SortChoice, type SortState, undo } from '../sorter';
import { GoogleAuthenticationRequiredError, GooglePickerCanceledError, GoogleWritebackError } from '../google/types';
import { chooseGoogleSpreadsheet, loadScoresFromGoogleSheet, writePartialRanksToGoogleSheet, writeRanksToGoogleSheet, writeScoresToGoogleSheet } from '../google/googleSheetsWriteback';
import {
    resolveSongEntry,
    songEntryAnime,
    songEntryId,
    songEntryName,
    type ResolvedSongEntry,
    type SongEntry,
} from '../songs';
import { Controls } from './components/Controls';
import { Duel } from './components/Duel';
import { HistoryModal } from './components/HistoryModal';
import { Playlist, type PlaylistMode, type PlaylistScoreFilter } from './components/Playlist';
import { Progress } from './components/Progress';
import { Results } from './components/Results';
import { SettingsModal } from './components/SettingsModal';
import { SongListModal } from './components/SongListModal';
import { automaticChoiceForCurrentBattle } from './internal/automaticChoice';
import { projectedSongSortInfos } from './internal/projectedSortInfo';
import { isScoreEnabled, normalizeScore } from './internal/songScores';
import { createStorage, parseSorterStorageSnapshot } from './storage';
import type { AppConfig, GoogleSpreadsheetSelection, SavedProgressKind, Screen, Settings, SongScoresById, SorterAutoPlayMode } from './types';

type AppProps = {
    config: AppConfig;
    songs: SongEntry[];
};

const screenFor = (sort: SortState | null): Screen => {
    if (!sort) {
        return 'landing';
    }

    return isComplete(sort) ? 'complete' : 'sorting';
};

const hasSavedSortProgress = (sort: SortState): boolean =>
    sort.pickedCount > 0 || sort.history.length > 0 || isComplete(sort);

export function App({config, songs}: AppProps) {
    const resolvedSongs = useMemo(
        () => songs.map((song) => resolveSongEntry(song, fallbackAnimeName(config))),
        [config, songs],
    );
    const songIds = useMemo(() => resolvedSongs.map((song) => songEntryId(song)), [resolvedSongs]);
    const storage = useMemo(() => createStorage(config, songIds), [config, songIds]);
    const scoreEnabled = isScoreEnabled(config);
    const rankSupported = config.rankSupported !== false;
    const [screen, setScreen] = useState<Screen>('landing');
    const [settings, setSettings] = useState<Settings>(() => storage.loadSettings());
    const [scoresBySongId, setScoresBySongId] = useState<SongScoresById>(() => storage.loadScores());
    const [sorterAutoPlaySide, setSorterAutoPlaySide] = useState<SortChoice | null>(null);
    const [sorterAutoPlayKey, setSorterAutoPlayKey] = useState(0);
    const [playlistMode, setPlaylistMode] = useState<PlaylistMode>('in-order');
    const [playlistScoreFilter, setPlaylistScoreFilter] = useState<PlaylistScoreFilter>('all');
    const [playlistOrder, setPlaylistOrder] = useState<number[]>(() => createPlaylistOrder(resolvedSongs.length, 'in-order'));
    const [playlistPosition, setPlaylistPosition] = useState(0);
    const [sort, setSort] = useState<SortState | null>(null);
    const [isHistoryOpen, setHistoryOpen] = useState(false);
    const [isSongListOpen, setSongListOpen] = useState(false);
    const [isSettingsOpen, setSettingsOpen] = useState(false);
    const [isWritingSheet, setWritingSheet] = useState(false);
    const [isWritingSheetScores, setWritingSheetScores] = useState(false);
    const [isConnectingGoogleSheet, setConnectingGoogleSheet] = useState(false);
    const [sheetScoresBySongId, setSheetScoresBySongId] = useState<SongScoresById>({});
    const [sheetScoreStatus, setSheetScoreStatus] = useState<
        | { state: 'unavailable'; message: string }
        | { state: 'loading'; message: string }
        | { state: 'ready'; message: string }
        | { state: 'error'; message: string }
    >({state: 'unavailable', message: 'Choose a Google Sheet in Settings to show live sheet scores.'});
    const [googleSpreadsheetSelection, setGoogleSpreadsheetSelection] = useState<GoogleSpreadsheetSelection | null>(() =>
        storage.loadGoogleSpreadsheetSelection(),
    );
    const pendingScoreWritebackRef = useRef<Map<number, number>>(new Map());
    const scoreWritebackQueueRef = useRef<Promise<void>>(Promise.resolve());
    const lastEagerRankWritebackRef = useRef<Map<number, number>>(new Map());
    const lastEagerRankSpreadsheetIdRef = useRef<string | null>(null);
    const eagerRankWritebackQueueRef = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        document.title = config.title;
        document.querySelector('meta[name="og:site_name"]')?.setAttribute('content', config.title);
        document.querySelector('meta[name="og:description"]')?.setAttribute('content', config.description);
    }, [config.description, config.title]);

    useEffect(() => {
        setPlaylistOrder(createPlaylistOrder(resolvedSongs.length, playlistMode, playlistEligibleIndexes()));
        setPlaylistPosition(0);
    }, [playlistMode, playlistScoreFilter, resolvedSongs.length]);

    useEffect(() => {
        if (!isSongListOpen) {
            return;
        }

        if (!scoreEnabled) {
            setSheetScoresBySongId({});
            setSheetScoreStatus({state: 'unavailable', message: 'Score support is disabled for this sorter.'});
            return;
        }

        const writebackConfig = googleWritebackConfig();
        if (!writebackConfig?.scoreColumnHeader || !googleSpreadsheetSelection) {
            setSheetScoresBySongId({});
            setSheetScoreStatus({state: 'unavailable', message: 'Choose a Google Sheet in Settings to show live sheet scores.'});
            return;
        }

        let canceled = false;
        setSheetScoreStatus({state: 'loading', message: 'Loading live sheet scores...'});

        void loadScoresFromGoogleSheet(writebackConfig, googleSpreadsheetSelection, songIds)
            .then((sheetScores) => {
                if (canceled) {
                    return;
                }

                setSheetScoresBySongId(scoresRecordFromSheet(sheetScores));
                setSheetScoreStatus({state: 'ready', message: `Loaded sheet scores from ${googleSpreadsheetSelection.name}.`});
            })
            .catch((error: unknown) => {
                if (canceled) {
                    return;
                }

                console.error('Error loading scores from Google Sheet:', error);
                setSheetScoresBySongId({});
                setSheetScoreStatus({
                    state: 'error',
                    message: error instanceof GoogleWritebackError ? error.message : 'Could not load sheet scores.',
                });
            });

        return () => {
            canceled = true;
        };
    }, [googleSpreadsheetSelection, isSongListOpen, scoreEnabled, songIds]);

    const savedKind: SavedProgressKind = useMemo(() => {
        if (!rankSupported) {
            return 'none';
        }

        if (screen !== 'landing') {
            return 'none';
        }

        const savedSort = storage.loadSort();
        if (!savedSort || !hasSavedSortProgress(savedSort)) {
            return 'none';
        }

        return isComplete(savedSort) ? 'complete' : 'in-progress';
    }, [rankSupported, screen, storage]);

    function startSort(): void {
        if (!rankSupported) {
            return;
        }

        const savedSort = storage.loadSort();
        if (savedSort && hasSavedSortProgress(savedSort) && !window.confirm('Starting a new sort deletes all saved picks for this sorter. Scores are kept. Continue?')) {
            return;
        }

        const nextSort = createSort(resolvedSongs.length);
        setSort(nextSort);
        setScreen(screenFor(nextSort));
        storage.saveSort(nextSort);
        setSorterAutoPlayForSort(nextSort, settings, scoresBySongId);
    }

    function loadSort(): void {
        if (!rankSupported) {
            setScreen('landing');
            setSort(null);
            return;
        }

        const savedSort = storage.loadSort();
        if (!savedSort) {
            setScreen('landing');
            setSort(null);
            return;
        }

        const savedScores = storage.loadScores();
        const nextSort = resolveAutoSkips(savedSort, savedScores, settings);
        setScoresBySongId(savedScores);
        setSort(nextSort);
        setScreen(screenFor(nextSort));
        storage.saveSort(nextSort);
        setSorterAutoPlayForSort(nextSort, settings, savedScores);
    }

    function pick(choice: SortChoice): void {
        if (!rankSupported || !sort) {
            return;
        }

        const previousBattle = currentBattle(sort);
        const nextSort = resolveAutoSkips(choose(sort, choice), scoresBySongId, settings);
        setSort(nextSort);
        setScreen(screenFor(nextSort));
        storage.saveSort(nextSort);
        setSorterAutoPlayForSort(nextSort, settings, scoresBySongId, {previousBattle, choice});
        flushPendingScoreWriteback();
        void queueFixedRankWriteback(nextSort, scoresBySongId, settings);
    }

    function undoPick(): void {
        if (!rankSupported || !sort) {
            return;
        }

        const nextSort = undo(sort);
        setSort(nextSort);
        setScreen(screenFor(nextSort));
        storage.saveSort(nextSort);
        setSorterAutoPlayForSort(nextSort, settings, scoresBySongId);
    }

    function updateSettings(nextSettings: Settings): void {
        setSettings(nextSettings);
        storage.saveSettings(nextSettings);
        if (screen === 'sorting') {
            setSorterAutoPlayForSort(sort, nextSettings, scoresBySongId);
        }
    }

    function openPlaylist(): void {
        clearSorterAutoPlay();
        const eligibleIndexes = playlistEligibleIndexes();
        setPlaylistOrder(createPlaylistOrder(resolvedSongs.length, playlistMode, eligibleIndexes));
        setPlaylistPosition(0);

        setScreen('playlist');
    }

    function exitPlaylist(): void {
        if (!rankSupported) {
            return;
        }

        const nextScreen = screenFor(sort);
        setScreen(nextScreen);
        if (nextScreen === 'sorting') {
            setSorterAutoPlayForSort(sort, settings, scoresBySongId);
            return;
        }

        clearSorterAutoPlay();
    }

    function changePlaylistMode(nextMode: PlaylistMode): void {
        setPlaylistMode(nextMode);
        setPlaylistOrder(createPlaylistOrder(resolvedSongs.length, nextMode, playlistEligibleIndexes()));
        setPlaylistPosition(0);
    }

    function changePlaylistScoreFilter(nextFilter: PlaylistScoreFilter): void {
        setPlaylistScoreFilter(nextFilter);
        setPlaylistOrder(createPlaylistOrder(resolvedSongs.length, playlistMode, playlistEligibleIndexes(nextFilter)));
        setPlaylistPosition(0);
    }

    function nextPlaylistSong(): void {
        flushPendingScoreWriteback({allowAuthPrompt: true});
        movePlaylistSong(1);
    }

    function previousPlaylistSong(): void {
        flushPendingScoreWriteback({allowAuthPrompt: true});
        movePlaylistSong(-1);
    }

    function autoNextPlaylistSong(): void {
        flushPendingScoreWriteback({allowAuthPrompt: false});
        movePlaylistSong(1);
    }

    function sorterAutoPlayEnded(side: SortChoice): void {
        if (screen !== 'sorting' || !sort) {
            clearSorterAutoPlay();
            return;
        }

        const nextSide = sorterAutoPlaySideAfterEnded(settings.sorterAutoPlayMode, side);
        if (!nextSide) {
            clearSorterAutoPlay();
            return;
        }

        setSorterAutoPlaySide(nextSide);
        setSorterAutoPlayKey((current) => current + 1);
    }

    function activateSorterAutoPlaySide(side: SortChoice): void {
        if (screen !== 'sorting' || !sort || settings.sorterAutoPlayMode === 'off') {
            return;
        }

        setSorterAutoPlaySide(side);
    }

    function setSorterAutoPlayForSort(
        currentSort: SortState | null,
        currentSettings: Settings,
        currentScoresBySongId: SongScoresById,
        context?: { previousBattle: [number, number] | null; choice: SortChoice },
    ): void {
        const nextSide = initialSorterAutoPlaySide(
            currentSort,
            currentSettings,
            currentScoresBySongId,
            resolvedSongs,
            scoreEnabled,
            context,
        );
        if (!nextSide) {
            clearSorterAutoPlay();
            return;
        }

        setSorterAutoPlaySide(nextSide);
        setSorterAutoPlayKey((current) => current + 1);
    }

    function clearSorterAutoPlay(): void {
        setSorterAutoPlaySide(null);
    }

    function movePlaylistSong(direction: 1 | -1): void {
        if (playlistScoreFilter === 'all') {
            setPlaylistPosition((current) => (playlistOrder.length === 0 ? 0 : (current + direction + playlistOrder.length) % playlistOrder.length));
            return;
        }

        const currentSongIndex = playlistOrder[playlistPosition] ?? null;
        const nextOrder = filteredPlaylistOrder(playlistOrder, playlistEligibleIndexes(), playlistMode);
        if (nextOrder.length === 0) {
            setPlaylistOrder(nextOrder);
            setPlaylistPosition(0);
            return;
        }

        const currentPositionInNextOrder = currentSongIndex === null ? -1 : nextOrder.indexOf(currentSongIndex);
        const nextPosition =
            currentPositionInNextOrder >= 0
                ? (currentPositionInNextOrder + direction + nextOrder.length) % nextOrder.length
                : positiveModulo(playlistPosition + (direction > 0 ? 0 : -1), nextOrder.length);

        setPlaylistOrder(nextOrder);
        setPlaylistPosition(nextPosition);
    }

    function updateScore(songId: number, score: string): void {
        if (!scoreEnabled) {
            return;
        }

        const nextScores = {...scoresBySongId, [songId]: score};
        setScoresBySongId(nextScores);
        storage.saveScores(nextScores);

        try {
            const normalized = normalizeScore(score);
            if (normalized !== null) {
                pendingScoreWritebackRef.current.set(songId, normalized);
            }
        } catch {
            // Keep locally typed invalid scores editable, but do not write them to Sheets.
        }
    }

    function flushPendingScoreWriteback(options: { allowAuthPrompt?: boolean } = {allowAuthPrompt: true}): void {
        if (!scoreEnabled || pendingScoreWritebackRef.current.size === 0) {
            return;
        }

        const writebackConfig = googleWritebackConfig();
        if (!writebackConfig?.scoreColumnHeader || !googleSpreadsheetSelection) {
            return;
        }

        const scoresToWrite = new Map(pendingScoreWritebackRef.current);
        pendingScoreWritebackRef.current.clear();

        scoreWritebackQueueRef.current = scoreWritebackQueueRef.current
            .catch(() => undefined)
            .then(async () => {
                try {
                    await writeScoresToGoogleSheet(writebackConfig, googleSpreadsheetSelection, scoresToWrite, {
                        allowAuthPrompt: options.allowAuthPrompt ?? true,
                    });
                } catch (error) {
                    for (const [songId, score] of scoresToWrite.entries()) {
                        pendingScoreWritebackRef.current.set(songId, score);
                    }

                    if (options.allowAuthPrompt === false && isAuthenticationWritebackError(error)) {
                        return;
                    }

                    console.error('Error writing scores to Google Sheet:', error);
                }
            });
    }

    function queueFixedRankWriteback(
        currentSort: SortState | null,
        currentScoresBySongId: SongScoresById,
        currentSettings: Settings,
        options: { allowAuthPrompt?: boolean; reportErrors?: boolean } = {},
    ): Promise<number> {
        const writebackConfig = googleWritebackConfig();
        if (!currentSort || !writebackConfig || !googleSpreadsheetSelection) {
            return Promise.resolve(0);
        }

        const spreadsheet = googleSpreadsheetSelection;
        if (lastEagerRankSpreadsheetIdRef.current !== spreadsheet.id) {
            lastEagerRankWritebackRef.current.clear();
            lastEagerRankSpreadsheetIdRef.current = spreadsheet.id;
        }

        const fixedRanks = fixedProjectedRanksBySongId(currentSort, resolvedSongs, currentScoresBySongId, currentSettings, scoreEnabled);
        const ranksToWrite = changedRanks(fixedRanks, lastEagerRankWritebackRef.current);
        if (ranksToWrite.size === 0) {
            return Promise.resolve(0);
        }

        const queuedWrite = eagerRankWritebackQueueRef.current
            .catch(() => undefined)
            .then(async () => {
                try {
                    const writtenCount = await writePartialRanksToGoogleSheet(writebackConfig, ranksToWrite, songIds, spreadsheet, {
                        allowAuthPrompt: options.allowAuthPrompt ?? false,
                    });

                    if (lastEagerRankSpreadsheetIdRef.current === spreadsheet.id) {
                        for (const [songId, rank] of ranksToWrite.entries()) {
                            lastEagerRankWritebackRef.current.set(songId, rank);
                        }
                    }

                    return writtenCount;
                } catch (error) {
                    if (options.allowAuthPrompt === false && isAuthenticationWritebackError(error)) {
                        return 0;
                    }

                    console.error('Error writing fixed ranks to Google Sheet:', error);
                    if (options.reportErrors) {
                        throw error;
                    }

                    return 0;
                }
            });

        eagerRankWritebackQueueRef.current = queuedWrite.then(() => undefined, () => undefined);
        return queuedWrite;
    }

    function resolveAutoSkips(
        currentSort: SortState,
        currentScoresBySongId: SongScoresById,
        currentSettings: Settings,
    ): SortState {
        let nextSort = currentSort;
        const maxIterations = resolvedSongs.length * resolvedSongs.length * 2;

        for (let iteration = 0; iteration < maxIterations; iteration += 1) {
            const choice = automaticChoiceForCurrentBattle(nextSort, resolvedSongs, currentScoresBySongId, currentSettings, scoreEnabled);
            if (!choice) {
                return nextSort;
            }

            logAutoSkippedBattle(nextSort, currentScoresBySongId, choice);
            nextSort = chooseAutomatic(nextSort, choice);
            if (isComplete(nextSort)) {
                return nextSort;
            }
        }

        return nextSort;
    }

    function logAutoSkippedBattle(
        currentSort: SortState,
        currentScoresBySongId: SongScoresById,
        choice: SortChoice,
    ): void {
        const battle = currentBattle(currentSort);
        if (!battle) {
            return;
        }

        const [leftIndex, rightIndex] = battle;
        const leftSong = resolvedSongs[leftIndex];
        const rightSong = resolvedSongs[rightIndex];
        if (!leftSong || !rightSong) {
            return;
        }
        const leftId = songEntryId(leftSong);
        const rightId = songEntryId(rightSong);

        console.info('Auto-skipped comparison', {
            picked: choice,
            left: {
                id: leftId,
                anime: songEntryAnime(leftSong),
                name: songEntryName(leftSong),
                score: currentScoresBySongId[leftId] ?? '',
            },
            right: {
                id: rightId,
                anime: songEntryAnime(rightSong),
                name: songEntryName(rightSong),
                score: currentScoresBySongId[rightId] ?? '',
            },
        });
    }

    function googleWritebackConfig() {
        const googleSheets = config.googleSheets;
        const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;

        if (!googleSheets || !apiKey) {
            return null;
        }

        return {
            ...googleSheets,
            apiKey,
            tokenStorageKey: `${config.localStoragePrefix}:google-oauth-access-token`,
        };
    }

    function copyRanks(): void {
        if (!rankSupported || !sort) {
            return;
        }

        const ranks = ranksBySongId(resolvedSongs, sort);
        const lines = resolvedSongs.map((song) => {
            const id = songEntryId(song);
            const rank = ranks.get(id);
            if (rank === undefined) {
                throw new Error(`Missing rank for song id ${id}.`);
            }
            return String(rank);
        });

        void navigator.clipboard
            .writeText(lines.join('\n'))
            .then(() => {
                alert('Copied ranks to clipboard!');
            })
            .catch((error: unknown) => {
                console.error('Error copying ranks:', error);
                alert('Could not copy ranks to clipboard.');
            });
    }

    function writeRanksToSheet(): void {
        if (!rankSupported || screen !== 'complete' || !sort) {
            return;
        }

        const writebackConfig = googleWritebackConfig();
        if (!writebackConfig) {
            alert('Google integration is not configured.');
            return;
        }

        if (!googleSpreadsheetSelection) {
            alert('Choose a Google Sheet in Settings before writing ranks.');
            return;
        }

        let normalizedScoresBySongId: Map<number, number> | undefined;
        try {
            normalizedScoresBySongId = scoreEnabled ? normalizedScoresForWriteback(scoresBySongId) : undefined;
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Scores must be numbers from 0 to 10.');
            return;
        }

        setWritingSheet(true);
        void writeRanksToGoogleSheet(writebackConfig, ranksBySongId(resolvedSongs, sort), googleSpreadsheetSelection, normalizedScoresBySongId)
            .then((spreadsheet) => {
                alert(`Updated ranks in ${spreadsheet.name}.`);
            })
            .catch((error: unknown) => {
                if (error instanceof GooglePickerCanceledError) {
                    return;
                }

                console.error('Error writing ranks to Google Sheet:', error);
                alert(error instanceof GoogleWritebackError ? error.message : 'Could not write ranks to Google Sheet.');
            })
            .finally(() => {
                setWritingSheet(false);
            });
    }

    function writeSongListScoresToSheet(): void {
        const writebackConfig = googleWritebackConfig();
        if (!writebackConfig) {
            alert('Google integration is not configured.');
            return;
        }

        if (!googleSpreadsheetSelection) {
            alert('Choose a Google Sheet in Settings before writing to the spreadsheet.');
            return;
        }

        let normalizedScoresBySongId: Map<number, number> | undefined;
        if (scoreEnabled) {
            if (!writebackConfig.scoreColumnHeader) {
                alert('Google score writeback is not configured.');
                return;
            }

            try {
                normalizedScoresBySongId = normalizedScoresForWriteback(scoresBySongId);
            } catch (error) {
                alert(error instanceof Error ? error.message : 'Scores must be numbers from 0 to 10.');
                return;
            }
        }

        setWritingSheetScores(true);
        const scoreWrite = normalizedScoresBySongId && writebackConfig.scoreColumnHeader
            ? writeScoresToGoogleSheet(writebackConfig, googleSpreadsheetSelection, normalizedScoresBySongId)
            : Promise.resolve(0);

        void scoreWrite
            .then(async () => {
                if (normalizedScoresBySongId) {
                    pendingScoreWritebackRef.current.clear();
                    setSheetScoresBySongId((current) => ({
                        ...current,
                        ...scoresRecordFromNumericScores(normalizedScoresBySongId),
                    }));
                }

                const fixedRankWriteCount = await queueFixedRankWriteback(sort, scoresBySongId, settings, {
                    allowAuthPrompt: true,
                    reportErrors: true,
                });

                if (normalizedScoresBySongId) {
                    setSheetScoreStatus({state: 'ready', message: `Updated sheet scores in ${googleSpreadsheetSelection.name}.`});
                    return;
                }

                if (fixedRankWriteCount > 0) {
                    setSheetScoreStatus({state: 'ready', message: `Updated fixed ranks in ${googleSpreadsheetSelection.name}.`});
                    return;
                }

                alert('There are no scores or fixed ranks to write.');
            })
            .catch((error: unknown) => {
                console.error('Error writing to Google Sheet:', error);
                alert(error instanceof GoogleWritebackError ? error.message : 'Could not write to Google Sheet.');
            })
            .finally(() => {
                setWritingSheetScores(false);
            });
    }

    function chooseSheet(): void {
        const writebackConfig = googleWritebackConfig();
        if (!writebackConfig) {
            alert('Google integration is not configured.');
            return;
        }

        setConnectingGoogleSheet(true);
        void chooseGoogleSpreadsheet(writebackConfig)
            .then(async (spreadsheet) => {
                setGoogleSpreadsheetSelection(spreadsheet);
                storage.saveGoogleSpreadsheetSelection(spreadsheet);

                if (scoreEnabled) {
                    try {
                        const sheetScores = await loadScoresFromGoogleSheet(writebackConfig, spreadsheet, songIds);
                        const loadedScores = scoresRecordFromSheet(sheetScores);
                        setScoresBySongId((currentScores) => {
                            const nextScores = mergeLoadedScores(currentScores, loadedScores);
                            storage.saveScores(nextScores);
                            return nextScores;
                        });
                    } catch (error) {
                        console.error('Error loading scores from Google Sheet:', error);
                        alert(`Selected ${spreadsheet.name}, but could not load scores. ${messageFromError(error)}`);
                    }
                }
            })
            .catch((error: unknown) => {
                if (error instanceof GooglePickerCanceledError) {
                    return;
                }

                console.error('Error choosing Google Sheet:', error);
                alert(error instanceof GoogleWritebackError ? error.message : 'Could not choose Google Sheet.');
            })
            .finally(() => {
                setConnectingGoogleSheet(false);
            });
    }

    function clearSheetSelection(): void {
        setGoogleSpreadsheetSelection(null);
        storage.clearGoogleSpreadsheetSelection();
    }

    function exportSorterState(): void {
        const snapshot = storage.exportSorterState();
        const blob = new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeFileName(config.localStoragePrefix)}-sorter-state.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function importSorterState(file: File): void {
        void file.text()
            .then((text) => {
                const snapshot = parseSorterStorageSnapshot(JSON.parse(text) as unknown);
                if (snapshot.prefix !== config.localStoragePrefix) {
                    throw new Error(`This file is for sorter "${snapshot.prefix}", not "${config.localStoragePrefix}".`);
                }

                if (!window.confirm('Importing will replace saved state for this sorter. Continue?')) {
                    return;
                }

                const result = storage.importSorterState(snapshot);
                reloadStateFromStorage();
                alert(`Imported ${result.importedKeys.length} localStorage entr${result.importedKeys.length === 1 ? 'y' : 'ies'}.`);
            })
            .catch((error: unknown) => {
                console.error('Error importing sorter state:', error);
                alert(error instanceof Error ? error.message : 'Could not import sorter state.');
            });
    }

    function migrateLegacySorterSave(): void {
        const legacySave = storage.findLegacySorterSave();
        if (!legacySave) {
            alert('No compatible legacy save was found for this sorter.');
            return;
        }

        if (!legacySave.compatible) {
            alert(legacySave.reason ?? 'This legacy save is not compatible with the current sorter.');
            return;
        }

        const progressDescription = legacySave.complete ? 'completed result' : 'in-progress sort';
        if (!window.confirm(`Migrate the legacy ${progressDescription} from ${legacySave.legacyPrefix}*? This replaces saved new-format sorter progress.`)) {
            return;
        }

        const result = storage.migrateLegacySorterSave();
        if (!result) {
            alert('The legacy save could not be migrated.');
            return;
        }

        reloadStateFromStorage();
        alert(`Migrated ${result.complete ? 'completed' : 'in-progress'} legacy sorter progress from ${result.legacyPrefix}*.`);
    }

    function reloadStateFromStorage(): void {
        const importedSettings = storage.loadSettings();
        const importedScores = storage.loadScores();
        const importedSort = storage.loadSort();
        const importedGoogleSpreadsheetSelection = storage.loadGoogleSpreadsheetSelection();

        pendingScoreWritebackRef.current.clear();
        setSettings(importedSettings);
        setScoresBySongId(importedScores);
        setSort(rankSupported && importedSort && hasSavedSortProgress(importedSort) ? importedSort : null);
        setScreen(rankSupported && importedSort && hasSavedSortProgress(importedSort) ? screenFor(importedSort) : 'landing');
        setGoogleSpreadsheetSelection(importedGoogleSpreadsheetSelection);
        setSheetScoresBySongId({});
        setSheetScoreStatus({
            state: 'unavailable',
            message: importedGoogleSpreadsheetSelection
                ? 'Open the song list to load live sheet scores.'
                : 'Choose a Google Sheet in Settings to show live sheet scores.',
        });
        setPlaylistMode('in-order');
        setPlaylistScoreFilter('all');
        setPlaylistOrder(createPlaylistOrder(resolvedSongs.length, 'in-order'));
        setPlaylistPosition(0);
        setHistoryOpen(false);
        setSongListOpen(false);
        setSorterAutoPlayForSort(
            rankSupported && importedSort && hasSavedSortProgress(importedSort) ? importedSort : null,
            importedSettings,
            importedScores,
        );
    }

    function playlistEligibleIndexes(nextFilter: PlaylistScoreFilter = playlistScoreFilter): number[] {
        if (!scoreEnabled || nextFilter === 'all') {
            return Array.from({length: resolvedSongs.length}, (_, index) => index);
        }

        return resolvedSongs
            .map((song, index) => (hasMemoryScore(songEntryId(song), scoresBySongId) ? null : index))
            .filter((index): index is number => index !== null);
    }

    const googleSheetsDisabledReason = config.googleSheets && !import.meta.env.VITE_GOOGLE_API_KEY
        ? 'Google API key is not configured.'
        : null;
    const writeSheetSetupReason = config.googleSheets && !googleSpreadsheetSelection ? 'Choose a Google Sheet in Settings.' : null;
    const legacySorterSaveInfo = isSettingsOpen && rankSupported ? storage.findLegacySorterSave() : null;

    const progressLabel =
        sort && screen === 'complete'
            ? `Completed! (${sort.battleNo} battles)`
            : sort && screen === 'sorting'
                ? `Battle no. ${sort.battleNo}`
                : '';
    const progressValue =
        sort && screen === 'complete'
            ? 100
            : sort && screen === 'sorting'
                ? progressPercentage(sort, resolvedSongs.length)
                : 0;

    const currentPlaylistSongIndex = playlistOrder[playlistPosition] ?? 0;
    const currentPlaylistSong = playlistOrder.length > 0 ? resolvedSongs[currentPlaylistSongIndex] ?? null : null;
    const scoredPlaylistSongCount = countScoredSongs(resolvedSongs, scoresBySongId);

    return (
        <>
            <SettingsModal
                open={isSettingsOpen}
                settings={settings}
                scoreEnabled={scoreEnabled}
                googleSheetsConfigured={Boolean(config.googleSheets)}
                googleSheetsDisabledReason={googleSheetsDisabledReason}
                googleSpreadsheetSelection={googleSpreadsheetSelection}
                isConnectingGoogleSheet={isConnectingGoogleSheet}
                legacySorterSaveInfo={legacySorterSaveInfo}
                onClose={() => setSettingsOpen(false)}
                onChange={updateSettings}
                onChooseGoogleSheet={chooseSheet}
                onClearGoogleSheet={clearSheetSelection}
                onExportSorterState={exportSorterState}
                onImportSorterState={importSorterState}
                onMigrateLegacySorterSave={migrateLegacySorterSave}
            />
            <HistoryModal
                open={isHistoryOpen}
                picks={sort ? pickHistory(sort) : []}
                songs={resolvedSongs}
                scoresBySongId={scoresBySongId}
                onClose={() => setHistoryOpen(false)}
            />
            <SongListModal
                open={isSongListOpen}
                songs={resolvedSongs}
                sort={sort}
                settings={settings}
                scoreEnabled={scoreEnabled}
                scoresBySongId={scoresBySongId}
                sheetScoresBySongId={sheetScoresBySongId}
                sheetScoreStatus={sheetScoreStatus}
                googleSpreadsheetSelection={googleSpreadsheetSelection}
                canWriteSheetScores={Boolean(googleWritebackConfig() && googleSpreadsheetSelection)}
                isWritingSheetScores={isWritingSheetScores}
                onScoreChange={updateScore}
                onWriteSheetScores={writeSongListScoresToSheet}
                onClose={() => setSongListOpen(false)}
            />
            <div className={`main-page ${screen === 'landing' ? 'main-page--landing' : ''}`}>
                {screen !== 'sorting' ? (
                    <div className="title" style={screen === 'complete' ? {height: '3%'} : undefined}>
                        {screen === 'complete' ? 'Results' : screen === 'playlist' ? 'Playlist' : landingTitle(savedKind, rankSupported)}
                    </div>
                ) : null}

                <Controls
                    screen={screen}
                    savedKind={savedKind}
                    rankSupported={rankSupported}
                    googleSheetsEnabled={Boolean(config.googleSheets)}
                    googleSheetsDisabledReason={googleSheetsDisabledReason}
                    googleSheetsSetupReason={writeSheetSetupReason}
                    isWritingSheet={isWritingSheet}
                    canUndo={sort ? canUndo(sort) : false}
                    onOpenSongList={() => setSongListOpen(true)}
                    onOpenHistory={() => setHistoryOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenPlaylist={openPlaylist}
                    onExitPlaylist={exitPlaylist}
                    onStart={startSort}
                    onLoad={loadSort}
                    onUndo={undoPick}
                    onCopyRanks={copyRanks}
                    onWriteRanksToSheet={writeRanksToSheet}
                    onSetupGoogleSheet={chooseSheet}
                />

                {screen === 'playlist' ? (
                    <Playlist
                        config={config}
                        songs={resolvedSongs}
                        currentSong={currentPlaylistSong}
                        currentPosition={playlistPosition}
                        orderLength={playlistOrder.length}
                        scoredSongCount={scoredPlaylistSongCount}
                        totalSongCount={resolvedSongs.length}
                        mode={playlistMode}
                        scoreFilter={playlistScoreFilter}
                        settings={settings}
                        scoreEnabled={scoreEnabled}
                        scoresBySongId={scoresBySongId}
                        canWriteSheetScores={Boolean(googleWritebackConfig() && googleSpreadsheetSelection)}
                        sheetScoresSetupReason={writeSheetSetupReason}
                        isWritingSheetScores={isWritingSheetScores}
                        onModeChange={changePlaylistMode}
                        onScoreFilterChange={changePlaylistScoreFilter}
                        onPrevious={previousPlaylistSong}
                        onNext={nextPlaylistSong}
                        onAutoNext={autoNextPlaylistSong}
                        onScoreChange={updateScore}
                        onWriteSheetScores={writeSongListScoresToSheet}
                        onSetupGoogleSheet={chooseSheet}
                    />
                ) : screen !== 'landing' && sort ? (
                    <>
                        <div className="duel-container">
                            {screen === 'sorting' ? (
                                <Duel
                                    config={config}
                                    songs={resolvedSongs}
                                    sort={sort}
                                    settings={settings}
                                    scoreEnabled={scoreEnabled}
                                    scoresBySongId={scoresBySongId}
                                    autoPlaySide={sorterAutoPlaySide}
                                    autoPlayKey={sorterAutoPlayKey}
                                    onAutoPlaySideActivate={activateSorterAutoPlaySide}
                                    onAutoPlayEnded={sorterAutoPlayEnded}
                                    onPick={pick}
                                    onScoreChange={updateScore}
                                />
                            ) : null}
                            {screen === 'complete' ? (
                                <Results songs={resolvedSongs} sort={sort} scoreEnabled={scoreEnabled} scoresBySongId={scoresBySongId}/>
                            ) : null}
                        </div>
                        <Progress label={progressLabel} percentage={progressValue}/>
                    </>
                ) : null}
            </div>
        </>
    );
}

function scoresRecordFromSheet(sheetScores: Map<number, string>): SongScoresById {
    const scores: SongScoresById = {};

    for (const [songId, rawScore] of sheetScores.entries()) {
        try {
            normalizeScore(rawScore);
        } catch (error) {
            throw new GoogleWritebackError(`Sheet score for song ID ${songId} is invalid. ${messageFromError(error)}`);
        }
        scores[songId] = rawScore;
    }

    return scores;
}

function messageFromError(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error.';
}

function scoresRecordFromNumericScores(sheetScores: Map<number, number>): SongScoresById {
    const scores: SongScoresById = {};

    for (const [songId, score] of sheetScores.entries()) {
        scores[songId] = String(score);
    }

    return scores;
}

function mergeLoadedScores(currentScores: SongScoresById, loadedScores: SongScoresById): SongScoresById {
    return {
        ...currentScores,
        ...loadedScores,
    };
}

function normalizedScoresForWriteback(scoresBySongId: SongScoresById): Map<number, number> | undefined {
    const normalizedScores = new Map<number, number>();

    for (const [songId, rawScore] of Object.entries(scoresBySongId)) {
        const score = normalizeScore(rawScore);
        if (score !== null) {
            normalizedScores.set(Number.parseInt(songId, 10), score);
        }
    }

    return normalizedScores.size > 0 ? normalizedScores : undefined;
}

function fixedProjectedRanksBySongId(
    sort: SortState,
    songs: ResolvedSongEntry[],
    scoresBySongId: SongScoresById,
    settings: Settings,
    scoreEnabled: boolean,
): Map<number, number> {
    const projectedInfos = projectedSongSortInfos(sort, songs.length, {songs, scoresBySongId, settings, scoreEnabled});
    const ranks = new Map<number, number>();

    songs.forEach((song, index) => {
        const info = projectedInfos.get(index);
        if (info && info.minRank === info.maxRank) {
            ranks.set(songEntryId(song), info.minRank);
        }
    });

    return ranks;
}

function changedRanks(currentRanks: Map<number, number>, lastWrittenRanks: Map<number, number>): Map<number, number> {
    return new Map(
        [...currentRanks.entries()].filter(([songId, rank]) => lastWrittenRanks.get(songId) !== rank),
    );
}

function landingTitle(savedKind: SavedProgressKind, rankSupported: boolean): string {
    if (!rankSupported) {
        return 'Press "Playlist" to browse songs.';
    }

    if (savedKind === 'complete') {
        return 'Press "Start" to begin sorting or "Show Results" to display results of previous sorting.';
    }

    if (savedKind === 'in-progress') {
        return 'Press "Start" to begin sorting or "Continue" to load saved progress and resume where you left.';
    }

    return 'Press "Start" to begin sorting.';
}

function fallbackAnimeName(config: AppConfig): string {
    return config.fallbackAnimeName?.trim() || config.title.replace(/\s+Sorter$/i, '').trim() || config.title;
}

function isAuthenticationWritebackError(error: unknown): boolean {
    return (
        error instanceof GoogleAuthenticationRequiredError ||
        (error instanceof GoogleWritebackError && error.message === 'OAuth token expired or was rejected.')
    );
}

function initialSorterAutoPlaySide(
    sort: SortState | null,
    settings: Settings,
    scoresBySongId: SongScoresById,
    songs: ResolvedSongEntry[],
    scoreEnabled: boolean,
    context?: { previousBattle: [number, number] | null; choice: SortChoice },
): SortChoice | null {
    if (settings.sorterAutoPlayMode === 'off') {
        return null;
    }

    const battle = sort ? currentBattle(sort) : null;
    if (!battle) {
        return null;
    }

    if (settings.sorterAutoPlayMode === 'left' || settings.sorterAutoPlayMode === 'right') {
        return settings.sorterAutoPlayMode;
    }

    if (settings.sorterAutoPlayMode === 'picked') {
        return changedSideForBattleTransition(context?.previousBattle ?? null, battle) ?? context?.choice ?? 'left';
    }

    if (settings.sorterAutoPlayMode === 'higher-score') {
        return higherScoredBattleSide(battle, scoresBySongId, songs, scoreEnabled) ?? 'left';
    }

    return 'left';
}

function sorterAutoPlaySideAfterEnded(mode: SorterAutoPlayMode, side: SortChoice): SortChoice | null {
    if (mode === 'off') {
        return null;
    }

    return side === 'left' ? 'right' : 'left';
}

function changedSideForBattleTransition(
    previousBattle: [number, number] | null,
    nextBattle: [number, number],
): SortChoice | null {
    if (!previousBattle) {
        return null;
    }

    const leftChanged = previousBattle[0] !== nextBattle[0];
    const rightChanged = previousBattle[1] !== nextBattle[1];
    if (leftChanged && !rightChanged) {
        return 'left';
    }

    if (rightChanged && !leftChanged) {
        return 'right';
    }

    return null;
}

function higherScoredBattleSide(
    battle: [number, number],
    scoresBySongId: SongScoresById,
    songs: ResolvedSongEntry[],
    scoreEnabled: boolean,
): SortChoice | null {
    if (!scoreEnabled) {
        return null;
    }

    const [leftIndex, rightIndex] = battle;
    const leftSong = songs[leftIndex];
    const rightSong = songs[rightIndex];
    if (!leftSong || !rightSong) {
        return null;
    }

    try {
        const leftScore = normalizeScore(scoresBySongId[songEntryId(leftSong)] ?? '');
        const rightScore = normalizeScore(scoresBySongId[songEntryId(rightSong)] ?? '');
        if (leftScore === null || rightScore === null || leftScore === rightScore) {
            return null;
        }

        return leftScore > rightScore ? 'left' : 'right';
    } catch {
        return null;
    }
}

function createPlaylistOrder(songCount: number, mode: PlaylistMode, eligibleIndexes?: number[]): number[] {
    const order = eligibleIndexes ?? Array.from({length: songCount}, (_, index) => index);
    if (mode === 'in-order') {
        return order;
    }

    return shuffledPlaylistOrder(order);
}

function filteredPlaylistOrder(currentOrder: number[], eligibleIndexes: number[], mode: PlaylistMode): number[] {
    if (mode === 'in-order') {
        return eligibleIndexes;
    }

    const eligibleSet = new Set(eligibleIndexes);
    const currentSet = new Set(currentOrder);
    const retainedOrder = currentOrder.filter((index) => eligibleSet.has(index));
    const missingOrder = shuffledPlaylistOrder(eligibleIndexes.filter((index) => !currentSet.has(index)));
    return [...retainedOrder, ...missingOrder];
}

function shuffledPlaylistOrder(order: number[]): number[] {
    const shuffled = [...order];
    for (let index = order.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
}

function positiveModulo(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
}

function countScoredSongs(songs: ResolvedSongEntry[], scoresBySongId: SongScoresById): number {
    return songs.filter((song) => hasMemoryScore(songEntryId(song), scoresBySongId)).length;
}

function hasMemoryScore(songId: number, scoresBySongId: SongScoresById): boolean {
    try {
        return normalizeScore(scoresBySongId[songId] ?? '') !== null;
    } catch {
        return false;
    }
}

function safeFileName(value: string): string {
    return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'sorter';
}
