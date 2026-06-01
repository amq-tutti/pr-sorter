import { spawn } from "node:child_process";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { writePublicSorterIndexCatalog } from "./sorterIndexCatalog.js";

const generatedModulePath = path.resolve(process.cwd(), "src", "sorterIndex", "sorters.generated.ts");
const previewSlug = "test";
const sorterPreviewDist = path.resolve(process.cwd(), ".pages-tools", "local-sorter-dist");
const finalDist = path.resolve(process.cwd(), "dist");

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await rm(sorterPreviewDist, { recursive: true, force: true });

  await runNodeBin("node_modules/typescript/bin/tsc", ["--noEmit"], childEnv());
  await runNodeBin("node_modules/vite/bin/vite.js", ["build", "--outDir", sorterPreviewDist, "--emptyOutDir"], childEnv());
  await copyLocalFavicon(sorterPreviewDist);

  await writePreviewSorterIndex();
  await runNodeBin("node_modules/vite/bin/vite.js", ["build", "--outDir", finalDist, "--emptyOutDir"], withEnv({ VITE_SORTER_INDEX: "true" }));

  await cp(sorterPreviewDist, path.join(finalDist, previewSlug), { recursive: true });
}

async function writePreviewSorterIndex(): Promise<void> {
  const configSource = await readFile(path.resolve(process.cwd(), "customize", "config.ts"), "utf8");
  const title = readStringProperty(configSource, "title") ?? "Local Sorter";
  const description = readStringProperty(configSource, "description") ?? "Open this sorter.";
  const localSorter = [{ slug: previewSlug, title, description }];

  await mkdir(path.dirname(generatedModulePath), { recursive: true });
  await writeFile(
    generatedModulePath,
    `import type { SorterIndexEntry } from "./types";\n\nexport const sorters: SorterIndexEntry[] = ${JSON.stringify(localSorter, null, 2)};\n`,
    "utf8",
  );
  await writePublicSorterIndexCatalog(localSorter);
}

async function copyLocalFavicon(outputRoot: string): Promise<void> {
  const outputDir = path.join(outputRoot, "customize");
  await mkdir(outputDir, { recursive: true });
  await copyFile(path.resolve(process.cwd(), "customize", "favicon.ico"), path.join(outputDir, "favicon.ico"));
}

function readStringProperty(source: string, propertyName: string): string | null {
  const match = new RegExp(`${propertyName}\\s*:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`, "s").exec(source);
  if (!match) {
    return null;
  }

  return match[2]
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function withEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return { ...env, ...overrides };
}

function childEnv(): Record<string, string> {
  return withEnv({});
}

function run(command: string, args: string[], env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" && command === "npm" ? "npm.cmd" : command, args, {
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function runNodeBin(scriptPath: string, args: string[], env: Record<string, string>): Promise<void> {
  return run(process.execPath, [path.resolve(process.cwd(), scriptPath), ...args], env);
}
