import type { ClientAction } from "@playmat/shared/actions";
import type { ZoneName } from "@playmat/shared/table";
import { useEffect, useRef } from "react";
import type {
  TableCardSelection,
  TableInteractionController,
} from "./use-table-interaction";

type TableShortcutCallbacks = {
  onClearInspector: () => void;
  onMoveCard: (selection: TableCardSelection, to: ZoneName) => void;
  onSelectAllBattlefield: () => void;
  onShuffleLibrary: () => void;
  onTapCard: (selection: TableCardSelection) => void;
  onToggleFaceDown: (selection: TableCardSelection) => void;
  onTransformCard: (selection: TableCardSelection) => void;
  onUndo: () => void;
  sendAction: (action: ClientAction) => void;
};

export function useTableShortcuts(
  interaction: TableInteractionController,
  currentPlayerId: string | null,
  callbacks: TableShortcutCallbacks,
): void {
  const callbacksRef = useRef(callbacks);
  const currentPlayerIdRef = useRef(currentPlayerId);
  const interactionRef = useRef(interaction);

  callbacksRef.current = callbacks;
  currentPlayerIdRef.current = currentPlayerId;
  interactionRef.current = interaction;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentInteraction = interactionRef.current;
      const currentCallbacks = callbacksRef.current;
      const target = event.target;

      if (target instanceof HTMLElement) {
        const tagName = target.tagName;

        if (
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const key = event.key.toLowerCase();
      const hasCommandModifier = event.metaKey || event.ctrlKey;

      if (key === "escape") {
        if (currentInteraction.isDragging) {
          currentInteraction.cancelDrag();
        }

        currentInteraction.closeContextMenu();
        currentInteraction.clearSelection();
        currentCallbacks.onClearInspector();
        return;
      }

      if (hasCommandModifier && key === "z") {
        event.preventDefault();
        currentCallbacks.onUndo();
        return;
      }

      if (hasCommandModifier && key === "a") {
        event.preventDefault();
        currentCallbacks.onSelectAllBattlefield();
        return;
      }

      if (key === "d") {
        event.preventDefault();
        currentCallbacks.sendAction({ type: "draw", count: 1 });
        return;
      }

      if (key === "s") {
        event.preventDefault();
        currentCallbacks.onShuffleLibrary();
        return;
      }

      const selectedCard = currentInteraction.selectedCard;

      if (
        !currentPlayerIdRef.current ||
        !selectedCard ||
        selectedCard.ownerPlayerId !== currentPlayerIdRef.current
      ) {
        return;
      }

      if (
        key === "t" &&
        currentInteraction.selectedCards.length === 1 &&
        selectedCard.zone === "battlefield"
      ) {
        event.preventDefault();
        currentCallbacks.onTapCard(selectedCard);
        return;
      }

      if (
        key === "f" &&
        currentInteraction.selectedCards.length === 1 &&
        selectedCard.zone === "battlefield"
      ) {
        event.preventDefault();
        currentCallbacks.onToggleFaceDown(selectedCard);
        return;
      }

      if (
        key === "r" &&
        currentInteraction.selectedCards.length === 1 &&
        selectedCard.zone === "battlefield"
      ) {
        event.preventDefault();
        currentCallbacks.onTransformCard(selectedCard);
        return;
      }

      if (key === "g") {
        event.preventDefault();
        currentCallbacks.onMoveCard(selectedCard, "graveyard");
        return;
      }

      if (key === "x") {
        event.preventDefault();
        currentCallbacks.onMoveCard(selectedCard, "exile");
        return;
      }

      if (key === "h") {
        event.preventDefault();
        currentCallbacks.onMoveCard(selectedCard, "hand");
        return;
      }

      if (key === "l") {
        event.preventDefault();
        currentCallbacks.onMoveCard(selectedCard, "library");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
