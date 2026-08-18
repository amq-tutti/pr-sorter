import { isComplete, type SortState } from '../../sorter';
import { songEntryId, type ResolvedSongEntry } from '../../songs';
import type { SortLoadResult } from '../storage';
import type { AppConfig, SavedProgressKind } from '../types';
import type { ReconcileReport } from '../../sorter';

type PendingLoad = Extract<SortLoadResult, {kind: 'ready' | 'needs-consent'}>;

export function pendingLoadMessage(pending: PendingLoad, songCount: number): string {
    if (pending.kind === 'needs-consent') {
        return `Saved progress was made when this sorter had ${pending.savedSongCount} songs; it now has ${songCount}. `
            + 'It can be mapped onto the first '
            + `${pending.savedSongCount} songs, with the rest added as new. `
            + 'If songs were inserted or reordered rather than appended, this would scramble your ranking.';
    }

    const added = pending.report.addedIds.length;
    const removed = pending.report.removedIds.length;
    const changes: string[] = [];

    if (added > 0) {
        changes.push(`${added} new ${added === 1 ? 'song was' : 'songs were'} added to this sorter's song list`);
    }

    if (removed > 0) {
        changes.push(added > 0
            ? `${removed} ${removed === 1 ? 'song is' : 'songs are'} no longer in it`
            : `${removed} ${removed === 1 ? 'song is' : 'songs are'} no longer in this sorter's song list`);
    }

    const sentences = [`${changes.join(', and ')}.`];

    if (removed > 0 && added === 0) {
        sentences.push(`${removed === 1 ? 'It has' : 'They have'} been taken out of your results — `
            + 'everything else keeps the order you picked.');
    } else if (removed > 0) {
        sentences.push(`The removed ${removed === 1 ? 'song has' : 'songs have'} been taken out of your results.`);
    }

    if (added > 0) {
        sentences.push('Everything you already picked is kept, so only the new '
            + `${added === 1 ? 'song still needs' : 'songs still need'} placing.`);
    }

    return sentences.join(' ');
}

export function pendingLoadConfirmLabel(pending: PendingLoad): string {
    if (pending.kind === 'needs-consent') {
        return 'Use saved progress';
    }

    // Removals alone can leave the ranking finished, in which case this goes straight to results.
    return isComplete(pending.sort) ? 'Show Results' : 'Continue sorting';
}

export function describeSavedSort(saved: SortLoadResult, songCount: number): string | null {
    if (saved.kind === 'unusable') {
        return saved.reason;
    }

    if (saved.kind === 'none' || !saved.report.changed) {
        return null;
    }

    const {addedIds, removedIds} = saved.report;
    const covered = songCount - addedIds.length;

    return `Saved progress covers ${covered} of this sorter's ${songCount} songs`
        + (removedIds.length > 0 ? ` (${removedIds.length} saved song(s) no longer exist)` : '')
        + '.';
}

export function incompleteRankingMessage(songs: ResolvedSongEntry[], sort: SortState): string {
    if (!isComplete(sort)) {
        return 'Finish sorting before exporting ranks.';
    }

    const ranked = new Set(sort.groups[0] ?? []);
    const missing = songs.filter((song) => !ranked.has(songEntryId(song))).length;

    return `Your saved ranking does not cover ${missing} song(s) in the current list. Continue sorting to finish.`;
}

export function landingTitle(
    savedKind: SavedProgressKind,
    rankSupported: boolean,
    listChange: ReconcileReport | null,
): string {
    if (!rankSupported) {
        return 'Press "Playlist" to browse songs.';
    }

    // Without this, someone who remembers finishing sees "Continue" and reads it as lost work.
    if (savedKind === 'in-progress' && listChange?.addedIds.length) {
        const count = listChange.addedIds.length;
        return `This sorter gained ${count} ${count === 1 ? 'song' : 'songs'} since you last sorted. `
            + `Press "Continue" to place ${count === 1 ? 'it' : 'them'}, or "Start" to sort everything from scratch.`;
    }

    if (savedKind === 'complete') {
        return 'Press "Start" to begin sorting or "Show Results" to display results of previous sorting.';
    }

    if (savedKind === 'in-progress') {
        return 'Press "Start" to begin sorting or "Continue" to load saved progress and resume where you left.';
    }

    return 'Press "Start" to begin sorting.';
}
