import type { CardView, PlayerView, ZoneName } from "@playmat/shared/table";
import { useMemo } from "react";
import { useCardDetail } from "../../lib/card-api";
import {
  buildCardContextMenuItems,
  buildReadonlyBattlefieldCardContextMenuItems,
  buildViewerCardContextMenuItems,
} from "./context-menu-items";
import type { ContextMenuItem } from "./context-menu";
import { getActionSelections, hasUsableRelatedCards } from "./table-action-helpers";
import type {
  TableCardSelection,
  TableContextMenuState,
  TableInteractionController,
} from "./use-table-interaction";

type TableContextMenuHandlers = {
  onAttachToCard: (selection: TableCardSelection) => void;
  onClearArrows: (selection: TableCardSelection) => void;
  onCloneCard: (selection: TableCardSelection) => void;
  onCreateToken: (selection: TableCardSelection) => void;
  onDrawArrow: (selection: TableCardSelection) => void;
  onAdjustPtModifier: (selection: TableCardSelection, powerDelta: number, toughnessDelta: number) => void;
  onPeekAtFace: (selection: TableCardSelection) => void;
  onMoveCard: (selection: TableCardSelection, to: ZoneName) => void;
  onMoveCardToLibrary: (
    selection: TableCardSelection,
    options: { promptForOffset?: boolean; toIndex?: number; toPosition: "top" | "bottom" },
  ) => void;
  onOpenRelatedCards: (selection: TableCardSelection) => void;
  onPlayFaceDown: (selection: TableCardSelection) => void;
  onRevealCards: (selection: TableCardSelection, targetPlayerId: string | "all") => void;
  onSelectAllBattlefieldCards: (selection: TableCardSelection) => void;
  onSelectBattlefieldRow: (selection: TableCardSelection) => void;
  onSelectAllVisibleViewerCards: (selection: TableCardSelection) => void;
  onSelectViewerColumnCards: (selection: TableCardSelection) => void;
  onSelectAllHand: () => void;
  onSetAnnotation: (selection: TableCardSelection) => void;
  onSetCounter: (selection: TableCardSelection, counter: string, value: number) => void;
  onSetCounterByDelta: (selection: TableCardSelection, counter: string, delta: number) => void;
  onSetCustomCounter: (selection: TableCardSelection) => void;
  onSetDoesNotUntap: (selection: TableCardSelection, doesNotUntap: boolean) => void;
  onSetSpecificCounterValue: (selection: TableCardSelection, counter: string) => void;
  onSetPtModifier: (selection: TableCardSelection) => void;
  onResetPtModifier: (selection: TableCardSelection) => void;
  onTapCard: (selection: TableCardSelection) => void;
  onToggleFaceDown: (selection: TableCardSelection) => void;
  onTransformCard: (selection: TableCardSelection) => void;
  onUnattachCard: (selection: TableCardSelection) => void;
  onHideViewerCards: (selection: TableCardSelection) => void;
};

type UseTableContextMenuArgs = TableContextMenuHandlers & {
  currentPlayer: PlayerView | null;
  findContextCard: (selection: TableCardSelection | null) => CardView | null;
  interaction: TableInteractionController;
  otherPlayers: PlayerView[];
};

function getCardContextMenu(
  contextMenu: TableInteractionController["contextMenu"],
): TableContextMenuState | null {
  if (!contextMenu || contextMenu.kind !== "card") {
    return null;
  }

  return contextMenu;
}

function getContextSelectionCount(
  contextMenu: TableContextMenuState | null,
  selectedCards: TableCardSelection[],
): number {
  if (!contextMenu) {
    return 0;
  }

  return getActionSelections(contextMenu, selectedCards).length;
}

