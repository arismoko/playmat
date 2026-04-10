import { clamp, createId } from "./utils";
import {
  BATTLEFIELD_GRID_COLUMNS,
  BATTLEFIELD_GRID_ORIGIN_X,
  BATTLEFIELD_GRID_ORIGIN_Y,
  BATTLEFIELD_GRID_STEP_X,
  BATTLEFIELD_GRID_STEP_Y,
  isPhase,
  phases,
  type CardInstance,
  type CardMove,
  type DeckCard,
  type LibraryFlags,
  type LibraryPosition,
  type Phase,
  type PlayerCounterState,
  type PlayerState,
  type PlayerZones,
  type TableState,
  type ZoneName,
} from "./table-types";

type CardMovePosition = {
  x?: number;
  y?: number;
};

type CardMoveOptions = {
  faceDown?: boolean;
  toPosition?: LibraryPosition;
};

type MovableCard = {
  id: string;
  activeFaceIndex: number;
  attachedToCardId?: string;
  attachedToOwnerPlayerId?: string;
  faceDown: boolean;
  x: number;
  y: number;
};

type PlayerWithZones<TCard extends MovableCard> = {
  zones: Record<ZoneName, TCard[]>;
};

export function createEmptyZones(): PlayerZones {
  return {
    library: [],
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone: [],
    sideboard: [],
  };
}

export function createLibraryFlags(): LibraryFlags {
  return {
    alwaysLookAtTop: false,
    alwaysRevealTop: false,
  };
}

export function createCardInstance(
  card: Pick<DeckCard, "name" | "imageUrl" | "artCropUrl">,
  index = 0,
): CardInstance {
  return {
    id: createId(),
    name: card.name,
    imageUrl: card.imageUrl,
    artCropUrl: card.artCropUrl,
    activeFaceIndex: 0,
    annotation: undefined,
    attachedToCardId: undefined,
    attachedToOwnerPlayerId: undefined,
    doesNotUntap: false,
    ptModifier: { power: 0, toughness: 0 },
    tapped: false,
    faceDown: false,
    x: 56 + (index % 7) * 36,
    y: 56 + Math.floor(index / 7) * 48,
    counters: {},
  };
}

export function createPlayerState(playerId: string, name: string): PlayerState {
  return {
    id: playerId,
    name,
    life: 20,
    arrows: [],
    connected: true,
    ready: false,
    selectedDeckName: null,
    selectedDeckCardCount: 0,
    counters: [],
    libraryFlags: createLibraryFlags(),
    zones: createEmptyZones(),
  };
}

export function createTableState(tableId: string): TableState {
  return {
    id: tableId,
    hostId: null,
    status: "lobby",
    players: {},
    turnPlayerId: null,
    phase: null,
    log: [],
  };
}

export function upsertPlayer(
  state: TableState,
  playerId: string,
  name: string,
): PlayerState {
  const existing = state.players[playerId];

  if (existing) {
    existing.name = name;
    existing.connected = true;
    return existing;
  }

  const player = createPlayerState(playerId, name);
  state.players[playerId] = player;

  if (!state.hostId) {
    state.hostId = playerId;
  }

  return player;
}

export function setPlayerConnected(
  state: TableState,
  playerId: string,
  connected: boolean,
): void {
  const player = state.players[playerId];

  if (player) {
    player.connected = connected;
    player.ready = connected ? player.ready : false;
  }

  if (state.hostId === playerId && !connected) {
    const nextHost = Object.values(state.players).find(
      (entry) => entry.id !== playerId && entry.connected,
    );
    state.hostId = nextHost?.id ?? playerId;
  }
}

export function setSelectedDeck(
  state: TableState,
  playerId: string,
  deckName: string,
  cardCount: number,
): boolean {
  const player = state.players[playerId];

  if (!player) {
    return false;
  }

  player.selectedDeckName = deckName;
  player.selectedDeckCardCount = cardCount;
  player.ready = false;
  return true;
}

export function setReadyState(
  state: TableState,
  playerId: string,
  ready: boolean,
): boolean {
  const player = state.players[playerId];

  if (!player || state.hostId === playerId || !player.selectedDeckName) {
    return false;
  }

  player.ready = ready;
  return true;
}

export function canStartGame(state: TableState): boolean {
  if (!state.hostId || state.status !== "lobby") {
    return false;
  }

  const connectedPlayers = Object.values(state.players).filter(
    (player) => player.connected,
  );

  if (connectedPlayers.length === 0) {
    return false;
  }

  return connectedPlayers.every((player) => {
    if (!player.selectedDeckName || player.selectedDeckCardCount === 0) {
      return false;
    }

    if (player.id === state.hostId) {
      return true;
    }

    return player.ready;
  });
}

