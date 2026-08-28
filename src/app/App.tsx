import { useEffect, useMemo, useRef, useState } from 'react';
import { canUndo, choose, chooseAutomatic, completeRanking, createSort, currentBattle, isComplete, pickHistory, progressPercentage, type ReconcileReport, type SortChoice, type SortState, undo } from '../sorter';
import { GoogleAuthenticationRequiredError, GooglePickerCanceledError, GoogleWritebackError, UNSUPPORTED_SPREADSHEET_MESSAGE, UNSUPPORTED_SPREADSHEET_SHORT, UnsupportedSpreadsheetError } from '../google/types';
import { chooseGoogleSpreadsheet, loadScoresFromGoogleSheet, validateSpreadsheetSupported, writePartialRanksToGoogleSheet, writeRanksToGoogleSheet, writeScoresToGoogleSheet } from '../google/googleSheetsWriteback';
import {
    createSongCatalog,
    songEntryAnime,
    songEntryId,
    songEntryName,
    type ResolvedSongEntry,
    type SongCatalog,
    type SongEntry,
} from '../songs';
import { ConfirmModal } from './components/ConfirmModal';
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
import {
    describeSavedSort,
    incompleteRankingMessage,
    landingTitle,
    pendingLoadConfirmLabel,
    pendingLoadMessage,
} from './internal/savedSortMessages';
import { createStorage, parseSorterStorageSnapshot, type SortLoadResult } from './storage';
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
    const catalog = useMemo(
        () => createSongCatalog(songs, fallbackAnimeName(config)),
        [config, songs],
    );
    const resolvedSongs = catalog.entries;
    const songIds = catalog.ids;
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
    const [isStartConfirmOpen, setStartConfirmOpen] = useState(false);
    const [pendingSaveLoad, setPendingSaveLoad] = useState<Extract<SortLoadResult, {kind: 'ready' | 'needs-consent'}> | null>(null);
    const [unusableSaveReason, setUnusableSaveReason] = useState<string | null>(null);
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

        if (googleSpreadsheetSelection.writebackSupported === false) {
            setSheetScoresBySongId({});
            setSheetScoreStatus({state: 'error', message: UNSUPPORTED_SPREADSHEET_MESSAGE});
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

    const savedSortPreview = useMemo(
        () => (rankSupported && screen === 'landing' ? storage.peekSort() : null),
        [rankSupported, screen, storage],
    );

    const previewSort = savedSortPreview?.kind === 'ready' || savedSortPreview?.kind === 'needs-consent'
        ? savedSortPreview.sort
        : null;

    // Derived from the reconciled state on purpose. A finished sort whose list gained songs is no
    // longer complete, so the button reads "Continue" rather than offering stale results.
    const savedKind: SavedProgressKind = useMemo(() => {
        if (!previewSort || !hasSavedSortProgress(previewSort)) {
            return 'none';
        }

        return isComplete(previewSort) ? 'complete' : 'in-progress';
    }, [previewSort]);

    const savedListChange = savedSortPreview?.kind === 'ready' || savedSortPreview?.kind === 'needs-consent'
        ? savedSortPreview.report
        : null;

    function startSort(): void {
        if (!rankSupported) {
            return;
        }

        const saved = storage.peekSort();
        const savedSort = saved.kind === 'ready' || saved.kind === 'needs-consent' ? saved.sort : null;
        if (savedSort && hasSavedSortProgress(savedSort)) {
            setStartConfirmOpen(true);
            return;
        }

        confirmStart();
    }

    function confirmStart(): void {
        setStartConfirmOpen(false);
        const nextSort = createSort(catalog.ids);
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

        const loaded = storage.loadSort();
        if (loaded.kind === 'none') {
            setScreen('landing');
            setSort(null);
            return;
        }

        if (loaded.kind === 'unusable') {
            setUnusableSaveReason(loaded.reason);
            return;
        }

        // Nothing has been written yet. Confirm first so the old save stays exportable on cancel.
        if (loaded.kind === 'needs-consent' || loaded.report.changed) {
            setPendingSaveLoad(loaded);
            return;
        }

        commitLoadedSort(loaded.sort);
    }

    function commitLoadedSort(loadedSort: SortState): void {
        const savedScores = storage.loadScores();
        const nextSort = resolveAutoSkips(loadedSort, savedScores, settings);
        setPendingSaveLoad(null);
        setScoresBySongId(savedScores);
        setSort(nextSort);
        setScreen(screenFor(nextSort));
        storage.saveSort(nextSort);
        setSorterAutoPlayForSort(nextSort, settings, savedScores);
    }

    function discardUnusableSave(): void {
        storage.dropSort();
        setUnusableSaveReason(null);
        setSort(null);
        setScreen('landing');
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
        if (scoreEnabled && settings.playlistAutoAdvance === 'only-if-scored') {
            const currentIndex = playlistOrder[playlistPosition] ?? null;
            const currentSong = currentIndex !== null ? (resolvedSongs[currentIndex] ?? null) : null;
            if (currentSong !== null && !hasMemoryScore(songEntryId(currentSong), scoresBySongId)) {
                return; // song ended without a score — stay on the current song
            }
        }
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
            catalog,
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
        if (!writebackConfig?.scoreColumnHeader || !googleSpreadsheetSelection || googleSpreadsheetSelection.writebackSupported === false) {
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
        if (!currentSort || !writebackConfig || !googleSpreadsheetSelection || googleSpreadsheetSelection.writebackSupported === false) {
            return Promise.resolve(0);
        }

        const spreadsheet = googleSpreadsheetSelection;
        if (lastEagerRankSpreadsheetIdRef.current !== spreadsheet.id) {
            lastEagerRankWritebackRef.current.clear();
            lastEagerRankSpreadsheetIdRef.current = spreadsheet.id;
        }

        const fixedRanks = fixedProjectedRanksBySongId(currentSort, catalog, currentScoresBySongId, currentSettings, scoreEnabled);
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
            const choice = automaticChoiceForCurrentBattle(nextSort, catalog, currentScoresBySongId, currentSettings, scoreEnabled);
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

        const [leftId, rightId] = battle;
        const leftSong = catalog.byId.get(leftId);
        const rightSong = catalog.byId.get(rightId);
        if (!leftSong || !rightSong) {
            return;
        }

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

        const ranks = completeRanking(resolvedSongs, sort);
        if (!ranks) {
            alert(incompleteRankingMessage(resolvedSongs, sort));
            return;
        }

        const lines = resolvedSongs.map((song) => String(ranks.get(songEntryId(song)) ?? ''));

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

    function copyScores(): void {
        if (!scoreEnabled) {
            return;
        }

        const lines = resolvedSongs.map((song) => {
            const id = songEntryId(song);
            return scoresBySongId[id] ?? '';
        });

        void navigator.clipboard
            .writeText(lines.join('\n'))
            .then(() => {
                alert('Copied scores to clipboard!');
            })
            .catch((error: unknown) => {
                console.error('Error copying scores:', error);
                alert('Could not copy scores to clipboard.');
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

        if (googleSpreadsheetSelection.writebackSupported === false) {
            alert(UNSUPPORTED_SPREADSHEET_MESSAGE);
            return;
        }

        let normalizedScoresBySongId: Map<number, number> | undefined;
        try {
            normalizedScoresBySongId = scoreEnabled ? normalizedScoresForWriteback(scoresBySongId) : undefined;
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Scores must be numbers from 0 to 10.');
            return;
        }

        const ranksForSheet = completeRanking(resolvedSongs, sort);
        if (!ranksForSheet) {
            alert(incompleteRankingMessage(resolvedSongs, sort));
            return;
        }

        setWritingSheet(true);
        void writeRanksToGoogleSheet(writebackConfig, ranksForSheet, googleSpreadsheetSelection, normalizedScoresBySongId)
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

        if (googleSpreadsheetSelection.writebackSupported === false) {
            alert(UNSUPPORTED_SPREADSHEET_MESSAGE);
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
                const markUnsupported = (message: string): void => {
                    const unsupported: GoogleSpreadsheetSelection = {id: spreadsheet.id, name: spreadsheet.name, writebackSupported: false};
                    setGoogleSpreadsheetSelection(unsupported);
                    storage.saveGoogleSpreadsheetSelection(unsupported);
                    setSheetScoresBySongId({});
                    setSheetScoreStatus({state: 'error', message});
                    alert(`Selected ${spreadsheet.name}, but it can’t be synced. ${message}`);
                };

                const selection: GoogleSpreadsheetSelection = {id: spreadsheet.id, name: spreadsheet.name, writebackSupported: true};
                setGoogleSpreadsheetSelection(selection);
                storage.saveGoogleSpreadsheetSelection(selection);

                if (scoreEnabled) {
                    try {
                        const sheetScores = await loadScoresFromGoogleSheet(writebackConfig, selection, songIds);
                        const loadedScores = scoresRecordFromSheet(sheetScores);
                        setScoresBySongId((currentScores) => {
                            const nextScores = mergeLoadedScores(currentScores, loadedScores);
                            storage.saveScores(nextScores);
                            return nextScores;
                        });
                    } catch (error) {
                        if (error instanceof UnsupportedSpreadsheetError) {
                            markUnsupported(error.message);
                            return;
                        }

                        console.error('Error loading scores from Google Sheet:', error);
                        alert(`Selected ${spreadsheet.name}, but could not load scores. ${messageFromError(error)}`);
                    }
                } else {
                    try {
                        await validateSpreadsheetSupported(writebackConfig, selection);
                    } catch (error) {
                        if (error instanceof UnsupportedSpreadsheetError) {
                            markUnsupported(error.message);
                            return;
                        }

                        // Auth/network problems aren't fatal to selection here; keep the sheet
                        // selected and let a later write surface any real error.
                        console.error('Error validating Google Sheet:', error);
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
        const importedLoad = storage.loadSort();
        const importedSort = importedLoad.kind === 'ready' || importedLoad.kind === 'needs-consent'
            ? importedLoad.sort
            : null;
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
    // Disables the Google read/write actions (but not the picker) when the selected file is an
    // Office file (.xlsx) the Sheets API can't sync. Reuses the existing "disabled reason" pattern.
    const sheetWritebackDisabledReason =
        googleSheetsDisabledReason ??
        (googleSpreadsheetSelection?.writebackSupported === false ? UNSUPPORTED_SPREADSHEET_SHORT : null);
    const writeSheetSetupReason = config.googleSheets && !googleSpreadsheetSelection ? 'Choose a Google Sheet in Settings.' : null;
    const legacySorterSaveInfo = isSettingsOpen && rankSupported ? storage.findLegacySorterSave() : null;
    const savedSortDiagnostic = isSettingsOpen && rankSupported ? describeSavedSort(storage.peekSort(), catalog.ids.length) : null;

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
                ? progressPercentage(sort)
                : 0;

    const currentPlaylistSongIndex = playlistOrder[playlistPosition] ?? 0;
    const currentPlaylistSong = playlistOrder.length > 0 ? resolvedSongs[currentPlaylistSongIndex] ?? null : null;
    const scoredPlaylistSongCount = countScoredSongs(resolvedSongs, scoresBySongId);

    return (
        <>
            <a className="collection-back-link" href="../">
                <svg className="collection-back-link__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Sorter Collection</span>
            </a>
            <ConfirmModal
                open={isStartConfirmOpen}
                title="Start new sort"
                message="Starting a new sort deletes all saved picks for this sorter. Scores are kept."
                confirmLabel="Start"
                onConfirm={confirmStart}
                onCancel={() => setStartConfirmOpen(false)}
            />
            <ConfirmModal
                open={pendingSaveLoad !== null}
                title={pendingSaveLoad?.kind === 'needs-consent' ? 'Check saved progress' : 'Song list updated'}
                message={pendingSaveLoad ? pendingLoadMessage(pendingSaveLoad, catalog.ids.length) : ''}
                confirmLabel={pendingSaveLoad ? pendingLoadConfirmLabel(pendingSaveLoad) : ''}
                onConfirm={() => pendingSaveLoad && commitLoadedSort(pendingSaveLoad.sort)}
                onCancel={() => setPendingSaveLoad(null)}
            />
            <ConfirmModal
                open={unusableSaveReason !== null}
                title="Saved progress cannot be used"
                message={`${unusableSaveReason ?? ''} You can export it from Settings before discarding.`}
                confirmLabel="Discard progress"
                cancelLabel="Keep"
                onConfirm={discardUnusableSave}
                onCancel={() => setUnusableSaveReason(null)}
            />
            <SettingsModal
                open={isSettingsOpen}
                settings={settings}
                scoreEnabled={scoreEnabled}
                googleSheetsConfigured={Boolean(config.googleSheets)}
                googleSheetsDisabledReason={googleSheetsDisabledReason}
                googleSpreadsheetSelection={googleSpreadsheetSelection}
                isConnectingGoogleSheet={isConnectingGoogleSheet}
                legacySorterSaveInfo={legacySorterSaveInfo}
                savedSortDiagnostic={savedSortDiagnostic}
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
                catalog={catalog}
                scoresBySongId={scoresBySongId}
                onClose={() => setHistoryOpen(false)}
            />
            <SongListModal
                open={isSongListOpen}
                catalog={catalog}
                sort={sort}
                settings={settings}
                scoreEnabled={scoreEnabled}
                scoresBySongId={scoresBySongId}
                sheetScoresBySongId={sheetScoresBySongId}
                sheetScoreStatus={sheetScoreStatus}
                googleSpreadsheetSelection={googleSpreadsheetSelection}
                canWriteSheetScores={Boolean(googleWritebackConfig() && googleSpreadsheetSelection && googleSpreadsheetSelection.writebackSupported !== false)}
                isWritingSheetScores={isWritingSheetScores}
                onScoreChange={updateScore}
                onWriteSheetScores={writeSongListScoresToSheet}
                onClose={() => setSongListOpen(false)}
            />
            <div className={`main-page ${screen === 'landing' ? 'main-page--landing' : ''}`}>
                {screen !== 'sorting' ? (
                    <div className="title" style={screen === 'complete' ? {height: '3%'} : undefined}>
                        {screen === 'complete'
                        ? 'Results'
                        : screen === 'playlist'
                            ? 'Playlist'
                            : landingTitle(savedKind, rankSupported, savedListChange)}
                    </div>
                ) : null}

                <Controls
                    screen={screen}
                    savedKind={savedKind}
                    rankSupported={rankSupported}
                    googleSheetsEnabled={Boolean(config.googleSheets)}
                    googleSheetsDisabledReason={sheetWritebackDisabledReason}
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
                    onCopyScores={copyScores}
                    onWriteRanksToSheet={writeRanksToSheet}
                    onSetupGoogleSheet={chooseSheet}
                    scoreEnabled={scoreEnabled}
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
                        canWriteSheetScores={Boolean(googleWritebackConfig() && googleSpreadsheetSelection && googleSpreadsheetSelection.writebackSupported !== false)}
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
                                    catalog={catalog}
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
    catalog: SongCatalog,
    scoresBySongId: SongScoresById,
    settings: Settings,
    scoreEnabled: boolean,
): Map<number, number> {
    const projectedInfos = projectedSongSortInfos(sort, catalog.ids, {catalog, scoresBySongId, settings, scoreEnabled});
    const ranks = new Map<number, number>();

    for (const songId of catalog.ids) {
        const info = projectedInfos.get(songId);
        if (info && info.minRank === info.maxRank) {
            ranks.set(songId, info.minRank);
        }
    }

    return ranks;
}

function changedRanks(currentRanks: Map<number, number>, lastWrittenRanks: Map<number, number>): Map<number, number> {
    return new Map(
        [...currentRanks.entries()].filter(([songId, rank]) => lastWrittenRanks.get(songId) !== rank),
    );
}

export function fallbackAnimeName(config: AppConfig): string {
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
    catalog: SongCatalog,
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
        return higherScoredBattleSide(battle, scoresBySongId, catalog, scoreEnabled) ?? 'left';
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
    catalog: SongCatalog,
    scoreEnabled: boolean,
): SortChoice | null {
    if (!scoreEnabled) {
        return null;
    }

    const [leftId, rightId] = battle;
    const leftSong = catalog.byId.get(leftId);
    const rightSong = catalog.byId.get(rightId);
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
