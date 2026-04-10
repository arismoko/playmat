import type { LogEntry, PlayerView, ZoneName } from "@playmat/shared/table";
import type { MouseEventHandler } from "react";
import { ActivityFeed } from "./activity-feed";
import type { InspectorCard } from "./inspector";
import { TableCard } from "./table-card";
import { getOpponentZoneLayout } from "./table-zone-layout";
import { useEffect, useRef } from "react";
import type { TableCardSelection, TableInteractionController } from "./use-table-interaction";
import { ZoneSlot } from "./zone-slot";

type OpponentHalfProps = {
  players: PlayerView[];
  activePlayerId: string | null;
  interaction: TableInteractionController;
  log: LogEntry[];
  onOpenZone: (zone: ZoneName, targetPlayerId?: string) => void;
  onOpenZoneContextMenu: (zone: ZoneName, ownerPlayerId?: string) => MouseEventHandler<HTMLButtonElement>;
  selectedOpponentId: string | null;
  onInspect: (entry: InspectorCard | null) => void;
  onStartArrowDrag: (selection: TableCardSelection) => void;
};

export function OpponentHalf({
  players,
  activePlayerId,
  interaction,
  log,
  onOpenZone,
  onOpenZoneContextMenu,
  selectedOpponentId,
  onInspect,
  onStartArrowDrag,
}: OpponentHalfProps) {
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
      rightArrowDragRef.current = null;
      suppressContextMenuCardIdRef.current = null;
    };
  }, []);

  if (!players.length) {
    return (
      <section className="game-table-half">
        <div className="game-table-half-empty">
          Waiting for another seat to appear.
        </div>
      </section>
    );
  }

  const selectedOpponent = selectedOpponentId
    ? players.find((player) => player.id === selectedOpponentId) ?? null
    : null;

  if (!selectedOpponent) {
    return (
      <section className="game-table-half game-table-half-activity">
        <ActivityFeed log={log} />
      </section>
    );
  }

  const { rightSlots } = getOpponentZoneLayout(selectedOpponent);
  const battlefieldCards = selectedOpponent.zones.battlefield
    .slice()
    .sort((left, right) => left.y - right.y || left.x - right.x);
  const playerTargetKey = `${selectedOpponent.id}:__player__`;
  const isValidPlayerTarget = interaction.targetingMode?.validTargetKeys.has(playerTargetKey) ?? false;
  const isHoveredPlayerTarget =
    interaction.targetingMode?.hoveredTargetCardId === null
    && interaction.targetingMode?.hoveredTargetOwnerPlayerId === selectedOpponent.id;

  return (
    <section className="game-table-half">
      <header
        className={`game-table-half-header${isValidPlayerTarget ? " game-table-player-target-valid" : ""}${isHoveredPlayerTarget ? " game-table-player-target-hovered" : ""}`}
        data-table-player-id={selectedOpponent.id}
      >
        <div className="game-table-half-nameblock">
          <strong className="game-table-half-name">{selectedOpponent.name}</strong>
        </div>

        <div className="game-table-half-stats">
          {selectedOpponent.id === activePlayerId ? (
            <span className="game-table-turn-badge">Active</span>
          ) : null}
          <span className="game-table-life">{selectedOpponent.life} life</span>
        </div>
      </header>

      <div className="game-table-opponent-body game-table-half-body">
        <div
          className="game-table-opponent-battlefield"
          onContextMenu={(event) => {
            event.preventDefault();
            interaction.openContextMenu({
              kind: "zone",
              ownerPlayerId: selectedOpponent.id,
              x: event.clientX,
              y: event.clientY,
              zone: "battlefield",
            });
          }}
        >
          {battlefieldCards.length ? (
            battlefieldCards.map((card) => (
              (() => {
                const targetKey = `${selectedOpponent.id}:${card.id}`;
                const isValidTarget = interaction.targetingMode?.validTargetKeys.has(targetKey) ?? false;
                const isHoveredTarget =
                  interaction.targetingMode?.hoveredTargetCardId === card.id
                  && interaction.targetingMode.hoveredTargetOwnerPlayerId === selectedOpponent.id;

                return (
              <div
                className="game-table-opponent-battlefield-card"
                data-table-card-id={card.id}
                data-table-card-owner-player-id={selectedOpponent.id}
                key={card.id}
                onPointerDownCapture={(event) => {
                  if (event.button !== 2) {
                    return;
                  }

                  event.currentTarget.setPointerCapture(event.pointerId);
                  rightArrowDragRef.current = {
                    cardId: card.id,
                    ownerPlayerId: selectedOpponent.id,
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
                    || state.ownerPlayerId !== selectedOpponent.id
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

                  const selection = {
                    cardId: card.id,
                    ownerPlayerId: selectedOpponent.id,
                    zone: "battlefield" as const,
                  };

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
                    || state.ownerPlayerId !== selectedOpponent.id
                    || state.pointerId !== event.pointerId
                  ) {
                    return;
                  }

                  event.currentTarget.releasePointerCapture(event.pointerId);
                  rightArrowDragRef.current = null;

                  if (!state.started && event.button === 2) {
                    suppressContextMenuCardIdRef.current = card.id;
                    const selection = {
                      cardId: card.id,
                      ownerPlayerId: selectedOpponent.id,
                      zone: "battlefield" as const,
                    };

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
                  ariaLabel={`${card.name} on ${selectedOpponent.name}'s battlefield`}
                  card={card}
                  className={`game-table-card-opponent${isValidTarget ? " game-table-card-target-valid" : ""}${isHoveredTarget ? " game-table-card-target-hovered" : ""}`}
                  selected={interaction.selectedCardIds.has(card.id)}
                  onMouseEnter={() =>
                    interaction.isDragging
                      ? undefined
                      : onInspect({
                          card,
                          locationLabel: `On ${selectedOpponent.name}'s battlefield`,
                        })
                  }
                  onMouseLeave={() => onInspect(null)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                />
              </div>
                );
              })()
            ))
          ) : (
            <div className="game-table-battlefield-empty game-table-battlefield-empty-compact" />
          )}
        </div>

        <div className="game-table-zone-dock game-table-zone-dock-right game-table-zone-dock-compact">
          {rightSlots.map((slot) => {
            const supportsMenu = slot.zoneName === "graveyard" || slot.zoneName === "exile";

            return (
              <ZoneSlot
                count={slot.count}
                hidePreview={slot.hidePreview}
                key={slot.label}
                label={slot.label}
                onClick={supportsMenu ? () => onOpenZone(slot.zoneName, selectedOpponent.id) : undefined}
                onContextMenu={supportsMenu ? onOpenZoneContextMenu(slot.zoneName, selectedOpponent.id) : undefined}
                onInspect={onInspect}
                ownerLabel={`${selectedOpponent.name}'s`}
                previewCard={slot.previewCard}
                shortLabel={slot.shortLabel}
                suppressInspect={interaction.isDragging}
                tone={slot.tone}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
