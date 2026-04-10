import { Link } from "react-router-dom";
import { CardImage } from "../../components/card-image";
import { formatDeckCount, getDeckCoverCard, type SavedDeck } from "../../lib/decks";
import { formatUpdatedAt } from "./helpers";

type DeckLibraryTileProps = {
  deck: SavedDeck;
  onDuplicate: (deck: SavedDeck) => void;
  onDelete: (deck: SavedDeck) => void;
};

export function DeckLibraryTile({ deck, onDuplicate, onDelete }: DeckLibraryTileProps) {
  const coverCard = getDeckCoverCard(deck);

  return (
    <article className="dl-card">
      <div className="dl-card-media">
        {coverCard?.artCropUrl || coverCard?.imageUrl ? (
          <CardImage
            alt={coverCard.name}
            className="dl-card-image"
            src={coverCard.artCropUrl ?? coverCard.imageUrl}
            width={488}
            height={320}
            fallback={<div className="dl-card-fallback">{deck.name.slice(0, 1)}</div>}
          />
        ) : (
          <div className="dl-card-fallback">{deck.name.slice(0, 1)}</div>
        )}
        <div className="dl-card-scrim" />
      </div>

      <div className="dl-card-content">
        <Link to={`/decks/${deck.id}`} className="dl-card-link" aria-label={`Edit ${deck.name}`} />

        <div className="dl-card-info">
          <h2 className="dl-card-title">{deck.name || "Untitled Deck"}</h2>
          <div className="dl-card-meta">
            <span>{formatDeckCount(deck)}</span>
            <span className="dl-meta-dot" aria-hidden="true">•</span>
            <span>Updated {formatUpdatedAt(deck.updatedAt)}</span>
          </div>
        </div>

        <div className="dl-card-actions">
          <button
            className="dl-action-btn"
            title="Duplicate deck"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDuplicate(deck);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button
            className="dl-action-btn dl-action-danger"
            title="Delete deck"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete(deck);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    </article>
  );
}
