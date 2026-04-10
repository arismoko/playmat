import type { DeckCard } from "@playmat/shared/table";
import {
  getDeckCoverCard,
  getDefaultDeckCoverCardName,
  parseDeckImport,
  serializeDeckText,
  type SavedDeck,
} from "../../lib/decks";
import { hydrateDeckImages } from "../../lib/deck-images";

export function upsertDeckCard(cards: DeckCard[], nextCard: Pick<DeckCard, "name" | "imageUrl" | "artCropUrl">): DeckCard[] {
  const existingCard = cards.find((card) => card.name === nextCard.name);

  if (!existingCard) {
    return [...cards, { name: nextCard.name, count: 1, imageUrl: nextCard.imageUrl, artCropUrl: nextCard.artCropUrl }];
  }

  return cards.map((card) =>
    card.name === nextCard.name
      ? {
          ...card,
          count: card.count + 1,
          imageUrl: card.imageUrl ?? nextCard.imageUrl,
          artCropUrl: card.artCropUrl ?? nextCard.artCropUrl,
        }
      : card,
  );
}

export function adjustDeckCardCount(cards: DeckCard[], cardName: string, delta: number): DeckCard[] {
  return cards
    .map((card) =>
      card.name === cardName
        ? {
            ...card,
            count: card.count + delta,
          }
        : card,
    )
    .filter((card) => card.count > 0);
}

export async function resolveImportedDeck(deckText: string): Promise<{
  name: string | null;
  cards: DeckCard[];
  sideboard: DeckCard[];
  warning: string | null;
} | null> {
  const importedDeck = parseDeckImport(deckText);

  if (!importedDeck) {
    return null;
  }

  try {
    const hydrated = await hydrateDeckImages(importedDeck.cards, importedDeck.sideboard);

    return {
      name: importedDeck.name,
      cards: hydrated.cards,
      sideboard: hydrated.sideboard,
      warning: null,
    };
  } catch {
    return {
      name: importedDeck.name,
      cards: importedDeck.cards,
      sideboard: importedDeck.sideboard,
      warning: "Imported deck, but card art could not be resolved right now.",
    };
  }
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsText(file);
  });
}

export function formatUpdatedAt(updatedAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(updatedAt));
}

export function buildDeckDraft(deck: SavedDeck) {
  return {
    deckName: deck.name,
    deckCards: deck.cards,
    sideboardCards: deck.sideboard,
    coverCardName: deck.coverCardName ?? getDefaultDeckCoverCardName(deck.cards, deck.sideboard) ?? null,
    importText: serializeDeckText(deck.cards, deck.sideboard),
  };
}

export function resolveCoverCard(cards: DeckCard[], sideboard: DeckCard[], coverCardName: string | null): DeckCard | undefined {
  return getDeckCoverCard({ cards, sideboard, coverCardName: coverCardName ?? undefined });
}

export function formatDeckText(cards: DeckCard[], sideboard: DeckCard[]): string {
  return serializeDeckText(cards, sideboard);
}
