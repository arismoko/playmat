import type { PointerEvent as ReactPointerEvent } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  TableCardSelection,
  TableDragState,
  TableDropTarget,
  TableInteractionController,
} from "./use-table-interaction";

export type TableDragMovePayload = {
  clientX: number;
  clientY: number;
  height: number;
  left: number;
  offsetX: number;
  offsetY: number;
  top: number;
  width: number;
};

type BuildTableDragSourceHandlersArgs = {
  interaction: TableInteractionController;
  getDragStateExtras?: (
    event: ReactPointerEvent<HTMLElement>,
    rect: DOMRect,
  ) => Partial<TableDragState>;
  selection: TableCardSelection;
  onDrop: (
    selection: TableCardSelection,
    finishedDrag: TableDragState,
    dropTarget: TableDropTarget | null,
  ) => boolean;
  onMove: (selection: TableCardSelection, payload: TableDragMovePayload) => void;
  onNoMove?: (
    selection: TableCardSelection,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  openContextMenuOnRightClick?: boolean;
};

export type TableDragSourceHandlers = ReturnType<
  typeof buildTableDragSourceHandlers
>;

export function buildTableDragSourceHandlers({
  interaction,
  getDragStateExtras,
  selection,
  onDrop,
  onMove,
  onNoMove,
  openContextMenuOnRightClick = true,
}: BuildTableDragSourceHandlersArgs) {
  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        onNoMove?.(selection, event);
        return;
      }

      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();
      const dragStateExtras = getDragStateExtras?.(event, rect) ?? {};
      const dragSelections =
        interaction.isCardSelected(selection) ? interaction.selectedCards : [selection];

      element.setPointerCapture(event.pointerId);

      interaction.startDrag({
        ...selection,
        selections: dragSelections,
        moved: false,
        height: rect.height,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        originX: rect.left,
        originY: rect.top,
        pointerId: event.pointerId,
        screenX: event.clientX,
        screenY: event.clientY,
        width: rect.width,
        x: rect.left,
        y: rect.top,
        ...dragStateExtras,
      });
    },

    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const dragState = interaction.dragState;

      if (
        !dragState ||
        dragState.cardId !== selection.cardId ||
        dragState.zone !== selection.zone ||
        dragState.ownerPlayerId !== selection.ownerPlayerId ||
        dragState.pointerId !== event.pointerId
      ) {
        return;
      }

      onMove(selection, {
        clientX: event.clientX,
        clientY: event.clientY,
        height: dragState.height,
        left: event.clientX - dragState.offsetX,
        offsetX: dragState.offsetX,
        offsetY: dragState.offsetY,
        top: event.clientY - dragState.offsetY,
        width: dragState.width,
      });
    },

    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const dragState = interaction.dragState;

      if (
        !dragState ||
        dragState.cardId !== selection.cardId ||
        dragState.zone !== selection.zone ||
        dragState.ownerPlayerId !== selection.ownerPlayerId ||
        dragState.pointerId !== event.pointerId
      ) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const dropTarget = interaction.getDropTarget();
      const finishedDrag = interaction.finishDrag();

      if (!finishedDrag) {
        return;
      }

      if (!finishedDrag.moved) {
        onNoMove?.(selection, event);
        return;
      }

      const handled = onDrop(selection, finishedDrag, dropTarget);

      if (!handled) {
        interaction.clearSelection();
        interaction.startSnapback(finishedDrag);
      }
    },

    onContextMenu(event: ReactMouseEvent<HTMLElement>) {
      if (!openContextMenuOnRightClick) {
        return;
      }

      event.preventDefault();

      if (!interaction.isCardSelected(selection)) {
        interaction.selectCard(selection);
      }

      interaction.openContextMenu({
        ...selection,
        kind: "card",
        source: "table",
        x: event.clientX,
        y: event.clientY,
      });
    },

    onPointerCancel() {
      if (
        interaction.dragState?.cardId === selection.cardId &&
        interaction.dragState.zone === selection.zone &&
        interaction.dragState.ownerPlayerId === selection.ownerPlayerId
      ) {
        interaction.cancelDrag();
      }
    },
  };
}
