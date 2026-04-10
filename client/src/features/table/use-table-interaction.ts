import type { ZoneName } from "@playmat/shared/table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TableCardSelection = {
  cardId: string;
  initialRoll?: number;
  zone: ZoneName;
  ownerPlayerId: string;
};

export type TableGrabSnapshot = {
  anchorLocalX: number;
  anchorLocalY: number;
  anchorScreenX: number;
  anchorScreenY: number;
  roll: number;
  scale: number;
};

export type TableContextMenuState = TableCardSelection & {
  kind: "card";
  source?: "table" | "viewer";
  viewerColumnCardIds?: string[];
  viewerLayout?: "grid" | "list";
  viewerReadOnly?: boolean;
  viewerVisibleCardIds?: string[];
  x: number;
  y: number;
};

export type TableZoneContextMenuState = {
  kind: "zone";
  ownerPlayerId: string;
  x: number;
  y: number;
  zone: ZoneName;
};

export type TableAnyContextMenuState =
  | TableContextMenuState
  | TableZoneContextMenuState;

export type TableDragState = TableCardSelection & {
  selections: TableCardSelection[];
  grabSnapshot?: TableGrabSnapshot;
  restSnapshot?: TableGrabSnapshot;
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
};

export type TableSnapbackState = TableDragState & {
  returnX: number;
  returnY: number;
};

export type TableDropTarget = {
  zone: ZoneName;
  ownerPlayerId: string;
  x?: number;
  y?: number;
};

export type TableTargetingMode = {
  kind: "attach" | "arrow";
  pointerX: number;
  pointerY: number;
  sourceCardId: string;
  sourceFallbackX?: number;
  sourceFallbackY?: number;
  sourceOwnerPlayerId: string;
  sourceZone: ZoneName;
  validTargetKeys: Set<string>;
  hoveredTargetCardId: string | null;
  hoveredTargetOwnerPlayerId: string | null;
};

export type HandDropArrival = {
  cardId: string;
  screenX: number;
  screenY: number;
};

export type TableInteractionController = {
  selectedCard: TableCardSelection | null;
  selectedCards: TableCardSelection[];
  selectedCardId: string | null;
  selectedCardIds: Set<string>;
  contextMenu: TableAnyContextMenuState | null;
  dragState: TableDragState | null;
  snapbackState: TableSnapbackState | null;
  dropTarget: TableDropTarget | null;
  targetingMode: TableTargetingMode | null;
  isDragging: boolean;
  selectCard: (selection: TableCardSelection | null) => void;
  setSelectedCards: (selections: TableCardSelection[]) => void;
  toggleCardSelection: (selection: TableCardSelection) => void;
  isCardSelected: (selection: TableCardSelection) => boolean;
  clearSelection: () => void;
  openContextMenu: (menu: TableAnyContextMenuState) => void;
  closeContextMenu: () => void;
  setDropTarget: (target: TableDropTarget | null) => void;
  clearDropTarget: () => void;
  getDropTarget: () => TableDropTarget | null;
  startTargeting: (mode: Omit<TableTargetingMode, "hoveredTargetCardId" | "hoveredTargetOwnerPlayerId" | "pointerX" | "pointerY">) => void;
  updateTargetingPointer: (x: number, y: number) => void;
  getTargetingPointer: () => { x: number; y: number } | null;
  setTargetingHover: (cardId: string | null, ownerPlayerId: string | null) => void;
  cancelTargeting: () => void;
  setHandInsertionIndex: (index: number | null) => void;
  getHandInsertionIndex: () => number | null;
  setHandDropArrival: (arrival: HandDropArrival | null) => void;
  consumeHandDropArrival: () => HandDropArrival | null;
  startDrag: (dragState: TableDragState) => void;
  updateDrag: (position: Pick<TableDragState, "x" | "y" | "screenX" | "screenY">) => void;
  startSnapback: (dragState: TableDragState) => void;
  clearSnapback: () => void;
  finishDrag: () => TableDragState | null;
  cancelDrag: () => void;
  clearAll: () => void;
};

function selectionKey(selection: TableCardSelection): string {
  return `${selection.ownerPlayerId}:${selection.zone}:${selection.cardId}`;
}

function isSameSelection(
  left: TableCardSelection,
  right: TableCardSelection,
): boolean {
  return selectionKey(left) === selectionKey(right);
}

function isSameSelectionScope(
  left: TableCardSelection,
  right: TableCardSelection,
): boolean {
  return left.ownerPlayerId === right.ownerPlayerId && left.zone === right.zone;
}

