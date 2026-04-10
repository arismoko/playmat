import { useEffect, useMemo, useState } from "react";
import { CardImage } from "../../components/card-image";
import { lookupRelatedCardsByPrintingId, type CardResult } from "../../lib/card-api";
import { MasterDetailPanel } from "./master-detail-panel";

type DetailMode = "card" | "text";

type RelatedCardsDialogProps = {
  canCreateTokens?: boolean;
  onClose: () => void;
  onCreateToken?: (token: CardResult) => void;
  sourceCard: CardResult;
};

type RelatedEntry = {
  card: CardResult;
  relation: CardResult["relatedCards"][number];
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function formatComponentLabel(component?: string): string {
  return component ? component.replace(/_/g, " ") : "related";
}

function orderRelatedCards(sourceCard: CardResult, cards: CardResult[]): RelatedEntry[] {
  const cardsByOracleId = new Map<string, CardResult>();
  const cardsById = new Map<string, CardResult>();
  const cardsByName = new Map<string, CardResult>();

  for (const card of cards) {
    if (card.oracleId) {
      cardsByOracleId.set(card.oracleId, card);
    }

    cardsById.set(card.id, card);
    cardsByName.set(normalizeName(card.name), card);
  }

  const seenKeys = new Set<string>();
  const orderedEntries: RelatedEntry[] = [];

  for (const relation of sourceCard.relatedCards) {
    const relatedCard = (relation.oracleId ? cardsByOracleId.get(relation.oracleId) : undefined)
      ?? (relation.id ? cardsById.get(relation.id) : undefined)
      ?? cardsByName.get(normalizeName(relation.name));

    if (!relatedCard) {
      continue;
    }

    if (
      relatedCard.id === sourceCard.id
      || (relatedCard.oracleId && sourceCard.oracleId === relatedCard.oracleId)
      || normalizeName(relatedCard.name) === normalizeName(sourceCard.name)
    ) {
      continue;
    }

    const stableKey = relatedCard.oracleId ?? relatedCard.id;

    if (seenKeys.has(stableKey)) {
      continue;
    }

    seenKeys.add(stableKey);
    orderedEntries.push({ card: relatedCard, relation });
  }

  return orderedEntries;
}

export function RelatedCardsDialog({
  canCreateTokens = false,
  onClose,
  onCreateToken,
  sourceCard,
}: RelatedCardsDialogProps) {
  const [relatedCards, setRelatedCards] = useState<CardResult[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>("card");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);
    setError(null);
    setRelatedCards([]);
    setSelectedCardId(null);

    void lookupRelatedCardsByPrintingId(sourceCard.id, controller.signal)
      .then((cards) => {
        if (controller.signal.aborted) {
          return;
        }

        setRelatedCards(cards);
        setSelectedCardId(cards[0]?.id ?? null);
      })
      .catch((nextError) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : "Related card lookup failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [sourceCard.id]);

  const orderedRelatedEntries = useMemo(
    () => orderRelatedCards(sourceCard, relatedCards),
    [relatedCards, sourceCard],
  );
  const selectedEntry = orderedRelatedEntries.find((entry) => entry.card.id === selectedCardId)
    ?? orderedRelatedEntries[0]
    ?? null;

  return (
    <div className="game-table-overlay" onClick={onClose} role="presentation">
      <section
        aria-label={`Related cards for ${sourceCard.name}`}
        className="game-table-dialog game-table-related-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="game-table-dialog-header">
          <div>
            <strong className="game-table-dialog-title">Related cards</strong>
            <p className="game-table-dialog-meta">Links and token references for {sourceCard.name}.</p>
          </div>

          <button className="button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {isLoading ? <p className="game-table-token-status">Loading related cards...</p> : null}
        {error ? <p className="game-table-token-status game-table-token-status-error">{error}</p> : null}

        {!isLoading && !error && orderedRelatedEntries.length === 0 ? (
          <p className="game-table-token-status">No related cards were found for {sourceCard.name}.</p>
        ) : null}

        {!isLoading && !error && orderedRelatedEntries.length > 0 && selectedEntry ? (
          <>
            <MasterDetailPanel
              detail={(
                <div className="game-table-token-preview-content">
                  <div className="game-table-detail-mode-toggle" role="tablist" aria-label="Related card detail mode">
                    <button
                      aria-selected={detailMode === "card"}
                      className={[
                        "game-table-detail-mode-button",
                        detailMode === "card" ? "game-table-detail-mode-button-active" : "",
                      ].filter(Boolean).join(" ")}
                      type="button"
                      onClick={() => setDetailMode("card")}
                    >
                      Card
                    </button>
                    <button
                      aria-selected={detailMode === "text"}
                      className={[
                        "game-table-detail-mode-button",
                        detailMode === "text" ? "game-table-detail-mode-button-active" : "",
                      ].filter(Boolean).join(" ")}
                      type="button"
                      onClick={() => setDetailMode("text")}
                    >
                      Text
                    </button>
                  </div>

                  {detailMode === "card" ? (
                    <div className="game-table-token-preview-art game-table-token-preview-art-full">
                      <CardImage
                        alt={selectedEntry.card.name}
                        className="game-table-token-preview-image"
                        priority
                        src={selectedEntry.card.imageUrl}
                        fallback={<div className="game-table-token-option-fallback">{selectedEntry.card.name}</div>}
                      />
                    </div>
                  ) : null}

                  {detailMode === "text" ? (
                    <div className="game-table-token-preview-copy">
                      <strong>{selectedEntry.card.name}</strong>
                      <span>{selectedEntry.card.typeLine}</span>
                      <span>{formatComponentLabel(selectedEntry.relation.component)}</span>
                      {selectedEntry.card.oracleText ? <p>{selectedEntry.card.oracleText}</p> : null}
                    </div>
                  ) : null}
                </div>
              )}
              detailClassName="game-table-token-preview"
              list={orderedRelatedEntries.map((entry) => {
                const isSelected = entry.card.id === selectedEntry.card.id;

                return (
                  <button
                    aria-selected={isSelected}
                    className={[
                      "game-table-token-option",
                      isSelected ? "game-table-token-option-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={`${entry.relation.component ?? "related"}-${entry.card.id}`}
                    type="button"
                    onClick={() => setSelectedCardId(entry.card.id)}
                  >
                    <CardImage
                      alt={entry.card.name}
                      className="game-table-token-option-image"
                      src={entry.card.imageUrl}
                      fallback={<div className="game-table-token-option-image game-table-token-option-fallback">{entry.card.name}</div>}
                    />

                    <span className="game-table-token-option-copy">
                      <strong>{entry.card.name}</strong>
                      <span>{entry.card.typeLine}</span>
                      <span>{formatComponentLabel(entry.relation.component)}</span>
                    </span>
                  </button>
                );
              })}
              listAriaLabel="Related cards"
              listClassName="game-table-token-list"
            />

            <div className="game-table-dialog-actions">
              <button className="button" type="button" onClick={onClose}>
                Close
              </button>

              {canCreateTokens && selectedEntry.relation.component === "token" && onCreateToken ? (
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => onCreateToken(selectedEntry.card)}
                >
                  Create token
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
