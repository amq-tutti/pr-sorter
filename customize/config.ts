import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "crystal-kay",
  title: "Crystal Kay",
  tags: ["Artist"],
  deadline: "2026-06-09T20:00:00.000Z",
  description: "Party rank sorter for Crystal Kay anime song",
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score",
  },
} satisfies AppConfig;
