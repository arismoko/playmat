import type { ClientAction } from "@playmat/shared/actions";
import { type CardView, type PlayerView } from "@playmat/shared/table";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTableStore } from "../../stores/table-store";
import { ContextMenu } from "./context-menu";
import { GameSidebar } from "./game-sidebar";
import "./game-table.css";
import { HandFan } from "./hand-fan";
import { Inspector } from "./inspector";
import { OpponentHalf } from "./opponent-half";
import { PhaseRail } from "./phase-rail";
import { PlayerHalf } from "./player-half";
import { RelatedCardsDialog } from "./related-cards-dialog";
import { TableCommandPrompt } from "./table-command-prompt";
import { TableCard } from "./table-card";
import { TableArrowsOverlay } from "./table-arrows-overlay";
import { TokenCreationDialog } from "./token-creation-dialog";
import { useCardCacheWarmer } from "./use-card-cache-warmer";
import { useDragPreview } from "./use-drag-preview";
import { useTableActions } from "./use-table-actions";
import { useTableInteraction } from "./use-table-interaction";
import { useTableShortcuts } from "./use-table-shortcuts";
import { useTableUiState } from "./use-table-ui-state";
import { ZoneViewerModal } from "./zone-viewer-modal";

type GameTableProps = {
  sendAction: (action: ClientAction) => void;
};

type DragPreviewItem = {
  card: CardView;
  isPrimary: boolean;
  offsetX: number;
  offsetY: number;
  zIndex: number;
};
const STACKED_PREVIEW_OFFSET_X = 24;
const STACKED_PREVIEW_OFFSET_Y = 12;

function buildDragPreviewItems(
  currentPlayer: PlayerView | null,
  previewState: {
    cardId: string;
    selections: { cardId: string }[];
    zone: keyof PlayerView["zones"];
  } | null,
): DragPreviewItem[] {
  if (!currentPlayer || !previewState) {
    return [];
  }

  const selectedCardIds = new Set(previewState.selections.map((selection) => selection.cardId));
  const zoneCards = currentPlayer.zones[previewState.zone].filter((card) => selectedCardIds.has(card.id));
  const primaryCard = zoneCards.find((card) => card.id === previewState.cardId) ?? zoneCards[0];
  const primaryIndex = zoneCards.findIndex((card) => card.id === primaryCard?.id);

  if (!primaryCard) {
    return [];
  }

  return zoneCards.map((card, index) => ({
    card,
    isPrimary: card.id === primaryCard.id,
    offsetX:
      previewState.zone === "battlefield"
        ? card.x - primaryCard.x
        : (index - primaryIndex) * STACKED_PREVIEW_OFFSET_X,
    offsetY:
      previewState.zone === "battlefield"
        ? card.y - primaryCard.y
        : (index - primaryIndex) * STACKED_PREVIEW_OFFSET_Y,
    zIndex: index + 1,
  }));
}

