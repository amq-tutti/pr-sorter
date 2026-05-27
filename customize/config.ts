import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "movie-anisongs",
  title: "Movie Anisongs",
  description: "Party rank sorter for nominated songs from anime movies",
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    allowCustomScoreColumn: true,
  },
} satisfies AppConfig;
