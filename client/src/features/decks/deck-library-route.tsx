import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEFAULT_DECK_TEXT, deleteDeck, duplicateDeck, readSavedDecks, saveDeck, type SavedDeck } from "../../lib/decks";
import { DeckLibraryTile } from "./deck-library-tile";
import { resolveImportedDeck } from "./helpers";

export function DeckLibraryRoute() {
  const navigate = useNavigate();
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(() => readSavedDecks());
  const [isLoadingSample, setLoadingSample] = useState(false);

  const refreshDecks = () => {
    setSavedDecks(readSavedDecks());
  };

  const handleDuplicateDeck = (deck: SavedDeck) => {
    const duplicate = duplicateDeck(deck);
    refreshDecks();
    navigate(`/decks/${duplicate.id}`);
  };

  const handleDeleteDeck = (deck: SavedDeck) => {
    if (!window.confirm(`Delete ${deck.name}?`)) {
      return;
    }

    const nextDecks = deleteDeck(deck.id);
    setSavedDecks(nextDecks);
  };

  const handleLoadSample = async () => {
    try {
      setLoadingSample(true);
      const resolvedDeck = await resolveImportedDeck(DEFAULT_DECK_TEXT);

      if (!resolvedDeck) {
        return;
      }

      const savedDeck = saveDeck({
        name: resolvedDeck.name ?? "Sample Elves",
        cards: resolvedDeck.cards,
        sideboard: resolvedDeck.sideboard,
      });

      refreshDecks();
      navigate(`/decks/${savedDeck.id}`);
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <section className="dl-page">
      <header className="dl-header">
        <div className="dl-header-text">
          <span className="dl-eyebrow">Your Collection</span>
          <h1 className="dl-title">Deck Library</h1>
          <p className="dl-subtitle">Build, tune, and manage your constructed decks.</p>
        </div>

        <div className="dl-header-actions">
          <Link className="dl-btn dl-btn-secondary" to="/">
            Back to Home
          </Link>
        </div>
      </header>

      <div className="dl-grid">
        <Link className="dl-create-card" to="/decks/new">
          <div className="dl-create-content">
            <h2>New Deck</h2>
            <p>Start empty, paste a list, or import a Cockatrice file.</p>
          </div>
        </Link>

        {savedDecks.map((deck) => (
          <DeckLibraryTile key={deck.id} deck={deck} onDuplicate={handleDuplicateDeck} onDelete={handleDeleteDeck} />
        ))}
      </div>

      {!savedDecks.length ? (
        <div className="dl-empty-state">
          <p>No saved decks in this browser yet.</p>
          <button className="dl-btn dl-btn-secondary" disabled={isLoadingSample} type="button" onClick={() => void handleLoadSample()}>
            {isLoadingSample ? "Loading sample..." : "Load sample deck"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
