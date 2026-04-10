import type { ClientAction } from "@playmat/shared/actions";
import type { PlayerView } from "@playmat/shared/table";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CardImage } from "../../components/card-image";
import { DeckPicker } from "../../components/deck-picker";
import { LobbySeatCard } from "../../components/lobby-seat-card";
import { copyCurrentUrl } from "../../lib/copy-current-url";
import { deckNeedsImageHydration, hydrateDeckImages } from "../../lib/deck-images";
import { readSavedDecks, saveDeck, type SavedDeck } from "../../lib/decks";
import { useTableStore } from "../../stores/table-store";

type ReadyRoomProps = {
  sendAction: (action: ClientAction) => void;
};

function isLikelyLand(name: string): boolean {
  const normalizedName = name.toLowerCase();

  return (
    ["plains", "island", "swamp", "mountain", "forest", "wastes"].some(
      (landName) => normalizedName.includes(landName),
    ) || normalizedName.endsWith("land")
  );
}

export function ReadyRoom({ sendAction }: ReadyRoomProps) {
  const table = useTableStore((state) => state.table);
  const connectionState = useTableStore((state) => state.connectionState);
  const error = useTableStore((state) => state.error);
  const playerId = useTableStore((state) => state.playerId);
  const [isDeckPickerOpen, setDeckPickerOpen] = useState(false);
  const [isListViewOpen, setIsListViewOpen] = useState(false);
  const [isHydratingDeckSelection, setHydratingDeckSelection] = useState(false);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);

  useEffect(() => {
    setSavedDecks(readSavedDecks());
  }, [isDeckPickerOpen]);

  const currentPlayer = useMemo<PlayerView | null>(() => {
    if (!table || !playerId) {
      return null;
    }

    return table.players[playerId] ?? null;
  }, [playerId, table]);

  const connectedPlayers = useMemo(() => {
    if (!table) {
      return [];
    }

    return Object.values(table.players).filter((player) => player.connected);
  }, [table]);

  const isHost = Boolean(playerId && table?.hostId === playerId);

  const selectedDeck = useMemo(() => {
    if (!currentPlayer?.selectedDeckName) {
      return null;
    }

    return (
      savedDecks.find((deck) => deck.name === currentPlayer.selectedDeckName) ??
      null
    );
  }, [currentPlayer?.selectedDeckName, savedDecks]);

  const signatureCards = useMemo(() => {
    if (!selectedDeck?.cards) {
      return [];
    }

    const nonLands = selectedDeck.cards.filter((card) => !isLikelyLand(card.name));
    const lands = selectedDeck.cards.filter((card) => isLikelyLand(card.name));
    return [...nonLands, ...lands].slice(0, 4);
  }, [selectedDeck]);

  useEffect(() => {
    setIsListViewOpen(false);
  }, [selectedDeck?.id]);

  const canStartGame = useMemo(() => {
    if (!table || !playerId || table.status !== "lobby") {
      return false;
    }

    return connectedPlayers.every((player) => {
      if (!player.selectedDeckName || player.selectedDeckCardCount === 0) {
        return false;
      }

      if (player.id === table.hostId) {
        return true;
      }

      return player.ready;
    });
  }, [connectedPlayers, playerId, table]);

  if (!table) {
    return null;
  }

  return (
    <section className="page ready-room-page">
      <div className="ready-room-shell">
        <div className="ready-room-layout">
          <aside className="ready-room-sidebar">
            <header className="ready-room-header">
              <div>
                <h1 className="ready-room-title">Ready room</h1>
                <p className="ready-room-meta">
                  {connectedPlayers.length} player
                  {connectedPlayers.length === 1 ? "" : "s"} connected
                </p>
              </div>

              {connectionState !== "open" ? (
                <p className="ready-room-connection-warning">
                  Connection {connectionState}
                </p>
              ) : null}
            </header>

            <div className="ready-room-roster">
              {connectedPlayers.length ? (
                connectedPlayers.map((player) => (
                  <LobbySeatCard
                    key={player.id}
                    player={player}
                    isCurrentPlayer={player.id === playerId}
                    isHost={player.id === table.hostId}
                  />
                ))
              ) : (
                <div className="ready-room-empty">Waiting for players...</div>
              )}
            </div>

            <footer className="ready-room-sidebar-footer">
              <button
                className="ready-room-button ready-room-button-secondary"
                type="button"
                onClick={() => void copyCurrentUrl()}
              >
                Copy invite
              </button>

              {isHost ? (
                <button
                  className="ready-room-button ready-room-button-primary"
                  type="button"
                  disabled={!canStartGame}
                  onClick={() => sendAction({ type: "start-game" })}
                >
                  Start game
                </button>
              ) : (
                <button
                  className={`ready-room-button ready-room-button-primary${currentPlayer?.ready ? " ready-room-button-ready" : ""}`}
                  type="button"
                  disabled={!currentPlayer?.selectedDeckName}
                  onClick={() =>
                    sendAction({
                      type: "set-ready",
                      ready: !currentPlayer?.ready,
                    })
                  }
                >
                  {currentPlayer?.ready ? "Ready" : "Ready up"}
                </button>
              )}

              <p className="ready-room-note ready-room-note-center">
                {isHost
                  ? canStartGame
                    ? "Everyone is seated and ready."
                    : "Guests need decks and must ready up before the game can start."
                  : "Choose your deck, then mark yourself ready."}
              </p>
            </footer>
          </aside>

          <section className="ready-room-preview">
            <header className="ready-room-preview-header">
              <div>
                <span className="ready-room-section-label">Deck preview</span>
                <h2 className="ready-room-deck-title">
                  {currentPlayer?.selectedDeckName ?? "No deck selected"}
                </h2>
                <p className="ready-room-note">
                  {isHydratingDeckSelection
                    ? "Resolving card art for this deck..."
                    : currentPlayer?.selectedDeckCardCount
                      ? `${currentPlayer.selectedDeckCardCount} cards ready to load`
                      : "Choose a saved deck before the match starts."}
                </p>
              </div>

              <div className="ready-room-button-stack">
                <button
                  className="ready-room-button ready-room-button-secondary"
                  type="button"
                  onClick={() => setDeckPickerOpen(true)}
                >
                  {currentPlayer?.selectedDeckName ? "Swap deck" : "Choose deck"}
                </button>
                <Link className="ready-room-button ready-room-button-secondary" to="/decks">
                  Deckbuilder
                </Link>
              </div>
            </header>

            <div className="ready-room-preview-body new-preview-body">
              {isListViewOpen ? (
                <div className="ready-room-full-list">
                  <div className="list-toolbar">
                    <button
                      className="ready-room-button ready-room-button-secondary"
                      type="button"
                      onClick={() => setIsListViewOpen(false)}
                    >
                      ← Back to spread
                    </button>
                  </div>
                  <div className="ready-room-card-list scrollable">
                    {selectedDeck?.cards.length ? (
                      selectedDeck.cards.map((card) => (
                        <div className="ready-room-card-row" key={card.name}>
                          <span>{card.name}</span>
                          <span>{card.count}x</span>
                        </div>
                      ))
                    ) : (
                      <div className="ready-room-empty">No cards in deck.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="signature-spread-container">
                  {signatureCards.length > 0 ? (
                    <>
                      <div className="signature-spread">
                        {signatureCards.map((card, index) => (
                          <button
                            className="signature-card"
                            key={card.name}
                            type="button"
                            style={
                              {
                                "--card-x": `${(index - (signatureCards.length - 1) / 2) * 68}px`,
                                "--card-y": `${(index % 2) * 10}px`,
                                "--card-rotate": `${(index - (signatureCards.length - 1) / 2) * 8}deg`,
                                "--card-z": `${index + 1}`,
                              } as CSSProperties
                            }
                          >
                            <div className="signature-card-inner">
                              <CardImage
                                alt={card.name}
                                className="signature-card-image"
                                priority
                                src={card.imageUrl}
                                fallback={
                                  <div className="signature-card-fallback">{card.name}</div>
                                }
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        className="ready-room-button ready-room-button-secondary view-list-btn"
                        type="button"
                        onClick={() => setIsListViewOpen(true)}
                      >
                        View full list
                      </button>
                    </>
                  ) : (
                    <div className="ready-room-empty">Pick a deck to preview cards.</div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {error ? <p className="ready-room-error">{error}</p> : null}
      </div>

        <DeckPicker
          decks={savedDecks}
          open={isDeckPickerOpen}
          selectedDeckName={currentPlayer?.selectedDeckName ?? null}
          onClose={() => setDeckPickerOpen(false)}
          onSelect={async (deck) => {
            let nextCards = deck.cards;
            let nextSideboard = deck.sideboard;

            if (deckNeedsImageHydration(deck.cards, deck.sideboard)) {
              setHydratingDeckSelection(true);

              try {
                const hydrated = await hydrateDeckImages(deck.cards, deck.sideboard);
                nextCards = hydrated.cards;
                nextSideboard = hydrated.sideboard;

                saveDeck({
                  id: deck.id,
                  name: deck.name,
                  cards: nextCards,
                  sideboard: nextSideboard,
                  coverCardName: deck.coverCardName,
                });
                setSavedDecks(readSavedDecks());
              } catch {
                // Keep selection resilient if metadata refresh fails.
              } finally {
                setHydratingDeckSelection(false);
              }
            }

            sendAction({ type: "select-deck", deckName: deck.name, cards: nextCards });
          }}
        />
      </section>
    );
}
