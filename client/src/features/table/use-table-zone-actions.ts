import type { ClientAction, ServerEvent } from "@playmat/shared/actions";
import type { CardView, LibraryPosition, PlayerView, ZoneName } from "@playmat/shared/table";
import { useMemo, type MouseEventHandler } from "react";
import type { NavigateFunction } from "react-router-dom";
import { lookupCardsByNames } from "../../lib/card-api";
import { readSavedDecks } from "../../lib/decks";
import {
  buildZoneFieldContextMenuItems,
  type HandSortCriterion,
} from "./context-menu-items";
import type { ContextMenuItem } from "./context-menu";
import { getNextBattlefieldPosition } from "./table-zone-layout";
import type { TableCommandPromptState } from "./table-command-prompt";
import type { TableInteractionController } from "./use-table-interaction";

type ZoneViewState = Extract<ServerEvent, { type: "zone-view" }> | null;

type SortCardDetail = {
  manaValue: number;
  typeLine: string;
};

type UseTableZoneActionsArgs = {
  applyOptimisticHandOrder: (playerId: string, cardIds: string[]) => void;
  applyOptimisticMove: (
    playerId: string,
    cardId: string,
    from: ZoneName,
    to: ZoneName,
    position?: { x?: number; y?: number },
  ) => void;
  applyOptimisticMoveZone: (
    playerId: string,
    from: ZoneName,
    to: ZoneName,
    toPosition?: LibraryPosition,
  ) => void;
  closeZoneView: () => void;
  currentPlayer: PlayerView | null;
  interaction: TableInteractionController;
  navigate: NavigateFunction;
  onUndo: () => void;
  otherPlayers: PlayerView[];
  sendAction: (action: ClientAction) => void;
  setCommandPrompt: (state: TableCommandPromptState | null) => void;
  zoneView: ZoneViewState;
};

export type UseTableZoneActionsResult = {
  canManageZoneView: boolean;
  zoneViewOwnerPlayerId: string | null;
  handleOpenZone: (zone: ZoneName, targetPlayerId?: string) => void;
  handleOpenZoneContextMenu: (zone: ZoneName, ownerPlayerId?: string) => MouseEventHandler<HTMLButtonElement>;
  handleShuffleLibrary: () => void;
  handleZoneViewMoveCard: (cardId: string, to: ZoneName) => void;
  zoneFieldMenuItems: ContextMenuItem[];
};

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

