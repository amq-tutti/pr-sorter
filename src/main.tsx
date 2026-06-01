import { createRoot } from "react-dom/client";
import { ActiveRoute } from "active-route";

const root = createRoot(document.querySelector<HTMLElement>("#root")!);

root.render(<ActiveRoute />);
