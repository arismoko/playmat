import type { ClientAction } from "@playmat/shared/actions";
import type { CardView, PlayerView } from "@playmat/shared/table";
import { getCachedCardByName, type CardResult } from "../../lib/card-api";
import {
  BATTLEFIELD_MULTI_SPREAD_X,
  BATTLEFIELD_MULTI_SPREAD_Y,
  buildCreateTokenAction,
  hasUsableRelatedCards,
} from "./table-action-helpers";
import type { InspectorCard } from "./inspector";
import type { TableCardSelection, TableInteractionController } from "./use-table-interaction";
import type { RelatedCardsDialogState, TokenDialogState } from "./use-table-ui-state";

type UseTableTokenActionsArgs = {
  closeCardActionUi: (selection: TableCardSelection) => void;
  currentPlayer: PlayerView | null;
  findOwnedCard: (selection: TableCardSelection | null) => CardView | null;
  inspectorEntry: InspectorCard | null;
  interaction: TableInteractionController;
  relatedCardsDialog: RelatedCardsDialogState | null;
  sendAction: (action: ClientAction) => void;
  setRelatedCardsDialog: (state: RelatedCardsDialogState | null) => void;
  setTokenDialog: (state: TokenDialogState | null) => void;
  tokenDialog: TokenDialogState | null;
};

export type UseTableTokenActionsResult = {
  handleCreateRelatedToken: (token: CardResult) => void;
  handleCreateToken: (token: CardResult, count: number) => void;
  handleOpenRelatedCardsFromSelection: (selection: TableCardSelection) => void;
  handleOpenTokenDialog: (selection: TableCardSelection) => void;
};

function getTokenPosition(card: CardView): { x: number; y: number } {
  return {
    x: card.x + BATTLEFIELD_MULTI_SPREAD_X,
    y: card.y + BATTLEFIELD_MULTI_SPREAD_Y,
  };
}

export function useTableTokenActions({
  closeCardActionUi,
  currentPlayer,
  findOwnedCard,
  inspectorEntry,
  interaction,
  relatedCardsDialog,
  sendAction,
  setRelatedCardsDialog,
  setTokenDialog,
  tokenDialog,
}: UseTableTokenActionsArgs): UseTableTokenActionsResult {
  function getInspectorBattlefieldCard(): CardView | null {
    if (!inspectorEntry || !currentPlayer) {
      return null;
    }

    return currentPlayer.zones.battlefield.find((card) => card.id === inspectorEntry.card.id) ?? null;
  }

  function openRelatedCards(
    sourceCard: CardResult,
    sourceSelection: CardView | null = null,
    options?: { canCreateTokens?: boolean },
  ): void {
    const resolvedSelection = sourceSelection ?? getInspectorBattlefieldCard();
    const position = resolvedSelection ? getTokenPosition(resolvedSelection) : null;

    setRelatedCardsDialog({
      canCreateTokens: options?.canCreateTokens ?? Boolean(resolvedSelection),
      sourceCard,
      x: position?.x,
      y: position?.y,
    });
  }

  function handleOpenTokenDialog(selection: TableCardSelection): void {
    if (selection.zone !== "battlefield") {
      return;
    }

    const card = findOwnedCard(selection);

    if (!card) {
      return;
    }

    setTokenDialog({
      sourceCardName: card.name,
      ...getTokenPosition(card),
    });
    closeCardActionUi(selection);
  }

  function handleCreateToken(token: CardResult, count: number): void {
    if (!tokenDialog) {
      return;
    }

    sendAction(buildCreateTokenAction(token, count, tokenDialog));
    setTokenDialog(null);
  }

  function handleOpenRelatedCardsFromSelection(selection: TableCardSelection): void {
    const sourceSelection = findOwnedCard(selection);

    if (!sourceSelection || sourceSelection.visibility !== "public") {
      return;
    }

    const cachedCard = getCachedCardByName(sourceSelection.name);

    if (!cachedCard || !hasUsableRelatedCards(cachedCard)) {
      return;
    }

    openRelatedCards(cachedCard, sourceSelection, {
      canCreateTokens: selection.zone === "battlefield" && Boolean(sourceSelection),
    });
    interaction.closeContextMenu();
  }

  function handleCreateRelatedToken(token: CardResult): void {
    sendAction(buildCreateTokenAction(token, 1, relatedCardsDialog ?? undefined));
    setRelatedCardsDialog(null);
  }

  return {
    handleCreateRelatedToken,
    handleCreateToken,
    handleOpenRelatedCardsFromSelection,
    handleOpenTokenDialog,
  };
}
