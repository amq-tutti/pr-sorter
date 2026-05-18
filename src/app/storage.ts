import type { SortState } from "../sorter";
import { z } from "zod";
import type { AppConfig, GoogleSpreadsheetSelection, Settings, SongScoresById } from "./types";
import { isSortState } from "./internal/savedSortValidation";
import { isScoreEnabled } from "./internal/songScores";

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
};

const settingsSchema = z.object({
  mediaFormat: z.enum(["video", "audio", "full"]),
  region: z.enum(["eu", "naw", "nae"]),
  autoSkipScoreDifference: z.number().min(0).max(10).default(10),
});

const scoresSchema = z.record(z.string(), z.string());

const googleSpreadsheetSelectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export function createStorage(config: AppConfig, songIds: number[]): StorageFacade {
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
    const fallback: Settings = { mediaFormat: "video", region: "eu", autoSkipScoreDifference: 10 };
    const raw = localStorage.getItem(settingsKey);
    if (!raw) {
      return fallback;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      const result = settingsSchema.safeParse(parsed);
      if (result.success) {
        return result.data;
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
  };
}
