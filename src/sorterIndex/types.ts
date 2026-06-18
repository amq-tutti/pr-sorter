export type SorterIndexEntry = {
  slug: string;
  title: string;
  description: string;
  tags?: string[];
  localStoragePrefix?: string;
  rankSupported?: boolean;
  songCount?: number;
  deadline?: string;
  url?: string;
  iconUrl?: string;
  sourceTitle?: string;
  sourceIndexUrl?: string;
  sourceSlug?: string;
  hide?: boolean;
};

export type ExternalSorterSource = {
  title: string;
  indexUrl: string;
  excludedSorterSlugs?: string[];
};
