import { useEffect, useState } from "react";
import { sorters } from "./sorters.generated";
import type { SorterIndexEntry } from "./types";

type ExternalSorterSource = {
  title: string;
  indexUrl: string;
  catalogUrl?: string;
};

type SorterIndexCatalog = {
  sorters: SorterIndexEntry[];
  externalSources: ExternalSorterSource[];
};

const THIS_COLLECTION = "This Collection";
const ALL_CATEGORY = "All";

export function SorterIndex() {
  const [externalSorters, setExternalSorters] = useState<SorterIndexEntry[]>([]);
  const [selectedSource, setSelectedSource] = useState(THIS_COLLECTION);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);

  useEffect(() => {
    document.title = "Sorter Collection";
    document.body.classList.add("sorter-index-body");
    document.querySelector('meta[name="og:site_name"]')?.setAttribute("content", "Sorter Collection");
    document.querySelector('meta[name="og:description"]')?.setAttribute("content", "Select a sorter to get started.");

    return () => {
      document.body.classList.remove("sorter-index-body");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void discoverExternalSorters().then((nextExternalSorters) => {
      if (!cancelled) {
        setExternalSorters(nextExternalSorters);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Reset category filter whenever the selected source changes
  useEffect(() => {
    setSelectedCategory(ALL_CATEGORY);
  }, [selectedSource]);

  const allSorters = [...sorters, ...externalSorters];
  const sorterGroups = groupSorters(allSorters);
  const hasMultipleSources = sorterGroups.length > 1;

  // Sorters for the selected source, sorted alphabetically by title
  const selectedGroup = sorterGroups.find((g) => g.title === selectedSource);
  const visibleSorters = [...(selectedGroup?.sorters ?? [])].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );

  // Distinct categories present in the selected source, sorted alphabetically
  const categories = [
    ...new Set(visibleSorters.flatMap((s) => (s.category ? [s.category] : []))),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const hasCategories = categories.length > 0;

  const sections = buildSections(visibleSorters, categories, hasCategories, selectedCategory);
  const collectionName: string | undefined = import.meta.env.VITE_COLLECTION_NAME || undefined;

  return (
    <div className="main-page main-page--landing sorter-index-page">
      {allSorters.length ? (
        <div className="sorter-index-sections">
          <div className="sorter-index-panel">
            <div className="sorter-index-panel__intro">
              <h1 className="sorter-index-panel__title">
                {collectionName ? `${collectionName} Sorter Collection` : "Sorter Collection"}
              </h1>
              <p className="sorter-index-panel__subtitle">Select a sorter to get started.</p>
            </div>
            {hasMultipleSources ? (
              <div className="sorter-index-panel__header">
                <span className="sorter-index-source-label">Collection</span>
                <select
                  className="sorter-index-source-select"
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                >
                  {sorterGroups.map((group) => (
                    <option key={group.title} value={group.title}>
                      {group.title === THIS_COLLECTION && collectionName
                        ? `${THIS_COLLECTION} (${collectionName})`
                        : group.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {hasCategories ? (
              <div className="sorter-index-chips">
                {[ALL_CATEGORY, ...categories].map((cat) => (
                  <button
                    key={cat}
                    className={`sorter-index-chip${selectedCategory === cat ? " sorter-index-chip--active" : ""}`}
                    onClick={() => setSelectedCategory(cat)}
                    type="button"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="sorter-index-panel__body">
              {sections.map((section) =>
                section.title !== null ? (
                  <section className="sorter-index-section" key={section.title}>
                    <h2 className="sorter-index-section__title">{section.title}</h2>
                    <div className="sorter-index-grid">
                      {section.sorters.map((sorter) => (
                        <SorterCard
                          sorter={sorter}
                          key={`${sorter.sourceTitle ?? "local"}:${sorter.url ?? sorter.slug}`}
                        />
                      ))}
                    </div>
                  </section>
                ) : (
                  <div className="sorter-index-grid" key="flat">
                    {section.sorters.map((sorter) => (
                      <SorterCard
                        sorter={sorter}
                        key={`${sorter.sourceTitle ?? "local"}:${sorter.url ?? sorter.slug}`}
                      />
                    ))}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="sorter-index-empty">No sorters have been published yet.</p>
      )}
    </div>
  );
}

function SorterCard({ sorter }: { sorter: SorterIndexEntry }) {
  const href = sorter.url ?? `${sorter.slug}/`;
  const iconUrl = sorter.iconUrl ?? `${sorter.slug}/customize/favicon.ico`;

  return (
    <a className="sorter-index-card" href={href}>
      <img className="sorter-index-card__icon" src={iconUrl} alt="" />
      <div className="sorter-index-card__body">
        <h3>{sorter.title}</h3>
        <p>{sorter.description}</p>
      </div>
    </a>
  );
}

function groupSorters(entries: SorterIndexEntry[]): { title: string; sorters: SorterIndexEntry[] }[] {
  const localSorters = entries.filter((sorter) => !sorter.sourceTitle);
  // Always include "This Collection" as the first group, even if it's empty
  const groups: { title: string; sorters: SorterIndexEntry[] }[] = [{ title: THIS_COLLECTION, sorters: localSorters }];
  const externalGroups = new Map<string, SorterIndexEntry[]>();

  for (const sorter of entries) {
    if (!sorter.sourceTitle) {
      continue;
    }

    const group = externalGroups.get(sorter.sourceTitle) ?? [];
    group.push(sorter);
    externalGroups.set(sorter.sourceTitle, group);
  }

  for (const [title, group] of externalGroups) {
    groups.push({ title, sorters: group });
  }

  return groups;
}

function buildSections(
  visibleSorters: SorterIndexEntry[],
  categories: string[],
  hasCategories: boolean,
  selectedCategory: string,
): { title: string | null; sorters: SorterIndexEntry[] }[] {
  // No categories in this source — flat grid, no headers
  if (!hasCategories) {
    return [{ title: null, sorters: visibleSorters }];
  }

  const categoriesToShow = selectedCategory === ALL_CATEGORY ? categories : [selectedCategory];
  const result: { title: string | null; sorters: SorterIndexEntry[] }[] = [];

  for (const cat of categoriesToShow) {
    const catSorters = visibleSorters.filter((s) => s.category === cat);
    if (catSorters.length > 0) {
      result.push({ title: cat, sorters: catSorters });
    }
  }

  // Uncategorized section: only in "All" view, only when categorised sorters exist (hasCategories guarantees this)
  if (selectedCategory === ALL_CATEGORY) {
    const uncategorized = visibleSorters.filter((s) => !s.category);
    if (uncategorized.length > 0) {
      result.push({ title: "Uncategorized", sorters: uncategorized });
    }
  }

  return result;
}

async function discoverExternalSorters(): Promise<SorterIndexEntry[]> {
  const currentCollectionUrl = new URL(".", window.location.href);
  const currentCatalog = await readSorterIndexCatalog(currentCollectionUrl);
  const pendingSources = [...currentCatalog.externalSources];
  const visitedSourceUrls = new Set<string>();
  const visitedCatalogUrls = new Set<string>();
  const seenSorterUrls = new Set(sorters.map((sorter) => new URL(`${sorter.slug}/`, currentCollectionUrl).toString()));
  const discoveredSorters: SorterIndexEntry[] = [];

  for (let index = 0; index < pendingSources.length; index += 1) {
    const source = pendingSources[index];
    const sourceUrl = normalizeCollectionUrl(new URL(source.indexUrl, currentCollectionUrl));
    const sourceKey = sourceUrl.toString();
    if (visitedSourceUrls.has(sourceKey) || sameCollectionUrl(sourceUrl, currentCollectionUrl)) {
      continue;
    }

    visitedSourceUrls.add(sourceKey);

    const sourceCatalog = await readExternalSourceCatalog(source, sourceUrl, visitedCatalogUrls);
    const sourceSorters = sourceCatalog.sorters
      .map((entry) => externalizeEntry(entry, sourceUrl, source.title))
      .filter((entry) => {
        const key = entry.url ?? entry.slug;
        if (seenSorterUrls.has(key)) {
          return false;
        }

        seenSorterUrls.add(key);
        return true;
      });
    discoveredSorters.push(...sourceSorters);

    pendingSources.push(...sourceCatalog.externalSources);
  }

  return discoveredSorters;
}

async function readSorterIndexCatalog(collectionUrl: URL): Promise<SorterIndexCatalog> {
  try {
    const catalogUrl = new URL("sorter-index.json", collectionUrl);
    const response = await fetch(catalogUrl);
    if (!response.ok) {
      throw new Error(`${catalogUrl.toString()} returned ${response.status}.`);
    }

    return parseSorterIndexCatalog(await response.json());
  } catch (error) {
    console.warn(`Skipping sorter index catalog: ${error instanceof Error ? error.message : error}`);
    return { sorters: [], externalSources: [] };
  }
}

async function readExternalSourceCatalog(
  source: ExternalSorterSource,
  sourceUrl: URL,
  visitedCatalogUrls: Set<string>,
): Promise<SorterIndexCatalog> {
  try {
    const catalogUrl = source.catalogUrl ? new URL(source.catalogUrl, sourceUrl) : new URL("sorter-index.json", sourceUrl);
    const catalogKey = catalogUrl.toString();
    if (visitedCatalogUrls.has(catalogKey)) {
      return { sorters: [], externalSources: [] };
    }

    visitedCatalogUrls.add(catalogKey);

    const response = await fetch(catalogUrl);
    if (!response.ok) {
      throw new Error(`${catalogUrl.toString()} returned ${response.status}.`);
    }

    return parseSorterIndexCatalog(await response.json());
  } catch (error) {
    console.warn(`Skipping external sorter source "${source.title}": ${error instanceof Error ? error.message : error}`);
    return { sorters: [], externalSources: [] };
  }
}

function parseCatalog(value: unknown): SorterIndexEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is SorterIndexEntry => {
    return (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as SorterIndexEntry).slug === "string" &&
      typeof (entry as SorterIndexEntry).title === "string" &&
      typeof (entry as SorterIndexEntry).description === "string"
    );
  });
}

function parseSorterIndexCatalog(value: unknown): SorterIndexCatalog {
  if (typeof value !== "object" || value === null) {
    return { sorters: [], externalSources: [] };
  }

  return {
    sorters: parseCatalog((value as { sorters?: unknown }).sorters),
    externalSources: parseExternalSources((value as { externalSources?: unknown }).externalSources),
  };
}

function parseExternalSources(value: unknown): ExternalSorterSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((source): source is ExternalSorterSource => {
    return (
      typeof source === "object" &&
      source !== null &&
      typeof (source as ExternalSorterSource).title === "string" &&
      typeof (source as ExternalSorterSource).indexUrl === "string" &&
      ((source as ExternalSorterSource).catalogUrl === undefined || typeof (source as ExternalSorterSource).catalogUrl === "string")
    );
  });
}

function externalizeEntry(entry: SorterIndexEntry, indexUrl: URL, sourceTitle: string): SorterIndexEntry {
  const url = entry.url ? new URL(entry.url, indexUrl) : new URL(`${entry.slug}/`, indexUrl);
  const iconUrl = entry.iconUrl ? new URL(entry.iconUrl, indexUrl) : new URL(`${entry.slug}/customize/favicon.ico`, indexUrl);

  return {
    ...entry,
    slug: `${sourceTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${entry.slug}`,
    url: url.toString(),
    iconUrl: iconUrl.toString(),
    sourceTitle: entry.sourceTitle ?? sourceTitle,
  };
}

function normalizeCollectionUrl(url: URL): URL {
  return new URL(".", url.pathname.endsWith("/") ? url : new URL(`${url.href}/`));
}

function sameCollectionUrl(left: URL, right: URL): boolean {
  return normalizeCollectionUrl(left).toString() === normalizeCollectionUrl(right).toString();
}
