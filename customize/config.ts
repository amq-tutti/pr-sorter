import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "ayame",
  title: "AYAME / AliA",
  description: "Party rank sorter for AYAME / AliA anime songs",
  tags: ["Artist"],
  deadline: new Date("2026-11-07T04:59:00.000Z"),
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score",
  },
} satisfies AppConfig;
