import type { SongId } from '../../songs';
import { nextBattle, remainingPlacements, withEstimate, type Merge, type SortState } from './mergeSort';

export type ReconcileReport = {
    /** New song ids, in current song-list order. */
    addedIds: SongId[];
    /** Ids that were in the save but are no longer in the song list. */
    removedIds: SongId[];
    /** Undo history had to be discarded (removals only). */
    historyCleared: boolean;
    changed: boolean;
};

export type ReconcileResult = {
    sort: SortState;
    report: ReconcileReport;
};

/**
 * Re-fits saved progress onto the current song list: drops songs that disappeared (keeping the
 * relative order of everything else) and queues new songs so only the battles needed to place them
 * get asked. Returns null when the save is unusable — corrupt, or every song is gone.
 *
 * Invariants preserved:
 *   I1 the state's ids are exactly the current ids, each appearing once
 *   I2 a live merge has 0 <= leftPos < left.length and 0 <= rightPos < right.length
 *   I3 merged.length === leftPos + rightPos
 *   I4 no empty group (nextBattle's `if (left && right)` does NOT reject [], and an empty group
 *      makes currentBattle yield undefined)
 */
export function reconcileSort(sort: SortState, songIds: SongId[]): ReconcileResult | null {
    const stateIds = collectStateIds(sort);
    if (!stateIds || !hasValidMerge(sort.current)) {
        return null;
    }

    const currentIds = new Set(songIds);
    const removedIds = [...stateIds].filter((songId) => !currentIds.has(songId));
    const addedIds = songIds.filter((songId) => !stateIds.has(songId));

    if (removedIds.length === 0 && addedIds.length === 0) {
        return {sort, report: {addedIds: [], removedIds: [], historyCleared: false, changed: false}};
    }

    const keep = (songId: SongId) => currentIds.has(songId);
    let groups = removedIds.length > 0
        ? sort.groups.map((group) => group.filter(keep)).filter((group) => group.length > 0)
        : sort.groups.map((group) => [...group]);
    let current = sort.current ? cloneMerge(sort.current) : null;

    if (current && removedIds.length > 0) {
        const left = current.left.filter(keep);
        const right = current.right.filter(keep);
        const merged = current.merged.filter(keep);
        // Count survivors strictly before the old cursor. If the on-screen song was removed this
        // lands on the next surviving contender, and it keeps I3 by construction: merged is exactly
        // the interleaving of the two consumed prefixes, so filtering it drops exactly the same ids.
        const leftPos = current.left.slice(0, current.leftPos).filter(keep).length;
        const rightPos = current.right.slice(0, current.rightPos).filter(keep).length;

        if (left.length === 0 && right.length === 0) {
            current = null;
        } else if (leftPos >= left.length || rightPos >= right.length) {
            // A side ran out, so the merge is finished rather than invalid. Flush exactly the way
            // applyChoice does, and push to the back of the queue.
            groups.push([...merged, ...left.slice(leftPos), ...right.slice(rightPos)]);
            current = null;
        } else {
            current = {left, right, merged, leftPos, rightPos};
        }
    }

    // New songs join the back of the FIFO queue, matching where finished merges are pushed.
    groups.push(...addedIds.map((songId) => [songId]));

    if (groups.length === 0 && current === null) {
        return null;
    }

    // Removals leave placedCount counting work done on songs that are gone, so progress can read a
    // little high. Resetting it instead would show ~0% on a nearly finished sort, which is worse.
    const historyCleared = removedIds.length > 0;
    const reconciled = withEstimate(nextBattle({
        groups,
        current,
        battleNo: sort.battleNo,
        pickedCount: sort.pickedCount,
        placedCount: sort.placedCount,
        estimatedBattles: sort.estimatedBattles,
        history: historyCleared ? [] : sort.history.map((entry) => extendSnapshot(entry, addedIds)),
    }));

    return {sort: reconciled, report: {addedIds, removedIds, historyCleared, changed: true}};
}

/**
 * Keeps undo working across an additions-only reconcile. Each past snapshot partitions the old song
 * set, so appending the same singletons to its queue tail yields the state reconcile would have
 * produced from that point. Removals cannot be rewritten this way — pickHistory reads the cursor to
 * say what was compared, so a rewritten snapshot would display a battle that never happened.
 */
function extendSnapshot(entry: SortState['history'][number], addedIds: SongId[]): SortState['history'][number] {
    if (addedIds.length === 0) {
        return entry;
    }

    const groups = [...entry.groups.map((group) => [...group]), ...addedIds.map((songId) => [songId])];
    const extended = {...entry, groups};

    return {
        ...extended,
        estimatedBattles: Math.max(1, entry.pickedCount + remainingPlacements({...extended, history: []})),
    };
}

function cloneMerge(merge: Merge): Merge {
    return {
        left: [...merge.left],
        right: [...merge.right],
        merged: [...merge.merged],
        leftPos: merge.leftPos,
        rightPos: merge.rightPos,
    };
}

/** Every id in the state, or null if any id appears twice. `merged` adds nothing new. */
function collectStateIds(sort: SortState): Set<SongId> | null {
    const ids = new Set<SongId>();
    const addAll = (values: SongId[]): boolean => {
        for (const songId of values) {
            if (ids.has(songId)) {
                return false;
            }

            ids.add(songId);
        }

        return true;
    };

    for (const group of sort.groups) {
        if (!addAll(group)) {
            return null;
        }
    }

    if (sort.current && !(addAll(sort.current.left) && addAll(sort.current.right))) {
        return null;
    }

    return ids;
}

function hasValidMerge(merge: Merge | null): boolean {
    if (!merge) {
        return true;
    }

    if (merge.leftPos < 0 || merge.leftPos >= merge.left.length) {
        return false;
    }

    if (merge.rightPos < 0 || merge.rightPos >= merge.right.length) {
        return false;
    }

    // merged must be exactly the two consumed prefixes, or flushing would emit a wrong-length group.
    const consumed = [...merge.left.slice(0, merge.leftPos), ...merge.right.slice(0, merge.rightPos)].sort((a, b) => a - b);
    const observed = [...merge.merged].sort((a, b) => a - b);

    return consumed.length === observed.length && consumed.every((value, index) => value === observed[index]);
}
