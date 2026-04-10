import type { ClientAction, ServerEvent } from "@playmat/shared/actions";
import type { CardMove, CardView, LibraryPosition, PlayerView, ZoneName } from "@playmat/shared/table";
import type { MouseEventHandler } from "react";
import type { NavigateFunction } from "react-router-dom";
import { getCachedCardByName, type CardResult } from "../../lib/card-api";
import type { ContextMenuItem } from "./context-menu";
import { resolveDropTargetAtPoint } from "./drop-targets";
import type { TableDragMovePayload } from "./drag-source-handlers";
import type { InspectorCard } from "./inspector";
import {
  buildMoveCards,
  clampBattlefieldMoveCardsToBounds,
  getActionSelections,
} from "./table-action-helpers";
import type { TableCommandPromptState } from "./table-command-prompt";
import { useTableContextMenu } from "./use-table-context-menu";
import type {
  TableCardSelection,
  TableDragState,
  TableDropTarget,
  TableInteractionController,
} from "./use-table-interaction";
import { useTableZoneActions } from "./use-table-zone-actions";
import { useTableTokenActions } from "./use-table-token-actions";
import type { RelatedCardsDialogState, TokenDialogState } from "./use-table-ui-state";

type ZoneViewState = Extract<ServerEvent, { type: "zone-view" }> | null;

type TableOptimisticActions = {
  applyOptimisticBatchMove: (
    playerId: string,
    cards: CardMove[],
    from: ZoneName,
    to: ZoneName,
    toIndex?: number,
    options?: { faceDown?: boolean; toPosition?: LibraryPosition },
  ) => void;
  applyOptimisticHandOrder: (playerId: string, cardIds: string[]) => void;
  applyOptimisticHandReorder: (playerId: string, cardId: string, toIndex: number) => void;
  applyOptimisticMove: (
    playerId: string,
    cardId: string,
    from: ZoneName,
    to: ZoneName,
    position?: { x?: number; y?: number },
    toIndex?: number,
    options?: { faceDown?: boolean; toPosition?: LibraryPosition },
  ) => void;
  applyOptimisticMoveZone: (
    playerId: string,
    from: ZoneName,
    to: ZoneName,
    toPosition?: LibraryPosition,
  ) => void;
};

type TableUiActions = {
  inspectorEntry: InspectorCard | null;
  relatedCardsDialog: RelatedCardsDialogState | null;
  setCommandPrompt: (state: TableCommandPromptState | null) => void;
  setInspectorEntry: (entry: InspectorCard | null) => void;
  setRelatedCardsDialog: (state: RelatedCardsDialogState | null) => void;
  setTokenDialog: (state: TokenDialogState | null) => void;
  tokenDialog: TokenDialogState | null;
};

type TableActionState = {
  closeZoneView: () => void;
  currentPlayer: PlayerView | null;
  otherPlayers: PlayerView[];
  zoneView: ZoneViewState;
};

type UseTableActionsArgs = {
  interaction: TableInteractionController;
  navigate: NavigateFunction;
  optimistic: TableOptimisticActions;
  sendAction: (action: ClientAction) => void;
  table: TableActionState;
  ui: TableUiActions;
};

export type UseTableActionsResult = {
  activeContextMenuItems: ContextMenuItem[];
  canManageZoneView: boolean;
  zoneViewOwnerPlayerId: string | null;
  handleConfirmTargeting: (target: { cardId: string | null; ownerPlayerId: string } | null) => void;
  handleCreateRelatedToken: (token: CardResult) => void;
  handleCreateToken: (token: CardResult, count: number) => void;
  handleDeleteArrow: (arrow: { sourceCardId: string; sourceOwnerPlayerId: string; sourceZone: ZoneName; targetCardId: string | null; targetOwnerPlayerId: string }) => void;
  handleDragEnd: (
    selection: TableCardSelection,
    finishedDrag: TableDragState,
    dropTarget: TableDropTarget | null,
  ) => boolean;
  handleDragMove: (selection: TableCardSelection, position: TableDragMovePayload) => void;
  handleMoveCard: (
    selection: TableCardSelection,
    to: ZoneName,
    position?: { x: number; y: number },
  ) => void;
  handleOpenZone: (zone: ZoneName) => void;
  handleOpenZoneContextMenu: (zone: ZoneName) => MouseEventHandler<HTMLButtonElement>;
  handlePlayCard: (selection: TableCardSelection) => void;
  handleStartArrowTargeting: (selection: TableCardSelection) => void;
  handleSelectAllBattlefield: () => void;
  handleSelectBattlefieldCard: (
    selection: TableCardSelection,
    options?: { additive: boolean; clickCount?: number },
  ) => void;
  handleSelectHandCard: (
    selection: TableCardSelection,
    options?: { additive: boolean; clickCount?: number },
  ) => void;
  handleShuffleLibrary: () => void;
  handleTapCard: (selection: TableCardSelection) => void;
  handleToggleFaceDown: (selection: TableCardSelection) => void;
  handleTransformCard: (selection: TableCardSelection) => void;
  handleUndo: () => void;
  handleZoneViewMoveCard: (cardId: string, to: ZoneName) => void;
};