export function useTableContextMenu({
  onAttachToCard,
  onClearArrows,
  onCloneCard,
  onAdjustPtModifier,
  currentPlayer,
  findContextCard,
  interaction,
  onDrawArrow,
  onPeekAtFace,
  onCreateToken,
  onMoveCard,
  onMoveCardToLibrary,
  onOpenRelatedCards,
  onPlayFaceDown,
  onRevealCards,
  onSelectAllBattlefieldCards,
  onSelectBattlefieldRow,
  onSelectAllVisibleViewerCards,
  onSelectViewerColumnCards,
  onSelectAllHand,
  onSetAnnotation,
  otherPlayers,
  onSetCounter,
  onSetCounterByDelta,
  onSetCustomCounter,
  onSetDoesNotUntap,
  onSetSpecificCounterValue,
  onSetPtModifier,
  onResetPtModifier,
  onTapCard,
  onToggleFaceDown,
  onTransformCard,
  onUnattachCard,
  onHideViewerCards,
}: UseTableContextMenuArgs): ContextMenuItem[] {
  const cardContextMenu = getCardContextMenu(interaction.contextMenu);
  const contextCard = findContextCard(cardContextMenu);
  const contextSelectionCount = getContextSelectionCount(cardContextMenu, interaction.selectedCards);
  const contextDetailedCard = useCardDetail(
    contextCard?.visibility === "public" ? contextCard.name : null,
  );
  const canTransform = Boolean(
    contextCard
      && contextCard.visibility === "public"
      && !contextCard.faceDown
      && (contextDetailedCard?.faces.length ?? 0) > 1,
  );
  const canShowRelatedCards = hasUsableRelatedCards(contextDetailedCard);

  return useMemo(() => {
    if (!currentPlayer || !cardContextMenu) {
      return [];
    }

    if (cardContextMenu.source === "viewer") {
      return buildViewerCardContextMenuItems(
        cardContextMenu,
        contextSelectionCount,
        {
          onCreateToken,
          onAttachToCard,
          onClearArrows,
          onCloneCard,
          onDrawArrow,
          onAdjustPtModifier,
          onPeekAtFace,
          onMoveCard,
          onMoveCardToLibrary,
          onOpenRelatedCards,
          onPlayFaceDown,
          onRevealCards,
          onSelectAllBattlefieldCards,
          onSelectBattlefieldRow,
          onSelectAllHand,
          onSetAnnotation,
          onSelectAllVisibleViewerCards,
          onSelectViewerColumnCards,
          onSetCounter,
          onSetCounterByDelta,
          onSetCustomCounter,
          onSetDoesNotUntap,
          onSetSpecificCounterValue,
          onSetPtModifier,
          onResetPtModifier,
          onTapCard,
          onToggleFaceDown,
          onTransformCard,
          onUnattachCard,
          onHideViewerCards,
        },
        otherPlayers,
        {
          canShowRelatedCards,
          canTransform,
          readOnly: cardContextMenu.viewerReadOnly ?? cardContextMenu.ownerPlayerId !== currentPlayer.id,
          viewerSupportsColumnSelection: cardContextMenu.viewerLayout !== "list",
        },
      );
    }

    if (cardContextMenu.ownerPlayerId !== currentPlayer.id) {
      if (cardContextMenu.zone === "battlefield") {
        return buildReadonlyBattlefieldCardContextMenuItems(
          cardContextMenu,
          contextSelectionCount,
          {
            onCreateToken,
            onAttachToCard,
            onClearArrows,
            onCloneCard,
            onDrawArrow,
            onAdjustPtModifier,
            onPeekAtFace,
            onMoveCard,
            onMoveCardToLibrary,
            onOpenRelatedCards,
            onPlayFaceDown,
            onRevealCards,
            onSelectAllBattlefieldCards,
            onSelectBattlefieldRow,
            onSelectAllHand,
            onSelectAllVisibleViewerCards,
            onSelectViewerColumnCards,
            onSetAnnotation,
            onSetCounter,
            onSetCounterByDelta,
            onSetCustomCounter,
            onSetDoesNotUntap,
            onSetSpecificCounterValue,
            onSetPtModifier,
            onResetPtModifier,
            onTapCard,
            onToggleFaceDown,
            onTransformCard,
            onUnattachCard,
            onHideViewerCards,
          },
          {
            canShowRelatedCards,
            canTransform,
          },
        );
      }

      return [];
    }

    return buildCardContextMenuItems(
      cardContextMenu,
      contextCard,
      contextSelectionCount,
      {
        onCreateToken,
        onAttachToCard,
        onClearArrows,
        onCloneCard,
        onDrawArrow,
        onAdjustPtModifier,
        onPeekAtFace,
        onMoveCard,
        onMoveCardToLibrary,
        onOpenRelatedCards,
        onPlayFaceDown,
        onRevealCards,
        onSelectAllBattlefieldCards,
        onSelectBattlefieldRow,
        onSelectAllHand,
        onSetAnnotation,
        onSelectAllVisibleViewerCards,
        onSelectViewerColumnCards,
        onSetCounter,
        onSetCounterByDelta,
        onSetCustomCounter,
        onSetDoesNotUntap,
        onSetSpecificCounterValue,
        onSetPtModifier,
        onResetPtModifier,
        onTapCard,
        onToggleFaceDown,
        onTransformCard,
        onUnattachCard,
        onHideViewerCards,
      },
      otherPlayers,
      {
        canShowRelatedCards,
        canTransform,
      },
    );
  }, [
    canShowRelatedCards,
    canTransform,
    cardContextMenu,
    contextCard,
    contextSelectionCount,
    currentPlayer,
    onAttachToCard,
    onCloneCard,
    onCreateToken,
    onDrawArrow,
    onAdjustPtModifier,
    onPeekAtFace,
    onMoveCard,
    onMoveCardToLibrary,
    onOpenRelatedCards,
    onPlayFaceDown,
    onRevealCards,
    onSelectAllBattlefieldCards,
    onSelectBattlefieldRow,
    onSelectAllVisibleViewerCards,
    onSelectViewerColumnCards,
    onSelectAllHand,
    onSetAnnotation,
    otherPlayers,
    onSetCounter,
    onSetCounterByDelta,
    onSetCustomCounter,
    onSetDoesNotUntap,
    onSetSpecificCounterValue,
    onSetPtModifier,
    onResetPtModifier,
    onTapCard,
    onToggleFaceDown,
    onTransformCard,
    onUnattachCard,
    onHideViewerCards,
  ]);
}
