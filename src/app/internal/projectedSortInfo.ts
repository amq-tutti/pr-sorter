import {
    applyChoice,
    currentBattle,
    isComplete,
    songSortInfo,
    type CurrentSongSortInfo,
    type SortState,
} from '../../sorter';
import type { SongCatalog, SongId } from '../../songs';
import type { Settings, SongScoresById } from '../types';
import { automaticChoiceForCurrentBattle } from './automaticChoice';

type ProjectionOptions = {
    catalog: SongCatalog;
    scoresBySongId: SongScoresById;
    settings: Settings;
    scoreEnabled: boolean;
};

export function projectedSongSortInfo(
    sort: SortState,
    songId: SongId,
    options: ProjectionOptions,
): CurrentSongSortInfo | null {
    return combineSortInfos(projectedSortInfoStates(sort, options).map((state) => songSortInfo(state, songId)));
}

export function projectedSongSortInfos(
    sort: SortState,
    songIds: SongId[],
    options: ProjectionOptions,
): Map<SongId, CurrentSongSortInfo> {
    const states = projectedSortInfoStates(sort, options);
    const infos = new Map<SongId, CurrentSongSortInfo>();

    for (const songId of songIds) {
        const info = combineSortInfos(states.map((state) => songSortInfo(state, songId)));
        if (info) {
            infos.set(songId, info);
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
        applyAutomaticPicks(applyChoice(afterCurrentAutomaticPicks, choice, null), options),
    );
}

// Projected states are read-only and never undone, so drop history rather than deep-copying it.
// Safe to share the input object: applyChoice copies before mutating.
const withoutHistory = (sort: SortState): SortState =>
    sort.history.length === 0 ? sort : {...sort, history: []};

function applyAutomaticPicks(sort: SortState, options: ProjectionOptions): SortState {
    let nextSort = withoutHistory(sort);
    const maxIterations = Math.max(1, options.catalog.entries.length * options.catalog.entries.length * 2);

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const choice = automaticChoiceForCurrentBattle(
            nextSort,
            options.catalog,
            options.scoresBySongId,
            options.settings,
            options.scoreEnabled,
        );
        if (!choice) {
            return nextSort;
        }

        nextSort = applyChoice(nextSort, choice, null);
        if (isComplete(nextSort)) {
            return nextSort;
        }
    }

    return nextSort;
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