export function startGame(state: TableState): boolean {
  if (!canStartGame(state)) {
    return false;
  }

  state.status = "playing";
  state.turnPlayerId = state.hostId;
  state.phase = "opening";

  for (const player of Object.values(state.players)) {
    player.ready = false;
  }

  return true;
}

export function loadDeck(
  state: TableState,
  playerId: string,
  cards: DeckCard[],
): void {
  const player = state.players[playerId];

  if (!player) {
    return;
  }

  const library = cards.flatMap((card) =>
    Array.from({ length: clamp(card.count, 1, 99) }, (_, index) =>
      createCardInstance(card, index),
    ),
  );

  player.zones.library = library;
  player.zones.hand = [];
  player.zones.battlefield = [];
  player.zones.graveyard = [];
  player.zones.exile = [];
  player.zones.commandZone = [];
  player.zones.sideboard = [];
  player.libraryFlags = createLibraryFlags();
}

export function drawCards(
  state: TableState,
  playerId: string,
  count: number,
  position: LibraryPosition = "top",
): number {
  const player = state.players[playerId];

  if (!player) {
    return 0;
  }

  const drawCount = clamp(count, 1, 99);
  const drawnCards =
    position === "bottom"
      ? player.zones.library
          .splice(Math.max(0, player.zones.library.length - drawCount), drawCount)
          .reverse()
      : player.zones.library.splice(0, drawCount);

  if (drawnCards.length === 0) {
    return 0;
  }

  player.zones.hand.push(...drawnCards);
  return drawnCards.length;
}

export function takeMulligan(
  state: TableState,
  playerId: string,
  count: number,
): number | null {
  const player = state.players[playerId];

  if (!player) {
    return null;
  }

  const handCards = player.zones.hand.splice(0, player.zones.hand.length);

  for (const card of handCards) {
    applyCardMove(card, "library");
  }

  if (handCards.length > 0) {
    player.zones.library = [...handCards, ...player.zones.library];
  }

  if (player.zones.library.length > 1) {
    shuffleZone(state, playerId, "library");
  }

  const nextCount = clamp(count, 0, 99);

  if (nextCount === 0) {
    return 0;
  }

  return drawCards(state, playerId, nextCount);
}

function applyCardMove(
  card: MovableCard,
  to: ZoneName,
  position?: CardMovePosition,
  options?: CardMoveOptions,
): void {
  if (to === "battlefield") {
    card.x = position?.x ?? card.x;
    card.y = position?.y ?? card.y;
    card.faceDown = options?.faceDown ?? false;
    return;
  }

  card.activeFaceIndex = 0;
  card.faceDown = false;
}

function applyLibraryZoneMove(card: CardInstance, to: ZoneName, faceDown = false): void {
  card.faceDown = faceDown;

  if (to === "battlefield") {
    return;
  }

  card.x = 0;
  card.y = 0;
}

function getDefaultBattlefieldCardPosition(cardCount: number): { x: number; y: number } {
  const column = cardCount % BATTLEFIELD_GRID_COLUMNS;
  const row = Math.floor(cardCount / BATTLEFIELD_GRID_COLUMNS);

  return {
    x: BATTLEFIELD_GRID_ORIGIN_X + column * BATTLEFIELD_GRID_STEP_X,
    y: BATTLEFIELD_GRID_ORIGIN_Y + row * BATTLEFIELD_GRID_STEP_Y,
  };
}

function clearCardAttachment(card: MovableCard): void {
  card.attachedToCardId = undefined;
  card.attachedToOwnerPlayerId = undefined;
}

function clearAttachmentsToCard<TCard extends MovableCard>(
  battlefield: TCard[],
  ownerPlayerId: string,
  targetCardId: string,
): void {
  for (const card of battlefield) {
    if (card.attachedToCardId !== targetCardId || card.attachedToOwnerPlayerId !== ownerPlayerId) {
      continue;
    }

    clearCardAttachment(card);
  }
}

function insertMovedCards<TCard extends MovableCard>(
  zoneCards: TCard[],
  movedCards: TCard[],
  to: ZoneName,
  toIndex?: number,
  options?: CardMoveOptions,
): void {
  if (to === "library" && options?.toPosition === "bottom" && typeof toIndex !== "number") {
    zoneCards.push(...movedCards);
    return;
  }

  if (typeof toIndex === "number") {
    zoneCards.splice(Math.max(0, Math.min(toIndex, zoneCards.length)), 0, ...movedCards);
    return;
  }

  zoneCards.unshift(...movedCards);
}

