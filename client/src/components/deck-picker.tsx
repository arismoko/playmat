import { countDeckCards, type SavedDeck } from "../lib/decks";

type DeckPickerProps = {
  decks: SavedDeck[];
  open: boolean;
  selectedDeckName: string | null;
  onClose: () => void;
  onSelect: (deck: SavedDeck) => void | Promise<void>;
};

export function DeckPicker({
  decks,
  open,
  selectedDeckName,
  onClose,
  onSelect,
}: DeckPickerProps) {
  const formatDeckCount = (deck: SavedDeck) => {
    const mainCount = countDeckCards(deck.cards);
    const sideCount = countDeckCards(deck.sideboard);

    return sideCount > 0 ? `${mainCount} main • ${sideCount} side` : `${mainCount} cards`;
  };

  if (!open) {
    return null;
  }

  return (
    <div className="ready-room-picker-backdrop" onClick={onClose} role="presentation">
      <div
        className="ready-room-picker"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="ready-room-picker-header">
          <div>
            <h2>Choose Deck</h2>
            <p>Saved decks in this browser.</p>
          </div>
          <button className="ready-room-button ready-room-button-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="ready-room-picker-list">
          {decks.length ? (
            decks.map((deck) => (
              <button
                key={deck.id}
                className={`ready-room-picker-item${deck.name === selectedDeckName ? " ready-room-picker-item-active" : ""}`}
                type="button"
                onClick={() => {
                  void onSelect(deck);
                  onClose();
                }}
              >
                <span className="ready-room-picker-deck-name">{deck.name}</span>
                <span className="ready-room-picker-deck-count">
                  {formatDeckCount(deck)}
                </span>
              </button>
            ))
          ) : (
            <div className="ready-room-picker-empty">
              No saved decks yet. Build one in the deckbuilder first.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
