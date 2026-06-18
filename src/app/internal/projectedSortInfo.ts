import {
    currentBattle,
    isComplete,
    songSortInfo,
    type CurrentSongSortInfo,
    type SortChoice,
    type SortState,
} from '../../sorter';
import type { ResolvedSongEntry } from '../../songs';
import type { Settings, SongScoresById } from '../types';
import { automaticChoiceForCurrentBattle } from './automaticChoice';

type ProjectionOptions = {
    songs: ResolvedSongEntry[];
    scoresBySongId: SongScoresById;
    settings: Settings;
    scoreEnabled: boolean;
};

export function projectedSongSortInfo(
    sort: SortState,
    songIndex: number,
    options: ProjectionOptions,
): CurrentSongSortInfo | null {
    return combineSortInfos(projectedSortInfoStates(sort, options).map((state) => songSortInfo(state, songIndex)));
}

export function projectedSongSortInfos(
    sort: SortState,
    songCount: number,
    options: ProjectionOptions,
): Map<number, CurrentSongSortInfo> {
    const states = projectedSortInfoStates(sort, options);
    const infos = new Map<number, CurrentSongSortInfo>();

    for (let songIndex = 0; songIndex < songCount; songIndex += 1) {
        const info = combineSortInfos(states.map((state) => songSortInfo(state, songIndex)));
        if (info) {
            infos.set(songIndex, info);
        }
    }

    return infos;
}

function projectedSortInfoStates(sort: SortState, options: ProjectionOptions): SortState[] {
    const afterCurrentAutomaticPicks = applyAutomaticPicks(sort, options);
    if (!currentBattle(afterCurrentAutomaticPicks)) {
        return [afterCurrentAutomaticPicks];
    }

    return (['left', 'right'] as const).map((choice) =>
        applyAutomaticPicks(chooseProjected(afterCurrentAutomaticPicks, choice), options),
    );
}

function applyAutomaticPicks(sort: SortState, options: ProjectionOptions): SortState {
    let nextSort = cloneProjectedSort(sort);
    const maxIterations = Math.max(1, options.songs.length * options.songs.length * 2);

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const choice = automaticChoiceForCurrentBattle(
            nextSort,
            options.songs,
            options.scoresBySongId,
            options.settings,
            options.scoreEnabled,
        );
        if (!choice) {
            return nextSort;
        }

        nextSort = chooseProjected(nextSort, choice);
        if (isComplete(nextSort)) {
            return nextSort;
        }
    }

    return nextSort;
}

function chooseProjected(sort: SortState, choice: SortChoice): SortState {
    const merge = sort.current;
    if (!merge) {
        return cloneProjectedSort(sort);
    }

    const next = cloneProjectedSort(sort);
    const nextMerge = next.current;
    if (!nextMerge) {
        return next;
    }

    const source = choice === 'left' ? nextMerge.left : nextMerge.right;
    const pos = choice === 'left' ? nextMerge.leftPos : nextMerge.rightPos;
    nextMerge.merged.push(source[pos]);
    nextMerge.leftPos += choice === 'left' ? 1 : 0;
    nextMerge.rightPos += choice === 'right' ? 1 : 0;
    next.pickedCount += 1;

    if (nextMerge.leftPos === nextMerge.left.length || nextMerge.rightPos === nextMerge.right.length) {
        next.groups.push([
            ...nextMerge.merged,
            ...nextMerge.left.slice(nextMerge.leftPos),
            ...nextMerge.right.slice(nextMerge.rightPos),
        ]);
        next.current = null;
    }

    if (!isComplete(next)) {
        next.battleNo += 1;
    }

    return nextProjectedBattle(next);
}

function nextProjectedBattle(sort: SortState): SortState {
    while (sort.current === null && sort.groups.length > 1) {
        const left = sort.groups.shift();
        const right = sort.groups.shift();
        if (left && right) {
            sort.current = {left, right, merged: [], leftPos: 0, rightPos: 0};
        }
    }

    return sort;
}

function cloneProjectedSort(sort: SortState): SortState {
    return {
        groups: sort.groups.map((group) => [...group]),
        current: sort.current
            ? {
                left: [...sort.current.left],
                right: [...sort.current.right],
                merged: [...sort.current.merged],
                leftPos: sort.current.leftPos,
                rightPos: sort.current.rightPos,
            }
            : null,
        battleNo: sort.battleNo,
        pickedCount: sort.pickedCount,
        estimatedBattles: sort.estimatedBattles,
        history: [],
    };
}

function combineSortInfos(infos: Array<CurrentSongSortInfo | null>): CurrentSongSortInfo | null {
    const availableInfos = infos.filter((info): info is CurrentSongSortInfo => info !== null);
    if (availableInfos.length === 0) {
        return null;
    }

    return {
        minRank: Math.min(...availableInfos.map((info) => info.minRank)),
        maxRank: Math.max(...availableInfos.map((info) => info.maxRank)),
        songCount: Math.max(...availableInfos.map((info) => info.songCount)),
    };
}
