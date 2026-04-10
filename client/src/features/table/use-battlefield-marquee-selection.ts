import type { CardView } from "@playmat/shared/table";
import { useCallback, useRef, useState } from "react";
import type { InspectorCard } from "./inspector";
import type { TableInteractionController } from "./use-table-interaction";

type MarqueeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
};

type MarqueeDragState = {
  pointerId: number;
  originX: number;
  originY: number;
  additive: boolean;
  selectedCardIdsAtStart: Set<string>;
};

type UseBattlefieldMarqueeSelectionArgs = {
  cards: CardView[];
  interaction: TableInteractionController;
  onInspect: (entry: InspectorCard | null) => void;
  ownerPlayerId: string;
};

type UseBattlefieldMarqueeSelectionResult = {
  marqueeRect: MarqueeRect | null;
  registerCardElement: (cardId: string, element: HTMLDivElement | null) => void;
  handlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
};

function intersects(
  left: number,
  top: number,
  width: number,
  height: number,
  otherLeft: number,
  otherTop: number,
  otherWidth: number,
  otherHeight: number,
): boolean {
  return (
    left < otherLeft + otherWidth &&
    left + width > otherLeft &&
    top < otherTop + otherHeight &&
    top + height > otherTop
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toggleIds(baseIds: Set<string>, idsInRect: Set<string>): Set<string> {
  const nextIds = new Set(baseIds);

  for (const id of idsInRect) {
    if (nextIds.has(id)) {
      nextIds.delete(id);
    } else {
      nextIds.add(id);
    }
  }

  return nextIds;
}

export function useBattlefieldMarqueeSelection({
  cards,
  interaction,
  onInspect,
  ownerPlayerId,
}: UseBattlefieldMarqueeSelectionArgs): UseBattlefieldMarqueeSelectionResult {
  const cardElementsRef = useRef(new Map<string, HTMLDivElement>());
  const dragStateRef = useRef<MarqueeDragState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  const registerCardElement = useCallback((cardId: string, element: HTMLDivElement | null) => {
    if (!element) {
      cardElementsRef.current.delete(cardId);
      return;
    }

    cardElementsRef.current.set(cardId, element);
  }, []);

  const finishMarquee = useCallback((element: HTMLDivElement, pointerId: number) => {
    dragStateRef.current = null;
    setMarqueeRect(null);

    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || event.target !== event.currentTarget || interaction.isDragging) {
        return;
      }

      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();
      const additive = event.metaKey || event.ctrlKey;
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const y = clamp(event.clientY - rect.top, 0, rect.height);

      interaction.closeContextMenu();
      onInspect(null);

      if (!additive) {
        interaction.clearSelection();
      }

      element.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        additive,
        originX: x,
        originY: y,
        pointerId: event.pointerId,
        selectedCardIdsAtStart: new Set(interaction.selectedCardIds),
      };
      setMarqueeRect({
        height: 0,
        left: x,
        top: y,
        visible: false,
        width: 0,
      });
    },
    [interaction, onInspect],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();
      const nextX = clamp(event.clientX - rect.left, 0, rect.width);
      const nextY = clamp(event.clientY - rect.top, 0, rect.height);
      const left = Math.min(dragState.originX, nextX);
      const top = Math.min(dragState.originY, nextY);
      const width = Math.abs(nextX - dragState.originX);
      const height = Math.abs(nextY - dragState.originY);
      const visible = width * width + height * height >= 16;

      setMarqueeRect({
        height,
        left,
        top,
        visible,
        width,
      });

      const idsInRect = new Set<string>();

      for (const [cardId, cardElement] of cardElementsRef.current) {
        const cardRect = cardElement.getBoundingClientRect();
        const cardLeft = cardRect.left - rect.left;
        const cardTop = cardRect.top - rect.top;

        if (
          intersects(left, top, width, height, cardLeft, cardTop, cardRect.width, cardRect.height)
        ) {
          idsInRect.add(cardId);
        }
      }

      const nextSelectedIds = dragState.additive
        ? toggleIds(dragState.selectedCardIdsAtStart, idsInRect)
        : idsInRect;

      interaction.setSelectedCards(
        cards
          .filter((card) => nextSelectedIds.has(card.id))
          .map((card) => ({
            cardId: card.id,
            ownerPlayerId,
            zone: "battlefield" as const,
          })),
      );
    },
    [cards, interaction, ownerPlayerId],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      finishMarquee(event.currentTarget, event.pointerId);
    },
    [finishMarquee],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      finishMarquee(event.currentTarget, event.pointerId);
    },
    [finishMarquee],
  );

  return {
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    marqueeRect,
    registerCardElement,
  };
}
