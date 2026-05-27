import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "2015-nominations",
  title: "2015 Nominations",
  description: "Party rank sorter for nominated anime songs from 2015",
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    allowCustomScoreColumn: true,
  },
} satisfies AppConfig;
