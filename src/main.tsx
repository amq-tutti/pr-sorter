import { createRoot } from "react-dom/client";
import { config } from "../customize/config";
import { songList } from "../customize/songList";
import { App } from "./app/App";
import { exposeHistoryMigrationTool } from "./app/historyMigrationTool";

exposeHistoryMigrationTool(config.localStoragePrefix, songList);

createRoot(document.querySelector<HTMLElement>("#root")!).render(
  <App config={config} songs={songList} />,
);
