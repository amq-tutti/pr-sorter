import {
  choose,
  chooseAutomatic,
  currentBattle,
  type SortChoice,
  type SortPickKind,
  type SortState,
} from "../sorter";
import type { Song } from "../songs";
import { normalizeScore } from "./internal/songScores";
import type { Settings, SongScoresById } from "./types";

type Snapshot = Omit<SortState, "history"> & {
  historyEntryKind?: SortPickKind;
  historyEntryChoice?: SortChoice;
};

type MigrationReport = {
  prefix: string;
  manualPicks: number;
  automaticPicksInserted: number;
  skippedManualPicks: number;
  matchedFinalState: boolean;
};

declare global {
  interface Window {
    prSorterFillAutomaticPickHistory?: (prefix?: string) => MigrationReport;
  }
}

export function exposeHistoryMigrationTool(defaultPrefix: string, songs: Song[]): void {
  window.prSorterFillAutomaticPickHistory = (prefix = defaultPrefix) =>
    fillAutomaticPickHistory(prefix, songs);
}

function fillAutomaticPickHistory(prefix: string, songs: Song[]): MigrationReport {
  const sortKey = `${prefix}:sort`;
  const scores = readJson<SongScoresById>(`${prefix}:scores`) ?? {};
  const settings = readJson<Settings>(`${prefix}:settings`) ?? {
    mediaFormat: "video",
    region: "eu",
    autoSkipScoreDifference: 10,
  };
  const sort = readJson<SortState>(sortKey);

  if (!sort) {
    throw new Error(`No saved sort found at localStorage key "${sortKey}".`);
  }

  const manualSnapshots = sort.history
    .filter((entry) => entry.historyEntryKind !== "automatic")
    .sort(compareSnapshots);
  if (manualSnapshots.length === 0) {
    return {
      prefix,
      manualPicks: 0,
      automaticPicksInserted: 0,
      skippedManualPicks: 0,
      matchedFinalState: true,
    };
  }

  let rebuilt = stateFromSnapshot(manualSnapshots[0], []);
  let automaticPicksInserted = 0;
  let skippedManualPicks = 0;

  for (let index = 0; index < manualSnapshots.length; index += 1) {
    const manualSnapshot = manualSnapshots[index];
    const nextManualSnapshot = manualSnapshots[index + 1];
    const targetAfterThisPick = nextManualSnapshot ?? snapshotFromSort(sort);
    const manualChoice = manualSnapshot.historyEntryChoice ?? inferChoice(manualSnapshot, targetAfterThisPick);

    if (!manualChoice) {
      skippedManualPicks += 1;
      rebuilt = stateFromSnapshot(manualSnapshot, rebuilt.history);
      continue;
    }

    rebuilt = choose(stateFromSnapshot(manualSnapshot, rebuilt.history), manualChoice);

    const automaticBefore = rebuilt.history.length;
    rebuilt = applyAutomaticPicksUntilTarget(rebuilt, targetAfterThisPick, songs, scores, settings);
    automaticPicksInserted += rebuilt.history.length - automaticBefore;
  }

  const upgradedSort: SortState = {
    ...snapshotFromSort(sort),
    history: rebuilt.history,
  };
  localStorage.setItem(sortKey, JSON.stringify(upgradedSort));

  return {
    prefix,
    manualPicks: manualSnapshots.length - skippedManualPicks,
    automaticPicksInserted,
    skippedManualPicks,
    matchedFinalState: sameSnapshot(rebuilt, snapshotFromSort(sort)),
  };
}

