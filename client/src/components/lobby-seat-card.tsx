import type { PlayerState } from "@playmat/shared/table";

type LobbySeatCardProps = {
  player: PlayerState;
  isCurrentPlayer: boolean;
  isHost: boolean;
};

export function LobbySeatCard({
  player,
  isCurrentPlayer,
  isHost,
}: LobbySeatCardProps) {
  const isReady = player.ready || (isHost && player.selectedDeckName);
  const status = !player.connected
    ? "Offline"
    : isReady
      ? "Ready"
      : player.selectedDeckName
        ? "Waiting"
        : "Needs Deck";
  const statusClass = isReady
    ? "ready-room-seat-status-ready"
    : player.selectedDeckName
      ? "ready-room-seat-status-waiting"
      : "ready-room-seat-status-missing";

  return (
    <article
      className={`ready-room-seat ${isCurrentPlayer ? "ready-room-seat-self" : ""} ${isReady ? "ready-room-seat-ready" : ""} ${!player.connected ? "ready-room-seat-offline" : ""}`}
    >
      <div className="ready-room-seat-main">
        <div className="ready-room-seat-title-row">
          <h2 className="ready-room-seat-name">{player.name}</h2>
          <div className="ready-room-seat-tags">
            {isHost ? <span className="ready-room-seat-tag">Host</span> : null}
            {isCurrentPlayer ? <span className="ready-room-seat-tag ready-room-seat-tag-self">You</span> : null}
          </div>
        </div>
        <div className="ready-room-seat-meta">
          {player.selectedDeckName ? (
            <>
              <span className="ready-room-seat-deck-name">{player.selectedDeckName}</span>
              <span className="ready-room-seat-meta-separator">·</span>
              <span className="ready-room-seat-card-count">{player.selectedDeckCardCount} cards</span>
            </>
          ) : (
            <span className="ready-room-seat-empty">No deck selected</span>
          )}
        </div>
      </div>

      <div className={`ready-room-seat-status ${statusClass}`}>{status}</div>
    </article>
  );
}
