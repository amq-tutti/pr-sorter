import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { localCustomizeWriter } from './dev/localCustomizeWriter';

const activeRoute = process.env.VITE_SORTER_INDEX === 'true'
    ? '/src/routes/SorterIndexRoute.tsx'
    : '/src/routes/SorterAppRoute.tsx';

export default defineConfig({
    base: './',
    resolve: {
        alias: {
            'active-route': activeRoute,
        },
    },
    plugins: [react(), localCustomizeWriter(), externalSorterSourceFrameSrc()],
});

// Merge the external sorter collection origins (from externalSorterSources.json) into the CSP
// frame-src at build time, so the index can embed them in hidden iframes for cross-origin progress.
function externalSorterSourceFrameSrc(): Plugin {
    return {
        name: 'external-sorter-source-frame-src',
        transformIndexHtml(html) {
            const externalOrigins = externalSorterSourceOrigins();
            if (externalOrigins.length === 0) {
                return html;
            }

            return html.replace(
                /(frame-src\s+)([^;"]*)(;)/,
                (_match, prefix: string, sources: string, suffix: string) => {
                    const mergedSources = [...new Set([...sources.trim().split(/\s+/).filter(Boolean), ...externalOrigins])];
                    return `${prefix}${mergedSources.join(' ')}${suffix}`;
                },
            );
        },
    };
}

function externalSorterSourceOrigins(): string[] {
    try {
        const sourcesPath = path.resolve(process.cwd(), 'src', 'sorterIndex', 'externalSorterSources.json');
        const parsed = JSON.parse(readFileSync(sourcesPath, 'utf8')) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((source) => {
                if (typeof source !== 'object' || source === null || typeof (source as { indexUrl?: unknown }).indexUrl !== 'string') {
                    return null;
                }

                try {
                    return new URL((source as { indexUrl: string }).indexUrl).origin;
                } catch {
                    return null;
                }
            })
            .filter((origin): origin is string => origin !== null);
    } catch {
        return [];
    }
}
