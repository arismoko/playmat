import {
  zoneNames,
  type CardInstance,
  type CardMove,
  type HiddenCardView,
  type LibraryPosition,
  type PlayerView,
  type PublicCardView,
  type TableState,
  type TableView,
  type ZoneName,
} from "./table-types";
import {
  moveCardInPlayerZones,
  moveCardsInPlayerZones,
  moveZoneInPlayerZones,
  reorderHandCardInPlayerZones,
  setHandOrderInPlayerZones,
} from "./table-mutations";

function isPrivateZone(zone: ZoneName): boolean {
  return zone === "library" || zone === "hand" || zone === "sideboard";
}

function createPublicCardView(card: CardInstance): PublicCardView {
  return {
    ...card,
    visibility: "public",
  };
}

export function createPublicCardViews(cards: CardInstance[]): PublicCardView[] {
  return cards.map(createPublicCardView);
}

function createHiddenCardView(card: CardInstance): HiddenCardView {
  return {
    id: card.id,
    name: "Hidden card",
    activeFaceIndex: card.activeFaceIndex,
    annotation: card.annotation,
    attachedToCardId: card.attachedToCardId,
    attachedToOwnerPlayerId: card.attachedToOwnerPlayerId,
    doesNotUntap: card.doesNotUntap,
    ptModifier: card.ptModifier,
    tapped: card.tapped,
    faceDown: true,
    x: card.x,
    y: card.y,
    counters: card.counters,
    visibility: "hidden",
  };
}

export function projectTableView(
  state: TableState,
  viewerPlayerId: string | null,
): TableView {
  const players = Object.fromEntries(
    Object.entries(state.players).map(([playerId, player]) => {
      const zones = Object.fromEntries(
        zoneNames.map((zoneName) => {
          const cards = player.zones[zoneName].map((card, index) => {
            const shouldHide =
              playerId !== viewerPlayerId &&
              (isPrivateZone(zoneName) || card.faceDown);

            const isRevealedTopCard =
              playerId !== viewerPlayerId &&
              zoneName === "library" &&
              index === 0 &&
              player.libraryFlags.alwaysRevealTop;

            return shouldHide && !isRevealedTopCard
              ? createHiddenCardView(card)
              : createPublicCardView(card);
          });

          return [zoneName, cards];
        }),
      ) as PlayerView["zones"];

      return [
        playerId,
        {
          ...player,
          zones,
        } satisfies PlayerView,
      ];
    }),
  ) as Record<string, PlayerView>;

  return {
    ...state,
    players,
  };
}

export function moveCardView(
  state: TableView,
  playerId: string,
  cardId: string,
  from: ZoneName,
  to: ZoneName,
  position?: { x?: number; y?: number },
  toIndex?: number,
  options?: { faceDown?: boolean; toPosition?: LibraryPosition },
): boolean {
  return moveCardInPlayerZones(state.players[playerId], cardId, from, to, position, toIndex, options);
}

export function moveCardsView(
  state: TableView,
  playerId: string,
  cards: CardMove[],
  from: ZoneName,
  to: ZoneName,
  toIndex?: number,
  options?: { faceDown?: boolean; toPosition?: LibraryPosition },
): string[] {
  return moveCardsInPlayerZones(state.players[playerId], cards, from, to, toIndex, options);
}

export function moveZoneView(
  state: TableView,
  playerId: string,
  from: ZoneName,
  to: ZoneName,
  toPosition?: "top" | "bottom",
): string[] {
  return moveZoneInPlayerZones(state.players[playerId], from, to, toPosition);
}

export function reorderHandCardView(
  state: TableView,
  playerId: string,
  cardId: string,
  toIndex: number,
): boolean {
  return reorderHandCardInPlayerZones(state.players[playerId], cardId, toIndex);
}

export function setHandOrderView(
  state: TableView,
  playerId: string,
  cardIds: string[],
): boolean {
  return setHandOrderInPlayerZones(state.players[playerId], cardIds);
}
