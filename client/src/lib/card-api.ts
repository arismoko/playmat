import { useEffect, useSyncExternalStore } from "react";

const CARD_API_BASE_URL = "https://playmat-card-db.figueredoaria.workers.dev";
const LOOKUP_CHUNK_SIZE = 75;
const cardResultCache = new Map<string, CardResult>();
const cardCacheListeners = new Set<() => void>();

type WorkerCardFace = {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  flavorText?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: string[];
  imageUrl?: string;
  thumbnailUrl?: string;
  artCropUrl?: string;
};

type WorkerCardRelation = {
  id?: string;
  oracleId?: string;
  name: string;
  component?: string;
  typeLine?: string;
  uri?: string;
};

type WorkerCard = {
  id: string;
  oracleId?: string;
  name: string;
  layout: string;
  manaCost: string;
  manaValue: number;
  typeLine: string;
  oracleText: string;
  colors: string[];
  colorIdentity: string[];
  keywords: string[];
  legalities: Record<string, string>;
  rarity?: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  artCropUrl?: string;
  faces: WorkerCardFace[];
  relatedCards: WorkerCardRelation[];
  isToken: boolean;
};

type WorkerCardResponse = {
  data: WorkerCard[];
  meta?: WorkerSearchMeta;
};

type WorkerSearchMeta = {
  query: string;
  page: number;
  pageSize: number;
  sort: CardSearchSort;
  dir: CardSearchDir;
  hasMore: boolean;
  candidateOracleCount: number | null;
  candidateLimit: number;
};

export type CardSearchSort = "relevance" | "name" | "mv" | "released" | "rarity" | "color";
export type CardSearchDir = "asc" | "desc";

export type CardResult = {
  id: string;
  oracleId?: string;
  name: string;
  layout: string;
  manaCost: string;
  manaValue: number;
  typeLine: string;
  oracleText: string;
  colors: string[];
  colorIdentity: string[];
  keywords: string[];
  legalities: Record<string, string>;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  rarity?: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  artCropUrl?: string;
  faces: WorkerCardFace[];
  relatedCards: WorkerCardRelation[];
  isToken: boolean;
};

export type CardSearchMeta = {
  query: string;
  page: number;
  pageSize: number;
  sort: CardSearchSort;
  dir: CardSearchDir;
  hasMore: boolean;
  candidateOracleCount: number | null;
  candidateLimit: number;
};

export type SearchCardsOptions = {
  page?: number;
  pageSize?: number;
  sort?: CardSearchSort;
  dir?: CardSearchDir;
  signal?: AbortSignal;
};

export type CardSearchResponse = {
  cards: CardResult[];
  meta: CardSearchMeta;
};

const DEFAULT_SEARCH_PAGE = 1;
const DEFAULT_SEARCH_PAGE_SIZE = 18;
const DEFAULT_SEARCH_SORT: CardSearchSort = "relevance";
const DEFAULT_SEARCH_DIR: CardSearchDir = "asc";

function normalizeCardName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cacheCardAliases(card: WorkerCard, mappedCard: CardResult): void {
  for (const alias of [card.name, ...card.faces.map((face) => face.name)]) {
    const normalizedAlias = normalizeCardName(alias);

    if (!normalizedAlias) {
      continue;
    }

    cardResultCache.set(normalizedAlias, mappedCard);
  }
}

function notifyCardCacheListeners(): void {
  for (const listener of cardCacheListeners) {
    listener();
  }
}

function subscribeToCardCache(listener: () => void): () => void {
  cardCacheListeners.add(listener);

  return () => {
    cardCacheListeners.delete(listener);
  };
}

function cacheWorkerCard(card: WorkerCard): CardResult {
  const mappedCard = mapCard(card);
  cacheCardAliases(card, mappedCard);
  return mappedCard;
}

function cacheWorkerCards(cards: WorkerCard[]): CardResult[] {
  if (!cards.length) {
    return [];
  }

  const mappedCards = cards.map(cacheWorkerCard);
  notifyCardCacheListeners();
  return mappedCards;
}

export function getCachedCardByName(name: string): CardResult | undefined {
  return cardResultCache.get(normalizeCardName(name));
}

type UseCardDetailOptions = {
  loadOnMiss?: boolean;
};

