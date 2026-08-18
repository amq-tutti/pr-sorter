import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "nana-mizuki",
  title: "Nana Mizuki",
  description: "Party rank sorter for Nana Mizuki solo/duet anime songs",
  tags: ["Artist"],
  deadline: new Date("2026-10-17T04:00:00.000Z"),
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score",
  },
} satisfies AppConfig;
