import type { AppConfig } from "../types";

export function isScoreEnabled(config: AppConfig): boolean {
  return Boolean(config.googleSheets?.scoreColumnHeader);
}

export function normalizeScore(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error("Scores must be numbers from 0 to 10.");
  }

  return value;
}
