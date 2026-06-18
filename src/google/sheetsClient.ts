import { GoogleWritebackError } from './types';

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
    values?: unknown[][];
};

export type SheetGridCell = {
    value: string;
    hyperlink: string | null;
};

export type FirstSheetGrid = {
    title: string;
    rows: SheetGridCell[][];
};

type SpreadsheetGridResponse = {
    sheets?: Array<{
        properties?: Partial<SheetProperties>;
        data?: Array<{
            rowData?: Array<{
                values?: GridCellData[];
            }>;
        }>;
    }>;
};

type GridCellData = {
    formattedValue?: string;
    hyperlink?: string;
    userEnteredValue?: {
        stringValue?: string;
        numberValue?: number;
        boolValue?: boolean;
        formulaValue?: string;
    };
    userEnteredFormat?: {
        textFormat?: {
            link?: {
                uri?: string;
            };
        };
    };
    textFormatRuns?: Array<{
        format?: {
            link?: {
                uri?: string;
            };
        };
    }>;
};

type WriteRanksOptions = {
    spreadsheetId: string;
    token: string;
    ranksBySongId: Map<number, number>;
    idColumnHeader?: string;
    rankColumnHeader: string;
    scoreColumnHeader?: string;
    scoresBySongId?: Map<number, number>;
};

type WritePartialRanksOptions = {
    spreadsheetId: string;
    token: string;
    ranksBySongId: Map<number, number>;
    expectedSongIds: number[];
    idColumnHeader?: string;
    rankColumnHeader: string;
};

type ReadScoresOptions = {
    spreadsheetId: string;
    token: string;
    songIds: number[];
    idColumnHeader?: string;
    scoreColumnHeader: string;
};

type WriteScoresOptions = {
    spreadsheetId: string;
    token: string;
    idColumnHeader?: string;
    scoreColumnHeader: string;
    scoresBySongId: Map<number, number>;
};

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DEFAULT_ID_COLUMN_HEADER = 'ID';

export async function writeRanksToFirstSheet({
    spreadsheetId,
    token,
    ranksBySongId,
    idColumnHeader,
    rankColumnHeader,
    scoreColumnHeader,
    scoresBySongId,
}: WriteRanksOptions): Promise<number> {
    const sheet = await fetchFirstUsableSheet(spreadsheetId, token);
    const values = await fetchSheetValues(spreadsheetId, sheet.title, token);
    const updates = buildUpdates(values, sheet.title, ranksBySongId, idColumnHeader ?? DEFAULT_ID_COLUMN_HEADER, rankColumnHeader, scoreColumnHeader, scoresBySongId);

    await postSheetValueUpdates(spreadsheetId, token, updates);
    return updates.length;
}

export async function writePartialRanksToFirstSheet({
    spreadsheetId,
    token,
    ranksBySongId,
    expectedSongIds,
    idColumnHeader,
    rankColumnHeader,
}: WritePartialRanksOptions): Promise<number> {
    if (ranksBySongId.size === 0) {
        return 0;
    }

    const sheet = await fetchFirstUsableSheet(spreadsheetId, token);
    const values = await fetchSheetValues(spreadsheetId, sheet.title, token);
    const updates = buildPartialRankUpdates(values, sheet.title, ranksBySongId, expectedSongIds, idColumnHeader ?? DEFAULT_ID_COLUMN_HEADER, rankColumnHeader);

    if (updates.length === 0) {
        return 0;
    }

    await postSheetValueUpdates(spreadsheetId, token, updates);
    return updates.length;
}

export async function readScoresFromFirstSheet({
    spreadsheetId,
    token,
    songIds,
    idColumnHeader,
    scoreColumnHeader,
}: ReadScoresOptions): Promise<Map<number, string>> {
    const sheet = await fetchFirstUsableSheet(spreadsheetId, token);
    const values = await fetchSheetValues(spreadsheetId, sheet.title, token);
    return readScores(values, songIds, idColumnHeader ?? DEFAULT_ID_COLUMN_HEADER, scoreColumnHeader);
}

