import type { SongId } from '../../songs';

export type SortChoice = 'left' | 'right';
export type SortPickKind = 'manual' | 'automatic';

export type SortPickEntry = {
    battleNo: number;
    leftId: SongId;
    rightId: SongId;
    pickedId: SongId;
    choice: SortChoice;
    kind: SortPickKind;
};

// Every number below is a stable song id, never a position in the song list. Index-keyed state
// silently reattached itself to the wrong songs whenever customize/songList.ts changed.
export type Merge = {
    left: SongId[];
    right: SongId[];
    merged: SongId[];
    leftPos: number;
    rightPos: number;
};

export type SortState = {
    groups: SongId[][];
    current: Merge | null;
    battleNo: number;
    pickedCount: number;
    // Songs given a final position so far. Persisted rather than replayed from history, so progress
    // survives a reconcile that clears history and stays O(1) per render.
    placedCount: number;
    estimatedBattles: number;
    history: Snapshot[];
};

export type CurrentSongSortInfo = {
    minRank: number;
    maxRank: number;
    songCount: number;
};

type Snapshot = Omit<SortState, 'history'> & {
    historyEntryKind?: SortPickKind;
    historyEntryChoice?: SortChoice;
};

const cloneMerge = (merge: SortState['current']): SortState['current'] =>
    merge && {
        left: [...merge.left],
        right: [...merge.right],
        merged: [...merge.merged],
        leftPos: merge.leftPos,
        rightPos: merge.rightPos,
    };

const snapshot = (state: SortState, historyEntryKind?: SortPickKind, historyEntryChoice?: SortChoice): Snapshot => {
    const next: Snapshot = {
        groups: state.groups.map((group) => [...group]),
        current: cloneMerge(state.current),
        battleNo: state.battleNo,
        pickedCount: state.pickedCount,
        placedCount: state.placedCount,
        estimatedBattles: state.estimatedBattles,
    };

    if (historyEntryKind) {
        next.historyEntryKind = historyEntryKind;
    }

    if (historyEntryChoice) {
        next.historyEntryChoice = historyEntryChoice;
    }

    return next;
};

export const isComplete = (sort: SortState): boolean => sort.current === null && sort.groups.length === 1;

export function createSort(songIds: SongId[]): SortState {
    return withEstimate(nextBattle({
        groups: songIds.map((songId) => [songId]),
        current: null,
        battleNo: 1,
        pickedCount: 0,
        placedCount: 0,
        estimatedBattles: 1,
        history: [],
    }));
}

// Total placements a from-scratch sort of this size performs. Used to reconstruct placedCount for
// saves written before it was persisted.
export function totalMergePlacements(songCount: number): number {
    const queue = Array.from({length: songCount}, () => 1);
    let total = 0;

    while (queue.length > 1) {
        const left = queue.shift();
        const right = queue.shift();
        if (left === undefined || right === undefined) {
            break;
        }

        const mergedSize = left + right;
        total += mergedSize;
        queue.push(mergedSize);
    }

    return Math.max(1, total);
}

// Placements still owed before the sort completes: every element of every future merge output.
export function remainingPlacements(sort: SortState): number {
    const queue = sort.groups.map((group) => group.length);
    let total = 0;

    if (sort.current) {
        const activeSize = sort.current.left.length + sort.current.right.length;
        total += activeSize - sort.current.merged.length;
        queue.push(activeSize);
    }

    while (queue.length > 1) {
        const left = queue.shift();
        const right = queue.shift();
        if (left === undefined || right === undefined) {
            break;
        }

        const mergedSize = left + right;
        total += mergedSize;
        queue.push(mergedSize);
    }

    return total;
}

export function withEstimate(sort: SortState): SortState {
    return {...sort, estimatedBattles: Math.max(1, sort.pickedCount + remainingPlacements(sort))};
}

// Exported for the reconciler, which re-pumps the queue after adding or removing songs. Internal to
// the sorter module — not re-exported from ../index.ts.
export function nextBattle(state: SortState): SortState {
    while (state.current === null && state.groups.length > 1) {
        const left = state.groups.shift();
        const right = state.groups.shift();
        if (left && right) {
            state.current = {left, right, merged: [], leftPos: 0, rightPos: 0};
        }
    }
    return state;
}

export function currentBattle(sort: SortState): [SongId, SongId] | null {
    const merge = sort.current;
    return merge ? [merge.left[merge.leftPos], merge.right[merge.rightPos]] : null;
}

