import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "boa",
  title: "BoA",
  description: "Party rank sorter BoA anime songs",
  tags: ["Artist"],
  // Optional voting deadline (ISO 8601). Written into the generated sorter-index.json.
  // deadline: new Date("2026-06-05T21:59:00.000Z"),
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score",
  },
} satisfies AppConfig;