export function useCardDetail(
  name: string | null | undefined,
  options: UseCardDetailOptions = {},
): CardResult | null {
  const normalizedName = name ? normalizeCardName(name) : "";
  const card = useSyncExternalStore(
    subscribeToCardCache,
    () => (normalizedName ? cardResultCache.get(normalizedName) : undefined),
    () => undefined,
  );

  useEffect(() => {
    if (!options.loadOnMiss || !name || card) {
      return;
    }

    void lookupCardsByNames([name]).catch(() => {
      // Best-effort detail lookup only.
    });
  }, [card, name, options.loadOnMiss]);

  return card ?? null;
}

function mapCard(card: WorkerCard): CardResult {
  const primaryFace = card.faces[0];

  return {
    id: card.id,
    oracleId: card.oracleId,
    name: card.name,
    layout: card.layout,
    manaCost: card.manaCost || primaryFace?.manaCost || "",
    manaValue: card.manaValue,
    typeLine: primaryFace?.typeLine || card.typeLine || "",
    oracleText: primaryFace?.oracleText || card.oracleText || "",
    colors: primaryFace?.colors ?? card.colors ?? [],
    colorIdentity: card.colorIdentity ?? [],
    keywords: card.keywords ?? [],
    legalities: card.legalities ?? {},
    power: primaryFace?.power,
    toughness: primaryFace?.toughness,
    loyalty: primaryFace?.loyalty,
    defense: primaryFace?.defense,
    rarity: card.rarity,
    setCode: card.setCode,
    setName: card.setName,
    collectorNumber: card.collectorNumber,
    imageUrl: primaryFace?.imageUrl ?? card.imageUrl,
    thumbnailUrl: primaryFace?.thumbnailUrl ?? card.thumbnailUrl ?? card.imageUrl,
    artCropUrl: primaryFace?.artCropUrl ?? card.artCropUrl,
    faces: card.faces,
    relatedCards: card.relatedCards ?? [],
    isToken: card.isToken,
  };
}

function createCardApiUrl(pathname: string): URL {
  return new URL(pathname, CARD_API_BASE_URL);
}

function createEmptySearchMeta(query: string, options: SearchCardsOptions = {}): CardSearchMeta {
  return {
    query,
    page: options.page ?? DEFAULT_SEARCH_PAGE,
    pageSize: options.pageSize ?? DEFAULT_SEARCH_PAGE_SIZE,
    sort: options.sort ?? DEFAULT_SEARCH_SORT,
    dir: options.dir ?? DEFAULT_SEARCH_DIR,
    hasMore: false,
    candidateOracleCount: null,
    candidateLimit: 0,
  };
}

export async function searchCards(query: string, options: SearchCardsOptions = {}): Promise<CardSearchResponse> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return { cards: [], meta: createEmptySearchMeta(trimmedQuery, options) };
  }

  const url = createCardApiUrl("/cards/search");
  url.searchParams.set("q", trimmedQuery);

  if (options.page) {
    url.searchParams.set("page", String(options.page));
  }

  if (options.pageSize) {
    url.searchParams.set("pageSize", String(options.pageSize));
  }

  if (options.sort) {
    url.searchParams.set("sort", options.sort);
  }

  if (options.dir) {
    url.searchParams.set("dir", options.dir);
  }

  const response = await fetch(url, { signal: options.signal });

  if (response.status === 404) {
    return { cards: [], meta: createEmptySearchMeta(trimmedQuery, options) };
  }

  if (!response.ok) {
    throw new Error("Card search failed.");
  }

  const payload = (await response.json()) as WorkerCardResponse;
  const cards = cacheWorkerCards(payload.data);

  return {
    cards,
    meta: payload.meta ?? createEmptySearchMeta(trimmedQuery, options),
  };
}

