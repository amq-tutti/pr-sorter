import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "2026-spring-eds",
  title: "2026 Spring EDs",
  description: "Party rank sorter for all 2026 Spring anime endings",
  tags: ["Seasonal"],
  deadline: "2026-06-19T22:00:00.000Z",
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score (optional)",
  },
} satisfies AppConfig;
