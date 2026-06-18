import { config } from "../customize/config.js";
import { songList } from "../customize/songList.js";
import type { AppConfig } from "../src/app/types.js";

export async function loadCustomizeConfig(): Promise<AppConfig> {
  return config;
}

export async function loadCustomizeSongCount(): Promise<number> {
  return songList.length;
}

export function serializedDeadline(config: AppConfig): string | undefined {
  if (config.deadline === undefined) {
    return undefined;
  }

  if (!(config.deadline instanceof Date) || Number.isNaN(config.deadline.getTime())) {
    throw new Error("customize/config.ts deadline must be a valid Date.");
  }

  return config.deadline.toISOString();
}

export function serializedTags(config: AppConfig): string[] | undefined {
  if (!config.tags) {
    return undefined;
  }

  const tags = Array.from(new Set(config.tags.map((tag) => tag.trim()).filter(Boolean)));
  return tags.length ? tags : undefined;
}
