import { config } from "../../customize/config";
import { songList } from "../../customize/songList";
import { App } from "../app/App";

export function SorterRunRoute() {
  return <App config={config} songs={songList} />;
}
