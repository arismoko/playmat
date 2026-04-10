import type { PlayerView, ZoneName } from "@playmat/shared/table";
import { useEffect, useRef, type MouseEventHandler, type PointerEvent as ReactPointerEvent } from "react";
import {
  buildTableDragSourceHandlers,
  type TableDragMovePayload,
} from "./drag-source-handlers";
import type { InspectorCard } from "./inspector";
import { TableCard } from "./table-card";
import { getCurrentPlayerZoneLayout, type TableZoneSlot } from "./table-zone-layout";
import { useBattlefieldMarqueeSelection } from "./use-battlefield-marquee-selection";
import type {
  TableCardSelection,
  TableDragState,
  TableDropTarget,
  TableInteractionController,
} from "./use-table-interaction";
import { ZoneSlot } from "./zone-slot";

type PlayerHalfProps = {
  player: PlayerView | null;
  onBattlefieldDragEnd: (
    selection: TableCardSelection,
    finishedDrag: TableDragState,
    dropTarget: TableDropTarget | null,
  ) => boolean;
  onBattlefieldDragMove: (
    selection: TableCardSelection,
    payload: TableDragMovePayload,
  ) => void;
  onInspect: (entry: InspectorCard | null) => void;
  onOpenZone: (zone: ZoneName) => void;
  onOpenZoneContextMenu: (zone: ZoneName) => MouseEventHandler<HTMLButtonElement>;
  onStartArrowDrag: (selection: TableCardSelection) => void;
  onSelectBattlefieldCard: (
    selection: TableCardSelection,
    options?: { additive: boolean; clickCount?: number },
  ) => void;
  onTapBattlefieldCard: (selection: TableCardSelection) => void;
  interaction: TableInteractionController;
};

function isDropTarget(
  interaction: TableInteractionController,
  ownerPlayerId: string,
  zoneName: TableZoneSlot["zoneName"],
): boolean {
  return (
    interaction.dropTarget?.ownerPlayerId === ownerPlayerId &&
    interaction.dropTarget.zone === zoneName
  );
}

function isDraggedBattlefieldCard(
  interaction: TableInteractionController,
  cardId: string,
): boolean {
  return (
    ((interaction.dragState?.moved === true &&
      interaction.dragState.zone === "battlefield" &&
      interaction.dragState.selections.some((selection) => selection.cardId === cardId)) ||
      (interaction.snapbackState?.zone === "battlefield" &&
        interaction.snapbackState.selections.some((selection) => selection.cardId === cardId)))
  );
}

function getAttachedBattlefieldPosition(
  player: PlayerView,
  cardId: string,
): { x: number; y: number } | null {
  const card = player.zones.battlefield.find((entry) => entry.id === cardId);

  if (!card || !card.attachedToCardId || card.attachedToOwnerPlayerId !== player.id) {
    return null;
  }

  const targetCard = player.zones.battlefield.find((entry) => entry.id === card.attachedToCardId);

  if (!targetCard) {
    return null;
  }

  const attachmentIndex = player.zones.battlefield
    .filter(
      (entry) =>
        entry.attachedToCardId === card.attachedToCardId
        && entry.attachedToOwnerPlayerId === player.id,
    )
    .findIndex((entry) => entry.id === card.id);

  return {
    x: targetCard.x + 22 + Math.max(0, attachmentIndex) * 18,
    y: targetCard.y + 16 + Math.max(0, attachmentIndex) * 14,
  };
}

