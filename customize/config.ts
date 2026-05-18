import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "test",
  title: "test! Sorter",
  description: "Party rank sorter for your custom list of songs.",
  googleSheets: {
    clientId: "575550662002-hivobiln683gua375ss3b7k58afnn36t.apps.googleusercontent.com",
    appId: "575550662002",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score (optional)",
  },
} satisfies AppConfig;
