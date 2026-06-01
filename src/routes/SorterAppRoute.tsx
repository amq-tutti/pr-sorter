import { useEffect } from "react";
import { config } from "../../customize/config";
import { songList } from "../../customize/songList";
import { exposeHistoryMigrationTool } from "../app/historyMigrationTool";
import { CustomizeImportRoute } from "./CustomizeImportRoute";
import { SorterRunRoute } from "./SorterRunRoute";

export function ActiveRoute() {
  useEffect(() => {
    exposeHistoryMigrationTool(config.localStoragePrefix, songList);
  }, []);

  return isCustomizeImportRoute() ? <CustomizeImportRoute /> : <SorterRunRoute />;
}

function isCustomizeImportRoute(): boolean {
  return window.location.pathname.endsWith("/import");
}