function getCardCenter(cardId: string, ownerPlayerId: string): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(
    `[data-table-card-owner-player-id='${ownerPlayerId}'][data-table-card-id='${cardId}']`,
  );
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function getPlayerCenter(playerId: string): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(`[data-table-player-id='${playerId}']`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function pointToSegmentDistanceSq(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return (px - projX) ** 2 + (py - projY) ** 2;
}

function resolveCardTargetAtPoint(clientX: number, clientY: number): { cardId: string | null; ownerPlayerId: string } | null {
  if (typeof document === "undefined") {
    return null;
  }

  const elements = document.elementsFromPoint(clientX, clientY);
  const targetElement = elements.find(
    (element) => element instanceof HTMLElement && element.dataset.tableCardId && element.dataset.tableCardOwnerPlayerId,
  );

  if (targetElement instanceof HTMLElement) {
    const cardId = targetElement.dataset.tableCardId;
    const ownerPlayerId = targetElement.dataset.tableCardOwnerPlayerId;

    if (cardId && ownerPlayerId) {
      return { cardId, ownerPlayerId };
    }
  }

  const playerElement = elements.find(
    (element) => element instanceof HTMLElement && element.dataset.tablePlayerId,
  );

  if (!(playerElement instanceof HTMLElement) || !playerElement.dataset.tablePlayerId) {
    return null;
  }

  return {
    cardId: null,
    ownerPlayerId: playerElement.dataset.tablePlayerId,
  };
}

export function GameTable({ sendAction }: GameTableProps) {
  const navigate = useNavigate();
  const table = useTableStore((state) => state.table);
  const playerId = useTableStore((state) => state.playerId);
  const error = useTableStore((state) => state.error);
  const zoneView = useTableStore((state) => state.zoneView);
  const closeZoneView = useTableStore((state) => state.closeZoneView);
  const applyOptimisticBatchMove = useTableStore(
    (state) => state.applyOptimisticBatchMove,
  );
  const applyOptimisticHandReorder = useTableStore(
    (state) => state.applyOptimisticHandReorder,
  );
  const applyOptimisticHandOrder = useTableStore((state) => state.applyOptimisticHandOrder);
  const applyOptimisticMove = useTableStore((state) => state.applyOptimisticMove);
  const applyOptimisticMoveZone = useTableStore((state) => state.applyOptimisticMoveZone);
  const interaction = useTableInteraction();

  const currentPlayer = useMemo<PlayerView | null>(() => {
    if (!table || !playerId) {
      return null;
    }

    return table.players[playerId] ?? null;
  }, [playerId, table]);

  const otherPlayers = useMemo(() => {
    if (!table) {
      return [];
    }

    return Object.values(table.players).filter((player) => player.id !== playerId);
  }, [playerId, table]);

  const ui = useTableUiState(otherPlayers);
  const actions = useTableActions({
    interaction,
    navigate,
    optimistic: {
      applyOptimisticBatchMove,
      applyOptimisticHandOrder,
      applyOptimisticHandReorder,
      applyOptimisticMove,
      applyOptimisticMoveZone,
    },
    sendAction,
    table: {
      closeZoneView,
      currentPlayer,
      otherPlayers,
      zoneView,
    },
    ui: {
      inspectorEntry: ui.inspectorEntry,
      relatedCardsDialog: ui.relatedCardsDialog,
      setCommandPrompt: ui.setCommandPrompt,
      setInspectorEntry: ui.setInspectorEntry,
      setRelatedCardsDialog: ui.setRelatedCardsDialog,
      setTokenDialog: ui.setTokenDialog,
      tokenDialog: ui.tokenDialog,
    },
  });

  const visibleCardNames = useMemo(() => {
    if (!table) {
      return [];
    }

    const names = new Set<string>();

    for (const player of Object.values(table.players)) {
      for (const card of player.zones.battlefield) {
        if (card.visibility === "public" && !card.faceDown && card.name !== "Hidden card") {
          names.add(card.name);
        }
      }
    }

    for (const card of zoneView?.cards ?? []) {
      if (card.visibility === "public" && !card.faceDown && card.name !== "Hidden card") {
        names.add(card.name);
      }
    }

    if (
      ui.inspectorEntry?.card.visibility === "public"
      && !ui.inspectorEntry.card.faceDown
      && ui.inspectorEntry.card.name !== "Hidden card"
    ) {
      names.add(ui.inspectorEntry.card.name);
    }

    return Array.from(names);
  }, [
    table,
    ui.inspectorEntry?.card.faceDown,
    ui.inspectorEntry?.card.name,
    ui.inspectorEntry?.card.visibility,
    zoneView?.cards,
  ]);

  useCardCacheWarmer(visibleCardNames);

  const isCurrentTurn = table?.turnPlayerId === currentPlayer?.id;
  const tableArrows = useMemo(
    () => (
      table
        ? Object.values(table.players).flatMap((player) => {
            if (player.id === playerId || player.id === ui.selectedOpponentId) {
              return player.arrows;
            }

            return [];
          })
        : []
    ),
    [playerId, table, ui.selectedOpponentId],
  );

  const previewState = interaction.dragState?.moved
    ? interaction.dragState
    : interaction.snapbackState;

  const dragPreviewItems = useMemo(
    () => buildDragPreviewItems(currentPlayer, previewState),
    [currentPlayer, previewState],
  );

  const draggedCard = useMemo(() => {
    if (!currentPlayer || !previewState) {
      return null;
    }

    return (
      currentPlayer.zones[previewState.zone].find(
        (card) => card.id === previewState.cardId,
      ) ?? null
    );
  }, [currentPlayer, previewState]);
  const targetingMode = interaction.targetingMode;

  useEffect(() => {
    if (interaction.isDragging) {
      ui.setInspectorEntry(null);
    }
  }, [interaction.isDragging, ui.setInspectorEntry]);

  useEffect(() => {
    if (!targetingMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        interaction.cancelTargeting();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [interaction, targetingMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (interaction.contextMenu || targetingMode) return;

      if (ui.commandPrompt) {
        ui.setCommandPrompt(null);
      } else if (ui.tokenDialog) {
        ui.setTokenDialog(null);
      } else if (ui.relatedCardsDialog) {
        ui.setRelatedCardsDialog(null);
      } else if (zoneView) {
        closeZoneView();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    interaction.contextMenu,
    targetingMode,
    ui.commandPrompt,
    ui.setCommandPrompt,
    ui.tokenDialog,
    ui.setTokenDialog,
    ui.relatedCardsDialog,
    ui.setRelatedCardsDialog,
    zoneView,
    closeZoneView,
  ]);

  const activeDragState = interaction.dragState?.moved ? interaction.dragState : null;
  const { cardRef: dragCardRef, previewRef: dragPreviewRef } = useDragPreview(
    activeDragState,
    interaction.snapbackState,
    interaction.dropTarget,
    interaction.clearSnapback,
  );
  const isActionableDropTarget =
    activeDragState !== null &&
    interaction.dropTarget !== null &&
    (interaction.dropTarget.zone !== activeDragState.zone || interaction.dropTarget.zone === "battlefield");

  useTableShortcuts(interaction, currentPlayer?.id ?? null, {
    onClearInspector: () => ui.setInspectorEntry(null),
    onShuffleLibrary: actions.handleShuffleLibrary,
    onMoveCard: actions.handleMoveCard,
    onSelectAllBattlefield: actions.handleSelectAllBattlefield,
    onTapCard: actions.handleTapCard,
    onToggleFaceDown: actions.handleToggleFaceDown,
    onTransformCard: actions.handleTransformCard,
    onUndo: actions.handleUndo,
    sendAction,
  });

  if (!table) {
    return <section className="game-table-loading">Connecting to table...</section>;
  }

  function handleCloseZoneViewer(options?: { shuffleOnClose: boolean }): void {
    if (options?.shuffleOnClose && zoneView?.shuffleOnCloseAvailable) {
      sendAction({ type: "shuffle" });
    }

    closeZoneView();
  }

  const previewArrow = targetingMode
    ? {
        color: targetingMode.kind === "attach" ? "green" as const : "red" as const,
        sourceCardId: targetingMode.sourceCardId,
        sourceFallbackX: targetingMode.sourceFallbackX,
        sourceFallbackY: targetingMode.sourceFallbackY,
        sourceOwnerPlayerId: targetingMode.sourceOwnerPlayerId,
        targetCardId: targetingMode.hoveredTargetCardId,
        targetOwnerPlayerId: targetingMode.hoveredTargetOwnerPlayerId,
        targetX: targetingMode.pointerX,
        targetY: targetingMode.pointerY,
      }
    : null;

  return (
    <section className="game-table-screen" onContextMenu={(event) => event.preventDefault()}>
      <PhaseRail
        canAdvance={Boolean(isCurrentTurn)}
        currentPhase={table.phase}
        onAdvancePhase={() => sendAction({ type: "advance-phase" })}
        onPassTurn={() => sendAction({ type: "pass-turn" })}
      />

      <div className="game-table-main">
        <div
          className="game-table-board"
          onContextMenu={(event) => {
            const HIT_DISTANCE_SQ = 14 * 14;

            // Only handle clicks not already on a card
            const target = event.target;
            if (target instanceof HTMLElement && (target.closest("[data-table-card-id]") || target.closest("[data-context-menu]"))) {
              return;
            }

            for (const arrow of tableArrows) {
              const src = getCardCenter(arrow.sourceCardId, arrow.sourceOwnerPlayerId);
              const dst = arrow.targetCardId
                ? getCardCenter(arrow.targetCardId, arrow.targetOwnerPlayerId)
                : getPlayerCenter(arrow.targetOwnerPlayerId);
              if (!src || !dst) continue;

              if (pointToSegmentDistanceSq(event.clientX, event.clientY, src.x, src.y, dst.x, dst.y) < HIT_DISTANCE_SQ) {
                event.preventDefault();
                actions.handleDeleteArrow(arrow);
                return;
              }
            }
          }}
        >
          <OpponentHalf
            activePlayerId={table.turnPlayerId}
            interaction={interaction}
            log={table.log}
            onInspect={ui.setInspectorEntry}
            onOpenZone={actions.handleOpenZone}
            onOpenZoneContextMenu={actions.handleOpenZoneContextMenu}
            onStartArrowDrag={actions.handleStartArrowTargeting}
            players={otherPlayers}
            selectedOpponentId={ui.selectedOpponentId}
          />
          <div className="game-table-board-divider" />
          <PlayerHalf
            onBattlefieldDragEnd={actions.handleDragEnd}
            onBattlefieldDragMove={actions.handleDragMove}
            interaction={interaction}
            onInspect={ui.setInspectorEntry}
            onOpenZone={actions.handleOpenZone}
            onOpenZoneContextMenu={actions.handleOpenZoneContextMenu}
            onSelectBattlefieldCard={actions.handleSelectBattlefieldCard}
            onStartArrowDrag={actions.handleStartArrowTargeting}
            onTapBattlefieldCard={actions.handleTapCard}
            player={currentPlayer}
          />
        </div>
      </div>

      <Inspector entry={ui.inspectorEntry} suppress={interaction.isDragging} />
      <TableArrowsOverlay
        arrows={tableArrows}
        isDragging={interaction.isDragging}
        onDeleteArrow={actions.handleDeleteArrow}
        previewArrow={previewArrow}
        viewerPlayerId={currentPlayer?.id ?? null}
      />

      {targetingMode ? (
        <div
          className="game-table-targeting-layer"
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          onPointerMove={(event) => {
            interaction.updateTargetingPointer(event.clientX, event.clientY);

            const target = resolveCardTargetAtPoint(event.clientX, event.clientY);
            const targetKey = target
              ? `${target.ownerPlayerId}:${target.cardId ?? "__player__"}`
              : "";

            if (target && targetingMode.validTargetKeys.has(targetKey)) {
              interaction.setTargetingHover(target.cardId, target.ownerPlayerId);
              return;
            }

            interaction.setTargetingHover(null, null);
          }}
          onPointerUp={(event) => {
            const target = resolveCardTargetAtPoint(event.clientX, event.clientY);
            const targetKey = target
              ? `${target.ownerPlayerId}:${target.cardId ?? "__player__"}`
              : "";

            actions.handleConfirmTargeting(
              target && targetingMode.validTargetKeys.has(targetKey)
                ? target
                : null,
            );
          }}
          role="presentation"
          tabIndex={0}
        />
      ) : null}

      <HandFan
        cards={currentPlayer?.zones.hand ?? []}
        interaction={interaction}
        onHandDragEnd={actions.handleDragEnd}
        onHandDragMove={actions.handleDragMove}
        onInspect={ui.setInspectorEntry}
        onPlayCard={actions.handlePlayCard}
        onSelectHandCard={actions.handleSelectHandCard}
        ownerPlayerId={currentPlayer?.id ?? null}
      />

      {previewState && draggedCard ? (
        <div ref={dragPreviewRef} className="game-table-drag-preview">
          <div
            ref={dragCardRef}
            className={`game-table-drag-card-shell${isActionableDropTarget ? " game-table-drag-card-shell-valid" : ""}${interaction.snapbackState ? " game-table-drag-card-shell-snapback" : ""}`}
          >
            <div className={`game-table-drag-preview-group${previewState.zone === "hand" ? " game-table-drag-preview-group-hand" : ""}`}>
              {(dragPreviewItems.length ? dragPreviewItems : [{
                card: draggedCard,
                isPrimary: true,
                offsetX: 0,
                offsetY: 0,
                zIndex: 1,
              }]).map((item) => (
                <div
                  key={item.card.id}
                  className={`game-table-drag-preview-item${item.isPrimary ? " game-table-drag-preview-item-primary" : " game-table-drag-preview-item-secondary"}`}
                  data-table-card-id={item.isPrimary ? item.card.id : undefined}
                  data-table-card-owner-player-id={item.isPrimary ? previewState.ownerPlayerId : undefined}
                  style={{
                    transform: `translate(${item.offsetX}px, ${item.offsetY}px)`,
                    zIndex: item.zIndex,
                  }}
                >
                  <TableCard
                    ariaLabel={`${item.card.name} being dragged`}
                    card={item.card}
                    className={`game-table-card-drag${previewState.zone === "hand" ? " game-table-card-drag-hand" : ""} game-table-drag-preview-card${isActionableDropTarget ? " game-table-drag-preview-card-valid" : ""}${interaction.snapbackState ? " game-table-drag-preview-card-snapback" : ""}${item.isPrimary ? "" : " game-table-drag-preview-card-secondary"}`}
                    priority={item.isPrimary}
                  />
                </div>
              ))}
            </div>

          </div>
        </div>
      ) : null}

      <GameSidebar
        currentPlayer={currentPlayer}
        error={error}
        onAdjustLife={(amount) => sendAction({ type: "adjust-life", amount })}
        onAdjustPlayerCounter={(counterId, amount) =>
          sendAction({ type: "adjust-player-counter", amount, counterId })
        }
        onCreatePlayerCounter={(name, color) =>
          sendAction({ type: "create-player-counter", color, name })
        }
        onOpenHand={() => actions.handleOpenZone("hand")}
        onOpenHandContextMenu={actions.handleOpenZoneContextMenu("hand")}
        onOpenSideboard={() => actions.handleOpenZone("sideboard")}
        onOpenSideboardContextMenu={actions.handleOpenZoneContextMenu("sideboard")}
        onRemovePlayerCounter={(counterId) =>
          sendAction({ type: "remove-player-counter", counterId })
        }
        onSelectOpponent={ui.toggleSelectedOpponent}
        opponents={otherPlayers}
        selectedOpponentId={ui.selectedOpponentId}
        table={table}
        targetingMode={interaction.targetingMode}
      />

      {interaction.contextMenu && actions.activeContextMenuItems.length ? (
        <ContextMenu
          items={actions.activeContextMenuItems}
          x={interaction.contextMenu.x}
          y={interaction.contextMenu.y}
        />
      ) : null}

      {zoneView ? (
        <ZoneViewerModal
          cards={zoneView.cards}
          interaction={interaction}
          ownerPlayerId={zoneView.ownerPlayerId}
          onClose={handleCloseZoneViewer}
          ownerName={zoneView.ownerName}
          readOnly={!actions.canManageZoneView}
          shuffleOnCloseAvailable={zoneView.shuffleOnCloseAvailable}
          title={zoneView.title}
          zone={zoneView.zone}
        />
      ) : null}

      {ui.commandPrompt ? (
        <TableCommandPrompt onCancel={() => ui.setCommandPrompt(null)} prompt={ui.commandPrompt} />
      ) : null}

      {ui.tokenDialog ? (
        <TokenCreationDialog
          sourceCardName={ui.tokenDialog.sourceCardName}
          onClose={() => ui.setTokenDialog(null)}
          onCreate={actions.handleCreateToken}
        />
      ) : null}

      {ui.relatedCardsDialog ? (
        <RelatedCardsDialog
          canCreateTokens={ui.relatedCardsDialog.canCreateTokens}
          sourceCard={ui.relatedCardsDialog.sourceCard}
          onClose={() => ui.setRelatedCardsDialog(null)}
          onCreateToken={actions.handleCreateRelatedToken}
        />
      ) : null}
    </section>
  );
}