function clearArrowsForMovedCards(
  state: TableState,
  sourceOwnerPlayerId: string,
  from: ZoneName,
  movedCardIds: Set<string>,
  clearTargets: boolean,
): void {
  for (const player of Object.values(state.players)) {
    player.arrows = player.arrows.filter((arrow) => {
      const targetCardId = arrow.targetCardId;
      const sourceMoved =
        arrow.sourceOwnerPlayerId === sourceOwnerPlayerId
        && arrow.sourceZone === from
        && movedCardIds.has(arrow.sourceCardId);
      const targetMoved =
        clearTargets
        && arrow.targetOwnerPlayerId === sourceOwnerPlayerId
        && targetCardId !== null
        && movedCardIds.has(targetCardId);

      return !sourceMoved && !targetMoved;
    });
  }
}

function clearBattlefieldDerivedStateForMovedCards(
  state: TableState,
  ownerPlayerId: string,
  movedCardIds: Set<string>,
): void {
  const owner = state.players[ownerPlayerId];

  if (!owner) {
    return;
  }

  for (const cardId of movedCardIds) {
    clearAttachmentsToCard(owner.zones.battlefield, ownerPlayerId, cardId);
  }

  clearArrowsForMovedCards(state, ownerPlayerId, "battlefield", movedCardIds, true);
}

function extractLibraryCards(
  library: CardInstance[],
  count: number,
  position: LibraryPosition,
): CardInstance[] {
  const nextCount = clamp(count, 1, 99);

  if (position === "bottom") {
    return library.splice(Math.max(0, library.length - nextCount), nextCount).reverse();
  }

  return library.splice(0, nextCount);
}

export function peekZoneCards(
  state: TableState,
  playerId: string,
  zone: ZoneName,
  count?: number,
  position: LibraryPosition = "top",
): CardInstance[] {
  const player = state.players[playerId];

  if (!player) {
    return [];
  }

  const cards = player.zones[zone];

  if (typeof count !== "number") {
    return cards.slice();
  }

  const nextCount = clamp(count, 1, 99);

  return position === "bottom"
    ? cards.slice(Math.max(0, cards.length - nextCount)).reverse()
    : cards.slice(0, nextCount);
}

export function peekRandomZoneCards(
  state: TableState,
  playerId: string,
  zone: ZoneName,
  count = 1,
): CardInstance[] {
  const player = state.players[playerId];

  if (!player) {
    return [];
  }

  const cards = player.zones[zone];
  const nextCount = Math.min(cards.length, clamp(count, 1, 99));

  if (nextCount === 0) {
    return [];
  }

  const shuffledIndexes = cards.map((_, index) => index);

  for (let index = shuffledIndexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffledIndexes[index];
    shuffledIndexes[index] = shuffledIndexes[swapIndex] as number;
    shuffledIndexes[swapIndex] = current as number;
  }

  return shuffledIndexes
    .slice(0, nextCount)
    .sort((left, right) => left - right)
    .map((index) => cards[index])
    .filter((card): card is CardInstance => Boolean(card));
}

export function shuffleZone(
  state: TableState,
  playerId: string,
  zone: ZoneName,
  slice?: { count: number; position: LibraryPosition },
): number {
  const player = state.players[playerId];

  if (!player) {
    return 0;
  }

  const cards = player.zones[zone];

  if (cards.length < 2) {
    return cards.length;
  }

  const shuffleCards = (entries: CardInstance[]) => {
    for (let index = entries.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = entries[index];
      entries[index] = entries[swapIndex] as CardInstance;
      entries[swapIndex] = current as CardInstance;
    }
  };

  if (!slice) {
    shuffleCards(cards);
    return cards.length;
  }

  const nextCount = Math.min(cards.length, clamp(slice.count, 1, 99));

  if (nextCount < 2) {
    return nextCount;
  }

  if (slice.position === "bottom") {
    const start = cards.length - nextCount;
    const shuffled = cards.slice(start);
    shuffleCards(shuffled);
    cards.splice(start, nextCount, ...shuffled);
    return nextCount;
  }

  const shuffled = cards.slice(0, nextCount);
  shuffleCards(shuffled);
  cards.splice(0, nextCount, ...shuffled);
  return nextCount;
}

export function moveCardsFromLibrary(
  state: TableState,
  playerId: string,
  count: number,
  position: LibraryPosition,
  to: ZoneName,
  faceDown = false,
): string[] {
  const player = state.players[playerId];

  if (!player) {
    return [];
  }

  const extractedCards = extractLibraryCards(player.zones.library, count, position);

  if (!extractedCards.length) {
    return [];
  }

  if (to === "battlefield") {
    const nextBattlefieldCards = extractedCards.map((card, index) => {
      const nextPosition = getDefaultBattlefieldCardPosition(player.zones.battlefield.length + index);
      card.x = nextPosition.x;
      card.y = nextPosition.y;
      applyLibraryZoneMove(card, to, faceDown);
      return card;
    });

    player.zones.battlefield = [...nextBattlefieldCards, ...player.zones.battlefield];
    return nextBattlefieldCards.map((card) => card.id);
  }

  for (const card of extractedCards) {
    applyLibraryZoneMove(card, to, faceDown);
  }

  player.zones[to] = [...extractedCards, ...player.zones[to]];
  return extractedCards.map((card) => card.id);
}