export function songSortInfo(sort: SortState, songId: SongId): CurrentSongSortInfo | null {
    if (isComplete(sort)) {
        const rank = sort.groups[0].indexOf(songId) + 1;
        return rank > 0 ? {minRank: rank, maxRank: rank, songCount: sort.groups[0].length} : null;
    }

    const merge = sort.current;
    const activeMergeSize = merge ? merge.left.length + merge.right.length : 0;

    if (merge) {
        const activeRange = songRangeInMerge(merge, songId);
        if (activeRange) {
            return wholeSetEstimateFromQueue(
                [
                    ...sort.groups.map((group) => ({size: group.length, range: null})),
                    {size: activeMergeSize, range: activeRange},
                ],
            );
        }
    }

    for (const group of sort.groups) {
        const position = group.indexOf(songId);
        if (position === -1) {
            continue;
        }

        return wholeSetEstimateFromQueue(
            [
                ...sort.groups.map((candidate) => ({
                    size: candidate.length,
                    range: candidate === group
                        ? {minRank: position + 1, maxRank: position + 1, songCount: candidate.length}
                        : null,
                })),
                ...(merge ? [{size: activeMergeSize, range: null}] : []),
            ],
        );
    }

    return null;
}

function wholeSetEstimateFromQueue(
    initialQueue: Array<{ size: number; range: CurrentSongSortInfo | null }>,
): CurrentSongSortInfo | null {
    const queue = initialQueue.map((entry) => ({
        size: entry.size,
        range: entry.range ? {...entry.range} : null,
    }));

    while (queue.length > 1) {
        const left = queue.shift();
        const right = queue.shift();
        if (!left || !right) {
            break;
        }

        const mergeSize = left.size + right.size;
        if (left.range || right.range) {
            const range = left.range ?? right.range;
            if (!range) {
                break;
            }

            const oppositeGroupSize = left.range ? right.size : left.size;
            queue.push({
                size: mergeSize,
                range: {
                    minRank: range.minRank,
                    maxRank: range.maxRank + oppositeGroupSize,
                    songCount: mergeSize,
                },
            });
            continue;
        }

        queue.push({size: mergeSize, range: null});
    }

    return queue.find((entry) => entry.range)?.range ?? null;
}

function songRangeInActiveMerge(merge: Merge, side: SortChoice): CurrentSongSortInfo {
    const opposite = side === 'left' ? merge.right : merge.left;
    const oppositePos = side === 'left' ? merge.rightPos : merge.leftPos;
    const minRank = merge.merged.length + 1;

    return {
        minRank,
        maxRank: minRank + opposite.length - oppositePos,
        songCount: merge.left.length + merge.right.length,
    };
}

function songRangeInMerge(merge: Merge, songId: SongId): CurrentSongSortInfo | null {
    const mergedPosition = merge.merged.indexOf(songId);
    if (mergedPosition !== -1) {
        return {
            minRank: mergedPosition + 1,
            maxRank: mergedPosition + 1,
            songCount: merge.left.length + merge.right.length,
        };
    }

    if (merge.left[merge.leftPos] === songId) {
        return songRangeInActiveMerge(merge, 'left');
    }

    if (merge.right[merge.rightPos] === songId) {
        return songRangeInActiveMerge(merge, 'right');
    }

    const leftPosition = merge.left.indexOf(songId);
    if (leftPosition >= merge.leftPos) {
        const minRank = merge.merged.length + (leftPosition - merge.leftPos) + 1;
        return {
            minRank,
            maxRank: minRank + merge.right.length - merge.rightPos,
            songCount: merge.left.length + merge.right.length,
        };
    }

    const rightPosition = merge.right.indexOf(songId);
    if (rightPosition >= merge.rightPos) {
        const minRank = merge.merged.length + (rightPosition - merge.rightPos) + 1;
        return {
            minRank,
            maxRank: minRank + merge.left.length - merge.leftPos,
            songCount: merge.left.length + merge.right.length,
        };
    }

    return null;
}

export function choose(sort: SortState, choice: SortChoice): SortState {
    return applyChoice(sort, choice, 'manual');
}

export function chooseAutomatic(sort: SortState, choice: SortChoice): SortState {
    return applyChoice(sort, choice, 'automatic');
}

/**
 * Advances the merge by one pick. Pass `record: null` to project a hypothetical pick without
 * recording undo history — that path runs thousands of times per render, so it must not snapshot.
 */