export function PlayerHalf({
  player,
  onBattlefieldDragEnd,
  onBattlefieldDragMove,
  onInspect,
  onOpenZone,
  onOpenZoneContextMenu,
  onStartArrowDrag,
  onSelectBattlefieldCard,
  onTapBattlefieldCard,
  interaction,
}: PlayerHalfProps) {
  const clickTimerRef = useRef<number | null>(null);
  const pendingClickRef = useRef<{ at: number; cardId: string } | null>(null);
  const rightArrowDragRef = useRef<{
    cardId: string;
    ownerPlayerId: string;
    pointerId: number;
    startX: number;
    startY: number;
    started: boolean;
  } | null>(null);
  const suppressContextMenuCardIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }

      pendingClickRef.current = null;
      rightArrowDragRef.current = null;
      suppressContextMenuCardIdRef.current = null;
    };
  }, []);

  if (!player) {
    return (
      <section className="game-table-half">
        <div className="game-table-half-empty">Claiming your seat...</div>
      </section>
    );
  }

  const supportsZoneContextMenu = (zoneName: ZoneName): boolean =>
    zoneName === "library"
    || zoneName === "graveyard"
    || zoneName === "exile"
    || zoneName === "sideboard";

  const { rightSlots } = getCurrentPlayerZoneLayout(player);
  const marqueeSelection = useBattlefieldMarqueeSelection({
    cards: player.zones.battlefield,
    interaction,
    onInspect,
    ownerPlayerId: player.id,
  });

  const getZoneSlotDragHandlers = (slot: TableZoneSlot) => {
    const previewCard = slot.previewCard;

    if (!previewCard) {
      return undefined;
    }

    return buildTableDragSourceHandlers({
      interaction,
      onDrop: onBattlefieldDragEnd,
      onMove: onBattlefieldDragMove,
      onNoMove: () => onOpenZone(slot.zoneName),
      selection: {
        cardId: previewCard.id,
        ownerPlayerId: player.id,
        zone: slot.zoneName,
      },
    });
  };

  return (
    <section className="game-table-half game-table-half-player">
      <div className="game-table-half-body">
        <div
          className={`game-table-battlefield${interaction.isDragging ? " game-table-battlefield-dragging" : ""}${isDropTarget(interaction, player.id, "battlefield") ? " game-table-battlefield-drop-active" : ""}`}
          data-drop-owner-player-id={player.id}
          data-drop-zone="battlefield"
          data-battlefield-surface="true"
          onPointerCancel={marqueeSelection.handlePointerCancel}
          onPointerDown={marqueeSelection.handlePointerDown}
          onPointerMove={marqueeSelection.handlePointerMove}
          onPointerUp={marqueeSelection.handlePointerUp}
        >
          {player.zones.battlefield.length ? (
            player.zones.battlefield.map((card, index) => {
              const attachedPosition = getAttachedBattlefieldPosition(player, card.id);
              const targetKey = `${player.id}:${card.id}`;
              const isValidTarget = interaction.targetingMode?.validTargetKeys.has(targetKey) ?? false;
              const isHoveredTarget =
                interaction.targetingMode?.hoveredTargetCardId === card.id
                && interaction.targetingMode.hoveredTargetOwnerPlayerId === player.id;
              const selection = {
                cardId: card.id,
                ownerPlayerId: player.id,
                zone: "battlefield" as const,
              } satisfies TableCardSelection;
              const handleBattlefieldNoMove = (
                nextSelection: TableCardSelection,
                event: ReactPointerEvent<HTMLElement>,
              ) => {
                const pendingClick = pendingClickRef.current;

                if (clickTimerRef.current !== null) {
                  window.clearTimeout(clickTimerRef.current);
                  clickTimerRef.current = null;
                }

                if (pendingClick && pendingClick.cardId !== nextSelection.cardId) {
                  onSelectBattlefieldCard(
                    {
                      cardId: pendingClick.cardId,
                      ownerPlayerId: nextSelection.ownerPlayerId,
                      zone: nextSelection.zone,
                    },
                    { additive: false },
                  );
                  pendingClickRef.current = null;
                }

                if (event.metaKey || event.ctrlKey) {
                  pendingClickRef.current = null;
                  onSelectBattlefieldCard(nextSelection, { additive: true });
                  return;
                }

                const now = performance.now();

                if (
                  pendingClickRef.current?.cardId === nextSelection.cardId &&
                  now - pendingClickRef.current.at <= 260
                ) {
                  pendingClickRef.current = null;
                  onTapBattlefieldCard(nextSelection);
                  return;
                }

                pendingClickRef.current = {
                  at: now,
                  cardId: nextSelection.cardId,
                };

                clickTimerRef.current = window.setTimeout(() => {
                  onSelectBattlefieldCard(nextSelection, { additive: false });
                  clickTimerRef.current = null;
                  pendingClickRef.current = null;
                }, 220);
              };
              const dragHandlers = buildTableDragSourceHandlers({
                interaction,
                onDrop: onBattlefieldDragEnd,
                onMove: onBattlefieldDragMove,
                onNoMove: handleBattlefieldNoMove,
                selection,
              });

              return (
                <div
                  className={`game-table-battlefield-card${isDraggedBattlefieldCard(interaction, card.id) ? " game-table-battlefield-card-dragging" : ""}`}
                  key={card.id}
                  ref={(element) => marqueeSelection.registerCardElement(card.id, element)}
                  data-table-card-id={card.id}
                  data-table-card-owner-player-id={player.id}
                  style={{
                    left: `${attachedPosition?.x ?? card.x}px`,
                    top: `${attachedPosition?.y ?? card.y}px`,
                    zIndex: player.zones.battlefield.length - index + (attachedPosition ? 24 : 0),
                  }}
                  {...dragHandlers}
                  onPointerDownCapture={(event) => {
                    if (event.button !== 2) {
                      return;
                    }

                    event.currentTarget.setPointerCapture(event.pointerId);
                    rightArrowDragRef.current = {
                      cardId: card.id,
                      ownerPlayerId: player.id,
                      pointerId: event.pointerId,
                      startX: event.clientX,
                      startY: event.clientY,
                      started: false,
                    };
                  }}
                  onPointerMoveCapture={(event) => {
                    const state = rightArrowDragRef.current;

                    if (
                      !state
                      || state.cardId !== card.id
                      || state.ownerPlayerId !== player.id
                      || state.pointerId !== event.pointerId
                      || state.started
                    ) {
                      return;
                    }

                    const cardElement = event.currentTarget;
                    const rect = cardElement.getBoundingClientRect();
                    const insideCard =
                      event.clientX >= rect.left
                      && event.clientX <= rect.right
                      && event.clientY >= rect.top
                      && event.clientY <= rect.bottom;

                    if (insideCard) {
                      return;
                    }

                    cardElement.releasePointerCapture(event.pointerId);
                    state.started = true;
                    suppressContextMenuCardIdRef.current = card.id;
                    onStartArrowDrag(selection);
                    interaction.updateTargetingPointer(event.clientX, event.clientY);
                  }}
                  onPointerUpCapture={(event) => {
                    const state = rightArrowDragRef.current;

                    if (
                      !state
                      || state.cardId !== card.id
                      || state.ownerPlayerId !== player.id
                      || state.pointerId !== event.pointerId
                    ) {
                      return;
                    }

                    event.currentTarget.releasePointerCapture(event.pointerId);
                    rightArrowDragRef.current = null;

                    if (!state.started && event.button === 2) {
                      suppressContextMenuCardIdRef.current = card.id;
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
                    }
                  }}
                >
                  <TableCard
                    ariaLabel={`${card.name} on your battlefield`}
                    card={card}
                    className={`game-table-card-battlefield${isValidTarget ? " game-table-card-target-valid" : ""}${isHoveredTarget ? " game-table-card-target-hovered" : ""}`}
                    selected={interaction.selectedCardIds.has(card.id)}
                    onMouseEnter={() =>
                      interaction.isDragging
                        ? undefined
                        : onInspect({
                            card,
                            locationLabel: "On your battlefield",
                          })
                    }
                    onMouseLeave={() => onInspect(null)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                    }}
                  />
                </div>
              );
            })
          ) : (
            <div className="game-table-battlefield-empty" />
          )}

          {marqueeSelection.marqueeRect?.visible ? (
            <div
              className="game-table-battlefield-selection-box"
              style={{
                height: `${marqueeSelection.marqueeRect.height}px`,
                left: `${marqueeSelection.marqueeRect.left}px`,
                top: `${marqueeSelection.marqueeRect.top}px`,
                width: `${marqueeSelection.marqueeRect.width}px`,
              }}
            />
          ) : null}
        </div>

        <div className="game-table-zone-dock game-table-zone-dock-right">
          {rightSlots.map((slot) => (
            (() => {
              const dragHandlers = getZoneSlotDragHandlers(slot);

              return (
            <ZoneSlot
              count={slot.count}
              dropOwnerPlayerId={player.id}
              dragHandlers={dragHandlers}
              hidePreview={slot.hidePreview}
              isDragSource={Boolean(slot.previewCard)}
              isDropTarget={isDropTarget(interaction, player.id, slot.zoneName)}
              key={slot.label}
              label={slot.label}
              onClick={dragHandlers ? undefined : () => onOpenZone(slot.zoneName)}
              onContextMenu={supportsZoneContextMenu(slot.zoneName)
                  ? onOpenZoneContextMenu(slot.zoneName)
                  : undefined}
                onInspect={onInspect}
                ownerLabel="your"
              previewCard={slot.previewCard}
              shortLabel={slot.shortLabel}
              suppressInspect={interaction.isDragging}
              tone={slot.tone}
              zoneName={slot.zoneName}
            />
              );
            })()
          ))}
        </div>
      </div>
    </section>
  );
}
