export type SortChoice = "left" | "right";
export type SortPickKind = "manual" | "automatic";

export type SortPickEntry = {
  battleNo: number;
  leftIndex: number;
  rightIndex: number;
  pickedIndex: number;
  choice: SortChoice;
  kind: SortPickKind;
};

export type Merge = {
  left: number[];
  right: number[];
  merged: number[];
  leftPos: number;
  rightPos: number;
};

export type SortState = {
  groups: number[][];
  current: Merge | null;
  battleNo: number;
  pickedCount: number;
  estimatedBattles: number;
  history: Snapshot[];
};

export type CurrentSongSortInfo = {
  minRank: number;
  maxRank: number;
  songCount: number;
};

type Snapshot = Omit<SortState, "history"> & {
  historyEntryKind?: SortPickKind;
  historyEntryChoice?: SortChoice;
};

const cloneMerge = (merge: SortState["current"]): SortState["current"] =>
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

export function createSort(songCount: number): SortState {
  return nextBattle({
    groups: Array.from({ length: songCount }, (_, index) => [index]),
    current: null,
    battleNo: 1,
    pickedCount: 0,
    estimatedBattles: Math.max(1, Math.ceil(songCount * Math.log2(Math.max(2, songCount)))),
    history: [],
  });
}

function nextBattle(state: SortState): SortState {
  while (state.current === null && state.groups.length > 1) {
    const left = state.groups.shift();
    const right = state.groups.shift();
    if (left && right) {
      state.current = { left, right, merged: [], leftPos: 0, rightPos: 0 };
    }
  }
  return state;
}

export function currentBattle(sort: SortState): [number, number] | null {
  const merge = sort.current;
  return merge ? [merge.left[merge.leftPos], merge.right[merge.rightPos]] : null;
}

export function currentSongSortInfo(sort: SortState, songIndex: number): CurrentSongSortInfo | null {
  return songSortInfo(sort, songIndex);
}

export function songSortInfo(sort: SortState, songIndex: number): CurrentSongSortInfo | null {
  if (isComplete(sort)) {
    const rank = sort.groups[0].indexOf(songIndex) + 1;
    return rank > 0 ? { minRank: rank, maxRank: rank, songCount: sort.groups[0].length } : null;
  }

  const merge = sort.current;
  const activeMergeSize = merge ? merge.left.length + merge.right.length : 0;

  if (merge) {
    const activeRange = songRangeInMerge(merge, songIndex);
    if (activeRange) {
      return wholeSetEstimateFromQueue(
        [
          ...sort.groups.map((group) => ({ size: group.length, range: null })),
          { size: activeMergeSize, range: activeRange },
        ],
      );
    }
  }

  for (const group of sort.groups) {
    const position = group.indexOf(songIndex);
    if (position === -1) {
      continue;
    }

    return wholeSetEstimateFromQueue(
      [
        ...sort.groups.map((candidate) => ({
          size: candidate.length,
          range: candidate === group
            ? { minRank: position + 1, maxRank: position + 1, songCount: candidate.length }
            : null,
        })),
        ...(merge ? [{ size: activeMergeSize, range: null }] : []),
      ],
    );
  }

  return null;
}

function wholeSetEstimate(sort: SortState, activeRange: CurrentSongSortInfo): CurrentSongSortInfo {
  return wholeSetEstimateFromQueue([
    ...sort.groups.map((group) => ({ size: group.length, range: null })),
    { size: activeRange.songCount, range: activeRange },
  ]) ?? activeRange;
}

