import type { DeckCard } from "@playmat/shared/table";
import { getCachedCardByName, lookupCardsByNames, type CardResult } from "./card-api";

type DeckImageLookup = Pick<CardResult, "imageUrl" | "artCropUrl">;

export function deckNeedsImageHydration(
  cards: DeckCard[],
  sideboard: DeckCard[] = [],
): boolean {
  return [...cards, ...sideboard].some(
    (card) => !card.imageUrl || !card.artCropUrl,
  );
}

function mergeCardMetadata(
  card: DeckCard,
  next: DeckImageLookup | undefined,
): DeckCard {
  return {
    ...card,
    imageUrl: card.imageUrl ?? next?.imageUrl,
    artCropUrl: card.artCropUrl ?? next?.artCropUrl,
  };
}

export function mergeDeckCardImageMetadata(
  current: DeckCard[],
  hydrated: DeckCard[],
): DeckCard[] {
  const lookup = new Map(hydrated.map((card) => [card.name, card]));

  return current.map((card) => mergeCardMetadata(card, lookup.get(card.name)));
}

export async function hydrateDeckImages(
  cards: DeckCard[],
  sideboard: DeckCard[],
  signal?: AbortSignal,
): Promise<{ cards: DeckCard[]; sideboard: DeckCard[] }> {
  const missingNames = Array.from(
    new Set(
      [...cards, ...sideboard]
        .filter((card) => !card.imageUrl || !card.artCropUrl)
        .map((card) => card.name),
    ),
  );

  if (missingNames.length === 0) {
    return { cards, sideboard };
  }

  const cachedLookup = new Map<string, DeckImageLookup>();
  const unresolvedNames: string[] = [];

  for (const name of missingNames) {
    const cached = getCachedCardByName(name);

    if (cached) {
      cachedLookup.set(name, cached);
      continue;
    }

    unresolvedNames.push(name);
  }

  const fetchedLookup = unresolvedNames.length
    ? await lookupCardsByNames(unresolvedNames, signal)
    : new Map<string, CardResult>();

  const lookup = new Map<string, DeckImageLookup>([
    ...cachedLookup.entries(),
    ...fetchedLookup.entries(),
  ]);

  return {
    cards: cards.map((card) => mergeCardMetadata(card, lookup.get(card.name))),
    sideboard: sideboard.map((card) =>
      mergeCardMetadata(card, lookup.get(card.name)),
    ),
  };
}
