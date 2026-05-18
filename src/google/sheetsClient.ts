import { GoogleWritebackError } from "./types";

type SheetProperties = {
  title: string;
  index: number;
  sheetType: string;
  hidden?: boolean;
};

type SpreadsheetMetadataResponse = {
  sheets?: Array<{
    properties?: Partial<SheetProperties>;
  }>;
};

type ValuesResponse = {
  values?: string[][];
};

type WriteRanksOptions = {
  spreadsheetId: string;
  token: string;
  ranksBySongId: Map<number, number>;
  rankColumnHeader: string;
  scoreColumnHeader?: string;
  scoresBySongId?: Map<number, number>;
};

type ReadScoresOptions = {
  spreadsheetId: string;
  token: string;
  songIds: number[];
  scoreColumnHeader: string;
};

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export async function writeRanksToFirstSheet({
  spreadsheetId,
  token,
  ranksBySongId,
  rankColumnHeader,
  scoreColumnHeader,
  scoresBySongId,
}: WriteRanksOptions): Promise<number> {
  const sheet = await fetchFirstUsableSheet(spreadsheetId, token);
  const values = await fetchSheetValues(spreadsheetId, sheet.title, token);
  const updates = buildUpdates(values, sheet.title, ranksBySongId, rankColumnHeader, scoreColumnHeader, scoresBySongId);

  await postRankUpdates(spreadsheetId, token, updates);
  return updates.length;
}

export async function readScoresFromFirstSheet({
  spreadsheetId,
  token,
  songIds,
  scoreColumnHeader,
}: ReadScoresOptions): Promise<Map<number, string>> {
  const sheet = await fetchFirstUsableSheet(spreadsheetId, token);
  const values = await fetchSheetValues(spreadsheetId, sheet.title, token);
  return readScores(values, songIds, scoreColumnHeader);
}

async function fetchFirstUsableSheet(spreadsheetId: string, token: string): Promise<SheetProperties> {
  const metadata = await fetchJson<SpreadsheetMetadataResponse>(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(title,index,sheetType,hidden))`,
    token,
    "Sheets API read failed.",
  );

  const sheets = (metadata.sheets ?? [])
    .map((sheet) => sheet.properties)
    .filter((properties): properties is SheetProperties => {
      return (
        typeof properties?.title === "string" &&
        typeof properties.index === "number" &&
        properties.sheetType === "GRID" &&
        properties.hidden !== true
      );
    })
    .sort((left, right) => left.index - right.index);

  const firstSheet = sheets[0];
  if (!firstSheet) {
    throw new GoogleWritebackError("No usable first worksheet found.");
  }

  return firstSheet;
}

async function fetchSheetValues(spreadsheetId: string, sheetTitle: string, token: string): Promise<string[][]> {
  const range = encodeURIComponent(quoteSheetName(sheetTitle));
  const response = await fetchJson<ValuesResponse>(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${range}`,
    token,
    "Sheets API read failed.",
  );

  return response.values ?? [];
}

function buildUpdates(
  values: string[][],
  sheetTitle: string,
  ranksBySongId: Map<number, number>,
  rankColumnHeader: string,
  scoreColumnHeader?: string,
  scoresBySongId?: Map<number, number>,
): Array<{ range: string; values: number[][] }> {
  const headerRow = values[0];
  if (!headerRow || headerRow.length === 0) {
    throw new GoogleWritebackError("Sheet is empty or missing a header row.");
  }

  const rankHeaderIndexes = matchingHeaderIndexes(headerRow, rankColumnHeader);

  if (rankHeaderIndexes.length === 0) {
    throw new GoogleWritebackError(`Rank header "${rankColumnHeader}" was not found.`);
  }

  if (rankHeaderIndexes.length > 1) {
    throw new GoogleWritebackError(`Rank header "${rankColumnHeader}" appears more than once.`);
  }

  const rankColumnIndex = rankHeaderIndexes[0];
  const shouldWriteScores = Boolean(scoreColumnHeader && scoresBySongId && scoresBySongId.size > 0);
  let scoreColumnIndex: number | null = null;
  if (shouldWriteScores && scoreColumnHeader) {
    const scoreHeaderIndexes = matchingHeaderIndexes(headerRow, scoreColumnHeader);

    if (scoreHeaderIndexes.length === 0) {
      throw new GoogleWritebackError(`Score header "${scoreColumnHeader}" was not found.`);
    }

    if (scoreHeaderIndexes.length > 1) {
      throw new GoogleWritebackError(`Score header "${scoreColumnHeader}" appears more than once.`);
    }

    scoreColumnIndex = scoreHeaderIndexes[0];
  }

  const rowsBySongId = new Map<number, number>();
  const unknownIds: number[] = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const rawId = values[rowIndex]?.[0];
    const trimmedId = rawId === undefined || rawId === null ? "" : String(rawId).trim();

    if (trimmedId === "") {
      continue;
    }

    if (!/^\d+$/.test(trimmedId)) {
      throw new GoogleWritebackError(`Sheet contains a non-numeric song ID in row ${rowIndex + 1}.`);
    }

    const songId = Number.parseInt(trimmedId, 10);
    if (rowsBySongId.has(songId)) {
      throw new GoogleWritebackError(`Sheet contains duplicate song ID ${songId}.`);
    }

    if (!ranksBySongId.has(songId)) {
      unknownIds.push(songId);
    }

    rowsBySongId.set(songId, rowIndex + 1);
  }

  if (unknownIds.length > 0) {
    throw new GoogleWritebackError(`Sheet contains unknown song IDs: ${formatIdList(unknownIds)}.`);
  }

  const missingIds = [...ranksBySongId.keys()].filter((songId) => !rowsBySongId.has(songId));
  if (missingIds.length > 0) {
    throw new GoogleWritebackError(`Sheet is missing sorter song IDs: ${formatIdList(missingIds)}.`);
  }

  const updates = [...ranksBySongId.entries()].map(([songId, rank]) => {
    const rowNumber = rowsBySongId.get(songId);
    if (rowNumber === undefined) {
      throw new GoogleWritebackError(`Sheet is missing sorter song ID ${songId}.`);
    }

    return {
      range: `${quoteSheetName(sheetTitle)}!${columnName(rankColumnIndex + 1)}${rowNumber}`,
      values: [[rank]],
    };
  });

  if (scoreColumnIndex !== null && scoresBySongId) {
    for (const [songId, score] of scoresBySongId.entries()) {
      const rowNumber = rowsBySongId.get(songId);
      if (rowNumber === undefined) {
        throw new GoogleWritebackError(`Sheet is missing sorter song ID ${songId}.`);
      }

      updates.push({
        range: `${quoteSheetName(sheetTitle)}!${columnName(scoreColumnIndex + 1)}${rowNumber}`,
        values: [[score]],
      });
    }
  }

  return updates;
}

