import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCustomizeConfig, loadCustomizeSongCount, serializedDeadline, serializedTags } from "./configLoader.js";
import { writePublicSorterIndexCatalog } from "./sorterIndexCatalog.js";

export const previewSlug = "test";

const generatedModulePath = path.resolve(process.cwd(), "src", "sorterIndex", "sorters.generated.ts");

export async function writeLocalPreviewSorterIndex(): Promise<void> {
  const config = await loadCustomizeConfig();
  const songCount = await loadCustomizeSongCount();
  const deadline = serializedDeadline(config);
  const configTags = serializedTags(config);
  const localSorter = config.hide
    ? []
    : Array.from({ length: 3 }, (_, index) => ({
        slug: index === 0 ? previewSlug : `${previewSlug}-${index + 1}`,
        title: `${config.title} ${index + 1}`,
        description: config.description,
        tags: [...(configTags ?? []), `test ${index + 1}`],
        localStoragePrefix: config.localStoragePrefix,
        ...(config.rankSupported === false ? { rankSupported: false } : {}),
        ...(config.rankSupported === false ? { songCount } : {}),
        ...(deadline ? { deadline } : {}),
        url: `${previewSlug}/`,
        iconUrl: `${previewSlug}/customize/favicon.ico`,
      }));

  await mkdir(path.dirname(generatedModulePath), { recursive: true });
  await writeFile(
    generatedModulePath,
    `import type { SorterIndexEntry } from "./types";\n\nexport const sorters: SorterIndexEntry[] = ${JSON.stringify(localSorter, null, 2)};\n`,
    "utf8",
  );
  await writePublicSorterIndexCatalog(localSorter);
}