function getBattlefieldPosition(
  position?: { x?: number; y?: number },
): { x: number; y: number } | undefined {
  if (position?.x === undefined || position.y === undefined) {
    return undefined;
  }

  return {
    x: position.x,
    y: position.y,
  };
}

function getDropTargetBattlefieldPosition(
  dropTarget: TableDropTarget,
): { x: number; y: number } | undefined {
  return getBattlefieldPosition({ x: dropTarget.x, y: dropTarget.y });
}

function getBattlefieldBounds(ownerPlayerId: string): { width: number; height: number } | null {
  const battlefieldElement = Array.from(
    document.querySelectorAll<HTMLElement>("[data-battlefield-surface='true']"),
  ).find((element) => element.dataset.dropOwnerPlayerId === ownerPlayerId);

  if (!battlefieldElement) {
    return null;
  }

  const rect = battlefieldElement.getBoundingClientRect();

  return {
    height: rect.height,
    width: rect.width,
  };
}

function getCardTargetKey(ownerPlayerId: string, cardId: string): string {
  return `${ownerPlayerId}:${cardId}`;
}

function getPlayerTargetKey(ownerPlayerId: string): string {
  return `${ownerPlayerId}:__player__`;
}

function shuffleMoveCards(cards: CardMove[]): CardMove[] {
  const nextCards = cards.slice();

  for (let index = nextCards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = nextCards[index];
    nextCards[index] = nextCards[swapIndex] as CardMove;
    nextCards[swapIndex] = current as CardMove;
  }

  return nextCards;
}

