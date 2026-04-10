import { createTableCode } from "@playmat/shared/utils";
import { useState, type FormEventHandler } from "react";
import { Link, useNavigate } from "react-router-dom";

const PLAYER_NAME_KEY = "playmat.player-name";
const RECENT_TABLES_KEY = "playmat.recent-tables";

type RecentTable = {
  code: string;
  visitedAt: string;
};

function readRecentTables(): RecentTable[] {
  try {
    const raw = localStorage.getItem(RECENT_TABLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RecentTable => {
      return Boolean(
        entry &&
        typeof entry === "object" &&
        "code" in entry &&
        "visitedAt" in entry &&
        typeof entry.code === "string" &&
        typeof entry.visitedAt === "string",
      );
    });
  } catch {
    return [];
  }
}

function parseTableCode(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/\/table\/([^/?#]+)/i);
      return match?.[1]?.toUpperCase() ?? null;
    } catch {
      return null;
    }
  }
  const pathMatch = trimmed.match(/\/table\/([^/?#]+)/i);
  if (pathMatch?.[1]) return pathMatch[1].toUpperCase();
  const cleaned = trimmed.replace(/\s+/g, "").toUpperCase();
  return cleaned || null;
}

export function HomeRoute() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState(
    () => sessionStorage.getItem(PLAYER_NAME_KEY) ?? "",
  );
  const [joinValue, setJoinValue] = useState("");
  const [recentTables, setRecentTables] = useState<RecentTable[]>(() =>
    readRecentTables(),
  );

  const persistPlayerName = () => {
    const nextName = playerName.trim() || "Guest";
    sessionStorage.setItem(PLAYER_NAME_KEY, nextName);
    return nextName;
  };

  const rememberTable = (code: string) => {
    const nextEntry = {
      code,
      visitedAt: new Date().toISOString(),
    } satisfies RecentTable;
    setRecentTables((current) => {
      const next = [
        nextEntry,
        ...current.filter((entry) => entry.code !== code),
      ].slice(0, 4);
      localStorage.setItem(RECENT_TABLES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const goToTable = (value: string) => {
    const code = parseTableCode(value);
    if (!code) return;
    persistPlayerName();
    rememberTable(code);
    navigate(`/table/${code}`);
  };

  const handleCreateTable = () => {
    const code = createTableCode();
    persistPlayerName();
    rememberTable(code);
    navigate(`/table/${code}`);
  };

  const handleJoinTable: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    goToTable(joinValue);
  };

  return (
    <section className="landing-page">
      <div className="landing-surface">
        <div className="landing-felt"></div>
        <div className="landing-mesh"></div>

        <div className="landing-centerpiece">
          <div className="playmat-brand">
            <h1>Playmat</h1>
            <p>Pull up a chair.</p>
          </div>

          <div className="tactile-box">
            <div className="tactile-box-inner">
              <div className="tactile-field">
                <label htmlFor="player-name">Your Name</label>
                <input
                  id="player-name"
                  maxLength={24}
                  placeholder="e.g. Nissa"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="tactile-actions">
                <button
                  className="btn-start-table"
                  type="button"
                  onClick={handleCreateTable}
                >
                  <span className="btn-glow"></span>
                  <span className="btn-text">Start a New Table</span>
                </button>

                <div className="tactile-divider">
                  <span>or</span>
                </div>

                <form className="join-form" onSubmit={handleJoinTable}>
                  <input
                    id="join-table"
                    placeholder="Enter table code or link..."
                    value={joinValue}
                    onChange={(event) => setJoinValue(event.target.value)}
                    autoComplete="off"
                  />
                  <button className="btn-join" type="submit">
                    Join
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="landing-footer-actions">
            {recentTables.length > 0 && (
              <div className="recent-chips">
                <span className="recent-label">Recent:</span>
                {recentTables.map((entry) => (
                  <button
                    key={entry.code}
                    className="recent-chip"
                    type="button"
                    onClick={() => goToTable(entry.code)}
                  >
                    {entry.code}
                  </button>
                ))}
              </div>
            )}

            <Link className="btn-deckbuilder-link" to="/decks">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
              </svg>
              Deckbuilder
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