async function buildSortedHandCardIds(
  cards: CardView[],
  sortBy: HandSortCriterion,
): Promise<string[]> {
  const detailsByName: Map<string, SortCardDetail> = sortBy === "name"
    ? new Map()
    : await lookupCardsByNames(cards.map((card) => card.name));

  return cards
    .map((card, index) => ({
      card,
      detail: detailsByName.get(card.name),
      index,
    }))
    .sort((left, right) => {
      switch (sortBy) {
        case "mana-value": {
          const manaValueDiff = (left.detail?.manaValue ?? Number.POSITIVE_INFINITY)
            - (right.detail?.manaValue ?? Number.POSITIVE_INFINITY);

          if (manaValueDiff !== 0) {
            return manaValueDiff;
          }

          break;
        }
        case "type": {
          const typeCompare = compareText(left.detail?.typeLine ?? "", right.detail?.typeLine ?? "");

          if (typeCompare !== 0) {
            return typeCompare;
          }

          break;
        }
        default:
          break;
      }

      const nameCompare = compareText(left.card.name, right.card.name);

      if (nameCompare !== 0) {
        return nameCompare;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.card.id);
}

export function useTableZoneActions({
  applyOptimisticHandOrder,
  applyOptimisticMove,
  applyOptimisticMoveZone,
  closeZoneView,
  currentPlayer,
  interaction,
  navigate,
  onUndo,
  otherPlayers,
  sendAction,
  setCommandPrompt,
  zoneView,
}: UseTableZoneActionsArgs): UseTableZoneActionsResult {
  function closeZoneMenu(): void {
    if (interaction.contextMenu?.kind === "zone") {
      interaction.closeContextMenu();
    }
  }

  function openCountPrompt(
    title: string,
    onSubmit: (count: number) => void,
    options?: { defaultValue?: string; min?: number },
  ): void {
    closeZoneMenu();
    setCommandPrompt({
      defaultValue: options?.defaultValue ?? "1",
      inputMode: "number",
      label: "Number of cards",
      title,
      onSubmit: (value) => {
        const nextCount = Number.parseInt(value, 10);
        const min = options?.min ?? 1;

        if (!Number.isFinite(nextCount) || nextCount < min) {
          return;
        }

        setCommandPrompt(null);
        onSubmit(nextCount);
      },
    });
  }

  const handleOpenZoneContextMenu = (zone: ZoneName, ownerPlayerId?: string): MouseEventHandler<HTMLButtonElement> => (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!currentPlayer) {
      return;
    }

    interaction.openContextMenu({
      kind: "zone",
      ownerPlayerId: ownerPlayerId ?? currentPlayer.id,
      x: event.clientX,
      y: event.clientY,
      zone,
    });
  };

  function handleLibraryDraw(count: number, position?: LibraryPosition): void {
    closeZoneMenu();
    sendAction({ type: "draw", count, position });
  }

  function handleLibraryToZone(options: {
    count: number;
    faceDown?: boolean;
    position: LibraryPosition;
    to: ZoneName;
  }): void {
    closeZoneMenu();
    sendAction({ type: "library-to-zone", ...options });
  }

  function handleViewZone(options: {
    count?: number;
    position?: LibraryPosition;
    targetPlayerId?: string;
    zone: ZoneName;
  }): void {
    closeZoneMenu();
    sendAction({ type: "view-zone", ...options });
  }

  function handleOpenZone(zone: ZoneName, targetPlayerId?: string): void {
    handleViewZone({ zone, targetPlayerId });
  }

  function handleRevealZone(options: {
    count?: number;
    position?: LibraryPosition;
    targetPlayerId: string | "all";
    zone: ZoneName;
  }): void {
    closeZoneMenu();
    sendAction({ type: "reveal-zone", ...options });
  }

  function handleRevealRandomCard(options: {
    targetPlayerId: string | "all";
    zone: ZoneName;
  }): void {
    closeZoneMenu();
    sendAction({ type: "reveal-random-card", ...options });
  }

  async function handleSortHand(sortBy: HandSortCriterion): Promise<void> {
    if (!currentPlayer || currentPlayer.zones.hand.length < 2) {
      closeZoneMenu();
      return;
    }

    closeZoneMenu();

    let cardIds: string[];

    try {
      cardIds = await buildSortedHandCardIds(currentPlayer.zones.hand, sortBy);
    } catch {
      try {
        cardIds = await buildSortedHandCardIds(currentPlayer.zones.hand, "name");
      } catch {
        return;
      }
    }

    applyOptimisticHandOrder(currentPlayer.id, cardIds);
    sendAction({ type: "set-hand-order", cardIds });
  }

  function handleTakeMulligan(count: number): void {
    closeZoneMenu();
    closeZoneView();
    sendAction({ type: "take-mulligan", count });
  }

  function handleMoveZone(options: { from: ZoneName; to: ZoneName; toPosition?: LibraryPosition }): void {
    if (!currentPlayer) {
      return;
    }

    closeZoneMenu();
    closeZoneView();
    applyOptimisticMoveZone(currentPlayer.id, options.from, options.to, options.toPosition);
    sendAction({ type: "move-zone", ...options });
  }

  function handleZoneViewMoveCard(cardId: string, to: ZoneName): void {
    if (!currentPlayer || !zoneView) {
      return;
    }

    const sourceCard = currentPlayer.zones[zoneView.zone].find((card) => card.id === cardId);

    if (!sourceCard) {
      return;
    }

    const position = to === "battlefield"
      ? getNextBattlefieldPosition(currentPlayer.zones.battlefield.map((card) => ({ x: card.x, y: card.y })))
      : undefined;

    sendAction({
      type: "move-card",
      cardId,
      from: zoneView.zone,
      to,
      x: position?.x,
      y: position?.y,
    });
    applyOptimisticMove(currentPlayer.id, cardId, zoneView.zone, to, position);
    closeZoneView();
  }

  function handleLibraryShuffle(slice?: { count: number; position: LibraryPosition }): void {
    closeZoneMenu();
    sendAction({ type: "shuffle", slice });
  }

  function handleShuffleLibrary(): void {
    closeZoneMenu();
    sendAction({ type: "shuffle" });
  }

  function handleOpenDeckInDeckEditor(): void {
    closeZoneMenu();

    if (!currentPlayer?.selectedDeckName) {
      navigate("/decks");
      return;
    }

    const matchingDeck = readSavedDecks().find((deck) => deck.name === currentPlayer.selectedDeckName);
    navigate(matchingDeck ? `/decks/${matchingDeck.id}` : "/decks");
  }

  const zoneFieldMenuItems = useMemo(
    () => {
      if (!currentPlayer || interaction.contextMenu?.kind !== "zone") {
        return [];
      }

      const menuZone = interaction.contextMenu.zone;
      const menuOwner = interaction.contextMenu.ownerPlayerId;

      if (menuOwner !== currentPlayer.id) {
        if (menuZone === "battlefield") {
          return [
            { label: "View graveyard", onSelect: () => handleOpenZone("graveyard", menuOwner) },
            { label: "View exile", onSelect: () => handleOpenZone("exile", menuOwner) },
          ];
        }

        if (menuZone === "graveyard") {
          return [{ label: "View graveyard", onSelect: () => handleOpenZone("graveyard", menuOwner) }];
        }

        if (menuZone === "exile") {
          return [{ label: "View exile", onSelect: () => handleOpenZone("exile", menuOwner) }];
        }

        return [];
      }

      return buildZoneFieldContextMenuItems({
        libraryCallbacks: {
          onDraw: handleLibraryDraw,
          onLibraryToZone: handleLibraryToZone,
          onOpenDeckEditor: handleOpenDeckInDeckEditor,
          onPromptForCount: openCountPrompt,
          onRevealZone: handleRevealZone,
          onSetLibraryFlag: (flag, enabled) => {
            closeZoneMenu();
            sendAction({ type: "set-library-flag", enabled, flag });
          },
          onShiftLibrary: (from, to) => {
            closeZoneMenu();
            sendAction({ type: "library-shift", from, to });
          },
          onShuffle: handleLibraryShuffle,
          onUndo,
          onViewZone: handleViewZone,
        },
        flags: currentPlayer.libraryFlags,
        isOwner: true,
        libraryCount: currentPlayer.zones.library.length,
        otherPlayers,
        zoneCallbacks: {
          onMoveZone: handleMoveZone,
          onPromptForCount: openCountPrompt,
          onRevealZone: handleRevealZone,
          onRevealRandomCard: handleRevealRandomCard,
          onSortHand: (sortBy) => {
            void handleSortHand(sortBy);
          },
          onTakeMulligan: handleTakeMulligan,
          onViewZone: handleViewZone,
        },
        zone: menuZone,
        zoneCount: currentPlayer.zones[menuZone].length,
      });
    },
    [
      closeZoneView,
      currentPlayer,
      interaction.contextMenu,
      navigate,
      onUndo,
      otherPlayers,
      sendAction,
      setCommandPrompt,
      applyOptimisticHandOrder,
      applyOptimisticMoveZone,
    ],
  );

  const canManageZoneView = Boolean(
    currentPlayer
      && zoneView
      && zoneView.ownerPlayerId === currentPlayer.id,
  );

  return {
    canManageZoneView,
    zoneViewOwnerPlayerId: zoneView?.ownerPlayerId ?? null,
    handleOpenZone,
    handleOpenZoneContextMenu,
    handleShuffleLibrary,
    handleZoneViewMoveCard,
    zoneFieldMenuItems,
  };
}
