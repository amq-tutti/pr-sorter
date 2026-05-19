import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "maaya-sakamoto",
  title: "Maaya Sakamoto",
  description: "Party rank sorter for Maaya Sakamoto anime songs",
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    allowCustomScoreColumn: true,
  },
} satisfies AppConfig;
