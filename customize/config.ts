import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "code-geass-op-ed",
  title: "Code Geass OP/ED",
  description: "Party rank sorter for Code Geass openings and endings.",
  // Tags group this sorter under one or more headers on the collection homepage.
  tags: ["Franchise"],
  // Optional voting deadline (ISO 8601). Written into the generated sorter-index.json.
  deadline: new Date("2026-07-05T04:00:00.000Z"),
  // Uncomment the following lines to enable Google Sheets integration. Make sure to fill in the correct values.
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score",
  },
} satisfies AppConfig;
