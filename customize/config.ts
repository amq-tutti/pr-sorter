import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "suara",
  title: "Suara",
  description: "Party rank sorter for Suara anime songs",
  // Tags group this sorter under one or more headers on the collection homepage.
  tags: ["Artist"],
  // Optional voting deadline (ISO 8601). Written into the generated sorter-index.json.
  deadline: new Date("2026-07-08T04:00:00.000Z"),
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score",
  },
} satisfies AppConfig;
