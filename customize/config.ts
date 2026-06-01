import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "si-vis",
  title: "SI-VIS",
  description: "Party rank sorter for SI-VIS anime songs",
  category: "Franchise",
  googleSheets: {
    clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
    appId: "601853881036",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score (optional)",
  },
} satisfies AppConfig;
