/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GOOGLE_API_KEY?: string;
    readonly VITE_SORTER_INDEX?: 'true';
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare module 'active-route' {
    export function ActiveRoute(): JSX.Element;
}
