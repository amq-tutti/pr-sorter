import { SorterIndex } from '../sorterIndex/SorterIndex';
import { CustomizeImportRoute } from './CustomizeImportRoute';
import { ActiveRoute as SorterAppRoute } from './SorterAppRoute';

export function ActiveRoute() {
    if (isCustomizeImportRoute()) {
        return <CustomizeImportRoute/>;
    }

    return isSorterRoute() ? <SorterAppRoute/> : <SorterIndex/>;
}

function isCustomizeImportRoute(): boolean {
    return window.location.pathname.replace(/\/+$/, '') === '/import';
}

function isSorterRoute(): boolean {
    const pathname = window.location.pathname.replace(/\/+$/, '');
    return pathname === '/test' || pathname.startsWith('/test/');
}
