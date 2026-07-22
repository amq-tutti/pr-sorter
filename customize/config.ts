import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: 'ghost-concert',
    title: 'Ghost Concert: Missing Songs',
    description: 'Party rank sorter "Ghost Concert: Missing Songs" anime songs',
    tags: ['Franchise'],
    deadline: new Date('2026-08-17T23:59:00+02:00'),
    googleSheets: {
      clientId: "601853881036-d54ok384qlquqv7h6arh4j5h4e2d1vm5.apps.googleusercontent.com",
      appId: "601853881036",
      rankColumnHeader: "Rank",
      scoreColumnHeader: "Score (optional)",
    },
} satisfies AppConfig;
