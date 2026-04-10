import { formatLogEvent, type LogEntry } from "@playmat/shared/table";

type ActivityFeedProps = {
  log: LogEntry[];
};

function formatLogTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Now";
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityFeed({ log }: ActivityFeedProps) {
  const entries = log.slice().reverse();

  return (
    <div className="game-table-feed-wrap">
      <div className="game-table-feed-header">
        <h2 className="game-table-feed-title">Activity</h2>
        <span className="game-table-feed-hint">
          Pick a player in the pod to focus their board.
        </span>
      </div>

      <div className="game-table-feed-scroll">
        {entries.length ? (
          entries.map((entry) => (
            <article className="game-table-feed-event" key={entry.id}>
              <div className="game-table-feed-top">
                <strong className="game-table-feed-who">
                  {entry.playerId ? formatLogEvent(entry.event).split(" ")[0] : "Table"}
                </strong>
                <span className="game-table-feed-when">{formatLogTime(entry.createdAt)}</span>
              </div>
              <p className="game-table-feed-text">{formatLogEvent(entry.event)}</p>
            </article>
          ))
        ) : (
          <div className="game-table-feed-empty">No table activity yet.</div>
        )}
      </div>
    </div>
  );
}