function wholeSetEstimateFromQueue(
  initialQueue: Array<{ size: number; range: CurrentSongSortInfo | null }>,
): CurrentSongSortInfo | null {
  const queue = initialQueue.map((entry) => ({
    size: entry.size,
    range: entry.range ? { ...entry.range } : null,
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

    queue.push({ size: mergeSize, range: null });
  }

  return queue.find((entry) => entry.range)?.range ?? null;
}

function songRangeInActiveMerge(merge: Merge, side: SortChoice): CurrentSongSortInfo {
  const opposite = side === "left" ? merge.right : merge.left;
  const oppositePos = side === "left" ? merge.rightPos : merge.leftPos;
  const minRank = merge.merged.length + 1;

  return {
    minRank,
    maxRank: minRank + opposite.length - oppositePos,
    songCount: merge.left.length + merge.right.length,
  };
}

function songRangeInMerge(merge: Merge, songIndex: number): CurrentSongSortInfo | null {
  const mergedPosition = merge.merged.indexOf(songIndex);
  if (mergedPosition !== -1) {
    return {
      minRank: mergedPosition + 1,
      maxRank: mergedPosition + 1,
      songCount: merge.left.length + merge.right.length,
    };
  }

  if (merge.left[merge.leftPos] === songIndex) {
    return songRangeInActiveMerge(merge, "left");
  }

  if (merge.right[merge.rightPos] === songIndex) {
    return songRangeInActiveMerge(merge, "right");
  }

  const leftPosition = merge.left.indexOf(songIndex);
  if (leftPosition >= merge.leftPos) {
    const minRank = merge.merged.length + (leftPosition - merge.leftPos) + 1;
    return {
      minRank,
      maxRank: minRank + merge.right.length - merge.rightPos,
      songCount: merge.left.length + merge.right.length,
    };
  }

  const rightPosition = merge.right.indexOf(songIndex);
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
  return chooseWithHistory(sort, choice, "manual");
}

export function chooseAutomatic(sort: SortState, choice: SortChoice): SortState {
  return chooseWithHistory(sort, choice, "automatic");
}

function chooseWithHistory(
  sort: SortState,
  choice: SortChoice,
  kind: SortPickKind,
): SortState {
  const merge = cloneMerge(sort.current);
  if (!merge) {
    return sort;
  }

  const next: SortState = {
    ...snapshot(sort),
    current: merge,
    history: [...sort.history, snapshot(sort, kind, choice)],
  };
  const source = choice === "left" ? merge.left : merge.right;
  const pos = choice === "left" ? merge.leftPos : merge.rightPos;
  merge.merged.push(source[pos]);
  merge.leftPos += choice === "left" ? 1 : 0;
  merge.rightPos += choice === "right" ? 1 : 0;
  next.pickedCount += 1;

  if (merge.leftPos === merge.left.length || merge.rightPos === merge.right.length) {
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

  return nextBattle(next);
}

export function undo(sort: SortState): SortState {
  for (let index = sort.history.length - 1; index >= 0; index -= 1) {
    const previous = sort.history[index];
    if (previous.historyEntryKind === "automatic") {
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

export const sortedSongIndexes = (sort: SortState): number[] =>
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

    const leftIndex = entry.current.left[entry.current.leftPos];
    const rightIndex = entry.current.right[entry.current.rightPos];
    const pickedIndex = choice === "left" ? leftIndex : rightIndex;

    return [{
      battleNo: entry.battleNo,
      leftIndex,
      rightIndex,
      pickedIndex,
      choice,
      kind: entry.historyEntryKind ?? "manual",
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
      return "left";
    }

    if (nextMerge.rightPos > previousMerge.rightPos) {
      return "right";
    }
  }

  const mergedGroup = next.groups.find((group) => includesMergeOutput(group, previousMerge));
  if (!mergedGroup) {
    return null;
  }

  const pickedPosition = previousMerge.merged.length;
  if (mergedGroup[pickedPosition] === previousMerge.left[previousMerge.leftPos]) {
    return "left";
  }

  if (mergedGroup[pickedPosition] === previousMerge.right[previousMerge.rightPos]) {
    return "right";
  }

  return null;
}

function includesMergeOutput(group: number[], merge: Merge): boolean {
  const expected = [...merge.left, ...merge.right];
  return expected.every((index) => group.includes(index));
}

function totalMergePlacements(songCount: number): number {
  const queue = Array.from({ length: songCount }, () => 1);
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

function sameArray(left: number[], right: number[]): boolean {
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

function placedByTransition(previous: Snapshot, next: Snapshot): number {
  if (previous.current === null || next.pickedCount <= previous.pickedCount) {
    return 0;
  }

  const manualPickCount = next.pickedCount - previous.pickedCount;
  const mergeSize = previous.current.left.length + previous.current.right.length;
  const nextIsSameMerge = hasSameMergeInputs(previous.current, next.current);

  return nextIsSameMerge ? manualPickCount : mergeSize - previous.current.merged.length;
}

export function progressPercentage(sort: SortState, songCount: number): number {
  if (isComplete(sort)) {
    return 100;
  }

  const snapshots = [...sort.history, snapshot(sort)];
  const placed = snapshots.reduce((total, current, index) => {
    const previous = snapshots[index - 1];
    return previous ? total + placedByTransition(previous, current) : total;
  }, 0);

  return Math.min(99, Math.floor((placed * 100) / totalMergePlacements(songCount)));
}