export async function writeScoresToFirstSheet({
    spreadsheetId,
    token,
    idColumnHeader,
    scoreColumnHeader,
    scoresBySongId,
}: WriteScoresOptions): Promise<number> {
    if (scoresBySongId.size === 0) {
        return 0;
    }

    const sheet = await fetchFirstUsableSheet(spreadsheetId, token);
    const values = await fetchSheetValues(spreadsheetId, sheet.title, token);
    const updates = buildScoreUpdates(values, sheet.title, idColumnHeader ?? DEFAULT_ID_COLUMN_HEADER, scoreColumnHeader, scoresBySongId);

    if (updates.length === 0) {
        return 0;
    }

    await postSheetValueUpdates(spreadsheetId, token, updates);
    return updates.length;
}

export async function readFirstSheetGrid(spreadsheetId: string, token: string): Promise<FirstSheetGrid> {
    const sheet = await fetchFirstUsableSheet(spreadsheetId, token);
    const range = encodeURIComponent(quoteSheetName(sheet.title));
    const metadata = await fetchSheetGrid(spreadsheetId, range, token);

    const sheetGrid = (metadata.sheets ?? []).find((candidate) => candidate.properties?.title === sheet.title);
    const rowData = sheetGrid?.data?.[0]?.rowData ?? [];

    return {
        title: sheet.title,
        rows: rowData.map((row) => (row.values ?? []).map(gridCellFromCellData)),
    };
}