function normalizeSelections(selections: TableCardSelection[]): TableCardSelection[] {
  if (selections.length === 0) {
    return [];
  }

  const scope = selections[selections.length - 1];

  if (!scope) {
    return [];
  }

  const uniqueKeys = new Set<string>();
  const normalized: TableCardSelection[] = [];

  for (const selection of selections) {
    if (!isSameSelectionScope(selection, scope)) {
      continue;
    }

    const key = selectionKey(selection);

    if (uniqueKeys.has(key)) {
      continue;
    }

    uniqueKeys.add(key);
    normalized.push(selection);
  }

  return normalized;
}

function toSelection(
  state: TableCardSelection | TableContextMenuState | TableDragState,
): TableCardSelection {
  return {
    cardId: state.cardId,
    zone: state.zone,
    ownerPlayerId: state.ownerPlayerId,
  };
}

export function useTableInteraction(): TableInteractionController {
  const [selectedCards, setSelectedCardsState] = useState<TableCardSelection[]>([]);
  const [contextMenu, setContextMenu] = useState<TableAnyContextMenuState | null>(null);
  const [dragState, setDragState] = useState<TableDragState | null>(null);
  const [snapbackState, setSnapbackState] = useState<TableSnapbackState | null>(null);
  const [dropTarget, setDropTarget] = useState<TableDropTarget | null>(null);
  const [targetingMode, setTargetingMode] = useState<TableTargetingMode | null>(null);
  const dragStateRef = useRef<TableDragState | null>(null);
  const dropTargetRef = useRef<TableDropTarget | null>(null);
  const targetingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const handInsertionIndexRef = useRef<number | null>(null);
  const handDropArrivalRef = useRef<HandDropArrival | null>(null);

  const setSelectedCards = useCallback((selections: TableCardSelection[]) => {
    setSelectedCardsState(normalizeSelections(selections));
  }, []);

  const selectCard = useCallback((selection: TableCardSelection | null) => {
    setSelectedCardsState(selection ? [selection] : []);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCardsState([]);
  }, []);

  const toggleCardSelection = useCallback((selection: TableCardSelection) => {
    setSelectedCardsState((currentSelections) => {
      if (currentSelections.length === 0) {
        return [selection];
      }

      const scope = currentSelections[currentSelections.length - 1];

      if (!scope || !isSameSelectionScope(scope, selection)) {
        return [selection];
      }

      if (currentSelections.some((entry) => isSameSelection(entry, selection))) {
        return currentSelections.filter((entry) => !isSameSelection(entry, selection));
      }

      return normalizeSelections([...currentSelections, selection]);
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const cancelDrag = useCallback(() => {
    dragStateRef.current = null;
    dropTargetRef.current = null;
    setDragState(null);
    setDropTarget(null);
    targetingPointerRef.current = null;
    setTargetingMode(null);
  }, []);

  const clearSnapback = useCallback(() => {
    setSnapbackState(null);
  }, []);

  const clearAll = useCallback(() => {
    setSelectedCardsState([]);
    setContextMenu(null);
    dragStateRef.current = null;
    dropTargetRef.current = null;
    targetingPointerRef.current = null;
    setDragState(null);
    setSnapbackState(null);
    setDropTarget(null);
    setTargetingMode(null);
  }, []);

  const cancelTargeting = useCallback(() => {
    targetingPointerRef.current = null;
    setTargetingMode(null);
  }, []);

  const startTargeting = useCallback((mode: Omit<TableTargetingMode, "hoveredTargetCardId" | "hoveredTargetOwnerPlayerId" | "pointerX" | "pointerY">) => {
    dragStateRef.current = null;
    dropTargetRef.current = null;
    targetingPointerRef.current = {
      x: mode.sourceFallbackX ?? 0,
      y: mode.sourceFallbackY ?? 0,
    };
    setDragState(null);
    setDropTarget(null);
    setTargetingMode({
      ...mode,
      pointerX: mode.sourceFallbackX ?? 0,
      pointerY: mode.sourceFallbackY ?? 0,
      hoveredTargetCardId: null,
      hoveredTargetOwnerPlayerId: null,
    });
  }, []);

  const updateTargetingPointer = useCallback((x: number, y: number) => {
    targetingPointerRef.current = { x, y };
    setTargetingMode((currentValue) => {
      if (!currentValue) {
        return currentValue;
      }

      if (currentValue.pointerX === x && currentValue.pointerY === y) {
        return currentValue;
      }

      return {
        ...currentValue,
        pointerX: x,
        pointerY: y,
      };
    });
  }, []);

  const getTargetingPointer = useCallback(() => targetingPointerRef.current, []);

  const setTargetingHover = useCallback((cardId: string | null, ownerPlayerId: string | null) => {
    setTargetingMode((currentValue) => {
      if (!currentValue) {
        return currentValue;
      }

      if (
        currentValue.hoveredTargetCardId === cardId
        && currentValue.hoveredTargetOwnerPlayerId === ownerPlayerId
      ) {
        return currentValue;
      }

      return {
        ...currentValue,
        hoveredTargetCardId: cardId,
        hoveredTargetOwnerPlayerId: ownerPlayerId,
      };
    });
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = () => {
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const selectedCard = selectedCards[selectedCards.length - 1] ?? null;
  const selectedCardIds = useMemo(
    () => new Set(selectedCards.map((selection) => selection.cardId)),
    [selectedCards],
  );
  const isCardSelected = useCallback(
    (selection: TableCardSelection) =>
      selectedCards.some((entry) => isSameSelection(entry, selection)),
    [selectedCards],
  );

  return {
    selectedCard,
    selectedCards,
    selectedCardId: selectedCard?.cardId ?? null,
    selectedCardIds,
    contextMenu,
    dragState,
    snapbackState,
    dropTarget,
    targetingMode,
    isDragging: dragState !== null,
    selectCard,
    setSelectedCards,
    toggleCardSelection,
    isCardSelected,
    clearSelection,
    openContextMenu: useCallback((menu) => {
      setContextMenu(menu);
    }, []),
    closeContextMenu,
    setDropTarget: useCallback((target) => {
      dropTargetRef.current = target;
      setDropTarget(target);
    }, []),
    clearDropTarget: useCallback(() => {
      dropTargetRef.current = null;
      setDropTarget(null);
    }, []),
    getDropTarget: useCallback(() => dropTargetRef.current, []),
    startTargeting,
    updateTargetingPointer,
    getTargetingPointer,
    setTargetingHover,
    cancelTargeting,
    setHandInsertionIndex: useCallback((index: number | null) => {
      handInsertionIndexRef.current = index;
    }, []),
    getHandInsertionIndex: useCallback(() => handInsertionIndexRef.current, []),
    setHandDropArrival: useCallback((arrival: HandDropArrival | null) => {
      handDropArrivalRef.current = arrival;
    }, []),
    consumeHandDropArrival: useCallback(() => {
      const arrival = handDropArrivalRef.current;
      handDropArrivalRef.current = null;
      return arrival;
    }, []),
    startDrag: useCallback((nextDragState) => {
      setSelectedCardsState(
        normalizeSelections(
          nextDragState.selections.length > 0
            ? nextDragState.selections
            : [toSelection(nextDragState)],
        ),
      );
      setContextMenu(null);
      targetingPointerRef.current = null;
      dragStateRef.current = nextDragState;
      dropTargetRef.current = null;
      setDragState(nextDragState);
      setSnapbackState(null);
      setDropTarget(null);
      setTargetingMode(null);
    }, []),
    updateDrag: useCallback((position) => {
      setDragState((currentState) => {
        if (!currentState) {
          return currentState;
        }

        const nextDragState = {
          ...currentState,
          ...position,
          moved: currentState.moved,
        };

        const deltaX = nextDragState.x - currentState.originX;
        const deltaY = nextDragState.y - currentState.originY;

        if (!nextDragState.moved && deltaX * deltaX + deltaY * deltaY >= 25) {
          nextDragState.moved = true;
        }

        dragStateRef.current = nextDragState;
        return nextDragState;
      });
    }, []),
    startSnapback: useCallback((finishedDragState) => {
      setSnapbackState({
        ...finishedDragState,
        returnX: finishedDragState.restSnapshot?.anchorScreenX ?? finishedDragState.originX,
        returnY: finishedDragState.restSnapshot?.anchorScreenY ?? finishedDragState.originY,
      });
    }, []),
    clearSnapback,
    finishDrag: useCallback(() => {
      const currentState = dragStateRef.current;
      dragStateRef.current = null;
      dropTargetRef.current = null;
      setDragState(null);
      setDropTarget(null);
      return currentState;
    }, []),
    cancelDrag,
    clearAll,
  };
}
