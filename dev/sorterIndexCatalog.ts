import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { externalSorterSources } from "../src/sorterIndex/externalSorterSources.js";
import type { ExternalSorterSource } from "../src/sorterIndex/types.js";

export type SorterIndexEntry = {
  slug: string;
  title: string;
  description: string;
  tags?: string[];
  localStoragePrefix?: string;
  rankSupported?: boolean;
  songCount?: number;
  deadline?: string;
};

export type SorterIndexManifestEntry = SorterIndexEntry & {
  hide?: boolean;
};

type PublicSorterIndexEntry = Omit<SorterIndexEntry, "localStoragePrefix">;

const publicCatalogPath = path.resolve(process.cwd(), "public", "sorter-index.json");

export async function writePublicSorterIndexCatalog(sorters: SorterIndexManifestEntry[]): Promise<void> {
  const externalSources = readExternalSources();
  const visibleSorters = publicIndexEntries(sorters);

  await mkdir(path.dirname(publicCatalogPath), { recursive: true });
  await writeFile(publicCatalogPath, `${JSON.stringify({ sorters: visibleSorters, externalSources }, null, 2)}\n`, "utf8");
}

export function sortIndexEntries<T extends SorterIndexEntry>(entries: T[]): T[] {
  return entries.sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));
}

export function visibleIndexEntries(entries: SorterIndexManifestEntry[]): SorterIndexEntry[] {
  return entries
    .filter((entry) => entry.hide !== true)
    .map(({ hide: _hide, ...entry }) => entry);
}

function publicIndexEntries(entries: SorterIndexManifestEntry[]): PublicSorterIndexEntry[] {
  return visibleIndexEntries(entries).map(({ localStoragePrefix: _localStoragePrefix, ...entry }) => entry);
}

function readExternalSources(): ExternalSorterSource[] {
  return externalSorterSources.filter((source) => source.title && source.indexUrl);
}