export function createTokensOnBattlefield(
  state: TableState,
  playerId: string,
  token: Pick<DeckCard, "name" | "imageUrl" | "artCropUrl">,
  count: number,
  position?: { x?: number; y?: number },
): string[] {
  const player = state.players[playerId];

  if (!player || !token.name.trim()) {
    return [];
  }

  const tokenCount = clamp(count, 1, 99);
  const nextCards = Array.from({ length: tokenCount }, (_, index) => {
    const nextCard = createCardInstance(token, index);

    if (typeof position?.x === "number" && typeof position?.y === "number") {
      nextCard.x = position.x + index * 28;
      nextCard.y = position.y + index * 14;
    } else {
      const nextPosition = getDefaultBattlefieldCardPosition(player.zones.battlefield.length + index);
      nextCard.x = nextPosition.x;
      nextCard.y = nextPosition.y;
    }

    return nextCard;
  });

  player.zones.battlefield = [...nextCards, ...player.zones.battlefield];
  return nextCards.map((card) => card.id);
}

export function shiftLibraryCard(
  state: TableState,
  playerId: string,
  from: LibraryPosition,
  to: LibraryPosition,
): boolean {
  const player = state.players[playerId];

  if (!player || from === to || player.zones.library.length === 0) {
    return false;
  }

  const card = from === "top" ? player.zones.library.shift() : player.zones.library.pop();

  if (!card) {
    return false;
  }

  if (to === "top") {
    player.zones.library.unshift(card);
  } else {
    player.zones.library.push(card);
  }

  return true;
}

export function setLibraryFlag(
  state: TableState,
  playerId: string,
  flag: keyof LibraryFlags,
  enabled: boolean,
): boolean {
  const player = state.players[playerId];

  if (!player || player.libraryFlags[flag] === enabled) {
    return false;
  }

  player.libraryFlags[flag] = enabled;
  return true;
}

export function moveCardInPlayerZones<TCard extends MovableCard>(
  player: PlayerWithZones<TCard> | undefined,
  cardId: string,
  from: ZoneName,
  to: ZoneName,
  position?: CardMovePosition,
  toIndex?: number,
  options?: CardMoveOptions,
): boolean {
  if (!player) {
    return false;
  }

  const fromZone = player.zones[from];
  const toZone = player.zones[to];
  const cardIndex = fromZone.findIndex((card) => card.id === cardId);

  if (cardIndex === -1) {
    return false;
  }

  const [card] = fromZone.splice(cardIndex, 1);

  if (!card) {
    return false;
  }

  if (from === "battlefield") {
    clearCardAttachment(card);
  }

  applyCardMove(card, to, position, options);

  if (from === to && to === "battlefield") {
    toZone.unshift(card);
    return true;
  }

  insertMovedCards(toZone, [card], to, toIndex, options);

  return true;
}

export function moveCard(
  state: TableState,
  playerId: string,
  cardId: string,
  from: ZoneName,
  to: ZoneName,
  position?: CardMovePosition,
  toIndex?: number,
  options?: CardMoveOptions,
): boolean {
  if (from !== to) {
    const movedCardIds = new Set([cardId]);

    clearArrowsForMovedCards(state, playerId, from, movedCardIds, from === "battlefield");

    if (from === "battlefield") {
      clearBattlefieldDerivedStateForMovedCards(state, playerId, movedCardIds);
    }
  }

  return moveCardInPlayerZones(state.players[playerId], cardId, from, to, position, toIndex, options);
}

export function moveZoneInPlayerZones<TCard extends MovableCard>(
  player: PlayerWithZones<TCard> | undefined,
  from: ZoneName,
  to: ZoneName,
  toPosition?: LibraryPosition,
): string[] {
  if (!player || from === to) {
    return [];
  }

  const fromZone = player.zones[from];

  if (fromZone.length === 0) {
    return [];
  }

  const movedCards = fromZone.splice(0, fromZone.length);

  if (to === "battlefield") {
    for (const [index, card] of movedCards.entries()) {
      const nextPosition = getDefaultBattlefieldCardPosition(player.zones.battlefield.length + index);
      applyCardMove(card, to, nextPosition);
    }

    player.zones.battlefield = [...movedCards, ...player.zones.battlefield];
    return movedCards.map((card) => card.id);
  }

  for (const card of movedCards) {
    applyCardMove(card, to);
  }

  if (to === "library" && toPosition === "bottom") {
    player.zones.library = [...player.zones.library, ...movedCards];
    return movedCards.map((card) => card.id);
  }

  player.zones[to] = [...movedCards, ...player.zones[to]];
  return movedCards.map((card) => card.id);
}

