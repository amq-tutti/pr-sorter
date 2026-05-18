import { useEffect, useMemo, useState } from "react";
import {
  choose,
  chooseAutomatic,
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
import { GooglePickerCanceledError, GoogleWritebackError } from "../google/types";
import { chooseGoogleSpreadsheet, loadScoresFromGoogleSheet, writeRanksToGoogleSheet } from "../google/googleSheetsWriteback";
import type { Song } from "../songs";
import { Controls } from "./components/Controls";
import { Duel } from "./components/Duel";
import { HistoryModal } from "./components/HistoryModal";
import { Progress } from "./components/Progress";
import { Results } from "./components/Results";
import { SettingsModal } from "./components/SettingsModal";
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
  const songIds = useMemo(() => songs.map((song) => song.id), [songs]);
  const storage = useMemo(() => createStorage(config, songIds), [config, songIds]);
  const scoreEnabled = isScoreEnabled(config);
  const [screen, setScreen] = useState<Screen>("landing");
  const [settings, setSettings] = useState<Settings>(() => storage.loadSettings());
  const [scoresBySongId, setScoresBySongId] = useState<SongScoresById>(() => storage.loadScores());
  const [sort, setSort] = useState<SortState | null>(null);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isWritingSheet, setWritingSheet] = useState(false);
  const [isConnectingGoogleSheet, setConnectingGoogleSheet] = useState(false);
  const [googleSpreadsheetSelection, setGoogleSpreadsheetSelection] = useState<GoogleSpreadsheetSelection | null>(() =>
    storage.loadGoogleSpreadsheetSelection(),
  );

  useEffect(() => {
    document.title = config.title;
    document.querySelector('meta[name="og:site_name"]')?.setAttribute("content", config.title);
    document.querySelector('meta[name="og:description"]')?.setAttribute("content", config.description);
  }, [config.description, config.title]);

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
    if (scoreEnabled) {
      storage.clearScores();
      setScoresBySongId({});
    }

    const nextSort = createSort(songs.length);
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

  function updateScore(songId: number, score: string): void {
    if (!scoreEnabled) {
      return;
    }

    const nextScores = { ...scoresBySongId, [songId]: score };
    setScoresBySongId(nextScores);
    storage.saveScores(nextScores);
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
    const leftSong = songs[leftIndex];
    const rightSong = songs[rightIndex];
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
    const maxIterations = songs.length * songs.length * 2;

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
    const leftSong = songs[leftIndex];
    const rightSong = songs[rightIndex];
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

    const ranks = ranksBySongId(songs, sort);
    const lines = songs.map((song) => {
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
    void writeRanksToGoogleSheet(writebackConfig, ranksBySongId(songs, sort), googleSpreadsheetSelection, normalizedScoresBySongId)
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

  function chooseSheet(): void {
    const writebackConfig = googleWritebackConfig();
    if (!writebackConfig) {
      alert("Google integration is not configured.");
      return;
    }

    setConnectingGoogleSheet(true);
    void chooseGoogleSpreadsheet(writebackConfig)
      .then(async (spreadsheet) => {
        let loadedScoreCount = 0;
        if (scoreEnabled) {
          const sheetScores = await loadScoresFromGoogleSheet(writebackConfig, spreadsheet, songIds);
          const nextScores = scoresRecordFromSheet(sheetScores);
          loadedScoreCount = Object.keys(nextScores).length;
          setScoresBySongId(nextScores);
          storage.saveScores(nextScores);
        }

        setGoogleSpreadsheetSelection(spreadsheet);
        storage.saveGoogleSpreadsheetSelection(spreadsheet);
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
        ? progressPercentage(sort, songs.length)
        : 0;

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
        songs={songs}
        scoresBySongId={scoresBySongId}
        onClose={() => setHistoryOpen(false)}
      />
      <div className={`main-page ${screen === "landing" ? "main-page--landing" : ""}`}>
        {screen !== "sorting" ? (
          <div className="title" style={screen === "complete" ? { height: "3%" } : undefined}>
            {screen === "complete" ? "Results" : landingTitle(savedKind)}
          </div>
        ) : null}

        <Controls
          screen={screen}
          savedKind={savedKind}
          googleSheetsEnabled={Boolean(config.googleSheets)}
          googleSheetsDisabledReason={googleSheetsDisabledReason}
          googleSheetsSetupReason={writeSheetSetupReason}
          isWritingSheet={isWritingSheet}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onStart={startSort}
          onLoad={loadSort}
          onUndo={undoPick}
          onCopyRanks={copyRanks}
          onWriteRanksToSheet={writeRanksToSheet}
          onSetupGoogleSheet={() => setSettingsOpen(true)}
        />

        {screen !== "landing" && sort ? (
          <>
            <div className="duel-container">
              {screen === "sorting" ? (
                <Duel
                  songs={songs}
                  sort={sort}
                  settings={settings}
                  scoreEnabled={scoreEnabled}
                  scoresBySongId={scoresBySongId}
                  onPick={pick}
                  onScoreChange={updateScore}
                />
              ) : null}
              {screen === "complete" ? (
                <Results songs={songs} sort={sort} scoreEnabled={scoreEnabled} scoresBySongId={scoresBySongId} />
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
    normalizeScore(rawScore);
    scores[songId] = rawScore;
  }

  return scores;
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
