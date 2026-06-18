import { useEffect, useState } from "react";
import { sorters } from "./sorters.generated";
import type { SorterIndexEntry } from "./types";

type ExternalSorterSource = {
  title: string;
  indexUrl: string;
  catalogUrl?: string;
  excludedSorterSlugs?: string[];
};

type SorterIndexCatalog = {
  sorters: SorterIndexEntry[];
  externalSources: ExternalSorterSource[];
};

const THIS_COLLECTION = "This Collection";
const ALL_CATEGORY = "All";

export function SorterIndex() {
  const [externalSorters, setExternalSorters] = useState<SorterIndexEntry[]>([]);
  const [externalProgress, setExternalProgress] = useState<Map<string, SorterProgress>>(new Map());
  const [selectedSource, setSelectedSource] = useState(THIS_COLLECTION);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);

  useEffect(() => {
    document.title = "Sorter Collection";
    document.body.classList.add("sorter-index-body");
    document.querySelector('meta[name="og:site_name"]')?.setAttribute("content", "Sorter Collection");
    document.querySelector('meta[name="og:description"]')?.setAttribute("content", "Select a collection and sorter to get started.");

    return () => {
      document.body.classList.remove("sorter-index-body");
    };
  }, []);

  // Respond to cross-origin progress requests when our index is embedded in another collection's iframe.
  useEffect(() => exposeSorterIndexProgressRequests(), []);

  // Only the top-level page discovers/requests external progress; an embedded responder stays passive.
  useEffect(() => {
    if (window.parent !== window) {
      return;
    }

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

  // Fetch progress for each external collection over postMessage and merge it in as it arrives.
  useEffect(() => {
    let cancelled = false;
    setExternalProgress(new Map());

    void loadExternalSorterProgress(externalSorters, (sourceProgress) => {
      if (!cancelled) {
        setExternalProgress((currentProgress) => new Map([...currentProgress, ...sourceProgress]));
      }
    }).then((nextExternalProgress) => {
      if (!cancelled) {
        setExternalProgress(nextExternalProgress);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [externalSorters]);

  // Reset category filter whenever the selected source changes
  useEffect(() => {
    setSelectedCategory(ALL_CATEGORY);
  }, [selectedSource]);

  const externalSortersWithProgress = externalSorters.map((sorter): SorterIndexDisplayEntry => {
    const progress = externalProgress.get(externalSorterProgressKey(sorter));
    return progress ? { ...sorter, progress } : sorter;
  });
  const allSorters: SorterIndexDisplayEntry[] = [...sorters, ...externalSortersWithProgress];
  const sorterGroups = groupSorters(allSorters);
  const hasMultipleSources = sorterGroups.length > 1;

  // Sorters for the selected source, sorted alphabetically by title
  const selectedGroup = sorterGroups.find((g) => g.title === selectedSource);
  const visibleSorters = [...(selectedGroup?.sorters ?? [])].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );

  // Distinct tags present in the selected source, sorted alphabetically
  const categories = [
    ...new Set(visibleSorters.flatMap((s) => (Array.isArray(s.tags) ? s.tags : []))),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const hasCategories = categories.length > 0;

  const sections = buildSections(visibleSorters, categories, hasCategories, selectedCategory);
  const collectionName: string | undefined = import.meta.env.VITE_COLLECTION_NAME || undefined;
  const titlePrefix = selectedSource === THIS_COLLECTION ? collectionName : selectedSource;

  return (
    <div className="main-page main-page--landing sorter-index-page">
      {allSorters.length ? (
        <div className="sorter-index-sections">
          <div className="sorter-index-panel">
            <div className="sorter-index-panel__intro">
              <h1 className="sorter-index-panel__title">
                {titlePrefix ? `${titlePrefix} Sorter Collection` : "Sorter Collection"}
              </h1>
              <p className="sorter-index-panel__subtitle">Select a collection and sorter to get started.</p>
            </div>
            {hasMultipleSources ? (
              <div className="sorter-index-panel__header">
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
                          showLocalProgress={!sorter.sourceTitle}
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
                        showLocalProgress={!sorter.sourceTitle}
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

function SorterCard({ sorter, showLocalProgress }: { sorter: SorterIndexDisplayEntry; showLocalProgress: boolean }) {
  const href = sorter.url ?? `${sorter.slug}/`;
  const iconUrl = sorter.iconUrl ?? `${sorter.slug}/customize/favicon.ico`;
  const rawProgress = sorter.progress ?? (showLocalProgress ? loadSorterProgress(sorter.localStoragePrefix ?? sorter.slug) : null);
  // Hide progress for sorters that haven't been started (0% / "0 / N scored") — they're irrelevant until touched.
  const progress = rawProgress && rawProgress.percent > 0 ? rawProgress : null;
  const deadline = formatDeadline(sorter.deadline);

  return (
    <a className="sorter-index-card" href={href}>
      <img className="sorter-index-card__icon" src={iconUrl} alt="" />
      <div className="sorter-index-card__body">
        <h3>{sorter.title}</h3>
        <p>{sorter.description}</p>
        {deadline ? (
          <div className={`sorter-index-card__deadline sorter-index-card__deadline--${deadline.kind}`}>
            <span className="sorter-index-card__deadline-label">Deadline</span>
            <time dateTime={deadline.iso}>{deadline.absolute}</time>
            <span>{deadline.relative}</span>
          </div>
        ) : null}
        {progress ? (
          <div className="sorter-index-card__progress" aria-label={`${progress.label}: ${progress.percent}%`}>
            <div className="sorter-index-card__progress-header">
              <span>{progress.label}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="sorter-index-card__progress-track">
              <div className="sorter-index-card__progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </a>
  );
}

type SorterProgress = {
  percent: number;
  label: string;
  kind: "in-progress" | "complete";
};

type SorterIndexDisplayEntry = SorterIndexEntry & {
  progress?: SorterProgress;
};

function loadSorterProgress(localStoragePrefix: string, storage: Storage = localStorage): SorterProgress | null {
  const raw = storage.getItem(`${localStoragePrefix}:sort`);
  if (!raw) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!isStoredSortState(value)) {
      return null;
    }

    if (value.current === null && value.groups.length === 1) {
      return { percent: 100, label: "Complete", kind: "complete" };
    }

    if (value.pickedCount <= 0 && value.history.length === 0) {
      return null;
    }

    const percent = Math.max(1, Math.min(99, Math.floor((value.pickedCount * 100) / Math.max(1, value.estimatedBattles))));
    return { percent, label: "In progress", kind: "in-progress" };
  } catch {
    return null;
  }
}

function isStoredSortState(value: unknown): value is {
  groups: unknown[];
  current: unknown;
  pickedCount: number;
  estimatedBattles: number;
  history: unknown[];
} {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { groups?: unknown }).groups) &&
    "current" in value &&
    typeof (value as { pickedCount?: unknown }).pickedCount === "number" &&
    typeof (value as { estimatedBattles?: unknown }).estimatedBattles === "number" &&
    Array.isArray((value as { history?: unknown }).history)
  );
}

function formatDeadline(deadline: string | undefined): {
  iso: string;
  absolute: string;
  relative: string;
  kind: "future" | "soon" | "past";
} | null {
  if (!deadline) {
    return null;
  }

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const diffMs = date.getTime() - Date.now();

  return {
    iso: date.toISOString(),
    absolute: new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
    relative: formatRelativeDeadline(date),
    kind: diffMs < 0 ? "past" : diffMs < 7 * 24 * 60 * 60 * 1000 ? "soon" : "future",
  };
}

function formatRelativeDeadline(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const absMinutes = Math.floor(Math.abs(diffMs) / (60 * 1000));
  const days = Math.floor(absMinutes / (24 * 60));
  const hours = Math.floor((absMinutes % (24 * 60)) / 60);
  const minutes = absMinutes % 60;
  const parts = [days > 0 ? `${days}d` : null, days > 0 || hours > 0 ? `${hours}h` : null, `${minutes}m`];
  const difference = parts.filter((part): part is string => part !== null).join(" ");

  return diffMs < 0 ? `${difference} ago` : `${difference} left`;
}

function groupSorters(entries: SorterIndexDisplayEntry[]): { title: string; sorters: SorterIndexDisplayEntry[] }[] {
  const localSorters = entries.filter((sorter) => !sorter.sourceTitle);
  // Always include "This Collection" as the first group, even if it's empty
  const groups: { title: string; sorters: SorterIndexDisplayEntry[] }[] = [{ title: THIS_COLLECTION, sorters: localSorters }];
  const externalGroups = new Map<string, SorterIndexDisplayEntry[]>();

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
  visibleSorters: SorterIndexDisplayEntry[],
  categories: string[],
  hasCategories: boolean,
  selectedCategory: string,
): { title: string | null; sorters: SorterIndexDisplayEntry[] }[] {
  // No categories in this source — flat grid, no headers
  if (!hasCategories) {
    return [{ title: null, sorters: visibleSorters }];
  }

  const categoriesToShow = selectedCategory === ALL_CATEGORY ? categories : [selectedCategory];
  const result: { title: string | null; sorters: SorterIndexDisplayEntry[] }[] = [];

  for (const cat of categoriesToShow) {
    // A sorter appears under every tag it has, so a multi-tag sorter shows up in multiple sections
    const catSorters = visibleSorters.filter((s) => (Array.isArray(s.tags) ? s.tags : []).includes(cat));
    if (catSorters.length > 0) {
      result.push({ title: cat, sorters: catSorters });
    }
  }

  // Uncategorized section: only in "All" view, only when categorised sorters exist (hasCategories guarantees this)
  if (selectedCategory === ALL_CATEGORY) {
    const uncategorized = visibleSorters.filter((s) => !(Array.isArray(s.tags) && s.tags.length > 0));
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
    const excludedSlugs = new Set(source.excludedSorterSlugs ?? []);
    const sourceSorters = sourceCatalog.sorters
      .filter((entry) => !excludedSlugs.has(entry.slug))
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

  return value
    .filter((source): source is ExternalSorterSource => {
      return (
        typeof source === "object" &&
        source !== null &&
        typeof (source as ExternalSorterSource).title === "string" &&
        typeof (source as ExternalSorterSource).indexUrl === "string" &&
        ((source as ExternalSorterSource).catalogUrl === undefined || typeof (source as ExternalSorterSource).catalogUrl === "string")
      );
    })
    .map((source) => {
      const excluded = (source as ExternalSorterSource).excludedSorterSlugs;
      return {
        ...source,
        excludedSorterSlugs: Array.isArray(excluded) ? excluded.filter((slug): slug is string => typeof slug === "string") : undefined,
      };
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
    sourceIndexUrl: indexUrl.toString(),
    sourceSlug: entry.sourceSlug ?? entry.slug,
  };
}

function normalizeCollectionUrl(url: URL): URL {
  return new URL(".", url.pathname.endsWith("/") ? url : new URL(`${url.href}/`));
}

function sameCollectionUrl(left: URL, right: URL): boolean {
  return normalizeCollectionUrl(left).toString() === normalizeCollectionUrl(right).toString();
}

// --- Cross-origin progress sharing -------------------------------------------------------------
// Each collection's index page is both a requester (embeds other collections in hidden iframes to
// read their progress) and a responder (when embedded, replies with its own localStorage progress
// via the Storage Access API). The message protocol below must stay identical across collections.

type SorterIndexProgressRequest = {
  type: typeof sorterIndexProgressRequestType;
  requestId: string;
  sorters: { slug: string }[];
};

type SorterIndexProgressResponse = {
  type: typeof sorterIndexProgressResponseType;
  requestId: string;
  progress: SorterIndexProgressResponseEntry[];
};

type SorterIndexProgressResponseEntry = {
  slug?: string;
  localStoragePrefix: string;
  progress: SorterProgress | null;
};

type ExternalSorterProgressResult = {
  status: "response" | "timeout";
  progress: SorterIndexProgressResponseEntry[];
};

type StorageAccessDocument = Document & {
  hasStorageAccess?: () => Promise<boolean>;
  requestStorageAccess?: (types?: { localStorage?: boolean }) => Promise<void | { localStorage?: Storage }>;
};

const sorterIndexProgressRequestType = "pr-sorter:index-progress-request";
const sorterIndexProgressResponseType = "pr-sorter:index-progress-response";
const sorterIndexProgressReadyType = "pr-sorter:index-progress-ready";
const externalProgressRequestTimeoutMs = 5000;

function exposeSorterIndexProgressRequests(): () => void {
  function handleMessage(event: MessageEvent<unknown>): void {
    const request = parseSorterIndexProgressRequest(event.data);
    if (!request || !event.source) {
      return;
    }

    void respondToSorterIndexProgressRequest(event, request);
  }

  window.addEventListener("message", handleMessage);

  if (window.parent !== window) {
    const targetOrigin = parentMessageTargetOrigin();
    window.parent.postMessage(
      {
        type: sorterIndexProgressReadyType,
        origin: window.location.origin,
      },
      targetOrigin,
    );
  }

  return () => {
    window.removeEventListener("message", handleMessage);
  };
}

async function respondToSorterIndexProgressRequest(event: MessageEvent<unknown>, request: SorterIndexProgressRequest): Promise<void> {
  const requestedSorters = requestedSorterStorageTargets(request);
  const storage = await progressStorageForResponder();
  const progress = requestedSorters.map((sorter) => ({
    slug: sorter.slug,
    localStoragePrefix: sorter.localStoragePrefix,
    progress: storage ? loadSorterProgress(sorter.localStoragePrefix, storage) : null,
  }));
  const response: SorterIndexProgressResponse = {
    type: sorterIndexProgressResponseType,
    requestId: request.requestId,
    progress,
  };

  (event.source as Window).postMessage(response, event.origin === "null" ? "*" : event.origin);
}

function requestedSorterStorageTargets(request: SorterIndexProgressRequest): { slug?: string; localStoragePrefix: string }[] {
  const localSortersBySlug = new Map(sorters.map((sorter) => [sorter.slug, sorter]));
  const requestedTargets: { slug?: string; localStoragePrefix: string }[] = [];
  const seenPrefixes = new Set<string>();

  for (const item of request.sorters) {
    const matchedSorter = localSortersBySlug.get(item.slug);
    if (!matchedSorter) {
      continue;
    }

    const localStoragePrefix = matchedSorter.localStoragePrefix ?? matchedSorter.slug;

    if (localStoragePrefix && !seenPrefixes.has(localStoragePrefix)) {
      seenPrefixes.add(localStoragePrefix);
      requestedTargets.push({ slug: matchedSorter.slug, localStoragePrefix });
    }
  }

  return requestedTargets;
}

function parseSorterIndexProgressRequest(value: unknown): SorterIndexProgressRequest | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<SorterIndexProgressRequest>;
  if (candidate.type !== sorterIndexProgressRequestType || typeof candidate.requestId !== "string") {
    return null;
  }

  if (!Array.isArray(candidate.sorters)) {
    return null;
  }

  if (!candidate.sorters.every(isSorterIndexProgressRequestSorter)) {
    return null;
  }

  return {
    type: sorterIndexProgressRequestType,
    requestId: candidate.requestId,
    sorters: candidate.sorters,
  };
}

function isSorterIndexProgressRequestSorter(value: unknown): value is { slug: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { slug?: unknown }).slug === "string"
  );
}

async function progressStorageForResponder(): Promise<Storage | null> {
  if (window.parent === window) {
    return localStorage;
  }

  const storageAccessDocument = document as StorageAccessDocument;
  if (!storageAccessDocument.requestStorageAccess) {
    return null;
  }

  try {
    const handle = await storageAccessDocument.requestStorageAccess({ localStorage: true });
    return handle && typeof handle === "object" && handle.localStorage ? handle.localStorage : null;
  } catch {
    return null;
  }
}

async function loadExternalSorterProgress(
  externalEntries: SorterIndexEntry[],
  onSourceProgress?: (sourceProgress: Map<string, SorterProgress>) => void,
): Promise<Map<string, SorterProgress>> {
  const progressByKey = new Map<string, SorterProgress>();
  const sourceGroups = new Map<string, SorterIndexEntry[]>();

  for (const sorter of externalEntries) {
    if (!sorter.sourceIndexUrl) {
      continue;
    }

    const sourceSorters = sourceGroups.get(sorter.sourceIndexUrl) ?? [];
    sourceSorters.push(sorter);
    sourceGroups.set(sorter.sourceIndexUrl, sourceSorters);
  }

  await Promise.all(
    [...sourceGroups].map(async ([sourceIndexUrl, sourceSorters]) => {
      const result = await requestExternalSorterProgress(sourceIndexUrl, sourceSorters);
      const progressBySlug = new Map(result.progress.map((entry) => [entry.slug, entry.progress]));
      const sourceProgressByKey = new Map<string, SorterProgress>();

      for (const sorter of sourceSorters) {
        const sourceSlug = sorter.sourceSlug ?? sorter.slug;
        const progress = progressBySlug.get(sourceSlug);
        if (progress) {
          progressByKey.set(externalSorterProgressKey(sorter), progress);
          sourceProgressByKey.set(externalSorterProgressKey(sorter), progress);
        }
      }

      onSourceProgress?.(sourceProgressByKey);
    }),
  );

  return progressByKey;
}

function requestExternalSorterProgress(sourceIndexUrl: string, sourceSorters: SorterIndexEntry[]): Promise<ExternalSorterProgressResult> {
  return new Promise((resolve) => {
    let settled = false;
    const sourceOrigin = new URL(sourceIndexUrl).origin;
    const requestId = crypto.randomUUID();
    const iframe = document.createElement("iframe");
    const requestedSlugs = sourceSorters.map((sorter) => sorter.sourceSlug ?? sorter.slug);
    const timeout = window.setTimeout(() => {
      finish("timeout", []);
    }, externalProgressRequestTimeoutMs);

    iframe.hidden = true;
    iframe.tabIndex = -1;
    iframe.src = sourceIndexUrl;

    function finish(status: ExternalSorterProgressResult["status"], progress: SorterIndexProgressResponseEntry[]): void {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      iframe.remove();
      resolve({ status, progress });
    }

    function handleMessage(event: MessageEvent<unknown>): void {
      if (!isSorterIndexProgressMessage(event.data)) {
        return;
      }

      if (event.origin !== sourceOrigin) {
        return;
      }

      const iframeWindow = iframe.contentWindow;
      if (!iframeWindow) {
        return;
      }

      if (event.source !== iframeWindow) {
        return;
      }

      if (isSorterIndexProgressReadyMessage(event.data)) {
        iframeWindow.postMessage(
          {
            type: sorterIndexProgressRequestType,
            requestId,
            sorters: requestedSlugs.map((slug) => ({ slug })),
          },
          sourceOrigin,
        );
        return;
      }

      if (!isSorterIndexProgressResponse(event.data, requestId)) {
        return;
      }

      finish("response", event.data.progress);
    }

    window.addEventListener("message", handleMessage);
    document.body.append(iframe);
  });
}

function isSorterIndexProgressMessage(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as { type?: unknown }).type === sorterIndexProgressRequestType ||
      (value as { type?: unknown }).type === sorterIndexProgressResponseType ||
      (value as { type?: unknown }).type === sorterIndexProgressReadyType)
  );
}

function isSorterIndexProgressReadyMessage(value: unknown): value is { type: typeof sorterIndexProgressReadyType } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === sorterIndexProgressReadyType
  );
}

function parentMessageTargetOrigin(): string {
  try {
    return document.referrer ? new URL(document.referrer).origin : "*";
  } catch {
    return "*";
  }
}

function isSorterIndexProgressResponse(value: unknown, requestId: string): value is SorterIndexProgressResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SorterIndexProgressResponse>;
  return (
    candidate.type === sorterIndexProgressResponseType &&
    candidate.requestId === requestId &&
    Array.isArray(candidate.progress) &&
    candidate.progress.every(isSorterIndexProgressResponseEntry)
  );
}

function isSorterIndexProgressResponseEntry(value: unknown): value is SorterIndexProgressResponseEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SorterIndexProgressResponseEntry>;
  return (
    typeof candidate.localStoragePrefix === "string" &&
    (candidate.slug === undefined || typeof candidate.slug === "string") &&
    (candidate.progress === null || isSorterProgress(candidate.progress))
  );
}

function isSorterProgress(value: unknown): value is SorterProgress {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SorterProgress>;
  return (
    typeof candidate.percent === "number" &&
    typeof candidate.label === "string" &&
    (candidate.kind === "in-progress" || candidate.kind === "complete")
  );
}

function externalSorterProgressKey(sorter: SorterIndexEntry): string {
  return `${sorter.sourceIndexUrl ?? ""}:${sorter.sourceSlug ?? sorter.slug}`;
}