export function moveZone(
  state: TableState,
  playerId: string,
  from: ZoneName,
  to: ZoneName,
  toPosition?: LibraryPosition,
): string[] {
  const player = state.players[playerId];

  if (from !== to && player) {
    const movedCardIds = new Set(player.zones[from].map((card) => card.id));

    clearArrowsForMovedCards(state, playerId, from, movedCardIds, from === "battlefield");

    if (from === "battlefield") {
      clearBattlefieldDerivedStateForMovedCards(state, playerId, movedCardIds);
    }
  }

  return moveZoneInPlayerZones(player, from, to, toPosition);
}

export function peekCardsByIds(
  state: TableState,
  playerId: string,
  zone: ZoneName,
  cardIds: string[],
): CardInstance[] {
  const player = state.players[playerId];

  if (!player || cardIds.length === 0) {
    return [];
  }

  const requestedIds = new Set(cardIds);
  return player.zones[zone].filter((card) => requestedIds.has(card.id));
}

export function cloneCardToBattlefield(
  state: TableState,
  playerId: string,
  sourceOwnerPlayerId: string | undefined,
  cardId: string,
  zone: ZoneName,
): CardInstance | null {
  const player = state.players[playerId];
  const sourceOwner = state.players[sourceOwnerPlayerId ?? playerId];

  if (!player || !sourceOwner) {
    return null;
  }

  const sourceCard = sourceOwner.zones[zone].find((card) => card.id === cardId);

  if (!sourceCard) {
    return null;
  }

  const nextCard = createCardInstance(
    {
      artCropUrl: sourceCard.artCropUrl,
      imageUrl: sourceCard.imageUrl,
      name: sourceCard.name,
    },
    player.zones.battlefield.length,
  );

  nextCard.activeFaceIndex = sourceCard.activeFaceIndex;
  nextCard.counters = structuredClone(sourceCard.counters);
  nextCard.faceDown = sourceCard.faceDown;
  nextCard.tapped = sourceCard.tapped;

  const nextPosition = zone === "battlefield"
    ? { x: sourceCard.x + 28, y: sourceCard.y + 14 }
    : getDefaultBattlefieldCardPosition(player.zones.battlefield.length);

  nextCard.x = nextPosition.x;
  nextCard.y = nextPosition.y;
  player.zones.battlefield.unshift(nextCard);
  return nextCard;
}

function getAttachmentPosition(
  battlefield: CardInstance[],
  targetCard: CardInstance,
  ownerPlayerId: string,
  targetCardId: string,
): { x: number; y: number } {
  const attachmentCount = battlefield.filter(
    (card) =>
      card.attachedToCardId === targetCardId
      && card.attachedToOwnerPlayerId === ownerPlayerId,
  ).length;

  return {
    x: targetCard.x + 22 + attachmentCount * 18,
    y: targetCard.y + 16 + attachmentCount * 14,
  };
}

export function attachCardToBattlefield(
  state: TableState,
  playerId: string,
  cardId: string,
  from: ZoneName,
  targetOwnerPlayerId: string,
  targetCardId: string,
): boolean {
  // Cross-player attachments need cross-battlefield positioning and ownership rules
  // that the current per-player battlefield model does not represent yet.
  if (targetOwnerPlayerId !== playerId) {
    return false;
  }

  const player = state.players[playerId];

  if (!player) {
    return false;
  }

  const targetCard = player.zones.battlefield.find((card) => card.id === targetCardId);

  if (!targetCard || targetCard.id === cardId) {
    return false;
  }

  const attachmentPosition = getAttachmentPosition(player.zones.battlefield, targetCard, playerId, targetCardId);

  if (from !== "battlefield") {
    const moved = moveCard(state, playerId, cardId, from, "battlefield", attachmentPosition);

    if (!moved) {
      return false;
    }
  }

  const sourceCard = player.zones.battlefield.find((card) => card.id === cardId);

  if (!sourceCard) {
    return false;
  }

  clearCardAttachment(sourceCard);
  sourceCard.attachedToCardId = targetCardId;
  sourceCard.attachedToOwnerPlayerId = targetOwnerPlayerId;
  sourceCard.x = attachmentPosition.x;
  sourceCard.y = attachmentPosition.y;
  return true;
}