async function fetchSheetGrid(spreadsheetId: string, encodedRange: string, token: string): Promise<SpreadsheetGridResponse> {
    const baseUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?includeGridData=true&ranges=${encodedRange}`;
    const fields =
        'sheets(properties(title,index,sheetType,hidden),data(rowData(values(formattedValue,hyperlink,userEnteredValue,userEnteredFormat/textFormat/link,textFormatRuns(format/link)))))';

    try {
        return await fetchJson<SpreadsheetGridResponse>(
            `${baseUrl}&fields=${encodeURIComponent(fields)}`,
            token,
            'Sheets API read failed.',
        );
    } catch (error) {
        if (!isRetryableSheetsReadError(error)) {
            throw error;
        }

        return await fetchJson<SpreadsheetGridResponse>(baseUrl, token, 'Sheets API read failed.');
    }
}

async function fetchFirstUsableSheet(spreadsheetId: string, token: string): Promise<SheetProperties> {
    const metadata = await fetchJson<SpreadsheetMetadataResponse>(
        `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(title,index,sheetType,hidden))`,
        token,
        'Sheets API read failed.',
    );

    const sheets = (metadata.sheets ?? [])
        .map((sheet) => sheet.properties)
        .filter((properties): properties is SheetProperties => {
            return (
                typeof properties?.title === 'string' &&
                typeof properties.index === 'number' &&
                properties.sheetType === 'GRID' &&
                properties.hidden !== true
            );
        })
        .sort((left, right) => left.index - right.index);

    const firstSheet = sheets[0];
    if (!firstSheet) {
        throw new GoogleWritebackError('No usable first worksheet found.');
    }

    return firstSheet;
}

async function fetchSheetValues(spreadsheetId: string, sheetTitle: string, token: string): Promise<string[][]> {
    const range = encodeURIComponent(quoteSheetName(sheetTitle));
    const response = await fetchJson<ValuesResponse>(
        `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`,
        token,
        'Sheets API read failed.',
    );

    return (response.values ?? []).map((row) => row.map((value) => String(value)));
}

function buildUpdates(
    values: string[][],
    sheetTitle: string,
    ranksBySongId: Map<number, number>,
    idColumnHeader: string,
    rankColumnHeader: string,
    scoreColumnHeader?: string,
    scoresBySongId?: Map<number, number>,
): Array<{ range: string; values: number[][] }> {
    const headerRow = values[0];
    if (!headerRow || headerRow.length === 0) {
        throw new GoogleWritebackError('Sheet is empty or missing a header row.');
    }

    const idColumnIndex = requireHeaderColumnIndex(headerRow, idColumnHeader, 'ID');
    const rankColumnIndex = requireHeaderColumnIndex(headerRow, rankColumnHeader, 'Rank');
    const shouldWriteScores = Boolean(scoreColumnHeader && scoresBySongId && scoresBySongId.size > 0);
    let scoreColumnIndex: number | null = null;
    if (shouldWriteScores && scoreColumnHeader) {
        const scoreHeaderIndexes = matchingHeaderIndexes(headerRow, scoreColumnHeader);

        if (scoreHeaderIndexes.length > 1) {
            throw new GoogleWritebackError(`Score header "${scoreColumnHeader}" appears more than once.`);
        }

        scoreColumnIndex = scoreHeaderIndexes[0] ?? null;
    }

    const rowsBySongId = rowsBySongIdFromValues(values, idColumnIndex);
    const unknownIds = [...rowsBySongId.keys()].filter((songId) => !ranksBySongId.has(songId));

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

function buildPartialRankUpdates(
    values: string[][],
    sheetTitle: string,
    ranksBySongId: Map<number, number>,
    expectedSongIds: number[],
    idColumnHeader: string,
    rankColumnHeader: string,
): Array<{ range: string; values: number[][] }> {
    const headerRow = values[0];
    if (!headerRow || headerRow.length === 0) {
        throw new GoogleWritebackError('Sheet is empty or missing a header row.');
    }

    const idColumnIndex = requireHeaderColumnIndex(headerRow, idColumnHeader, 'ID');
    const rankColumnIndex = requireHeaderColumnIndex(headerRow, rankColumnHeader, 'Rank');
    const expectedSongIdSet = new Set(expectedSongIds);
    const rankIdsOutsideSorter = [...ranksBySongId.keys()].filter((songId) => !expectedSongIdSet.has(songId));
    if (rankIdsOutsideSorter.length > 0) {
        throw new GoogleWritebackError(`Rank writeback contains unknown sorter song IDs: ${formatIdList(rankIdsOutsideSorter)}.`);
    }

    const rowsBySongId = rowsBySongIdFromValues(values, idColumnIndex);
    const sheetSongIds = new Set(rowsBySongId.keys());
    const unknownIds = [...sheetSongIds].filter((songId) => !expectedSongIdSet.has(songId));
    if (unknownIds.length > 0) {
        throw new GoogleWritebackError(`Sheet contains unknown song IDs: ${formatIdList(unknownIds)}.`);
    }

    const missingIds = expectedSongIds.filter((songId) => !sheetSongIds.has(songId));
    if (missingIds.length > 0) {
        throw new GoogleWritebackError(`Sheet is missing sorter song IDs: ${formatIdList(missingIds)}.`);
    }

    return [...ranksBySongId.entries()].map(([songId, rank]) => {
        const rowNumber = rowsBySongId.get(songId);
        if (rowNumber === undefined) {
            throw new GoogleWritebackError(`Sheet is missing sorter song ID ${songId}.`);
        }

        return {
            range: `${quoteSheetName(sheetTitle)}!${columnName(rankColumnIndex + 1)}${rowNumber}`,
            values: [[rank]],
        };
    });
}

function readScores(values: string[][], songIds: number[], idColumnHeader: string, scoreColumnHeader: string): Map<number, string> {
    const headerRow = values[0];
    if (!headerRow || headerRow.length === 0) {
        throw new GoogleWritebackError('Sheet is empty or missing a header row.');
    }

    const idColumnIndex = requireHeaderColumnIndex(headerRow, idColumnHeader, 'ID');
    const scoreHeaderIndexes = matchingHeaderIndexes(headerRow, scoreColumnHeader);
    if (scoreHeaderIndexes.length === 0) {
        return new Map();
    }

    if (scoreHeaderIndexes.length > 1) {
        throw new GoogleWritebackError(`Score header "${scoreColumnHeader}" appears more than once.`);
    }

    const expectedSongIds = new Set(songIds);
    const unknownIds: number[] = [];
    const scoresBySongId = new Map<number, string>();
    const scoreColumnIndex = scoreHeaderIndexes[0];
    const rowsBySongId = rowsBySongIdFromValues(values, idColumnIndex);

    for (const [songId, rowNumber] of rowsBySongId.entries()) {
        if (!expectedSongIds.has(songId)) {
            unknownIds.push(songId);
        }

        const rawScore = values[rowNumber - 1]?.[scoreColumnIndex];
        const score = scoreValueFromSheetCell(rawScore);
        if (score !== '') {
            scoresBySongId.set(songId, score);
        }
    }

    if (unknownIds.length > 0) {
        throw new GoogleWritebackError(`Sheet contains unknown song IDs: ${formatIdList(unknownIds)}.`);
    }

    const missingIds = songIds.filter((songId) => !rowsBySongId.has(songId));
    if (missingIds.length > 0) {
        throw new GoogleWritebackError(`Sheet is missing sorter song IDs: ${formatIdList(missingIds)}.`);
    }

    return scoresBySongId;
}

function scoreValueFromSheetCell(rawScore: string | undefined): string {
    if (rawScore === undefined || rawScore === null) {
        return '';
    }

    const score = String(rawScore).trim();
    if (score === '') {
        return '';
    }

    const numericScore = Number(score);
    if (!Number.isFinite(numericScore)) {
        return score;
    }

    return String(Math.round(numericScore * 1000) / 1000);
}

function buildScoreUpdates(
    values: string[][],
    sheetTitle: string,
    idColumnHeader: string,
    scoreColumnHeader: string,
    scoresBySongId: Map<number, number>,
): Array<{ range: string; values: number[][] }> {
    const headerRow = values[0];
    if (!headerRow || headerRow.length === 0) {
        throw new GoogleWritebackError('Sheet is empty or missing a header row.');
    }

    const idColumnIndex = requireHeaderColumnIndex(headerRow, idColumnHeader, 'ID');
    const scoreHeaderIndexes = matchingHeaderIndexes(headerRow, scoreColumnHeader);
    if (scoreHeaderIndexes.length === 0) {
        return [];
    }

    if (scoreHeaderIndexes.length > 1) {
        throw new GoogleWritebackError(`Score header "${scoreColumnHeader}" appears more than once.`);
    }

    const scoreColumnIndex = scoreHeaderIndexes[0];
    const rowsBySongId = rowsBySongIdFromValues(values, idColumnIndex);

    return [...scoresBySongId.entries()].map(([songId, score]) => {
        const rowNumber = rowsBySongId.get(songId);
        if (rowNumber === undefined) {
            throw new GoogleWritebackError(`Sheet is missing sorter song ID ${songId}.`);
        }

        return {
            range: `${quoteSheetName(sheetTitle)}!${columnName(scoreColumnIndex + 1)}${rowNumber}`,
            values: [[score]],
        };
    });
}

function rowsBySongIdFromValues(values: string[][], idColumnIndex: number): Map<number, number> {
    const rowsBySongId = new Map<number, number>();

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        const rawId = values[rowIndex]?.[idColumnIndex];
        const trimmedId = rawId === undefined || rawId === null ? '' : String(rawId).trim();

        if (trimmedId === '') {
            continue;
        }

        if (!/^\d+$/.test(trimmedId)) {
            throw new GoogleWritebackError(`Sheet contains a non-numeric song ID in row ${rowIndex + 1}.`);
        }

        const songId = Number.parseInt(trimmedId, 10);
        if (rowsBySongId.has(songId)) {
            throw new GoogleWritebackError(`Sheet contains duplicate song ID ${songId}.`);
        }

        rowsBySongId.set(songId, rowIndex + 1);
    }

    return rowsBySongId;
}

function gridCellFromCellData(cell: GridCellData): SheetGridCell {
    return {
        value: cellValue(cell).trim(),
        hyperlink:
            cell.hyperlink ??
            cell.userEnteredFormat?.textFormat?.link?.uri ??
            cell.textFormatRuns?.find((run) => run.format?.link?.uri)?.format?.link?.uri ??
            null,
    };
}

function cellValue(cell: GridCellData): string {
    if (cell.formattedValue !== undefined) {
        return cell.formattedValue;
    }

    const entered = cell.userEnteredValue;
    if (!entered) {
        return '';
    }

    if (entered.stringValue !== undefined) {
        return entered.stringValue;
    }

    if (entered.numberValue !== undefined) {
        return String(entered.numberValue);
    }

    if (entered.boolValue !== undefined) {
        return String(entered.boolValue);
    }

    return entered.formulaValue ?? '';
}

async function postSheetValueUpdates(
    spreadsheetId: string,
    token: string,
    updates: Array<{ range: string; values: number[][] }>,
): Promise<void> {
    const response = await fetch(`${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            valueInputOption: 'RAW',
            data: updates,
        }),
    });

    if (response.status === 401 || response.status === 403) {
        throw new GoogleWritebackError('OAuth token expired or was rejected.');
    }

    if (!response.ok) {
        throw new GoogleWritebackError('Sheets API write failed.');
    }
}