export function applyChoice(
    sort: SortState,
    choice: SortChoice,
    record: SortPickKind | null,
): SortState {
    const merge = cloneMerge(sort.current);
    if (!merge) {
        return record === null ? {...snapshot(sort), history: []} : sort;
    }

    const next: SortState = {
        ...snapshot(sort),
        current: merge,
        history: record === null ? [] : [...sort.history, snapshot(sort, record, choice)],
    };
    const source = choice === 'left' ? merge.left : merge.right;
    const pos = choice === 'left' ? merge.leftPos : merge.rightPos;
    merge.merged.push(source[pos]);
    merge.leftPos += choice === 'left' ? 1 : 0;
    merge.rightPos += choice === 'right' ? 1 : 0;
    next.pickedCount += 1;
    next.placedCount += 1;

    if (merge.leftPos === merge.left.length || merge.rightPos === merge.right.length) {
        // The exhausted side ends the merge, so the other side's tail is placed for free.
        next.placedCount += (merge.left.length - merge.leftPos) + (merge.right.length - merge.rightPos);
        next.groups.push([
            ...merge.merged,
            ...merge.left.slice(merge.leftPos),
            ...merge.right.slice(merge.rightPos),
        ]);
        next.current = null;
    }

    if (!isComplete(next)) {
        next.battleNo += 1;
    }

    return withEstimate(nextBattle(next));
}

export function undo(sort: SortState): SortState {
    for (let index = sort.history.length - 1; index >= 0; index -= 1) {
        const previous = sort.history[index];
        if (previous.historyEntryKind === 'automatic') {
            continue;
        }

        return {
            ...previous,
            history: sort.history.slice(0, index),
        };
    }

    const firstAutomatic = sort.history[0];
    if (!firstAutomatic) {
        return sort;
    }

    return {
        ...firstAutomatic,
        history: [],
    };
}

export function canUndo(sort: SortState): boolean {
    return sort.history.length > 0;
}

export const sortedSongIds = (sort: SortState): SongId[] =>
    isComplete(sort) ? sort.groups[0] : [];

export function pickHistory(sort: SortState): SortPickEntry[] {
    const entries = [...sort.history, snapshot(sort)];

    return sort.history.flatMap((entry, index) => {
        if (!entry.current) {
            return [];
        }

        const choice = entry.historyEntryChoice ?? inferChoice(entry, entries[index + 1]);
        if (!choice) {
            return [];
        }

        const leftId = entry.current.left[entry.current.leftPos];
        const rightId = entry.current.right[entry.current.rightPos];
        const pickedId = choice === 'left' ? leftId : rightId;

        return [{
            battleNo: entry.battleNo,
            leftId,
            rightId,
            pickedId,
            choice,
            kind: entry.historyEntryKind ?? 'manual',
        }];
    }).sort((left, right) => left.battleNo - right.battleNo);
}

function inferChoice(previous: Snapshot, next: Snapshot | undefined): SortChoice | null {
    const previousMerge = previous.current;
    if (!previousMerge || !next || next.pickedCount <= previous.pickedCount) {
        return null;
    }

    const nextMerge = next.current;
    if (hasSameMergeInputs(previousMerge, nextMerge) && nextMerge) {
        if (nextMerge.leftPos > previousMerge.leftPos) {
            return 'left';
        }

        if (nextMerge.rightPos > previousMerge.rightPos) {
            return 'right';
        }
    }

    const mergedGroup = next.groups.find((group) => includesMergeOutput(group, previousMerge));
    if (!mergedGroup) {
        return null;
    }

    const pickedPosition = previousMerge.merged.length;
    if (mergedGroup[pickedPosition] === previousMerge.left[previousMerge.leftPos]) {
        return 'left';
    }

    if (mergedGroup[pickedPosition] === previousMerge.right[previousMerge.rightPos]) {
        return 'right';
    }

    return null;
}

function includesMergeOutput(group: SongId[], merge: Merge): boolean {
    const expected = [...merge.left, ...merge.right];
    return expected.every((index) => group.includes(index));
}

function sameArray(left: SongId[], right: SongId[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasSameMergeInputs(left: Merge | null, right: Merge | null): boolean {
    return (
        left !== null &&
        right !== null &&
        sameArray(left.left, right.left) &&
        sameArray(left.right, right.right)
    );
}

export function progressPercentage(sort: SortState): number {
    if (isComplete(sort)) {
        return 100;
    }

    const total = sort.placedCount + remainingPlacements(sort);
    return Math.min(99, Math.floor((sort.placedCount * 100) / Math.max(1, total)));
}
