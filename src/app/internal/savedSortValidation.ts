import { z } from 'zod';
import { remainingPlacements, totalMergePlacements, type SortState } from '../../sorter';
import type { SongId } from '../../songs';

/** Bumped when the shape of `<prefix>:sort` changes. v1 saves have no version field at all. */
export const SORT_SAVE_VERSION = 2;

export type LoadedSave =
    /** Already id-keyed; use as-is (still needs reconciling against the current list). */
    | { kind: 'current'; sort: SortState }
    /** Index-keyed save whose song count matches, so positions map to ids unambiguously. */
    | { kind: 'legacy-mappable'; sort: SortState }
    /** Index-keyed save from a shorter list: mapping is a guess, so ask before using it. */
    | { kind: 'legacy-ambiguous'; sort: SortState; savedSongCount: number }
    | { kind: 'unusable'; reason: string };

const mergeSchema = z
    .object({
        left: z.array(z.number().int()),
        right: z.array(z.number().int()),
        merged: z.array(z.number().int()),
        leftPos: z.number().int(),
        rightPos: z.number().int(),
    })
    .superRefine((merge, context) => {
        if (merge.leftPos < 0 || merge.leftPos >= merge.left.length) {
            context.addIssue({code: 'custom', message: 'leftPos must point to an active left item.', path: ['leftPos']});
        }

        if (merge.rightPos < 0 || merge.rightPos >= merge.right.length) {
            context.addIssue({code: 'custom', message: 'rightPos must point to an active right item.', path: ['rightPos']});
        }

        // Without this the merge flushes a group of the wrong length.
        if (merge.merged.length !== merge.leftPos + merge.rightPos) {
            context.addIssue({code: 'custom', message: 'merged must hold exactly the consumed prefixes.', path: ['merged']});
        }
    });

const snapshotSchema = z.object({
    groups: z.array(z.array(z.number().int())),
    current: mergeSchema.nullable(),
    battleNo: z.number().int(),
    pickedCount: z.number().int(),
    placedCount: z.number().int().min(0),
    estimatedBattles: z.number().int(),
    historyEntryKind: z.enum(['manual', 'automatic']).optional(),
    historyEntryChoice: z.enum(['left', 'right']).optional(),
});

const currentSortSchema = snapshotSchema.extend({
    version: z.literal(SORT_SAVE_VERSION),
    history: z.array(snapshotSchema),
});

// v1: same shape minus version/placedCount, and the numbers are positions in the old song list.
const legacySnapshotSchema = snapshotSchema.omit({placedCount: true}).extend({
    groups: z.array(z.array(z.number().int().min(0))),
});
const legacySortSchema = legacySnapshotSchema.extend({
    history: z.array(legacySnapshotSchema),
});

export function readSavedSort(value: unknown, songIds: SongId[]): LoadedSave {
    const current = currentSortSchema.safeParse(value);
    if (current.success) {
        const {version: _version, ...sort} = current.data;
        return {kind: 'current', sort: sort as SortState};
    }

    if (isRecord(value) && value.version !== undefined) {
        return {kind: 'unusable', reason: 'Saved progress uses an unsupported format version.'};
    }

    const legacy = legacySortSchema.safeParse(value);
    if (!legacy.success) {
        return {kind: 'unusable', reason: 'Saved progress could not be read.'};
    }

    const savedSongCount = legacyIndexCount(legacy.data as unknown as SortState);
    if (savedSongCount === null) {
        return {kind: 'unusable', reason: 'Saved progress does not cover a whole song list.'};
    }

    if (savedSongCount > songIds.length) {
        return {
            kind: 'unusable',
            reason: `Saved progress covers ${savedSongCount} songs, but this sorter now has ${songIds.length}.`,
        };
    }

    const sort = mapLegacyIndexesToIds(legacy.data as unknown as SortState, songIds, savedSongCount);

    return savedSongCount === songIds.length
        ? {kind: 'legacy-mappable', sort}
        : {kind: 'legacy-ambiguous', sort, savedSongCount};
}

/**
 * A v1 state references every position of its song list exactly once, so the number of distinct
 * indexes recovers the song count it was built against. Returns null if the indexes are not exactly
 * 0..m-1 (holes or repeats mean we cannot map them onto anything).
 */
function legacyIndexCount(sort: SortState): number | null {
    const seen = new Set<number>();
    const add = (values: number[]): boolean => values.every((value) => !seen.has(value) && (seen.add(value), true));

    for (const group of sort.groups) {
        if (!add(group)) {
            return null;
        }
    }

    if (sort.current && !(add(sort.current.left) && add(sort.current.right))) {
        return null;
    }

    for (let index = 0; index < seen.size; index += 1) {
        if (!seen.has(index)) {
            return null;
        }
    }

    return seen.size;
}

/** Maps stored positions onto ids by position. Correct as long as the list was not reordered. */
export function mapLegacyIndexesToIds(sort: SortState, songIds: SongId[], savedSongCount: number): SortState {
    const toId = (index: number): SongId => songIds[index];
    const mapGroups = (groups: number[][]) => groups.map((group) => group.map(toId));
    const mapMerge = (merge: SortState['current']) => merge && {
        left: merge.left.map(toId),
        right: merge.right.map(toId),
        merged: merge.merged.map(toId),
        leftPos: merge.leftPos,
        rightPos: merge.rightPos,
    };

    const mapped: SortState = {
        groups: mapGroups(sort.groups),
        current: mapMerge(sort.current),
        battleNo: sort.battleNo,
        pickedCount: sort.pickedCount,
        placedCount: 0,
        estimatedBattles: sort.estimatedBattles,
        history: sort.history.map((entry) => ({
            ...entry,
            groups: mapGroups(entry.groups),
            current: mapMerge(entry.current),
            placedCount: 0,
        })),
    };

    // v1 never stored placedCount; recover it from the work the state still owes.
    return {...mapped, placedCount: Math.max(0, totalMergePlacements(savedSongCount) - remainingPlacements(mapped))};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