async function fetchJson<T>(url: string, token: string, failureMessage: string): Promise<T> {
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status === 401 || response.status === 403) {
        throw new GoogleWritebackError('OAuth token expired or was rejected.');
    }

    if (!response.ok) {
        throw new GoogleWritebackError(await formatFetchFailure(response, failureMessage));
    }

    return (await response.json()) as T;
}

async function formatFetchFailure(response: Response, failureMessage: string): Promise<string> {
    const detail = await googleApiErrorDetail(response);
    return detail ? `${failureMessage} ${detail}` : failureMessage;
}

async function googleApiErrorDetail(response: Response): Promise<string | null> {
    try {
        const payload = (await response.clone().json()) as { error?: { message?: unknown; status?: unknown } };
        const message = typeof payload.error?.message === 'string' ? payload.error.message.trim() : '';
        const status = typeof payload.error?.status === 'string' ? payload.error.status.trim() : '';

        if (message && status) {
            return `${status}: ${message}`;
        }

        return message || status || null;
    } catch {
        const text = (await response.text()).trim();
        return text ? text.slice(0, 500) : null;
    }
}

function isRetryableSheetsReadError(error: unknown): boolean {
    if (!(error instanceof GoogleWritebackError)) {
        return false;
    }

    return /Sheets API read failed\./.test(error.message) && !/OAuth token expired or was rejected/.test(error.message);
}

