import { useEffect, useMemo, useRef, useState } from "react";
import {
  choose,
  chooseAutomatic,
  canUndo,
  createSort,
  currentBattle,
  isComplete,
  pickHistory,
  progressPercentage,
  ranksBySongId,
  undo,
  type SortChoice,
  type SortState,
} from "../sorter";
import { GoogleAuthenticationRequiredError, GooglePickerCanceledError, GoogleWritebackError } from "../google/types";
import { chooseGoogleSpreadsheet, loadScoresFromGoogleSheet, writeRanksToGoogleSheet, writeScoresToGoogleSheet } from "../google/googleSheetsWriteback";
import { resolveSongAnime, type Song } from "../songs";
import { Controls } from "./components/Controls";
import { Duel } from "./components/Duel";
import { HistoryModal } from "./components/HistoryModal";
import { Playlist, type PlaylistMode, type PlaylistScoreFilter } from "./components/Playlist";
import { Progress } from "./components/Progress";
import { Results } from "./components/Results";
import { SettingsModal } from "./components/SettingsModal";
import { SongListModal } from "./components/SongListModal";
import { isScoreEnabled, normalizeScore } from "./internal/songScores";
import { createStorage } from "./storage";
import type { AppConfig, GoogleSpreadsheetSelection, SavedProgressKind, Screen, Settings, SongScoresById } from "./types";

type AppProps = {
  config: AppConfig;
  songs: Song[];
};

const screenFor = (sort: SortState | null): Screen => {
  if (!sort) {
    return "landing";
  }

  return isComplete(sort) ? "complete" : "sorting";
};