export async function lookupCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, CardResult>> {
  const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));

  if (uniqueNames.length === 0) {
    return new Map();
  }

  const results = new Map<string, CardResult>();
  const unresolvedNames: string[] = [];

  for (const name of uniqueNames) {
    const cachedCard = getCachedCardByName(name);

    if (cachedCard) {
      results.set(name, cachedCard);
      continue;
    }

    unresolvedNames.push(name);
  }

  for (let index = 0; index < unresolvedNames.length; index += LOOKUP_CHUNK_SIZE) {
    const chunk = unresolvedNames.slice(index, index + LOOKUP_CHUNK_SIZE);
    const response = await fetch(createCardApiUrl("/cards/lookup"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ names: chunk }),
      signal,
    });

    if (!response.ok) {
      throw new Error("Card lookup failed.");
    }

    const payload = (await response.json()) as WorkerCardResponse;
    const mappedCards = cacheWorkerCards(payload.data);
    const cardsByName = new Map<string, CardResult>();

    for (const [index, card] of payload.data.entries()) {
      const mappedCard = mappedCards[index];

      if (!mappedCard) {
        continue;
      }

      for (const alias of [card.name, ...card.faces.map((face) => face.name)]) {
        const normalizedAlias = normalizeCardName(alias);

        if (!normalizedAlias || cardsByName.has(normalizedAlias)) {
          continue;
        }

        cardsByName.set(normalizedAlias, mappedCard);
      }
    }

    for (const name of chunk) {
      const mappedCard = cardsByName.get(normalizeCardName(name));

      if (mappedCard) {
        results.set(name, mappedCard);
      }
    }
  }

  return results;
}

export async function lookupCardByOracleId(oracleId: string, signal?: AbortSignal): Promise<CardResult | null> {
  const trimmedOracleId = oracleId.trim();

  if (!trimmedOracleId) {
    return null;
  }

  const response = await fetch(
    createCardApiUrl(`/cards/by-oracle-id/${encodeURIComponent(trimmedOracleId)}`),
    { signal },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Card lookup failed.");
  }

  const payload = (await response.json()) as { data: WorkerCard | null };

  if (!payload.data) {
    return null;
  }

  const mappedCard = cacheWorkerCard(payload.data);
  notifyCardCacheListeners();
  return mappedCard;
}

export async function lookupRelatedCardsByPrintingId(
  printingId: string,
  signal?: AbortSignal,
): Promise<CardResult[]> {
  const trimmedPrintingId = printingId.trim();

  if (!trimmedPrintingId) {
    return [];
  }

  const response = await fetch(
    createCardApiUrl(`/cards/${encodeURIComponent(trimmedPrintingId)}/related`),
    { signal },
  );

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error("Related card lookup failed.");
  }

  const payload = (await response.json()) as WorkerCardResponse;

  return cacheWorkerCards(payload.data);
}

export async function lookupRelatedTokenCardsByName(
  name: string,
  signal?: AbortSignal,
): Promise<CardResult[]> {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return [];
  }

  const sourceCards = await lookupCardsByNames([trimmedName], signal);
  const sourceCard = sourceCards.get(trimmedName);

  if (!sourceCard) {
    return [];
  }

  const tokenRelations = sourceCard.relatedCards.filter((relation) => relation.component === "token");

  if (tokenRelations.length === 0) {
    return [];
  }

  const hydratedByKey = new Map<string, CardResult>();
  const fallbackNames: string[] = [];
  const relationKeys = tokenRelations.map((relation) => relation.oracleId ?? normalizeCardName(relation.name));

  await Promise.all(
    tokenRelations.map(async (relation) => {
      if (!relation.oracleId) {
        fallbackNames.push(relation.name);
        return;
      }

      const card = await lookupCardByOracleId(relation.oracleId, signal);

      if (card) {
        hydratedByKey.set(card.oracleId ?? card.id, card);
      }
    }),
  );

  if (fallbackNames.length > 0) {
    const fallbackCards = await lookupCardsByNames(fallbackNames, signal);

    for (const fallbackName of fallbackNames) {
      const fallbackCard = fallbackCards.get(fallbackName);

      if (fallbackCard) {
        hydratedByKey.set(fallbackCard.oracleId ?? fallbackCard.id, fallbackCard);
      }
    }
  }

  const seenKeys = new Set<string>();

  return relationKeys.flatMap((key) => {
    if (seenKeys.has(key)) {
      return [];
    }

    seenKeys.add(key);
    const card = hydratedByKey.get(key);
    return card ? [card] : [];
  });
}

export async function lookupTokenCardsByNames(
  names: string[],
  signal?: AbortSignal,
): Promise<CardResult[]> {
  const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));

  if (uniqueNames.length === 0) {
    return [];
  }

  const response = await fetch(createCardApiUrl("/cards/token-lookup"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ names: uniqueNames }),
    signal,
  });

  if (!response.ok) {
    throw new Error("Token lookup failed.");
  }

  const payload = (await response.json()) as WorkerCardResponse;

  return cacheWorkerCards(payload.data);
}
