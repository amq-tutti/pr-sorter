import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "princession-orchestra",
  title: "Princession Orchestra",
  description: "Party rank sorter for all Princession Orchestra songs (anime + image songs)",
  tags: ["Franchise"],
  deadline: new Date("2026-06-11T22:00:00.000Z"),
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score (optional)",
  },
} satisfies AppConfig;
