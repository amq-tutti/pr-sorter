import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localCustomizeWriter } from './dev/localCustomizeWriter';
import { externalSorterSources } from './src/sorterIndex/externalSorterSources';
import type { Plugin } from 'vite';

const activeRoute = process.env.VITE_PAGES_PREVIEW === 'true'
    ? '/src/routes/PagesPreviewRoute.tsx'
    : process.env.VITE_SORTER_INDEX === 'true'
        ? '/src/routes/SorterIndexRoute.tsx'
        : '/src/routes/SorterAppRoute.tsx';

export default defineConfig({
    base: './',
    resolve: {
        alias: {
            'active-route': activeRoute,
        },
    },
    plugins: [react(), localCustomizeWriter(), externalSorterSourceFrameSrc(), pagesPreviewAssetRewrite()],
});

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
    return externalSorterSources
        .map((source) => {
            try {
                return new URL(source.indexUrl).origin;
            } catch {
                return null;
            }
        })
        .filter((origin): origin is string => origin !== null);
}

function pagesPreviewAssetRewrite(): Plugin {
    return {
        name: 'pages-preview-asset-rewrite',
        configureServer(server) {
            if (process.env.VITE_PAGES_PREVIEW !== 'true') {
                return;
            }

            server.middlewares.use((request, _response, next) => {
                if (!request.url) {
                    next();
                    return;
                }

                if (request.url === '/test/style.css') {
                    request.url = '/style.css';
                } else if (request.url.startsWith('/test/customize/')) {
                    request.url = request.url.slice('/test'.length);
                }

                next();
            });
        },
    };
}
