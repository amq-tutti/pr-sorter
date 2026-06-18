import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "2015-nominations",
  title: "2015 Nominations",
  description: "Party rank sorter for nominated anime songs from 2015",
  tags: ["Nominations"],
  deadline: new Date("2026-06-13T22:00:00.000Z"),
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score",
  },
} satisfies AppConfig;
