import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCustomizeConfig, loadCustomizeSongCount, serializedDeadline, serializedTags } from "./configLoader.js";
import {
  sortIndexEntries,
  type SorterIndexEntry,
  type SorterIndexManifestEntry,
  visibleIndexEntries,
  writePublicSorterIndexCatalog,
} from "./sorterIndexCatalog.js";

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
    const config = await loadCustomizeConfig();
    const songCount = await loadCustomizeSongCount();
    const deadline = serializedDeadline(config);
    const tags = serializedTags(config);
    const nextEntry = {
      slug,
      title: config.title,
      description: config.description,
      ...(tags ? { tags } : {}),
      localStoragePrefix: config.localStoragePrefix,
      ...(config.rankSupported === false ? { rankSupported: false } : {}),
      ...(config.rankSupported === false ? { songCount } : {}),
      ...(config.hide ? { hide: true } : {}),
      ...(deadline ? { deadline } : {}),
    };
    const nextManifest = [...manifest.filter((entry) => entry.slug !== slug), nextEntry].sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" }),
    );

    await writeManifest(nextManifest);
    return;
  }

  if (command === "write") {
    const manifest = sortIndexEntries(await readManifest());
    const visibleManifest = visibleIndexEntries(manifest);
    await writePublicSorterIndexCatalog(manifest);
    await writeGeneratedModule(visibleManifest);
    return;
  }

  throw new Error(`Unknown command: ${command ?? "(none)"}`);
}

async function readManifest(): Promise<SorterIndexManifestEntry[]> {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as SorterIndexManifestEntry[];
  } catch {
    return [];
  }
}

async function writeManifest(manifest: SorterIndexManifestEntry[]): Promise<void> {
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
