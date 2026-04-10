import type { CardView, ZoneName } from "@playmat/shared/table";
import type { MouseEventHandler } from "react";
import type { TableDragSourceHandlers } from "./drag-source-handlers";
import type { InspectorCard } from "./inspector";
import type { TableZoneTone } from "./table-zone-layout";

type ZoneSlotProps = {
  label: string;
  shortLabel: string;
  count: number;
  tone: TableZoneTone;
  previewCard: CardView | null;
  ownerLabel: string;
  dropOwnerPlayerId?: string;
  zoneName?: ZoneName;
  isDropTarget?: boolean;
  isDragSource?: boolean;
  dragHandlers?: Partial<TableDragSourceHandlers>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onInspect: (entry: InspectorCard | null) => void;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  hidePreview?: boolean;
  suppressInspect?: boolean;
};

export function ZoneSlot({
  label,
  shortLabel,
  count,
  tone,
  previewCard,
  ownerLabel,
  dropOwnerPlayerId,
  zoneName,
  isDropTarget = false,
  isDragSource = false,
  dragHandlers,
  onClick,
  onInspect,
  onContextMenu,
  hidePreview = false,
  suppressInspect = false,
}: ZoneSlotProps) {
  const canInspect = Boolean(
    previewCard &&
      previewCard.visibility === "public" &&
      !hidePreview &&
      !suppressInspect,
  );

  return (
    <button
      aria-label={`${label}: ${count}`}
      className={`game-table-zone-slot game-table-zone-slot-${tone}${isDropTarget ? " game-table-zone-slot-drop-active" : ""}${isDragSource ? " game-table-zone-slot-drag-source" : ""}`}
      data-drop-owner-player-id={dropOwnerPlayerId}
      data-drop-zone={zoneName}
      title={`${label}: ${count}`}
      type="button"
      {...dragHandlers}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => {
        if (!canInspect || !previewCard) {
          return;
        }

        onInspect({ card: previewCard, locationLabel: `On ${ownerLabel} ${label.toLowerCase()}` });
      }}
      onMouseLeave={() => onInspect(null)}
    >
      <span className="game-table-zone-slot-short">{shortLabel}</span>
      <span className="game-table-zone-slot-count">{count}</span>
    </button>
  );
}
