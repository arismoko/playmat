import type { MouseEventHandler } from "react";
import type { PlayerView, TableView } from "@playmat/shared/table";
import type { TableTargetingMode } from "./use-table-interaction";
import { PlayerCounters } from "./player-counters";

type GameSidebarProps = {
  currentPlayer: PlayerView | null;
  opponents: PlayerView[];
  table: TableView;
  error: string | null;
  onAdjustLife: (amount: number) => void;
  onAdjustPlayerCounter: (counterId: string, amount: number) => void;
  onCreatePlayerCounter: (name: string, color: string) => void;
  onOpenHand: () => void;
  onOpenHandContextMenu: MouseEventHandler<HTMLButtonElement>;
  onRemovePlayerCounter: (counterId: string) => void;
  onOpenSideboard: () => void;
  onOpenSideboardContextMenu: MouseEventHandler<HTMLButtonElement>;
  onSelectOpponent: (opponentId: string) => void;
  selectedOpponentId: string | null;
  targetingMode: TableTargetingMode | null;
};

export function GameSidebar({
  currentPlayer,
  opponents,
  table,
  error,
  onAdjustLife,
  onAdjustPlayerCounter,
  onCreatePlayerCounter,
  onOpenHand,
  onOpenHandContextMenu,
  onRemovePlayerCounter,
  onOpenSideboard,
  onOpenSideboardContextMenu,
  onSelectOpponent,
  selectedOpponentId,
  targetingMode,
}: GameSidebarProps) {
  return (
    <aside className="game-table-sidebar">
      <section className="game-table-panel game-table-player-panel">
        {currentPlayer ? (
          <div className="game-table-seat-card game-table-seat-card-self">
            <div className="game-table-player-summary">
              <div className="game-table-player-life-row">
                <button className="game-table-life-button" type="button" onClick={() => onAdjustLife(-1)}>
                  -
                </button>
                <span className="game-table-player-life">{currentPlayer.life}</span>
                <button className="game-table-life-button" type="button" onClick={() => onAdjustLife(1)}>
                  +
                </button>
              </div>

              <div className="game-table-seat-copy">
                <strong className="game-table-seat-name">{currentPlayer.name}</strong>
                <div className="game-table-seat-meta">
                  <button
                    className="game-table-meta-action"
                    title={`Hand: ${currentPlayer.zones.hand.length}`}
                    type="button"
                    onClick={onOpenHand}
                    onContextMenu={onOpenHandContextMenu}
                  >
                    hand {currentPlayer.zones.hand.length}
                  </button>
                  <span className="game-table-seat-stat">lib {currentPlayer.zones.library.length}</span>
                  <button
                    className="game-table-meta-action"
                    title={`Sideboard: ${currentPlayer.zones.sideboard.length}`}
                    type="button"
                    onClick={onOpenSideboard}
                    onContextMenu={onOpenSideboardContextMenu}
                  >
                    SB {currentPlayer.zones.sideboard.length}
                  </button>
                </div>
              </div>
            </div>

            <PlayerCounters
              counters={currentPlayer.counters}
              onAdjustCounter={onAdjustPlayerCounter}
              onCreateCounter={onCreatePlayerCounter}
              onRemoveCounter={onRemovePlayerCounter}
            />
          </div>
        ) : null}
        {error ? <p className="game-table-panel-error">{error}</p> : null}
      </section>

      <section className="game-table-panel game-table-pod-panel">
        <div className="game-table-pod-list">
          {opponents.length ? (
            opponents.map((player) => (
              (() => {
                const playerTargetKey = `${player.id}:__player__`;
                const isValidPlayerTarget = targetingMode?.validTargetKeys.has(playerTargetKey) ?? false;
                const isHoveredPlayerTarget =
                  targetingMode?.hoveredTargetCardId === null
                  && targetingMode?.hoveredTargetOwnerPlayerId === player.id;

                return (
              <button
                className={`game-table-pod-item${player.id === selectedOpponentId ? " game-table-pod-item-active" : ""}${isValidPlayerTarget ? " game-table-player-target-valid" : ""}${isHoveredPlayerTarget ? " game-table-player-target-hovered" : ""}`}
                data-table-player-id={player.id}
                key={player.id}
                type="button"
                onClick={() => onSelectOpponent(player.id)}
              >
                <div className="game-table-seat-top">
                  <strong className="game-table-seat-name">{player.name}</strong>
                  {player.id === table.turnPlayerId ? (
                    <span className="game-table-turn-badge">Turn</span>
                  ) : null}
                </div>

                <div className="game-table-seat-meta">
                  <span className="game-table-seat-stat">{player.life} life</span>
                  <span className="game-table-seat-stat">hand {player.zones.hand.length}</span>
                  <span className="game-table-seat-stat">lib {player.zones.library.length}</span>
                </div>
              </button>
                );
              })()
            ))
          ) : (
            <div className="game-table-pod-empty">No opponents connected yet.</div>
          )}
        </div>
      </section>

    </aside>
  );
}