export function toggleCardArrow(
  state: TableState,
  playerId: string,
  sourceOwnerPlayerId: string | undefined,
  cardId: string,
  zone: ZoneName,
  targetOwnerPlayerId: string,
  targetCardId?: string,
): boolean {
  const player = state.players[playerId];
  const resolvedSourceOwnerPlayerId = sourceOwnerPlayerId ?? playerId;
  let resolvedZone = zone;
  const sourceOwner = state.players[resolvedSourceOwnerPlayerId];
  const targetPlayer = state.players[targetOwnerPlayerId];

  if (!player || !sourceOwner || !targetPlayer) {
    return false;
  }

  if (
    sourceOwner
    && resolvedSourceOwnerPlayerId === playerId
    && resolvedZone !== "battlefield"
  ) {
    // Match Cockatrice-style arrow creation by auto-playing your own source card
    // to the battlefield before the arrow is created.
    const moved = moveCard(
      state,
      playerId,
      cardId,
      resolvedZone,
      "battlefield",
      getDefaultBattlefieldCardPosition(sourceOwner.zones.battlefield.length),
    );

    if (!moved) {
      return false;
    }

    resolvedZone = "battlefield";
  }

  const sourceCard = sourceOwner.zones[resolvedZone].find((card) => card.id === cardId);
  const targetCard = targetCardId
    ? targetPlayer.zones.battlefield.find((card) => card.id === targetCardId)
    : null;

  if (!sourceCard || (targetCardId && !targetCard)) {
    return false;
  }

  // Check all players for an existing arrow to toggle off
  for (const candidate of Object.values(state.players)) {
    const existingArrowIndex = candidate.arrows.findIndex(
      (arrow) =>
        arrow.sourceCardId === cardId
        && arrow.sourceOwnerPlayerId === resolvedSourceOwnerPlayerId
        && arrow.sourceZone === resolvedZone
        && arrow.targetCardId === (targetCardId ?? null)
        && arrow.targetOwnerPlayerId === targetOwnerPlayerId,
    );

    if (existingArrowIndex >= 0) {
      candidate.arrows.splice(existingArrowIndex, 1);
      return true;
    }
  }

  player.arrows.unshift({
    id: createId(),
    sourceCardId: cardId,
    sourceOwnerPlayerId: sourceOwner.id,
    sourceZone: resolvedZone,
    targetCardId: targetCardId ?? null,
    targetOwnerPlayerId,
  });
  return true;
}

export function unattachCard(
  state: TableState,
  playerId: string,
  cardId: string,
): boolean {
  const player = state.players[playerId];

  if (!player) {
    return false;
  }

  const card = player.zones.battlefield.find((entry) => entry.id === cardId);

  if (!card || !card.attachedToCardId) {
    return false;
  }

  clearCardAttachment(card);
  return true;
}

export function setCardDoesNotUntap(
  state: TableState,
  playerId: string,
  cardId: string,
  doesNotUntap: boolean,
): boolean {
  const player = state.players[playerId];

  if (!player) {
    return false;
  }

  const card = player.zones.battlefield.find((entry) => entry.id === cardId);

  if (!card || card.doesNotUntap === doesNotUntap) {
    return false;
  }

  card.doesNotUntap = doesNotUntap;
  return true;
}

export function setCardAnnotation(
  state: TableState,
  playerId: string,
  cardId: string,
  annotation: string,
): boolean {
  const player = state.players[playerId];

  if (!player) {
    return false;
  }

  const card = player.zones.battlefield.find((entry) => entry.id === cardId);

  if (!card) {
    return false;
  }

  const nextAnnotation = annotation.trim().slice(0, 60);

  if ((card.annotation ?? "") === nextAnnotation) {
    return false;
  }

  card.annotation = nextAnnotation || undefined;
  return true;
}

export function setCardPtModifier(
  state: TableState,
  playerId: string,
  cardId: string,
  power: number,
  toughness: number,
): boolean {
  const player = state.players[playerId];

  if (!player) {
    return false;
  }

  const card = player.zones.battlefield.find((entry) => entry.id === cardId);

  if (!card) {
    return false;
  }

  const nextPower = clamp(power, -99, 99);
  const nextToughness = clamp(toughness, -99, 99);
  const currentModifier = card.ptModifier ?? { power: 0, toughness: 0 };

  if (currentModifier.power === nextPower && currentModifier.toughness === nextToughness) {
    return false;
  }

  card.ptModifier = { power: nextPower, toughness: nextToughness };
  return true;
}

function untapPlayerBattlefield(player: PlayerState): void {
  for (const card of player.zones.battlefield) {
    if (card.doesNotUntap) {
      continue;
    }

    card.tapped = false;
  }
}

