import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "test-sorter",
  title: "Test! Sorter",
  description: "Party rank sorter for your custom list of songs.",
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score (optional)",
  },
} satisfies AppConfig;