function applyAutomaticPicksUntilTarget(
  sort: SortState,
  target: Snapshot,
  songs: Song[],
  scores: SongScoresById,
  settings: Settings,
): SortState {
  let nextSort = sort;
  const maxIterations = songs.length * songs.length * 2;

  for (let iteration = 0; iteration < maxIterations && !sameSnapshot(nextSort, target); iteration += 1) {
    if (nextSort.pickedCount >= target.pickedCount || nextSort.battleNo >= target.battleNo) {
      return nextSort;
    }

    const choice = automaticChoice(nextSort, songs, scores, settings);
    if (!choice) {
      return nextSort;
    }

    nextSort = chooseAutomatic(nextSort, choice);
  }

  return nextSort;
}

function automaticChoice(
  sort: SortState,
  songs: Song[],
  scores: SongScoresById,
  settings: Settings,
): SortChoice | null {
  const battle = currentBattle(sort);
  if (!battle) {
    return null;
  }

  const [leftIndex, rightIndex] = battle;
  const leftSong = songs[leftIndex];
  const rightSong = songs[rightIndex];
  if (!leftSong || !rightSong) {
    return null;
  }

  const leftScore = normalizeScore(scores[leftSong.id] ?? "");
  const rightScore = normalizeScore(scores[rightSong.id] ?? "");
  if (leftScore === null || rightScore === null || leftScore === rightScore) {
    return null;
  }

  if (Math.abs(leftScore - rightScore) < settings.autoSkipScoreDifference) {
    return null;
  }

  return leftScore > rightScore ? "left" : "right";
}

function inferChoice(previous: Snapshot, next: Snapshot): SortChoice | null {
  const previousMerge = previous.current;
  if (!previousMerge || next.pickedCount <= previous.pickedCount) {
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

function stateFromSnapshot(snapshot: Snapshot, history: Snapshot[]): SortState {
  return {
    groups: snapshot.groups.map((group) => [...group]),
    current: snapshot.current ? {
      left: [...snapshot.current.left],
      right: [...snapshot.current.right],
      merged: [...snapshot.current.merged],
      leftPos: snapshot.current.leftPos,
      rightPos: snapshot.current.rightPos,
    } : null,
    battleNo: snapshot.battleNo,
    pickedCount: snapshot.pickedCount,
    estimatedBattles: snapshot.estimatedBattles,
    history,
  };
}

function snapshotFromSort(sort: SortState): Snapshot {
  return {
    groups: sort.groups.map((group) => [...group]),
    current: sort.current ? {
      left: [...sort.current.left],
      right: [...sort.current.right],
      merged: [...sort.current.merged],
      leftPos: sort.current.leftPos,
      rightPos: sort.current.rightPos,
    } : null,
    battleNo: sort.battleNo,
    pickedCount: sort.pickedCount,
    estimatedBattles: sort.estimatedBattles,
  };
}

function sameSnapshot(left: Snapshot | SortState, right: Snapshot): boolean {
  return (
    left.battleNo === right.battleNo &&
    left.pickedCount === right.pickedCount &&
    sameGroups(left.groups, right.groups) &&
    sameMerge(left.current, right.current)
  );
}

function compareSnapshots(left: Snapshot, right: Snapshot): number {
  return left.pickedCount - right.pickedCount || left.battleNo - right.battleNo;
}

function sameGroups(left: number[][], right: number[][]): boolean {
  return left.length === right.length && left.every((group, index) => sameArray(group, right[index] ?? []));
}

function sameMerge(left: Snapshot["current"], right: Snapshot["current"]): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return (
    sameArray(left.left, right.left) &&
    sameArray(left.right, right.right) &&
    sameArray(left.merged, right.merged) &&
    left.leftPos === right.leftPos &&
    left.rightPos === right.rightPos
  );
}

function hasSameMergeInputs(left: Snapshot["current"], right: Snapshot["current"]): boolean {
  return left !== null && right !== null && sameArray(left.left, right.left) && sameArray(left.right, right.right);
}

function includesMergeOutput(group: number[], merge: NonNullable<Snapshot["current"]>): boolean {
  const expected = [...merge.left, ...merge.right];
  return expected.every((index) => group.includes(index));
}

function sameArray(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as T;
}
