import { useEffect } from 'react';
import { config } from '../../customize/config';
import { songList } from '../../customize/songList';
import { fallbackAnimeName } from '../app/App';
import { exposeHistoryMigrationTool } from '../app/historyMigrationTool';
import { createSongCatalog } from '../songs';
import { CustomizeImportRoute } from './CustomizeImportRoute';
import { SorterRunRoute } from './SorterRunRoute';

export function ActiveRoute() {
    useEffect(() => {
        exposeHistoryMigrationTool(
            config.localStoragePrefix,
            createSongCatalog(songList, fallbackAnimeName(config)),
        );
    }, []);

    return isCustomizeImportRoute() ? <CustomizeImportRoute/> : <SorterRunRoute/>;
}

function isCustomizeImportRoute(): boolean {
    return window.location.pathname.endsWith('/import');
}
