import type { ClientAction } from "@playmat/shared/actions";
import type { CardMove, CardView, PlayerView, ZoneName } from "@playmat/shared/table";
import type { CardResult } from "../../lib/card-api";
import { getNextBattlefieldPosition } from "./table-zone-layout";
import type { TableCardSelection } from "./use-table-interaction";

export const BATTLEFIELD_MULTI_SPREAD_X = 28;
export const BATTLEFIELD_MULTI_SPREAD_Y = 14;
export const BATTLEFIELD_CARD_WIDTH = 92;
export const BATTLEFIELD_CARD_HEIGHT = 129;

export function hasUsableRelatedCards(card: CardResult | null | undefined): boolean {
  if (!card) {
    return false;
  }

  return card.relatedCards.some((relation) => (
    relation.id !== card.id
    && (!card.oracleId || relation.oracleId !== card.oracleId)
    && relation.name.trim().toLowerCase() !== card.name.trim().toLowerCase()
  ));
}

function isSelectionIncluded(
  selections: TableCardSelection[],
  selection: TableCardSelection,
): boolean {
  return selections.some(
    (entry) =>
      entry.cardId === selection.cardId
      && entry.ownerPlayerId === selection.ownerPlayerId
      && entry.zone === selection.zone,
  );
}

export function getActionSelections(
  selection: TableCardSelection,
  selectedCards: TableCardSelection[],
  explicitSelections?: TableCardSelection[],
): TableCardSelection[] {
  const candidateSelections = explicitSelections?.length
    ? explicitSelections
    : selectedCards;

  if (!candidateSelections.length || !isSelectionIncluded(candidateSelections, selection)) {
    return [selection];
  }

  const scopedSelections = candidateSelections.filter(
    (entry) =>
      entry.ownerPlayerId === selection.ownerPlayerId && entry.zone === selection.zone,
  );

  return scopedSelections.length ? scopedSelections : [selection];
}

function getOrderedSelectionCards(
  currentPlayer: PlayerView | null,
  selections: TableCardSelection[],
): CardView[] {
  if (!currentPlayer || !selections.length) {
    return [];
  }

  const selectedCardIds = new Set(selections.map((entry) => entry.cardId));

  return currentPlayer.zones[selections[0]?.zone ?? "battlefield"].filter((card) =>
    selectedCardIds.has(card.id),
  );
}

function buildBattlefieldMoveCards(
  currentPlayer: PlayerView | null,
  selections: TableCardSelection[],
  primarySelection: TableCardSelection,
  position?: { x: number; y: number },
): CardMove[] {
  if (!currentPlayer) {
    return [];
  }

  const orderedCards = getOrderedSelectionCards(currentPlayer, selections);

  if (!orderedCards.length) {
    return [];
  }

  const sourceZone = selections[0]?.zone;
  const selectedCardIds = new Set(orderedCards.map((card) => card.id));

  if (position && sourceZone === "battlefield") {
    const primaryCard =
      currentPlayer.zones.battlefield.find((card) => card.id === primarySelection.cardId) ??
      orderedCards[0];

    if (!primaryCard) {
      return [];
    }

    return orderedCards.map((card) => ({
      cardId: card.id,
      x: position.x + (card.x - primaryCard.x),
      y: position.y + (card.y - primaryCard.y),
    }));
  }

  if (position) {
    return orderedCards.map((card, index) => ({
      cardId: card.id,
      x: position.x + index * BATTLEFIELD_MULTI_SPREAD_X,
      y: position.y + index * BATTLEFIELD_MULTI_SPREAD_Y,
    }));
  }

  const occupiedCards = currentPlayer.zones.battlefield
    .filter((card) => !(sourceZone === "battlefield" && selectedCardIds.has(card.id)))
    .map((card) => ({ x: card.x, y: card.y }));

  return orderedCards.map((card) => {
    const nextPosition = getNextBattlefieldPosition(occupiedCards);

    occupiedCards.push(nextPosition);

    return {
      cardId: card.id,
      x: nextPosition.x,
      y: nextPosition.y,
    };
  });
}

export function buildMoveCards(
  currentPlayer: PlayerView | null,
  selections: TableCardSelection[],
  primarySelection: TableCardSelection,
  to: ZoneName,
  position?: { x: number; y: number },
): CardMove[] {
  if (to === "battlefield") {
    return buildBattlefieldMoveCards(currentPlayer, selections, primarySelection, position);
  }

  return getOrderedSelectionCards(currentPlayer, selections).map((card) => ({ cardId: card.id }));
}

export function clampBattlefieldMoveCardsToBounds(
  moveCards: CardMove[],
  bounds: { width: number; height: number } | null,
): CardMove[] {
  if (!bounds || moveCards.length === 0) {
    return moveCards;
  }

  const positionedCards = moveCards.filter(
    (cardMove): cardMove is CardMove & { x: number; y: number } =>
      cardMove.x !== undefined && cardMove.y !== undefined,
  );

  if (!positionedCards.length) {
    return moveCards;
  }

  const minX = Math.min(...positionedCards.map((cardMove) => cardMove.x));
  const minY = Math.min(...positionedCards.map((cardMove) => cardMove.y));
  const maxX = Math.max(...positionedCards.map((cardMove) => cardMove.x + BATTLEFIELD_CARD_WIDTH));
  const maxY = Math.max(...positionedCards.map((cardMove) => cardMove.y + BATTLEFIELD_CARD_HEIGHT));
  let shiftX = 0;
  let shiftY = 0;

  if (minX < 0) {
    shiftX = -minX;
  } else if (maxX > bounds.width) {
    shiftX = bounds.width - maxX;
  }

  if (minY < 0) {
    shiftY = -minY;
  } else if (maxY > bounds.height) {
    shiftY = bounds.height - maxY;
  }

  if (shiftX === 0 && shiftY === 0) {
    return moveCards;
  }

  return moveCards.map((cardMove) => {
    if (cardMove.x === undefined || cardMove.y === undefined) {
      return cardMove;
    }

    return {
      ...cardMove,
      x: Math.round(cardMove.x + shiftX),
      y: Math.round(cardMove.y + shiftY),
    };
  });
}

export function buildCreateTokenAction(
  token: CardResult,
  count: number,
  position?: { x?: number; y?: number },
): ClientAction {
  return {
    type: "create-token",
    artCropUrl: token.artCropUrl,
    count,
    imageUrl: token.imageUrl,
    name: token.name,
    x: position?.x,
    y: position?.y,
  };
}
