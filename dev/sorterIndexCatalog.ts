import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SorterIndexEntry = {
  slug: string;
  title: string;
  description: string;
  tags?: string[];
  deadline?: string;
  localStoragePrefix?: string;
};

type ExternalSorterSource = {
  title: string;
  indexUrl: string;
  catalogUrl?: string;
};

const externalSourcesPath = path.resolve(process.cwd(), "src", "sorterIndex", "externalSorterSources.json");
const publicCatalogPath = path.resolve(process.cwd(), "public", "sorter-index.json");

export async function writePublicSorterIndexCatalog(sorters: SorterIndexEntry[]): Promise<void> {
  const externalSources = await readExternalSources();

  await mkdir(path.dirname(publicCatalogPath), { recursive: true });
  await writeFile(publicCatalogPath, `${JSON.stringify({ sorters, externalSources }, null, 2)}\n`, "utf8");
}

export function sortIndexEntries(entries: SorterIndexEntry[]): SorterIndexEntry[] {
  return entries.sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));
}

export function readStringProperty(source: string, propertyName: string): string | null {
  const match = new RegExp(`${propertyName}\\s*:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`, "s").exec(source);
  if (!match) {
    return null;
  }

  return unescapeStringLiteral(match[2]);
}

export function readArrayProperty(source: string, propertyName: string): string[] | null {
  const match = new RegExp(`${propertyName}\\s*:\\s*\\[([^\\]]*)\\]`, "s").exec(source);
  if (!match) {
    return null;
  }

  return [...match[1].matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)].map((item) => unescapeStringLiteral(item[2]));
}

function unescapeStringLiteral(value: string): string {
  return value
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

async function readExternalSources(): Promise<ExternalSorterSource[]> {
  try {
    const parsed = JSON.parse(await readFile(externalSourcesPath, "utf8")) as ExternalSorterSource[];

    return parsed.filter((source) => source.title && source.indexUrl);
  } catch {
    return [];
  }
}
