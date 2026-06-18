import type { SortState } from '../sorter';

export type LegacySorterSaveInfo = {
    legacyPrefix: string;
    keyCount: number;
    complete: boolean;
    compatible: boolean;
    reason?: string;
};

export type LegacySorterMigrationResult = LegacySorterSaveInfo & {
    sort: SortState;
};

type LegacySorterSave = {
    legacyPrefix: string;
    sortedIndexList: number[][];
    parentIndexList: number[];
    recordDataList: number[];
    leftIndex: number;
    rightIndex: number;
    leftInnerIndex: number;
    rightInnerIndex: number;
    pointer: number;
    battleNo: number;
    sortedNo: number;
    totalBattles: number;
    keyCount: number;
};

export function findLegacySorterSave(prefix: string, songCount: number, storage: Storage = localStorage): LegacySorterSaveInfo | null {
    const legacy = readLegacySorterSave(prefix, storage);
    if (!legacy) {
        return null;
    }

    const reason = legacyMigrationBlocker(legacy, songCount);
    return {
        legacyPrefix: legacy.legacyPrefix,
        keyCount: legacy.keyCount,
        complete: legacy.leftIndex === -1,
        compatible: reason === null,
        ...(reason ? {reason} : {}),
    };
}

export function migrateLegacySorterSave(
    prefix: string,
    songCount: number,
    storage: Storage = localStorage,
): LegacySorterMigrationResult | null {
    const legacy = readLegacySorterSave(prefix, storage);
    if (!legacy || legacyMigrationBlocker(legacy, songCount)) {
        return null;
    }

    const completedRanking = completedLegacyRanking(legacy, songCount);
    const sort: SortState = completedRanking ? {
        groups: [completedRanking],
        current: null,
        battleNo: legacy.battleNo,
        pickedCount: Math.max(0, legacy.sortedNo),
        estimatedBattles: Math.max(1, legacy.totalBattles),
        history: [],
    } : partialLegacySortState(legacy);

    return {
        legacyPrefix: legacy.legacyPrefix,
        keyCount: legacy.keyCount,
        complete: completedRanking !== null,
        compatible: true,
        sort,
    };
}

function readLegacySorterSave(prefix: string, storage: Storage): LegacySorterSave | null {
    const legacyPrefix = `${prefix}-`;
    const key = (name: string) => `${legacyPrefix}${name}`;
    const keyCount = legacyStorageKeyCount(legacyPrefix, storage);

    try {
        const sortedIndexList = readJson<number[][]>(key('sortedIndexList'), storage);
        const parentIndexList = readJson<number[]>(key('parentIndexList'), storage);
        const recordDataList = readJson<number[]>(key('recordDataList'), storage) ?? [];
        if (!isNumberMatrix(sortedIndexList) || !isNumberArray(parentIndexList) || !isNumberArray(recordDataList)) {
            return null;
        }

        return {
            legacyPrefix,
            sortedIndexList,
            parentIndexList,
            recordDataList,
            leftIndex: readInteger(key('leftIndex'), storage) ?? -1,
            rightIndex: readInteger(key('rightIndex'), storage) ?? -1,
            leftInnerIndex: readInteger(key('leftInnerIndex'), storage) ?? 0,
            rightInnerIndex: readInteger(key('rightInnerIndex'), storage) ?? 0,
            pointer: readInteger(key('pointer'), storage) ?? 0,
            battleNo: readInteger(key('battleNo'), storage) ?? 1,
            sortedNo: readInteger(key('sortedNo'), storage) ?? 0,
            totalBattles: readInteger(key('totalBattles'), storage) ?? 1,
            keyCount,
        };
    } catch {
        return null;
    }
}

