import { z } from 'zod';
import type { SortState } from '../../sorter';

function createSortStateSchema(songCount: number) {
    const songIndexSchema = z.number().int().refine((index) => index >= 0 && index < songCount);
    const indexArraySchema = z.array(songIndexSchema);
    const mergeSchema = z
        .object({
            left: indexArraySchema,
            right: indexArraySchema,
            merged: indexArraySchema,
            leftPos: z.number().int(),
            rightPos: z.number().int(),
        })
        .superRefine((merge, context) => {
            if (merge.leftPos < 0 || merge.leftPos >= merge.left.length) {
                context.addIssue({
                    code: 'custom',
                    message: 'leftPos must point to an active left item.',
                    path: ['leftPos'],
                });
            }

            if (merge.rightPos < 0 || merge.rightPos >= merge.right.length) {
                context.addIssue({
                    code: 'custom',
                    message: 'rightPos must point to an active right item.',
                    path: ['rightPos'],
                });
            }
        });
    const snapshotSchema = z.object({
        groups: z.array(indexArraySchema),
        current: mergeSchema.nullable(),
        battleNo: z.number().int(),
        pickedCount: z.number().int(),
        estimatedBattles: z.number().int(),
        historyEntryKind: z.enum(['manual', 'automatic']).optional(),
        historyEntryChoice: z.enum(['left', 'right']).optional(),
    });

    return snapshotSchema.extend({
        history: z.array(snapshotSchema),
    });
}

export function isSortState(value: unknown, songCount: number): value is SortState {
    return createSortStateSchema(songCount).safeParse(value).success;
}