export function reorderHandCardInPlayerZones<TCard extends MovableCard>(
  player: PlayerWithZones<TCard> | undefined,
  cardId: string,
  toIndex: number,
): boolean {
  if (!player) {
    return false;
  }

  const hand = player.zones.hand;
  const currentIndex = hand.findIndex((card) => card.id === cardId);

  if (currentIndex === -1) {
    return false;
  }

  const [card] = hand.splice(currentIndex, 1);

  if (!card) {
    return false;
  }

  const nextIndex = clamp(toIndex, 0, hand.length);
  hand.splice(nextIndex, 0, card);
  return nextIndex !== currentIndex;
}

export function reorderHandCard(
  state: TableState,
  playerId: string,
  cardId: string,
  toIndex: number,
): boolean {
  return reorderHandCardInPlayerZones(state.players[playerId], cardId, toIndex);
}

export function setHandOrderInPlayerZones<TCard extends MovableCard>(
  player: PlayerWithZones<TCard> | undefined,
  cardIds: string[],
): boolean {
  if (!player) {
    return false;
  }

  const hand = player.zones.hand;

  if (hand.length !== cardIds.length) {
    return false;
  }

  const cardsById = new Map(hand.map((card) => [card.id, card]));

  if (cardsById.size !== cardIds.length || cardIds.some((cardId) => !cardsById.has(cardId))) {
    return false;
  }

  const nextHand = cardIds.map((cardId) => cardsById.get(cardId)).filter((card): card is TCard => Boolean(card));

  if (nextHand.length !== hand.length) {
    return false;
  }

  const changed = nextHand.some((card, index) => hand[index]?.id !== card.id);

  if (!changed) {
    return false;
  }

  player.zones.hand = nextHand;
  return true;
}

export function setHandOrder(
  state: TableState,
  playerId: string,
  cardIds: string[],
): boolean {
  return setHandOrderInPlayerZones(state.players[playerId], cardIds);
}

export function moveCardsInPlayerZones<TCard extends MovableCard>(
  player: PlayerWithZones<TCard> | undefined,
  cards: CardMove[],
  from: ZoneName,
  to: ZoneName,
  toIndex?: number,
  options?: CardMoveOptions,
): string[] {
  if (!player || cards.length === 0) {
    return [];
  }

  if (from === to && to !== "battlefield") {
    return [];
  }

  const requestedIds = new Set(cards.map((card) => card.cardId));
  const positionsById = new Map(cards.map((card) => [card.cardId, card]));
  const fromZone = player.zones[from];
  const movedCards = fromZone.filter((card) => requestedIds.has(card.id));

  if (movedCards.length === 0) {
    return [];
  }

  const keptCards = fromZone.filter((card) => !requestedIds.has(card.id));

  for (const card of movedCards) {
    if (from === "battlefield") {
      clearCardAttachment(card);
    }

    applyCardMove(card, to, positionsById.get(card.id), options);
  }

  if (from === to && to === "battlefield") {
    player.zones[from] = [...movedCards, ...keptCards];
    return movedCards.map((card) => card.id);
  }

  player.zones[from] = keptCards;
  insertMovedCards(player.zones[to], movedCards, to, toIndex, options);
  return movedCards.map((card) => card.id);
}

export function moveCards(
  state: TableState,
  playerId: string,
  cards: CardMove[],
  from: ZoneName,
  to: ZoneName,
  toIndex?: number,
  options?: CardMoveOptions,
): string[] {
  const player = state.players[playerId];

  if (player && from !== to) {
    const movedIds = new Set(cards.map((card) => card.cardId));

    clearArrowsForMovedCards(state, playerId, from, movedIds, from === "battlefield");

    if (from === "battlefield") {
      clearBattlefieldDerivedStateForMovedCards(state, playerId, movedIds);
    }
  }

  return moveCardsInPlayerZones(player, cards, from, to, toIndex, options);
}

export function toggleBattlefieldCard(
  state: TableState,
  playerId: string,
  cardId: string,
): boolean {
  const player = state.players[playerId];

  if (!player) {
    return false;
  }

  const card = player.zones.battlefield.find((entry) => entry.id === cardId);

  if (!card) {
    return false;
  }

  card.tapped = !card.tapped;
  return true;
}

export function toggleFaceDown(
  state: TableState,
  playerId: string,
  cardId: string,
): boolean {
  const player = state.players[playerId];

  if (!player) {
    return false;
  }

  const card = player.zones.battlefield.find((entry) => entry.id === cardId);

  if (!card) {
    return false;
  }

  card.faceDown = !card.faceDown;
  return true;
}

export function transformCard(
  state: TableState,
  playerId: string,
  cardId: string,
): boolean {
  const player = state.players[playerId];

  if (!player) {
    return false;
  }

  const card = player.zones.battlefield.find((entry) => entry.id === cardId);

  if (!card || card.faceDown) {
    return false;
  }

  card.activeFaceIndex = card.activeFaceIndex === 0 ? 1 : 0;
  return true;
}