export function App({ config, songs }: AppProps) {
  const resolvedSongs = useMemo(
    () => songs.map((song) => resolveSongAnime(song, fallbackAnimeName(config))),
    [config, songs],
  );
  const songIds = useMemo(() => resolvedSongs.map((song) => song.id), [resolvedSongs]);
  const storage = useMemo(() => createStorage(config, songIds), [config, songIds]);
  const scoreEnabled = isScoreEnabled(config);
  const [screen, setScreen] = useState<Screen>("landing");
  const [settings, setSettings] = useState<Settings>(() => storage.loadSettings());
  const [scoresBySongId, setScoresBySongId] = useState<SongScoresById>(() => storage.loadScores());
  const [playlistMode, setPlaylistMode] = useState<PlaylistMode>("in-order");
  const [playlistScoreFilter, setPlaylistScoreFilter] = useState<PlaylistScoreFilter>("all");
  const [playlistOrder, setPlaylistOrder] = useState<number[]>(() => createPlaylistOrder(resolvedSongs.length, "in-order"));
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
    | { state: "unavailable"; message: string }
    | { state: "loading"; message: string }
    | { state: "ready"; message: string }
    | { state: "error"; message: string }
  >({ state: "unavailable", message: "Choose a Google Sheet in Settings to show live sheet scores." });
  const [googleSpreadsheetSelection, setGoogleSpreadsheetSelection] = useState<GoogleSpreadsheetSelection | null>(() =>
    storage.loadGoogleSpreadsheetSelection(),
  );
  const pendingScoreWritebackRef = useRef<Map<number, number>>(new Map());
  const scoreWritebackQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    document.title = config.title;
    document.querySelector('meta[name="og:site_name"]')?.setAttribute("content", config.title);
    document.querySelector('meta[name="og:description"]')?.setAttribute("content", config.description);
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
      setSheetScoreStatus({ state: "unavailable", message: "Score support is disabled for this sorter." });
      return;
    }

    const writebackConfig = googleWritebackConfig();
    if (!writebackConfig?.scoreColumnHeader || !googleSpreadsheetSelection) {
      setSheetScoresBySongId({});
      setSheetScoreStatus({ state: "unavailable", message: "Choose a Google Sheet in Settings to show live sheet scores." });
      return;
    }

    let canceled = false;
    setSheetScoreStatus({ state: "loading", message: "Loading live sheet scores..." });

    void loadScoresFromGoogleSheet(writebackConfig, googleSpreadsheetSelection, songIds)
      .then((sheetScores) => {
        if (canceled) {
          return;
        }

        setSheetScoresBySongId(scoresRecordFromSheet(sheetScores));
        setSheetScoreStatus({ state: "ready", message: `Loaded sheet scores from ${googleSpreadsheetSelection.name}.` });
      })
      .catch((error: unknown) => {
        if (canceled) {
          return;
        }

        console.error("Error loading scores from Google Sheet:", error);
        setSheetScoresBySongId({});
        setSheetScoreStatus({
          state: "error",
          message: error instanceof GoogleWritebackError ? error.message : "Could not load sheet scores.",
        });
      });

    return () => {
      canceled = true;
    };
  }, [googleSpreadsheetSelection, isSongListOpen, scoreEnabled, songIds]);

  const savedKind: SavedProgressKind = useMemo(() => {
    if (screen !== "landing") {
      return "none";
    }

    const savedSort = storage.loadSort();
    if (!savedSort) {
      return "none";
    }

    return isComplete(savedSort) ? "complete" : "in-progress";
  }, [screen, storage]);

  function startSort(): void {
    const nextSort = createSort(resolvedSongs.length);
    setSort(nextSort);
    setScreen(screenFor(nextSort));
    storage.saveSort(nextSort);
  }

  function loadSort(): void {
    const savedSort = storage.loadSort();
    if (!savedSort) {
      setScreen("landing");
      setSort(null);
      return;
    }

    const savedScores = storage.loadScores();
    const nextSort = resolveAutoSkips(savedSort, savedScores, settings);
    setScoresBySongId(savedScores);
    setSort(nextSort);
    setScreen(screenFor(nextSort));
    storage.saveSort(nextSort);
  }

  function pick(choice: SortChoice): void {
    if (!sort) {
      return;
    }

    const nextSort = resolveAutoSkips(choose(sort, choice), scoresBySongId, settings);
    setSort(nextSort);
    setScreen(screenFor(nextSort));
    storage.saveSort(nextSort);
    flushPendingScoreWriteback();
  }

  function undoPick(): void {
    if (!sort) {
      return;
    }

    const nextSort = undo(sort);
    setSort(nextSort);
    setScreen(screenFor(nextSort));
    storage.saveSort(nextSort);
  }

  function updateSettings(nextSettings: Settings): void {
    setSettings(nextSettings);
    storage.saveSettings(nextSettings);
  }

  function openPlaylist(): void {
    const eligibleIndexes = playlistEligibleIndexes();
    setPlaylistOrder(createPlaylistOrder(resolvedSongs.length, playlistMode, eligibleIndexes));
    setPlaylistPosition(0);

    setScreen("playlist");
  }

  function exitPlaylist(): void {
    setScreen(screenFor(sort));
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
    flushPendingScoreWriteback({ allowAuthPrompt: true });
    movePlaylistSong(1);
  }

  function previousPlaylistSong(): void {
    flushPendingScoreWriteback({ allowAuthPrompt: true });
    movePlaylistSong(-1);
  }

  function autoNextPlaylistSong(): void {
    flushPendingScoreWriteback({ allowAuthPrompt: false });
    movePlaylistSong(1);
  }

  function movePlaylistSong(direction: 1 | -1): void {
    if (playlistScoreFilter === "all") {
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

    const nextScores = { ...scoresBySongId, [songId]: score };
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

  function flushPendingScoreWriteback(options: { allowAuthPrompt?: boolean } = { allowAuthPrompt: true }): void {
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

          console.error("Error writing scores to Google Sheet:", error);
        }
      });
  }

  function autoChoiceForCurrentBattle(
    currentSort: SortState,
    currentScoresBySongId: SongScoresById,
    currentSettings: Settings,
  ): SortChoice | null {
    if (!scoreEnabled) {
      return null;
    }

    const battle = currentBattle(currentSort);
    if (!battle) {
      return null;
    }

    const [leftIndex, rightIndex] = battle;
    const leftSong = resolvedSongs[leftIndex];
    const rightSong = resolvedSongs[rightIndex];
    if (!leftSong || !rightSong) {
      return null;
    }

    try {
      const leftScore = normalizeScore(currentScoresBySongId[leftSong.id] ?? "");
      const rightScore = normalizeScore(currentScoresBySongId[rightSong.id] ?? "");
      if (leftScore === null || rightScore === null || leftScore === rightScore) {
        return null;
      }

      const difference = Math.abs(leftScore - rightScore);
      if (difference < currentSettings.autoSkipScoreDifference) {
        return null;
      }

      return leftScore > rightScore ? "left" : "right";
    } catch {
      return null;
    }
  }

  function resolveAutoSkips(
    currentSort: SortState,
    currentScoresBySongId: SongScoresById,
    currentSettings: Settings,
  ): SortState {
    let nextSort = currentSort;
    const maxIterations = resolvedSongs.length * resolvedSongs.length * 2;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const choice = autoChoiceForCurrentBattle(nextSort, currentScoresBySongId, currentSettings);
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

    console.info("Auto-skipped comparison", {
      picked: choice,
      left: {
        id: leftSong.id,
        anime: leftSong.anime,
        name: leftSong.name,
        score: currentScoresBySongId[leftSong.id] ?? "",
      },
      right: {
        id: rightSong.id,
        anime: rightSong.anime,
        name: rightSong.name,
        score: currentScoresBySongId[rightSong.id] ?? "",
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
    if (!sort) {
      return;
    }

    const ranks = ranksBySongId(resolvedSongs, sort);
    const lines = resolvedSongs.map((song) => {
      const rank = ranks.get(song.id);
      if (rank === undefined) {
        throw new Error(`Missing rank for song id ${song.id}.`);
      }
      return String(rank);
    });

    void navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        alert("Copied ranks to clipboard!");
      })
      .catch((error: unknown) => {
        console.error("Error copying ranks:", error);
        alert("Could not copy ranks to clipboard.");
      });
  }

  function writeRanksToSheet(): void {
    if (screen !== "complete" || !sort) {
      return;
    }

    const writebackConfig = googleWritebackConfig();
    if (!writebackConfig) {
      alert("Google integration is not configured.");
      return;
    }

    if (!googleSpreadsheetSelection) {
      alert("Choose a Google Sheet in Settings before writing ranks.");
      return;
    }

    let normalizedScoresBySongId: Map<number, number> | undefined;
    try {
      normalizedScoresBySongId = scoreEnabled ? normalizedScoresForWriteback(scoresBySongId) : undefined;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Scores must be numbers from 0 to 10.");
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

        console.error("Error writing ranks to Google Sheet:", error);
        alert(error instanceof GoogleWritebackError ? error.message : "Could not write ranks to Google Sheet.");
      })
      .finally(() => {
        setWritingSheet(false);
      });
  }

  function writeSongListScoresToSheet(): void {
    if (!scoreEnabled) {
      alert("Score support is disabled for this sorter.");
      return;
    }

    const writebackConfig = googleWritebackConfig();
    if (!writebackConfig?.scoreColumnHeader) {
      alert("Google score writeback is not configured.");
      return;
    }

    if (!googleSpreadsheetSelection) {
      alert("Choose a Google Sheet in Settings before writing scores.");
      return;
    }

    let normalizedScoresBySongId: Map<number, number> | undefined;
    try {
      normalizedScoresBySongId = normalizedScoresForWriteback(scoresBySongId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Scores must be numbers from 0 to 10.");
      return;
    }

    if (!normalizedScoresBySongId) {
      alert("There are no scores to write.");
      return;
    }

    setWritingSheetScores(true);
    void writeScoresToGoogleSheet(writebackConfig, googleSpreadsheetSelection, normalizedScoresBySongId)
      .then(() => {
        pendingScoreWritebackRef.current.clear();
        setSheetScoresBySongId((current) => ({
          ...current,
          ...scoresRecordFromNumericScores(normalizedScoresBySongId),
        }));
        setSheetScoreStatus({ state: "ready", message: `Updated sheet scores in ${googleSpreadsheetSelection.name}.` });
      })
      .catch((error: unknown) => {
        console.error("Error writing scores to Google Sheet:", error);
        alert(error instanceof GoogleWritebackError ? error.message : "Could not write scores to Google Sheet.");
      })
      .finally(() => {
        setWritingSheetScores(false);
      });
  }

  function chooseSheet(): void {
    const writebackConfig = googleWritebackConfig();
    if (!writebackConfig) {
      alert("Google integration is not configured.");
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
            console.error("Error loading scores from Google Sheet:", error);
            alert(`Selected ${spreadsheet.name}, but could not load scores. ${messageFromError(error)}`);
          }
        }
      })
      .catch((error: unknown) => {
        if (error instanceof GooglePickerCanceledError) {
          return;
        }

        console.error("Error choosing Google Sheet:", error);
        alert(error instanceof GoogleWritebackError ? error.message : "Could not choose Google Sheet.");
      })
      .finally(() => {
        setConnectingGoogleSheet(false);
      });
  }

  function clearSheetSelection(): void {
    setGoogleSpreadsheetSelection(null);
    storage.clearGoogleSpreadsheetSelection();
  }

  function playlistEligibleIndexes(nextFilter: PlaylistScoreFilter = playlistScoreFilter): number[] {
    if (!scoreEnabled || nextFilter === "all") {
      return Array.from({ length: resolvedSongs.length }, (_, index) => index);
    }

    return resolvedSongs
      .map((song, index) => (hasMemoryScore(song.id, scoresBySongId) ? null : index))
      .filter((index): index is number => index !== null);
  }

  const googleSheetsDisabledReason = config.googleSheets && !import.meta.env.VITE_GOOGLE_API_KEY
    ? "Google API key is not configured."
    : null;
  const writeSheetSetupReason = config.googleSheets && !googleSpreadsheetSelection ? "Choose a Google Sheet in Settings." : null;

  const progressLabel =
    sort && screen === "complete"
      ? `Completed! (${sort.battleNo} battles)`
      : sort && screen === "sorting"
        ? `Battle no. ${sort.battleNo}`
        : "";
  const progressValue =
    sort && screen === "complete"
      ? 100
      : sort && screen === "sorting"
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
        onClose={() => setSettingsOpen(false)}
        onChange={updateSettings}
        onChooseGoogleSheet={chooseSheet}
        onClearGoogleSheet={clearSheetSelection}
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
        scoreEnabled={scoreEnabled}
        scoresBySongId={scoresBySongId}
        sheetScoresBySongId={sheetScoresBySongId}
        sheetScoreStatus={sheetScoreStatus}
        googleSpreadsheetSelection={googleSpreadsheetSelection}
        canWriteSheetScores={Boolean(scoreEnabled && googleWritebackConfig()?.scoreColumnHeader && googleSpreadsheetSelection)}
        isWritingSheetScores={isWritingSheetScores}
        onScoreChange={updateScore}
        onWriteSheetScores={writeSongListScoresToSheet}
        onClose={() => setSongListOpen(false)}
      />
      <div className={`main-page ${screen === "landing" ? "main-page--landing" : ""}`}>
        {screen !== "sorting" ? (
          <div className="title" style={screen === "complete" ? { height: "3%" } : undefined}>
            {screen === "complete" ? "Results" : screen === "playlist" ? "Playlist" : landingTitle(savedKind)}
          </div>
        ) : null}

        <Controls
          screen={screen}
          savedKind={savedKind}
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
          onSetupGoogleSheet={() => setSettingsOpen(true)}
        />

        {screen === "playlist" ? (
          <Playlist
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
            onModeChange={changePlaylistMode}
            onScoreFilterChange={changePlaylistScoreFilter}
            onPrevious={previousPlaylistSong}
            onNext={nextPlaylistSong}
            onAutoNext={autoNextPlaylistSong}
            onScoreChange={updateScore}
          />
        ) : screen !== "landing" && sort ? (
          <>
            <div className="duel-container">
              {screen === "sorting" ? (
                <Duel
                  songs={resolvedSongs}
                  sort={sort}
                  settings={settings}
                  scoreEnabled={scoreEnabled}
                  scoresBySongId={scoresBySongId}
                  onPick={pick}
                  onScoreChange={updateScore}
                />
              ) : null}
              {screen === "complete" ? (
                <Results songs={resolvedSongs} sort={sort} scoreEnabled={scoreEnabled} scoresBySongId={scoresBySongId} />
              ) : null}
            </div>
            <Progress label={progressLabel} percentage={progressValue} />
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
  return error instanceof Error ? error.message : "Unknown error.";
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

function landingTitle(savedKind: SavedProgressKind): string {
  if (savedKind === "complete") {
    return 'Press "Start" to begin sorting or "Show Results" to display results of previous sorting.';
  }

  if (savedKind === "in-progress") {
    return 'Press "Start" to begin sorting or "Continue" to load saved progress and resume where you left.';
  }

  return 'Press "Start" to begin sorting.';
}

function fallbackAnimeName(config: AppConfig): string {
  return config.fallbackAnimeName?.trim() || config.title.replace(/\s+Sorter$/i, "").trim() || config.title;
}

function isAuthenticationWritebackError(error: unknown): boolean {
  return (
    error instanceof GoogleAuthenticationRequiredError ||
    (error instanceof GoogleWritebackError && error.message === "OAuth token expired or was rejected.")
  );
}

function createPlaylistOrder(songCount: number, mode: PlaylistMode, eligibleIndexes?: number[]): number[] {
  const order = eligibleIndexes ?? Array.from({ length: songCount }, (_, index) => index);
  if (mode === "in-order") {
    return order;
  }

  return shuffledPlaylistOrder(order);
}

function filteredPlaylistOrder(currentOrder: number[], eligibleIndexes: number[], mode: PlaylistMode): number[] {
  if (mode === "in-order") {
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

function countScoredSongs(songs: { id: number }[], scoresBySongId: SongScoresById): number {
  return songs.filter((song) => hasMemoryScore(song.id, scoresBySongId)).length;
}

function hasMemoryScore(songId: number, scoresBySongId: SongScoresById): boolean {
  try {
    return normalizeScore(scoresBySongId[songId] ?? "") !== null;
  } catch {
    return false;
  }
}
