import type { ExternalSorterSource } from './types';

export const externalSorterSources = [
    {
        title: 'Minigamer42',
        indexUrl: 'https://minigamer42.github.io/pr-sorter/',
        excludedSorterSlugs: ['yorushika', 'princession', 'suara', 'yuuko-natsuyoshi'],
    },
] satisfies ExternalSorterSource[];