export function adjustLife(
  state: TableState,
  playerId: string,
  amount: number,
): number | null {
  const player = state.players[playerId];

  if (!player || amount === 0) {
    return null;
  }

  player.life = clamp(player.life + amount, 0, 999);
  return player.life;
}

function getNextConnectedPlayerId(
  state: TableState,
  currentPlayerId: string,
): string | null {
  const connectedPlayers = Object.values(state.players).filter(
    (player) => player.connected,
  );

  if (!connectedPlayers.length) {
    return null;
  }

  const currentIndex = connectedPlayers.findIndex(
    (player) => player.id === currentPlayerId,
  );

  if (currentIndex === -1) {
    return connectedPlayers[0]?.id ?? null;
  }

  return connectedPlayers[(currentIndex + 1) % connectedPlayers.length]?.id ?? null;
}

export function passTurn(state: TableState, playerId: string): string | null {
  if (state.status !== "playing" || state.turnPlayerId !== playerId) {
    return null;
  }

  const nextPlayerId = getNextConnectedPlayerId(state, playerId);

  if (!nextPlayerId) {
    return null;
  }

  state.turnPlayerId = nextPlayerId;
  state.phase = "upkeep";

  for (const player of Object.values(state.players)) {
    player.arrows = [];
  }

  const nextPlayer = state.players[nextPlayerId];

  if (nextPlayer) {
    untapPlayerBattlefield(nextPlayer);
  }

  return nextPlayerId;
}

export function advancePhase(
  state: TableState,
  playerId: string,
): { phase: Phase; passedTurn: boolean; nextPlayerId: string | null } | null {
  if (state.status !== "playing" || state.turnPlayerId !== playerId) {
    return null;
  }

  const currentPhase = state.phase ?? "opening";

  if (!isPhase(currentPhase)) {
    return null;
  }

  const currentIndex = phases.indexOf(currentPhase);

  if (currentIndex === -1) {
    return null;
  }

  if (currentIndex === phases.length - 1) {
    const nextPlayerId = passTurn(state, playerId);

    if (!nextPlayerId || !state.phase) {
      return null;
    }

    return {
      phase: state.phase,
      passedTurn: true,
      nextPlayerId,
    };
  }

  const nextPhase = phases[currentIndex + 1] ?? currentPhase;
  state.phase = nextPhase;
  return {
    phase: nextPhase,
    passedTurn: false,
    nextPlayerId: state.turnPlayerId,
  };
}

export function setCardCounter(
  state: TableState,
  playerId: string,
  cardId: string,
  counter: string,
  value: number,
): boolean {
  const player = state.players[playerId];

  if (!player) {
    return false;
  }

  const normalizedCounter = counter.trim();

  if (!normalizedCounter) {
    return false;
  }

  const card = player.zones.battlefield.find((entry) => entry.id === cardId);

  if (!card) {
    return false;
  }

  const nextValue = clamp(value, 0, 99);

  if (nextValue === 0) {
    delete card.counters[normalizedCounter];
    return true;
  }

  card.counters[normalizedCounter] = nextValue;
  return true;
}

function sanitizeCounterName(value: string): string {
  return value.trim().slice(0, 20) || "Counter";
}

function sanitizeCounterColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#7f8c62";
}

export function createPlayerCounter(
  state: TableState,
  playerId: string,
  name: string,
  color: string,
): PlayerCounterState | null {
  const player = state.players[playerId];

  if (!player) {
    return null;
  }

  const counter = {
    id: createId(),
    name: sanitizeCounterName(name),
    color: sanitizeCounterColor(color),
    value: 0,
  } satisfies PlayerCounterState;

  player.counters.push(counter);
  return counter;
}

export function adjustPlayerCounter(
  state: TableState,
  playerId: string,
  counterId: string,
  amount: number,
): PlayerCounterState | null {
  const player = state.players[playerId];

  if (!player) {
    return null;
  }

  const counter = player.counters.find((entry) => entry.id === counterId);

  if (!counter || amount === 0) {
    return null;
  }

  counter.value = clamp(counter.value + amount, -99, 999);
  return counter;
}

export function removePlayerCounter(
  state: TableState,
  playerId: string,
  counterId: string,
): PlayerCounterState | null {
  const player = state.players[playerId];

  if (!player) {
    return null;
  }

  const counterIndex = player.counters.findIndex((entry) => entry.id === counterId);

  if (counterIndex === -1) {
    return null;
  }

  const [counter] = player.counters.splice(counterIndex, 1);
  return counter ?? null;
}
