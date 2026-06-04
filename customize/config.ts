import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "yorushika",
  title: "Yorushika",
  tags: ["Artist"],
  deadline: "2026-06-09T20:00:00.000Z",
  description: "Party rank sorter for Yorushika anime songs",
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score",
  },
} satisfies AppConfig;