function readScores(values: string[][], songIds: number[], scoreColumnHeader: string): Map<number, string> {
  const headerRow = values[0];
  if (!headerRow || headerRow.length === 0) {
    throw new GoogleWritebackError("Sheet is empty or missing a header row.");
  }

  const scoreHeaderIndexes = matchingHeaderIndexes(headerRow, scoreColumnHeader);
  if (scoreHeaderIndexes.length === 0) {
    throw new GoogleWritebackError(`Score header "${scoreColumnHeader}" was not found.`);
  }

  if (scoreHeaderIndexes.length > 1) {
    throw new GoogleWritebackError(`Score header "${scoreColumnHeader}" appears more than once.`);
  }

  const expectedSongIds = new Set(songIds);
  const seenSongIds = new Set<number>();
  const unknownIds: number[] = [];
  const scoresBySongId = new Map<number, string>();
  const scoreColumnIndex = scoreHeaderIndexes[0];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const rawId = values[rowIndex]?.[0];
    const trimmedId = rawId === undefined || rawId === null ? "" : String(rawId).trim();

    if (trimmedId === "") {
      continue;
    }

    if (!/^\d+$/.test(trimmedId)) {
      throw new GoogleWritebackError(`Sheet contains a non-numeric song ID in row ${rowIndex + 1}.`);
    }

    const songId = Number.parseInt(trimmedId, 10);
    if (seenSongIds.has(songId)) {
      throw new GoogleWritebackError(`Sheet contains duplicate song ID ${songId}.`);
    }

    if (!expectedSongIds.has(songId)) {
      unknownIds.push(songId);
    }

    seenSongIds.add(songId);

    const rawScore = values[rowIndex]?.[scoreColumnIndex];
    const score = rawScore === undefined || rawScore === null ? "" : String(rawScore).trim();
    if (score !== "") {
      scoresBySongId.set(songId, score);
    }
  }

  if (unknownIds.length > 0) {
    throw new GoogleWritebackError(`Sheet contains unknown song IDs: ${formatIdList(unknownIds)}.`);
  }

  const missingIds = songIds.filter((songId) => !seenSongIds.has(songId));
  if (missingIds.length > 0) {
    throw new GoogleWritebackError(`Sheet is missing sorter song IDs: ${formatIdList(missingIds)}.`);
  }

  return scoresBySongId;
}

async function postRankUpdates(
  spreadsheetId: string,
  token: string,
  updates: Array<{ range: string; values: number[][] }>,
): Promise<void> {
  const response = await fetch(`${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: updates,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new GoogleWritebackError("OAuth token expired or was rejected.");
  }

  if (!response.ok) {
    throw new GoogleWritebackError("Sheets API write failed.");
  }
}

async function fetchJson<T>(url: string, token: string, failureMessage: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new GoogleWritebackError("OAuth token expired or was rejected.");
  }

  if (!response.ok) {
    throw new GoogleWritebackError(failureMessage);
  }

  return (await response.json()) as T;
}

function quoteSheetName(sheetTitle: string): string {
  return `'${sheetTitle.split("'").join("''")}'`;
}

function columnName(columnNumber: number): string {
  let remaining = columnNumber;
  let name = "";

  while (remaining > 0) {
    remaining -= 1;
    name = String.fromCharCode(65 + (remaining % 26)) + name;
    remaining = Math.floor(remaining / 26);
  }

  return name;
}

function matchingHeaderIndexes(headerRow: string[], headerName: string): number[] {
  return headerRow
    .map((header, index) => ({ header: String(header).trim(), index }))
    .filter(({ header }) => header === headerName)
    .map(({ index }) => index);
}

function formatIdList(ids: number[]): string {
  const sortedIds = [...ids].sort((left, right) => left - right);
  const shownIds = sortedIds.slice(0, 10).join(", ");
  return sortedIds.length > 10 ? `${shownIds}, and ${sortedIds.length - 10} more` : shownIds;
}