function quoteSheetName(sheetTitle: string): string {
    return `'${sheetTitle.split('\'').join('\'\'')}'`;
}

function columnName(columnNumber: number): string {
    let remaining = columnNumber;
    let name = '';

    while (remaining > 0) {
        remaining -= 1;
        name = String.fromCharCode(65 + (remaining % 26)) + name;
        remaining = Math.floor(remaining / 26);
    }

    return name;
}

function matchingHeaderIndexes(headerRow: string[], headerName: string): number[] {
    return headerRow
        .map((header, index) => ({header: String(header).trim(), index}))
        .filter(({header}) => header === headerName)
        .map(({index}) => index);
}

function requireHeaderColumnIndex(headerRow: string[], headerName: string, label: string): number {
    const indexes = matchingHeaderIndexes(headerRow, headerName);

    if (indexes.length === 0) {
        throw new GoogleWritebackError(`${label} header "${headerName}" was not found.`);
    }

    if (indexes.length > 1) {
        throw new GoogleWritebackError(`${label} header "${headerName}" appears more than once.`);
    }

    return indexes[0];
}

function formatIdList(ids: number[]): string {
    const sortedIds = [...ids].sort((left, right) => left - right);
    const shownIds = sortedIds.slice(0, 10).join(', ');
    return sortedIds.length > 10 ? `${shownIds}, and ${sortedIds.length - 10} more` : shownIds;
}
