import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "test-sorter",
  title: "Test Sorter",
  description: "Party rank sorter for your custom list of songs.",
  // Tags group this sorter under one or more headers on the collection homepage.
  tags: ["Example"],
  // Optional voting deadline (ISO 8601). Written into the generated sorter-index.json.
  deadline: new Date("2026-06-05T21:59:00.000Z"),
  // Uncomment the following lines to enable Google Sheets integration. Make sure to fill in the correct values.
  // googleSheets: {
  //   clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
  //   appId: "601853881036",
  //   rankColumnHeader: "Rank",
  //   This setting will only work if `scoreColumnHeader` is not set, allowing users to specify their own score column header in the sheet.
  //   If `scoreColumnHeader` is set, that value will be used as the score column header and users won't be able to change it.
  //   allowCustomScoreColumn: true,
  //   scoreColumnHeader: "Score (optional)",
  // },
} satisfies AppConfig;
