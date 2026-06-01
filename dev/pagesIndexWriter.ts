import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sortIndexEntries, type SorterIndexEntry, writePublicSorterIndexCatalog } from "./sorterIndexCatalog.js";

const manifestPath = path.resolve(process.cwd(), ".pages-tools", "sorters.json");
const generatedModulePath = path.resolve(process.cwd(), "src", "sorterIndex", "sorters.generated.ts");
const command = process.argv[2];

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  if (command === "init") {
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeManifest([]);
    return;
  }

  if (command === "add") {
    const slug = process.argv[3];
    if (!slug) {
      throw new Error("Missing sorter slug.");
    }

    const manifest = await readManifest();
    const configSource = await readFile(path.resolve(process.cwd(), "customize", "config.ts"), "utf8");
    const title = readStringProperty(configSource, "title") ?? `${slug} Sorter`;
    const description = readStringProperty(configSource, "description") ?? "Open this sorter.";
    const category = readStringProperty(configSource, "category") ?? undefined;
    const nextEntry: SorterIndexEntry = { slug, title, description, ...(category ? { category } : {}) };
    const nextManifest = [...manifest.filter((entry) => entry.slug !== slug), nextEntry].sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" }),
    );

    await writeManifest(nextManifest);
    return;
  }

  if (command === "write") {
    const manifest = sortIndexEntries(await readManifest());
    await writePublicSorterIndexCatalog(manifest);
    await writeGeneratedModule(manifest);
    return;
  }

  throw new Error(`Unknown command: ${command ?? "(none)"}`);
}

async function readManifest(): Promise<SorterIndexEntry[]> {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as SorterIndexEntry[];
  } catch {
    return [];
  }
}

async function writeManifest(manifest: SorterIndexEntry[]): Promise<void> {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function writeGeneratedModule(manifest: SorterIndexEntry[]): Promise<void> {
  await mkdir(path.dirname(generatedModulePath), { recursive: true });
  await writeFile(
    generatedModulePath,
    `import type { SorterIndexEntry } from "./types";\n\nexport const sorters: SorterIndexEntry[] = ${JSON.stringify(manifest, null, 2)};\n`,
    "utf8",
  );
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
