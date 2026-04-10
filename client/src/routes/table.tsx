import { Link, useParams } from "react-router-dom";
import { ReadyRoom } from "../features/ready-room/ready-room";
import { GameTable } from "../features/table/game-table";
import { useParty } from "../hooks/use-party";
import { useTableStore } from "../stores/table-store";

const PLAYER_NAME_KEY = "playmat.player-name";

export function TableRoute() {
  const params = useParams();
  const tableId = params.id?.toUpperCase() ?? "";
  const playerName = sessionStorage.getItem(PLAYER_NAME_KEY) ?? "Guest";
  const { sendAction } = useParty(tableId, playerName);
  const tableStatus = useTableStore((state) => state.table?.status ?? null);
  const connectionState = useTableStore((state) => state.connectionState);
  const error = useTableStore((state) => state.error);

  if (!tableId) {
    return (
      <section className="page hero-card">
        <p className="muted">Missing table code.</p>
        <Link className="button" to="/">
          Back home
        </Link>
      </section>
    );
  }

  if (!tableStatus) {
    return (
      <section className="page hero-card">
        <p className="muted">Connecting to table {tableId}...</p>
        <p className="muted">Connection {connectionState}</p>
        {error ? <p>{error}</p> : null}
        <Link className="button" to="/">
          Back home
        </Link>
      </section>
    );
  }

  return tableStatus === "lobby" ? (
    <ReadyRoom sendAction={sendAction} />
  ) : (
    <GameTable sendAction={sendAction} />
  );
}
