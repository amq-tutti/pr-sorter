import { currentBattle, type SortChoice, type SortState } from '../../sorter';
import { songEntryId, type SongCatalog } from '../../songs';
import type { Settings, SongScoresById } from '../types';
import { normalizeScore } from './songScores';

export function automaticChoiceForCurrentBattle(
    sort: SortState,
    catalog: SongCatalog,
    scoresBySongId: SongScoresById,
    settings: Settings,
    scoreEnabled: boolean,
): SortChoice | null {
    if (!scoreEnabled) {
        return null;
    }

    const battle = currentBattle(sort);
    if (!battle) {
        return null;
    }

    const [leftId, rightId] = battle;
    const leftSong = catalog.byId.get(leftId);
    const rightSong = catalog.byId.get(rightId);
    if (!leftSong || !rightSong) {
        return null;
    }

    try {
        const leftScore = normalizeScore(scoresBySongId[songEntryId(leftSong)] ?? '');
        const rightScore = normalizeScore(scoresBySongId[songEntryId(rightSong)] ?? '');
        if (leftScore === null || rightScore === null || leftScore === rightScore) {
            return null;
        }

        const difference = Math.abs(leftScore - rightScore);
        if (difference < settings.autoSkipScoreDifference) {
            return null;
        }

        return leftScore > rightScore ? 'left' : 'right';
    } catch {
        return null;
    }
}
