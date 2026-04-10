import type { DeckCard } from "@playmat/shared/table";
import { createId } from "@playmat/shared/utils";

export const SAVED_DECKS_KEY = "playmat.saved-decks";
export const DEFAULT_DECK_NAME = "Sample Elves";
export const DEFAULT_DECK_TEXT = `4 Llanowar Elves
4 Elvish Mystic
4 Elvish Archdruid
4 Collected Company
24 Forest`;

export type SavedDeck = {
  id: string;
  name: string;
  cards: DeckCard[];
  sideboard: DeckCard[];
  coverCardName?: string;
  updatedAt: string;
};

type DeckCoverSource = Pick<SavedDeck, "cards" | "sideboard" | "coverCardName">;

export type ParsedDeckImport = {
  name: string | null;
  cards: DeckCard[];
  sideboard: DeckCard[];
};

const CARD_LINE_RE = /^\s*[\w\[(\{].*$/u;
const EMPTY_LINE_RE = /^\s*$/;
const SB_PREFIX_RE = /^\s*sb:\s*(.+)$/i;
const SB_COMMENT_RE = /^sideboard\b.*$/i;
const DECK_COMMENT_RE = /^((main)?deck(list)?|mainboard)\b/i;
const MULTIPLIER_RE = /^[xX\[(]*(\d+)[xX*)\]]*\s?(.+)$/;
const HYPHEN_SET_RE = /\((\w{3,})\)\s+(\w{3,})-(\d+[^\w\s]*)$/i;
const REGULAR_SET_RE = /\((\w{3,})\)\s+(\d+[^\w\s]*)$/i;

function aggregateCards(entries: Array<{ name: string; count: number; imageUrl?: string }>): DeckCard[] {
  const cards = new Map<string, DeckCard>();

  for (const entry of entries) {
    const existing = cards.get(entry.name);

    if (existing) {
      existing.count += entry.count;
      existing.imageUrl = existing.imageUrl ?? entry.imageUrl;
      continue;
    }

    cards.set(entry.name, {
      name: entry.name,
      count: entry.count,
      imageUrl: entry.imageUrl,
    });
  }

  return Array.from(cards.values());
}

function simplifyWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function extractCommentContent(line: string): string | null {
  const match = line.match(/[\w\[(\{].*$/u);
  return match ? simplifyWhitespace(match[0]) : null;
}

function normalizeImportedCardName(value: string): string {
  let next = simplifyWhitespace(value)
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/Æ/g, "Ae")
    .replace(/æ/g, "ae")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s*\((\d+[^\w\s]*)\)\s*$/, "")
    .trim();

  if (!next.includes("//")) {
    next = next.replace(/([^/\s])\/([^/\s])/g, "$1 // $2");
  }

  return next.replace(/\s*\/\/\s*/g, " // ").replace(/\s+/g, " ").trim();
}

function parseCockatriceXmlString(deckText: string): ParsedDeckImport | null {
  const deckNameMatch = deckText.match(/<deckname>([\s\S]*?)<\/deckname>/i);
  const zoneMatches = Array.from(deckText.matchAll(/<zone\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/zone>/gi));
  const mainEntries: Array<{ name: string; count: number }> = [];
  const sideEntries: Array<{ name: string; count: number }> = [];

  for (const match of zoneMatches) {
    const rawZoneName = match[1] ?? "";
    const zoneContent = match[2] ?? "";
    const zoneName = rawZoneName.toLowerCase();

    if (zoneName !== "main" && zoneName !== "side") {
      continue;
    }

    const target = zoneName === "side" ? sideEntries : mainEntries;
    const cardMatches = Array.from(zoneContent.matchAll(/<card\s+([^>]+?)\/?>(?:<\/card>)?/gi));

    for (const cardMatch of cardMatches) {
      const attributes = cardMatch[1] ?? "";
      const nameMatch = attributes.match(/name="([^"]+)"/i);
      const countMatch = attributes.match(/number="([^"]+)"/i);
      const name = nameMatch?.[1]?.trim();
      const count = Number.parseInt(countMatch?.[1] ?? "1", 10);

      if (!name || !Number.isFinite(count) || count <= 0) {
        continue;
      }

      target.push({ name: normalizeImportedCardName(name), count });
    }
  }

  return {
    name: deckNameMatch?.[1]?.trim() || null,
    cards: aggregateCards(mainEntries),
    sideboard: aggregateCards(sideEntries),
  };
}

function parseCockatriceXmlDeck(deckText: string): ParsedDeckImport | null {
  if (typeof DOMParser === "undefined") {
    return parseCockatriceXmlString(deckText);
  }

  const parser = new DOMParser();
  const xml = parser.parseFromString(deckText, "application/xml");

  if (xml.querySelector("parsererror")) {
    return null;
  }

  const root = xml.querySelector("cockatrice_deck");

  if (!root) {
    return null;
  }

  const mainEntries: Array<{ name: string; count: number }> = [];
  const sideEntries: Array<{ name: string; count: number }> = [];

  for (const zone of Array.from(root.getElementsByTagName("zone"))) {
    const zoneName = zone.getAttribute("name")?.toLowerCase() ?? "";

    if (zoneName !== "main" && zoneName !== "side") {
      continue;
    }

    const target = zoneName === "side" ? sideEntries : mainEntries;

    for (const child of Array.from(zone.children)) {
      if (child.tagName !== "card") {
        continue;
      }

      const name = child.getAttribute("name")?.trim();
      const count = Number.parseInt(child.getAttribute("number") ?? "1", 10);

      if (!name || !Number.isFinite(count) || count <= 0) {
        continue;
      }

      target.push({ name: normalizeImportedCardName(name), count });
    }
  }

  return {
    name: xml.querySelector("deckname")?.textContent?.trim() || null,
    cards: aggregateCards(mainEntries),
    sideboard: aggregateCards(sideEntries),
  };
}

function parsePlainTextDeck(deckText: string): ParsedDeckImport | null {
  const inputs = deckText.replace(/\r\n?/g, "\n").trim().split("\n");
  const maxLine = inputs.length;
  const firstCardIndex = inputs.findIndex((line) => CARD_LINE_RE.test(line));

  let deckStart = 0;

  if (firstCardIndex === -1) {
    if (inputs.findIndex((line) => extractCommentContent(line)) === -1) {
      return null;
    }

    deckStart = maxLine;
  } else {
    const previousEmptyIndex = inputs
      .slice(0, firstCardIndex + 1)
      .map((line, index) => (EMPTY_LINE_RE.test(line) ? index : -1))
      .filter((index) => index >= 0)
      .pop();

    deckStart = previousEmptyIndex ?? 0;
  }

  let sideboardStart = -1;

  if (inputs.findIndex((line, index) => index >= deckStart && SB_PREFIX_RE.test(line)) === -1) {
    sideboardStart = inputs.findIndex((line, index) => index >= deckStart && SB_COMMENT_RE.test(line.trim()));

    if (sideboardStart === -1) {
      sideboardStart = inputs.findIndex((line, index) => index > deckStart && EMPTY_LINE_RE.test(line));

      if (sideboardStart === -1) {
        sideboardStart = maxLine;
      } else {
        const nextCard = inputs.findIndex((line, index) => index > sideboardStart && CARD_LINE_RE.test(line));
        const laterEmpty = nextCard === -1 ? -1 : inputs.findIndex((line, index) => index > nextCard && EMPTY_LINE_RE.test(line));

        if (laterEmpty !== -1) {
          sideboardStart = maxLine;
        }
      }
    }
  }

  let index = 0;
  let deckName: string | null = null;
  const deckComments: string[] = [];

  while (index < deckStart) {
    const current = inputs[index] ?? "";
    index += 1;
    const comment = extractCommentContent(current);

    if (comment) {
      deckName = comment;
      break;
    }
  }

  while (index < deckStart) {
    const current = inputs[index] ?? "";
    index += 1;
    const comment = extractCommentContent(current);

    if (comment) {
      deckComments.push(comment);
    }
  }

  while (index < maxLine && EMPTY_LINE_RE.test(inputs[index] ?? "")) {
    index += 1;
  }

  if (index < maxLine && DECK_COMMENT_RE.test((inputs[index] ?? "").trim())) {
    index += 1;
  }

  const mainEntries: Array<{ name: string; count: number }> = [];
  const sideEntries: Array<{ name: string; count: number }> = [];

  for (; index < maxLine; index += 1) {
    const rawLine = inputs[index] ?? "";

    if (!CARD_LINE_RE.test(rawLine)) {
      continue;
    }

    let cardName = simplifyWhitespace(rawLine);
    let sideboard = false;

    if (sideboardStart < 0) {
      const sideboardMatch = cardName.match(SB_PREFIX_RE);

      if (sideboardMatch?.[1]) {
        sideboard = true;
        cardName = simplifyWhitespace(sideboardMatch[1]);
      }
    } else {
      if (index === sideboardStart) {
        continue;
      }

      sideboard = index > sideboardStart;
    }

    if (cardName.toLowerCase() === "sideboard") {
      continue;
    }

    if (DECK_COMMENT_RE.test(cardName) || SB_COMMENT_RE.test(cardName)) {
      continue;
    }

    if (cardName.endsWith("*F*") || cardName.endsWith("*f*")) {
      cardName = cardName.slice(0, -3).trim();
    }

    const hyphenMatch = cardName.match(HYPHEN_SET_RE);
    const regularMatch = cardName.match(REGULAR_SET_RE);

    if (hyphenMatch) {
      cardName = cardName.slice(0, hyphenMatch.index).trim();
    } else if (regularMatch) {
      cardName = cardName.slice(0, regularMatch.index).trim();
    }

    let amount = 1;
    const multiplierMatch = cardName.match(MULTIPLIER_RE);

    if (multiplierMatch?.[1] && multiplierMatch[2]) {
      amount = Number.parseInt(multiplierMatch[1], 10);
      cardName = multiplierMatch[2];
    }

    const normalizedCardName = normalizeImportedCardName(cardName);

    if (!normalizedCardName || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    (sideboard ? sideEntries : mainEntries).push({
      name: normalizedCardName,
      count: amount,
    });
  }

  const cards = aggregateCards(mainEntries);
  const sideboard = aggregateCards(sideEntries);

  if (cards.length === 0 && sideboard.length === 0) {
    return null;
  }

  void deckComments;

  return {
    name: deckName,
    cards,
    sideboard,
  };
}

export function readSavedDecks(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(SAVED_DECKS_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((deck): deck is SavedDeck => {
        return Boolean(
          deck &&
          typeof deck === "object" &&
          "id" in deck &&
          "name" in deck &&
          "cards" in deck &&
          "updatedAt" in deck &&
          typeof deck.id === "string" &&
          typeof deck.name === "string" &&
          Array.isArray(deck.cards) &&
          typeof deck.updatedAt === "string",
        );
      })
      .map((deck) => ({
        ...deck,
        sideboard: Array.isArray(deck.sideboard) ? deck.sideboard : [],
        coverCardName: typeof deck.coverCardName === "string" ? deck.coverCardName : undefined,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function writeSavedDecks(decks: SavedDeck[]): void {
  localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(decks));
}

export function parseDeckImport(deckText: string): ParsedDeckImport | null {
  if (deckText.includes("<cockatrice_deck version=\"1\">")) {
    return parseCockatriceXmlDeck(deckText);
  }

  return parsePlainTextDeck(deckText);
}

export function parseDeckText(deckText: string): DeckCard[] {
  return parseDeckImport(deckText)?.cards ?? [];
}

export function serializeDeckText(cards: DeckCard[], sideboard: DeckCard[] = []): string {
  const mainboardText = cards.map((card) => `${card.count} ${card.name}`).join("\n");

  if (sideboard.length === 0) {
    return mainboardText;
  }

  const sideboardText = sideboard.map((card) => `${card.count} ${card.name}`).join("\n");
  return [mainboardText, "", "Sideboard", sideboardText].filter(Boolean).join("\n");
}

export function countDeckCards(cards: DeckCard[]): number {
  return cards.reduce((total, card) => total + card.count, 0);
}

export function formatDeckCount(deck: Pick<SavedDeck, "cards" | "sideboard">): string {
  const mainCount = countDeckCards(deck.cards);
  const sideCount = countDeckCards(deck.sideboard);

  return sideCount > 0 ? `${mainCount} main • ${sideCount} side` : `${mainCount} cards`;
}

export function getDefaultDeckCoverCardName(cards: DeckCard[], sideboard: DeckCard[] = []): string | undefined {
  const preferredCard = cards.find((card) => card.imageUrl) ?? cards[0] ?? sideboard.find((card) => card.imageUrl) ?? sideboard[0];
  return preferredCard?.name;
}

export function getDeckCoverCard(deck: DeckCoverSource): DeckCard | undefined {
  const allCards = [...deck.cards, ...deck.sideboard];

  if (deck.coverCardName) {
    const selectedCard = allCards.find((card) => card.name === deck.coverCardName);

    if (selectedCard) {
      return selectedCard;
    }
  }

  const fallbackName = getDefaultDeckCoverCardName(deck.cards, deck.sideboard);
  return fallbackName ? allCards.find((card) => card.name === fallbackName) : undefined;
}

export function saveDeck(input: {
  id?: string;
  name: string;
  cards: DeckCard[];
  sideboard?: DeckCard[];
  coverCardName?: string;
}): SavedDeck {
  const savedDecks = readSavedDecks();
  const sideboard = input.sideboard ?? [];
  const coverCardName = getDeckCoverCard({
    cards: input.cards,
    sideboard,
    coverCardName: input.coverCardName,
  })?.name;
  const nextDeck: SavedDeck = {
    id: input.id ?? createId(),
    name: input.name.trim() || "Untitled Deck",
    cards: input.cards,
    sideboard,
    coverCardName,
    updatedAt: new Date().toISOString(),
  };
  const nextDecks = [
    nextDeck,
    ...savedDecks.filter((deck) => deck.id !== nextDeck.id),
  ];
  writeSavedDecks(nextDecks);
  return nextDeck;
}

export function deleteDeck(deckId: string): SavedDeck[] {
  const nextDecks = readSavedDecks().filter((deck) => deck.id !== deckId);
  writeSavedDecks(nextDecks);
  return nextDecks;
}

export function duplicateDeck(deck: SavedDeck): SavedDeck {
  return saveDeck({
    name: `${deck.name} Copy`,
    cards: deck.cards.map((card) => ({ ...card })),
    sideboard: deck.sideboard.map((card) => ({ ...card })),
    coverCardName: deck.coverCardName,
  });
}
