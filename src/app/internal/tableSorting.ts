export type SortDirection = 'asc' | 'desc';

export function compareText(left: string, right: string): number {
    return left.localeCompare(right, undefined, {numeric: true, sensitivity: 'base'});
}

// Blank/unparseable scores always sort last, whichever direction the column is read in, so an
// empty cell never pushes a real score off the top of the table.
export function compareScores(left: string | undefined, right: string | undefined): number {
    const leftScore = parseScore(left);
    const rightScore = parseScore(right);

    if (leftScore === null && rightScore === null) {
        return compareText(left ?? '', right ?? '');
    }

    if (leftScore === null) {
        return 1;
    }

    if (rightScore === null) {
        return -1;
    }

    return leftScore - rightScore;
}

function parseScore(score: string | undefined): number | null {
    if (!score?.trim()) {
        return null;
    }

    const parsed = Number.parseFloat(score);
    return Number.isFinite(parsed) ? parsed : null;
}