export function useTableActions({
  interaction,
  navigate,
  optimistic,
  sendAction,
  table,
  ui,
}: UseTableActionsArgs): UseTableActionsResult {
  const {
    applyOptimisticBatchMove,
    applyOptimisticHandOrder,
    applyOptimisticHandReorder,
    applyOptimisticMove,
    applyOptimisticMoveZone,
  } = optimistic;
  const { closeZoneView, currentPlayer, otherPlayers, zoneView } = table;
  const {
    inspectorEntry,
    relatedCardsDialog,
    setCommandPrompt,
    setInspectorEntry,
    setRelatedCardsDialog,
    setTokenDialog,
    tokenDialog,
  } = ui;

  function closeCardActionUi(selection: TableCardSelection): void {
    interaction.closeContextMenu();
    interaction.selectCard(selection);
  }

  function clearTransientTableUi(): void {
    setInspectorEntry(null);
    interaction.closeContextMenu();
    interaction.clearDropTarget();
  }

  function getBattlefieldTargets(options?: { includeAllPlayers?: boolean }): Array<{
    cardId: string;
    cardName: string;
    ownerPlayerId: string;
    ownerPlayerName: string;
  }> {
    if (!currentPlayer) {
      return [];
    }

    const players = options?.includeAllPlayers ? [currentPlayer, ...otherPlayers] : [currentPlayer];

    return players.flatMap((player) =>
      player.zones.battlefield.map((card) => ({
        cardId: card.id,
        cardName: card.name,
        ownerPlayerId: player.id,
        ownerPlayerName: player.name,
      })),
    );
  }

  function getArrowTargetPlayers(): PlayerView[] {
    return otherPlayers;
  }

  function getBattlefieldOwner(ownerPlayerId: string): PlayerView | null {
    if (currentPlayer?.id === ownerPlayerId) {
      return currentPlayer;
    }

    return otherPlayers.find((player) => player.id === ownerPlayerId) ?? null;
  }

  function getCardScreenCenter(ownerPlayerId: string, cardId: string): { x: number; y: number } | null {
    if (typeof document === "undefined") {
      return null;
    }

    const selector = `[data-table-card-owner-player-id='${ownerPlayerId}'][data-table-card-id='${cardId}']`;
    const element = document.querySelector<HTMLElement>(selector);

    if (!element) {
      return null;
    }

    const rect = element.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function isViewerContextSelection(selection: TableCardSelection): boolean {
    return Boolean(
      interaction.contextMenu?.kind === "card"
        && interaction.contextMenu.source === "viewer"
        && interaction.contextMenu.cardId === selection.cardId
        && interaction.contextMenu.ownerPlayerId === selection.ownerPlayerId
        && interaction.contextMenu.zone === selection.zone,
    );
  }

  function findOwnedCard(selection: TableCardSelection | null): CardView | null {
    if (!currentPlayer || !selection) {
      return null;
    }

    return currentPlayer.zones[selection.zone].find((card) => card.id === selection.cardId) ?? null;
  }

  function findContextCard(selection: TableCardSelection | null): CardView | null {
    if (!selection) {
      return null;
    }

    const ownedCard = findOwnedCard(selection);

    if (ownedCard) {
      return ownedCard;
    }

    if (
      zoneView
      && zoneView.zone === selection.zone
      && zoneView.ownerPlayerId === selection.ownerPlayerId
    ) {
      return zoneView.cards.find((card) => card.id === selection.cardId) ?? null;
    }

    if (selection.zone === "battlefield") {
      const owner = otherPlayers.find((player) => player.id === selection.ownerPlayerId);
      return owner?.zones.battlefield.find((card) => card.id === selection.cardId) ?? null;
    }

    return null;
  }

  function handleMoveSelections(
    selection: TableCardSelection,
    to: ZoneName,
    position?: { x: number; y: number },
    explicitSelections?: TableCardSelection[],
    toIndex?: number,
    options?: { faceDown?: boolean; toPosition?: LibraryPosition },
  ): void {
    if (!currentPlayer || selection.ownerPlayerId !== currentPlayer.id) {
      return;
    }

    const selections = getActionSelections(selection, interaction.selectedCards, explicitSelections);
    const sourceZone = selections[0]?.zone;

    if (!sourceZone) {
      return;
    }

    if (sourceZone === to && to !== "battlefield") {
      return;
    }

    const moveCards = buildMoveCards(currentPlayer, selections, selection, to, position);
    const boundedMoveCards =
      to === "battlefield"
        ? clampBattlefieldMoveCardsToBounds(
            moveCards,
            getBattlefieldBounds(selection.ownerPlayerId),
          )
        : moveCards;
    const orderedMoveCards =
      to === "library" && boundedMoveCards.length > 1 && options?.toPosition
        ? shuffleMoveCards(boundedMoveCards)
        : boundedMoveCards;

    if (!orderedMoveCards.length) {
      return;
    }

    if (orderedMoveCards.length === 1) {
      const [cardMove] = orderedMoveCards;

      if (!cardMove) {
        return;
      }

      const battlefieldPosition = getBattlefieldPosition({ x: cardMove.x, y: cardMove.y });
      const action: ClientAction = {
        type: "move-card",
        cardId: cardMove.cardId,
        faceDown: options?.faceDown,
        from: sourceZone,
        to,
        toPosition: options?.toPosition,
      };

      if (battlefieldPosition) {
        action.x = battlefieldPosition.x;
        action.y = battlefieldPosition.y;
      }

      if (typeof toIndex === "number") {
        action.toIndex = toIndex;
      }

      applyOptimisticMove(
        selection.ownerPlayerId,
        cardMove.cardId,
        sourceZone,
        to,
        battlefieldPosition,
        toIndex,
        options,
      );
      sendAction(action);
    } else {
      if (typeof toIndex === "number" || options?.toPosition || options?.faceDown) {
        applyOptimisticBatchMove(selection.ownerPlayerId, orderedMoveCards, sourceZone, to, toIndex, options);
      } else {
        applyOptimisticBatchMove(selection.ownerPlayerId, orderedMoveCards, sourceZone, to);
      }
      sendAction({
        type: "move-cards",
        cards: orderedMoveCards,
        faceDown: options?.faceDown,
        from: sourceZone,
        to,
        toIndex,
        toPosition: options?.toPosition,
      });
    }

    clearTransientTableUi();

    if (to === "battlefield") {
      interaction.setSelectedCards(
        orderedMoveCards.map((cardMove) => ({
          cardId: cardMove.cardId,
          ownerPlayerId: selection.ownerPlayerId,
          zone: "battlefield",
        })),
      );
      return;
    }

    interaction.clearSelection();
  }

  function handleMoveCard(
    selection: TableCardSelection,
    to: ZoneName,
    position?: { x: number; y: number },
  ): void {
    handleMoveSelections(selection, to, position);
  }

  function handlePlayCard(selection: TableCardSelection): void {
    if (!currentPlayer || selection.ownerPlayerId !== currentPlayer.id) {
      return;
    }

    handleMoveSelections(selection, "battlefield", undefined, [selection]);
  }

  function handlePlayFaceDown(selection: TableCardSelection): void {
    if (!currentPlayer || selection.ownerPlayerId !== currentPlayer.id) {
      return;
    }

    handleMoveSelections(selection, "battlefield", undefined, undefined, undefined, { faceDown: true });
  }

  function handleCloneCard(selection: TableCardSelection): void {
    if (!currentPlayer) {
      return;
    }

    const selections = getActionSelections(selection, interaction.selectedCards)
      .filter((candidate) => candidate.zone === selection.zone);

    if (!selections.length) {
      return;
    }

    for (const candidate of selections) {
      sendAction({
        type: "clone-card",
        cardId: candidate.cardId,
        sourceOwnerPlayerId: candidate.ownerPlayerId === currentPlayer.id ? undefined : candidate.ownerPlayerId,
        zone: candidate.zone,
      });
    }

    closeCardActionUi(selection);
  }

  function handleRevealCards(selection: TableCardSelection, targetPlayerId: string | "all"): void {
    if (!currentPlayer || selection.ownerPlayerId !== currentPlayer.id) {
      return;
    }

    const cardIds = getActionSelections(selection, interaction.selectedCards)
      .filter((candidate) => candidate.zone === selection.zone)
      .map((candidate) => candidate.cardId);

    if (!cardIds.length) {
      return;
    }

    sendAction({
      type: "reveal-cards",
      cardIds,
      targetPlayerId,
      zone: selection.zone,
    });
    closeCardActionUi(selection);
  }

  function handleMoveCardToLibrary(
    selection: TableCardSelection,
    options: { promptForOffset?: boolean; toIndex?: number; toPosition: LibraryPosition },
  ): void {
    if (options.promptForOffset) {
      interaction.closeContextMenu();
      setCommandPrompt({
        defaultValue: "1",
        inputMode: "number",
        label: "Cards from the top",
        title: "Move card to library position",
        onSubmit: (value) => {
          const nextIndex = Number.parseInt(value, 10);

          if (!Number.isFinite(nextIndex) || nextIndex < 0) {
            return;
          }

          setCommandPrompt(null);
          handleMoveSelections(selection, "library", undefined, undefined, nextIndex, {
            toPosition: options.toPosition,
          });
        },
      });
      return;
    }

    handleMoveSelections(selection, "library", undefined, undefined, options.toIndex, {
      toPosition: options.toPosition,
    });
  }

  function handleAttachToCard(selection: TableCardSelection): void {
    if (!currentPlayer || selection.ownerPlayerId !== currentPlayer.id) {
      return;
    }

    const sourceCard = findContextCard(selection);

    if (!sourceCard) {
      return;
    }

    const targets = getBattlefieldTargets()
      .filter((target) => target.cardId !== selection.cardId || selection.zone !== "battlefield");

    if (!targets.length) {
      return;
    }

    const sourceCenter = getCardScreenCenter(selection.ownerPlayerId, selection.cardId);
    const startedFromViewer = isViewerContextSelection(selection);

    interaction.closeContextMenu();
    interaction.startTargeting({
      kind: "attach",
      sourceCardId: selection.cardId,
      sourceFallbackX: sourceCenter?.x,
      sourceFallbackY: sourceCenter?.y,
      sourceOwnerPlayerId: selection.ownerPlayerId,
      sourceZone: selection.zone,
      validTargetKeys: new Set(
        targets.map((target) => getCardTargetKey(target.ownerPlayerId, target.cardId)),
      ),
    });

    if (startedFromViewer) {
      closeZoneView();
    }
  }

  function handleStartArrowTargeting(selection: TableCardSelection): void {
    if (!currentPlayer) {
      return;
    }

    const sourceCard = findContextCard(selection);

    if (!sourceCard) {
      return;
    }

    const targets = getBattlefieldTargets({ includeAllPlayers: true })
      .filter((target) => target.cardId !== selection.cardId || target.ownerPlayerId !== selection.ownerPlayerId);
    const targetPlayers = getArrowTargetPlayers();

    if (!targets.length && !targetPlayers.length) {
      return;
    }

    const sourceCenter = getCardScreenCenter(selection.ownerPlayerId, selection.cardId);
    const startedFromViewer = isViewerContextSelection(selection);

    interaction.closeContextMenu();
    interaction.startTargeting({
      kind: "arrow",
      sourceCardId: selection.cardId,
      sourceFallbackX: sourceCenter?.x,
      sourceFallbackY: sourceCenter?.y,
      sourceOwnerPlayerId: selection.ownerPlayerId,
      sourceZone: selection.zone,
      validTargetKeys: new Set([
        ...targets.map((target) => getCardTargetKey(target.ownerPlayerId, target.cardId)),
        ...targetPlayers.map((player) => getPlayerTargetKey(player.id)),
      ]),
    });

    if (startedFromViewer) {
      closeZoneView();
    }
  }

  function handleClearArrows(selection: TableCardSelection): void {
    if (!currentPlayer) {
      return;
    }

    const ownerPlayerId = selection.ownerPlayerId;
    const owner = ownerPlayerId === currentPlayer.id
      ? currentPlayer
      : otherPlayers.find((player) => player.id === ownerPlayerId);

    if (!owner) {
      return;
    }

    const cardArrows = currentPlayer.arrows.filter(
      (arrow) => arrow.sourceCardId === selection.cardId && arrow.sourceOwnerPlayerId === ownerPlayerId,
    );

    for (const arrow of cardArrows) {
      sendAction({
        type: "toggle-card-arrow",
        cardId: arrow.sourceCardId,
        sourceOwnerPlayerId: arrow.sourceOwnerPlayerId === currentPlayer.id
          ? undefined
          : arrow.sourceOwnerPlayerId,
        targetCardId: arrow.targetCardId ?? undefined,
        targetOwnerPlayerId: arrow.targetOwnerPlayerId,
        zone: selection.zone,
      });
    }

    interaction.closeContextMenu();
  }

  function handleDrawArrow(selection: TableCardSelection): void {
    handleStartArrowTargeting(selection);
  }

  function handleConfirmTargeting(target: { cardId: string | null; ownerPlayerId: string } | null): void {
    const targetingMode = interaction.targetingMode;

    if (!targetingMode || !target) {
      interaction.cancelTargeting();
      return;
    }

    if (targetingMode.kind === "attach") {
      if (!target.cardId) {
        interaction.cancelTargeting();
        return;
      }

      sendAction({
        type: "attach-card",
        cardId: targetingMode.sourceCardId,
        from: targetingMode.sourceZone,
        targetCardId: target.cardId,
        targetOwnerPlayerId: target.ownerPlayerId,
      });
    } else if (currentPlayer) {
      sendAction({
        type: "toggle-card-arrow",
        cardId: targetingMode.sourceCardId,
        sourceOwnerPlayerId: targetingMode.sourceOwnerPlayerId === currentPlayer.id
          ? undefined
          : targetingMode.sourceOwnerPlayerId,
        targetCardId: target.cardId ?? undefined,
        targetOwnerPlayerId: target.ownerPlayerId,
        zone: targetingMode.sourceZone,
      });
    }

    interaction.cancelTargeting();
  }

  function handleDeleteArrow(arrow: {
    sourceCardId: string;
    sourceOwnerPlayerId: string;
    sourceZone: ZoneName;
    targetCardId: string | null;
    targetOwnerPlayerId: string;
  }): void {
    if (!currentPlayer) {
      return;
    }

    sendAction({
      type: "toggle-card-arrow",
      cardId: arrow.sourceCardId,
      sourceOwnerPlayerId: arrow.sourceOwnerPlayerId === currentPlayer.id
        ? undefined
        : arrow.sourceOwnerPlayerId,
      targetCardId: arrow.targetCardId ?? undefined,
      targetOwnerPlayerId: arrow.targetOwnerPlayerId,
      zone: arrow.sourceZone,
    });
  }

  function handleDragMove(selection: TableCardSelection, position: TableDragMovePayload): void {
    if (!currentPlayer || selection.ownerPlayerId !== currentPlayer.id) {
      return;
    }

    interaction.updateDrag({
      screenX: position.clientX,
      screenY: position.clientY,
      x: position.left,
      y: position.top,
    });
    interaction.setDropTarget(
      resolveDropTargetAtPoint({
        clientX: position.clientX,
        clientY: position.clientY,
        dragHeight: position.height,
        dragLeft: position.left,
        dragTop: position.top,
        dragWidth: position.width,
        ownerPlayerId: currentPlayer.id,
      }),
    );
  }

  function handleDragEnd(
    selection: TableCardSelection,
    finishedDrag: TableDragState,
    dropTarget: TableDropTarget | null,
  ): boolean {
    if (!finishedDrag.moved) {
      return true;
    }

    const resolvedDropTarget =
      dropTarget ??
      (currentPlayer && selection.ownerPlayerId === currentPlayer.id
        ? resolveDropTargetAtPoint({
            clientX: finishedDrag.screenX,
            clientY: finishedDrag.screenY,
            dragHeight: finishedDrag.height,
            dragLeft: finishedDrag.x,
            dragTop: finishedDrag.y,
            dragWidth: finishedDrag.width,
            ownerPlayerId: currentPlayer.id,
          })
        : null);

    if (!resolvedDropTarget) {
      return false;
    }

    const resolvedHandInsertionIndex = interaction.getHandInsertionIndex();

    if (resolvedDropTarget.zone === "hand" && resolvedDropTarget.zone === selection.zone) {
      if (
        currentPlayer &&
        selection.ownerPlayerId === currentPlayer.id &&
        finishedDrag.selections.length === 1 &&
        typeof resolvedHandInsertionIndex === "number"
      ) {
        const currentIndex = currentPlayer.zones.hand.findIndex((card) => card.id === selection.cardId);

        if (currentIndex !== -1 && resolvedHandInsertionIndex !== currentIndex) {
          applyOptimisticHandReorder(selection.ownerPlayerId, selection.cardId, resolvedHandInsertionIndex);
          sendAction({ type: "reorder-hand", cardId: selection.cardId, toIndex: resolvedHandInsertionIndex });
        }
      }

      interaction.clearSelection();
      return true;
    }

    if (resolvedDropTarget.zone === selection.zone && resolvedDropTarget.zone !== "battlefield") {
      return false;
    }

    if (resolvedDropTarget.zone === "battlefield") {
      handleMoveSelections(
        selection,
        resolvedDropTarget.zone,
        getDropTargetBattlefieldPosition(resolvedDropTarget),
        finishedDrag.selections,
      );
      interaction.clearSelection();
      return true;
    }

    const handToIndex =
      resolvedDropTarget.zone === "hand" && typeof resolvedHandInsertionIndex === "number"
        ? resolvedHandInsertionIndex
        : undefined;

    if (resolvedDropTarget.zone === "hand") {
      interaction.setHandDropArrival({
        cardId: selection.cardId,
        screenX: finishedDrag.screenX - finishedDrag.offsetX + finishedDrag.width / 2,
        screenY: finishedDrag.screenY - finishedDrag.offsetY + finishedDrag.height / 2,
      });
    }

    handleMoveSelections(selection, resolvedDropTarget.zone, undefined, finishedDrag.selections, handToIndex);
    interaction.clearSelection();
    return true;
  }

  function handleSelectBattlefieldCard(
    selection: TableCardSelection,
    options?: { additive: boolean; clickCount?: number },
  ): void {
    if (options?.additive) {
      interaction.toggleCardSelection(selection);
      return;
    }

    if (interaction.selectedCards.length === 1 && interaction.isCardSelected(selection)) {
      interaction.clearSelection();
      return;
    }

    interaction.selectCard(selection);
  }

  function handleSelectHandCard(
    selection: TableCardSelection,
    options?: { additive: boolean; clickCount?: number },
  ): void {
    if (options?.additive) {
      interaction.toggleCardSelection(selection);
      return;
    }

    interaction.selectCard(selection);
  }

  function handleSelectAllBattlefield(): void {
    if (!currentPlayer) {
      return;
    }

    interaction.setSelectedCards(
      currentPlayer.zones.battlefield.map((card) => ({
        cardId: card.id,
        ownerPlayerId: currentPlayer.id,
        zone: "battlefield",
      })),
    );
  }

  function handleSelectAllBattlefieldCards(selection: TableCardSelection): void {
    const owner = getBattlefieldOwner(selection.ownerPlayerId);

    if (!owner) {
      return;
    }

    interaction.setSelectedCards(
      owner.zones.battlefield.map((card) => ({
        cardId: card.id,
        ownerPlayerId: owner.id,
        zone: "battlefield",
      })),
    );
    interaction.closeContextMenu();
  }

  function handleSelectBattlefieldRow(selection: TableCardSelection): void {
    const owner = getBattlefieldOwner(selection.ownerPlayerId);
    const sourceCard = owner?.zones.battlefield.find((card) => card.id === selection.cardId);

    if (!owner || !sourceCard) {
      return;
    }

    interaction.setSelectedCards(
      owner.zones.battlefield
        .filter((card) => Math.abs(card.y - sourceCard.y) <= 56)
        .map((card) => ({
          cardId: card.id,
          ownerPlayerId: owner.id,
          zone: "battlefield",
        })),
    );
    interaction.closeContextMenu();
  }

  function handleSelectAllHand(): void {
    if (!currentPlayer) {
      return;
    }

    interaction.setSelectedCards(
      currentPlayer.zones.hand.map((card) => ({
        cardId: card.id,
        ownerPlayerId: currentPlayer.id,
        zone: "hand",
      })),
    );
  }

  function handleSelectAllVisibleViewerCards(selection: TableCardSelection): void {
    if (interaction.contextMenu?.kind !== "card") {
      return;
    }

    const visibleCardIds = interaction.contextMenu.viewerVisibleCardIds ?? [];

    if (!visibleCardIds.length) {
      return;
    }

    interaction.setSelectedCards(
      visibleCardIds.map((cardId) => ({
        cardId,
        ownerPlayerId: selection.ownerPlayerId,
        zone: selection.zone,
      })),
    );
    interaction.closeContextMenu();
  }

  function handleSelectViewerColumnCards(selection: TableCardSelection): void {
    if (interaction.contextMenu?.kind !== "card") {
      return;
    }

    const columnCardIds = interaction.contextMenu.viewerColumnCardIds ?? [];

    if (!columnCardIds.length) {
      return;
    }

    interaction.setSelectedCards(
      columnCardIds.map((cardId) => ({
        cardId,
        ownerPlayerId: selection.ownerPlayerId,
        zone: selection.zone,
      })),
    );
    interaction.closeContextMenu();
  }

  function handleHideViewerCards(_selection: TableCardSelection): void {
    interaction.closeContextMenu();
    interaction.clearSelection();
    closeZoneView();
  }

  function handleUndo(): void {
    sendAction({ type: "undo" });
    clearTransientTableUi();
    interaction.clearSelection();
  }

  const zoneActions = useTableZoneActions({
    applyOptimisticHandOrder,
    applyOptimisticMove,
    applyOptimisticMoveZone,
    closeZoneView,
    currentPlayer,
    interaction,
    navigate,
    onUndo: handleUndo,
    otherPlayers,
    sendAction,
    setCommandPrompt,
    zoneView,
  });

  function handleTapCard(selection: TableCardSelection): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    sendAction({ type: "tap-card", cardId: selection.cardId });
    closeCardActionUi(selection);
  }

  function handleToggleFaceDown(selection: TableCardSelection): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    sendAction({ type: "toggle-face-down", cardId: selection.cardId });
    closeCardActionUi(selection);
  }

  function handleTransformCard(selection: TableCardSelection): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    const card = findOwnedCard(selection);

    if (!card || card.visibility !== "public" || card.faceDown) {
      return;
    }

    const cachedCard = getCachedCardByName(card.name);

    if (!cachedCard || cachedCard.faces.length < 2) {
      return;
    }

    sendAction({ type: "transform-card", cardId: selection.cardId });
    closeCardActionUi(selection);
  }

  function handleSetCounter(
    selection: TableCardSelection,
    counter: string,
    value: number,
  ): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    sendAction({
      type: "set-counter",
      cardId: selection.cardId,
      counter,
      value,
    });
    closeCardActionUi(selection);
  }

  function handleSetCounterByDelta(
    selection: TableCardSelection,
    counter: string,
    delta: number,
  ): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    const card = findOwnedCard(selection);

    if (!card) {
      return;
    }

    const currentValue = card.counters[counter] ?? 0;
    handleSetCounter(selection, counter, Math.max(0, currentValue + delta));
  }

  function handleSetSpecificCounterValue(selection: TableCardSelection, counter: string): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    const card = findOwnedCard(selection);
    interaction.closeContextMenu();
    setCommandPrompt({
      defaultValue: String(card?.counters[counter] ?? 0),
      inputMode: "number",
      label: `Counters (${counter})`,
      title: "Set counter value",
      onSubmit: (value) => {
        const nextValue = Number.parseInt(value, 10);

        if (!Number.isFinite(nextValue) || nextValue < 0) {
          return;
        }

        setCommandPrompt(null);
        sendAction({
          type: "set-counter",
          cardId: selection.cardId,
          counter,
          value: nextValue,
        });
        interaction.selectCard(selection);
      },
    });
  }

  function handleSetCustomCounter(selection: TableCardSelection): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    interaction.closeContextMenu();
    setCommandPrompt({
      defaultValue: "Counter,+1",
      inputMode: "text",
      label: "Name,Value",
      title: "Set counter",
      onSubmit: (value) => {
        const [namePart, valuePart] = value.split(",");
        const counterName = (namePart ?? "").trim();
        const counterValue = Number.parseInt((valuePart ?? "0").trim(), 10);

        if (!counterName || !Number.isFinite(counterValue)) {
          return;
        }

        setCommandPrompt(null);
        sendAction({
          type: "set-counter",
          cardId: selection.cardId,
          counter: counterName,
          value: counterValue,
        });
        interaction.selectCard(selection);
      },
    });
  }

  function handleSetDoesNotUntap(selection: TableCardSelection, doesNotUntap: boolean): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    sendAction({ type: "set-does-not-untap", cardId: selection.cardId, doesNotUntap });
    closeCardActionUi(selection);
  }

  function handleSetAnnotation(selection: TableCardSelection): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    const card = findOwnedCard(selection);
    interaction.closeContextMenu();
    setCommandPrompt({
      defaultValue: card?.annotation ?? "",
      inputMode: "text",
      label: "Annotation",
      title: "Set annotation",
      onSubmit: (value) => {
        setCommandPrompt(null);
        sendAction({ type: "set-annotation", cardId: selection.cardId, annotation: value });
        interaction.selectCard(selection);
      },
    });
  }

  function handleSetPtModifier(selection: TableCardSelection): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    const card = findOwnedCard(selection);
    interaction.closeContextMenu();
    setCommandPrompt({
      defaultValue: `${card?.ptModifier?.power ?? 0},${card?.ptModifier?.toughness ?? 0}`,
      inputMode: "text",
      label: "Power,Toughness",
      title: "Set P/T modifier",
      onSubmit: (value) => {
        const [powerPart, toughnessPart] = value.split(",");
        const power = Number.parseInt((powerPart ?? "0").trim(), 10);
        const toughness = Number.parseInt((toughnessPart ?? "0").trim(), 10);

        if (!Number.isFinite(power) || !Number.isFinite(toughness)) {
          return;
        }

        setCommandPrompt(null);
        sendAction({ type: "set-pt-modifier", cardId: selection.cardId, power, toughness });
        interaction.selectCard(selection);
      },
    });
  }

  function handleAdjustPtModifier(
    selection: TableCardSelection,
    powerDelta: number,
    toughnessDelta: number,
  ): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    const card = findOwnedCard(selection);

    if (!card) {
      return;
    }

    const currentModifier = card.ptModifier ?? { power: 0, toughness: 0 };
    sendAction({
      type: "set-pt-modifier",
      cardId: selection.cardId,
      power: currentModifier.power + powerDelta,
      toughness: currentModifier.toughness + toughnessDelta,
    });
    closeCardActionUi(selection);
  }

  function handleResetPtModifier(selection: TableCardSelection): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    sendAction({ type: "set-pt-modifier", cardId: selection.cardId, power: 0, toughness: 0 });
    closeCardActionUi(selection);
  }

  function handleUnattachCard(selection: TableCardSelection): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    sendAction({ type: "unattach-card", cardId: selection.cardId });
    closeCardActionUi(selection);
  }

  function handlePeekAtFace(selection: TableCardSelection): void {
    const card = findContextCard(selection);

    if (!card) {
      return;
    }

    setInspectorEntry({
      card,
      locationLabel: selection.ownerPlayerId === currentPlayer?.id
        ? "On your battlefield"
        : "Peeked at opponent card",
    });
    interaction.closeContextMenu();
  }

  const tokenActions = useTableTokenActions({
    closeCardActionUi,
    currentPlayer,
    findOwnedCard: findContextCard,
    inspectorEntry,
    interaction,
    relatedCardsDialog,
    sendAction,
    setRelatedCardsDialog,
    setTokenDialog,
    tokenDialog,
  });

  const contextMenuItems = useTableContextMenu({
    onAttachToCard: handleAttachToCard,
    onAdjustPtModifier: handleAdjustPtModifier,
    onClearArrows: handleClearArrows,
    onCloneCard: handleCloneCard,
    currentPlayer,
    findContextCard,
    interaction,
    onDrawArrow: handleDrawArrow,
    onPeekAtFace: handlePeekAtFace,
    onCreateToken: tokenActions.handleOpenTokenDialog,
    onMoveCard: handleMoveCard,
    onMoveCardToLibrary: handleMoveCardToLibrary,
    onOpenRelatedCards: tokenActions.handleOpenRelatedCardsFromSelection,
    onPlayFaceDown: handlePlayFaceDown,
    onRevealCards: handleRevealCards,
    onSelectAllBattlefieldCards: handleSelectAllBattlefieldCards,
    onSelectBattlefieldRow: handleSelectBattlefieldRow,
    onSelectAllVisibleViewerCards: handleSelectAllVisibleViewerCards,
    onSelectViewerColumnCards: handleSelectViewerColumnCards,
    onSelectAllHand: handleSelectAllHand,
    onSetAnnotation: handleSetAnnotation,
    onSetCounter: handleSetCounter,
    onSetCounterByDelta: handleSetCounterByDelta,
    onSetCustomCounter: handleSetCustomCounter,
    onSetDoesNotUntap: handleSetDoesNotUntap,
    onSetSpecificCounterValue: handleSetSpecificCounterValue,
    onSetPtModifier: handleSetPtModifier,
    onResetPtModifier: handleResetPtModifier,
    otherPlayers,
    onTapCard: handleTapCard,
    onToggleFaceDown: handleToggleFaceDown,
    onTransformCard: handleTransformCard,
    onUnattachCard: handleUnattachCard,
    onHideViewerCards: handleHideViewerCards,
  });

  const activeContextMenuItems = interaction.contextMenu?.kind === "zone"
    ? zoneActions.zoneFieldMenuItems
    : contextMenuItems;

  return {
    activeContextMenuItems,
    canManageZoneView: zoneActions.canManageZoneView,
    zoneViewOwnerPlayerId: zoneActions.zoneViewOwnerPlayerId,
    handleConfirmTargeting,
    handleCreateRelatedToken: tokenActions.handleCreateRelatedToken,
    handleCreateToken: tokenActions.handleCreateToken,
    handleDeleteArrow,
    handleDragEnd,
    handleDragMove,
    handleMoveCard,
    handleOpenZone: zoneActions.handleOpenZone,
    handleOpenZoneContextMenu: zoneActions.handleOpenZoneContextMenu,
    handlePlayCard,
    handleStartArrowTargeting,
    handleSelectAllBattlefield,
    handleSelectBattlefieldCard,
    handleSelectHandCard,
    handleShuffleLibrary: zoneActions.handleShuffleLibrary,
    handleTapCard,
    handleToggleFaceDown,
    handleTransformCard,
    handleUndo,
    handleZoneViewMoveCard: zoneActions.handleZoneViewMoveCard,
  };
}
