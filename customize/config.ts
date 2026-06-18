import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "lozareena",
  title: "Lozareena",
  description: "Party rank sorter for Lozareena anime songs",
  tags: ["Artist"],
  deadline: new Date("2026-06-01T20:00:00.000Z"),
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score",
  },
} satisfies AppConfig;
