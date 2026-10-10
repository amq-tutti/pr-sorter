import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "doraemon-movie-eds",
  title: "Doraemon Movie EDs",
  description: "Party rank sorter for Doraemon movie ending songs",
  tags: ["Franchise"],
  deadline: new Date("2026-10-22T04:00:00.000Z"),
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score",
  },
} satisfies AppConfig;