function legacyMigrationBlocker(legacy: LegacySorterSave, songCount: number): string | null {
    if (legacy.keyCount === 0 || legacy.sortedIndexList.length === 0 || legacy.parentIndexList.length === 0) {
        return 'Legacy save is missing required sorter data.';
    }

    const root = legacy.sortedIndexList[0];
    if (!isNumberArray(root) || root.length === 0) {
        return 'Legacy save is missing its ranking list.';
    }

    if (root.length !== songCount) {
        return `Legacy save has ${root.length} songs, but this sorter has ${songCount}.`;
    }

    const completedRanking = completedLegacyRanking(legacy, songCount);
    if (completedRanking) {
        return null;
    }

    const left = legacy.sortedIndexList[legacy.leftIndex];
    const right = legacy.sortedIndexList[legacy.rightIndex];
    if (!isLegacyGroup(left, songCount) || !isLegacyGroup(right, songCount)) {
        return 'Legacy save has an invalid active comparison.';
    }

    if (
        legacy.leftInnerIndex < 0 ||
        legacy.leftInnerIndex >= left.length ||
        legacy.rightInnerIndex < 0 ||
        legacy.rightInnerIndex >= right.length
    ) {
        return 'Legacy save has an invalid active comparison position.';
    }

    return null;
}

function completedLegacyRanking(legacy: LegacySorterSave, songCount: number): number[] | null {
    const root = legacy.sortedIndexList[0];
    if (!isLegacyGroup(root, songCount) || root.length !== songCount || legacy.leftIndex !== -1) {
        return null;
    }

    return [...root];
}

function partialLegacySortState(legacy: LegacySorterSave): SortState {
    const left = legacy.sortedIndexList[legacy.leftIndex] ?? [];
    const right = legacy.sortedIndexList[legacy.rightIndex] ?? [];
    const mergedLength = Math.max(0, Math.min(
        legacy.recordDataList.length,
        legacy.pointer > 0 ? legacy.pointer : legacy.leftInnerIndex + legacy.rightInnerIndex,
    ));
    const merged = legacy.recordDataList.slice(0, mergedLength);
    const activeIndexes = new Set([legacy.leftIndex, legacy.rightIndex]);
    const groups = legacy.sortedIndexList
        .map((group, index) => ({group, index}))
        .filter(({group, index}) => group.length > 0 && !activeIndexes.has(index) && !hasCompletedAncestor(index, legacy))
        .sort((leftEntry, rightEntry) => leftEntry.index - rightEntry.index)
        .map(({group}) => [...group]);

    return {
        groups,
        current: {
            left: [...left],
            right: [...right],
            merged,
            leftPos: legacy.leftInnerIndex,
            rightPos: legacy.rightInnerIndex,
        },
        battleNo: Math.max(1, legacy.battleNo),
        pickedCount: Math.max(0, legacy.sortedNo),
        estimatedBattles: Math.max(1, legacy.totalBattles),
        history: [],
    };
}

function hasCompletedAncestor(index: number, legacy: LegacySorterSave): boolean {
    let parentIndex = legacy.parentIndexList[index];
    while (parentIndex !== undefined && parentIndex >= 0) {
        if ((legacy.sortedIndexList[parentIndex] ?? []).length > 0) {
            return true;
        }
        parentIndex = legacy.parentIndexList[parentIndex];
    }

    return false;
}

function legacyStorageKeyCount(legacyPrefix: string, storage: Storage): number {
    let count = 0;
    for (let index = 0; index < storage.length; index += 1) {
        if (storage.key(index)?.startsWith(legacyPrefix)) {
            count += 1;
        }
    }

    return count;
}

function readJson<T>(key: string, storage: Storage): T | null {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
}

function readInteger(key: string, storage: Storage): number | null {
    const raw = storage.getItem(key);
    if (raw === null) {
        return null;
    }

    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
}

function isNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((entry) => Number.isInteger(entry));
}

function isNumberMatrix(value: unknown): value is number[][] {
    return Array.isArray(value) && value.every(isNumberArray);
}

function isLegacyGroup(value: unknown, songCount: number): value is number[] {
    return isNumberArray(value) && value.every((index) => index >= 0 && index < songCount);
}
