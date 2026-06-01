export type AppConfig = {
  localStoragePrefix: string;
  title: string;
  description: string;
  fallbackAnimeName?: string;
  googleSheets?: GoogleSheetsConfig;
};

export type GoogleSheetsConfig = {
  clientId: string;
  appId: string;
  rankColumnHeader: string;
  scoreColumnHeader?: string;
};

export type GoogleSpreadsheetSelection = {
  id: string;
  name: string;
};

export type Region = "eu" | "naw" | "nae";

export type MediaFormat = "video" | "audio" | "full";

export type Settings = {
  mediaFormat: MediaFormat;
  region: Region;
  autoSkipScoreDifference: number;
};

export type Screen = "landing" | "sorting" | "complete" | "playlist";

export type SavedProgressKind = "none" | "in-progress" | "complete";

export type SongScoresById = Record<number, string>;
