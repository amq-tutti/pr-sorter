import { spawn } from "node:child_process";
import path from "node:path";
import { writeLocalPreviewSorterIndex } from "./localPreviewIndex.js";

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await writeLocalPreviewSorterIndex();
  await runViteDev();
}

function runViteDev(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(process.cwd(), "node_modules/vite/bin/vite.js"), ...process.argv.slice(2)], {
      env: { ...process.env, VITE_PAGES_PREVIEW: "true" },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === null) {
        resolve();
        return;
      }

      reject(new Error(`vite exited with code ${code}.`));
    });
  });
}
