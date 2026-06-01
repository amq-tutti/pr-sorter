import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
    plugins: [react(), localCustomizeWriter()],
});
