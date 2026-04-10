import { useEffect, useMemo, useState } from "react";
import { CardImage } from "../../components/card-image";
import { lookupRelatedTokenCardsByName, type CardResult } from "../../lib/card-api";
import { MasterDetailPanel } from "./master-detail-panel";

type DetailMode = "card" | "text";

type TokenCreationDialogProps = {
  sourceCardName: string;
  onClose: () => void;
  onCreate: (token: CardResult, count: number) => void;
};

function formatTokenStats(card: CardResult): string | null {
  if (!card.power && !card.toughness) {
    return null;
  }

  return `${card.power ?? "?"}/${card.toughness ?? "?"}`;
}

export function TokenCreationDialog({ sourceCardName, onClose, onCreate }: TokenCreationDialogProps) {
  const [tokenCards, setTokenCards] = useState<CardResult[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [countValue, setCountValue] = useState("1");
  const [detailMode, setDetailMode] = useState<DetailMode>("card");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);
    setError(null);
    setTokenCards([]);
    setSelectedTokenId(null);

    void lookupRelatedTokenCardsByName(sourceCardName, controller.signal)
      .then((cards) => {
        setTokenCards(cards);
        setSelectedTokenId(cards[0]?.id ?? null);
      })
      .catch((nextError) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : "Token lookup failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [sourceCardName]);

  const selectedToken = useMemo(
    () => tokenCards.find((card) => card.id === selectedTokenId) ?? tokenCards[0] ?? null,
    [selectedTokenId, tokenCards],
  );
  const selectedTokenStats = selectedToken ? formatTokenStats(selectedToken) : null;
  const parsedCount = Number.parseInt(countValue, 10);
  const createCount = Number.isFinite(parsedCount) ? Math.min(Math.max(parsedCount, 1), 99) : 1;

  return (
    <div className="game-table-overlay" onClick={onClose} role="presentation">
      <section
        aria-label="Create token"
        className="game-table-dialog game-table-token-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="game-table-dialog-header">
          <div>
            <strong className="game-table-dialog-title">Create token</strong>
            <p className="game-table-dialog-meta">Choose a predefined token for {sourceCardName}.</p>
          </div>

          <button className="button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {isLoading ? <p className="game-table-token-status">Loading tokens...</p> : null}
        {error ? <p className="game-table-token-status game-table-token-status-error">{error}</p> : null}

        {!isLoading && !error && tokenCards.length === 0 ? (
          <p className="game-table-token-status">No predefined tokens were found for {sourceCardName}.</p>
        ) : null}

        {!isLoading && !error && tokenCards.length > 0 && selectedToken ? (
          <>
            <MasterDetailPanel
              detail={(
                <div className="game-table-token-preview-content">
                  <div className="game-table-detail-mode-toggle" role="tablist" aria-label="Token detail mode">
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
                        alt={selectedToken.name}
                        className="game-table-token-preview-image"
                        priority
                        src={selectedToken.imageUrl}
                        fallback={<div className="game-table-token-option-fallback">{selectedToken.name}</div>}
                      />
                    </div>
                  ) : null}

                  {detailMode === "text" ? (
                    <div className="game-table-token-preview-copy">
                      <strong>{selectedToken.name}</strong>
                      <span>{selectedToken.typeLine}</span>
                      {selectedTokenStats ? <span>{selectedTokenStats}</span> : null}
                      {selectedToken.oracleText ? <p>{selectedToken.oracleText}</p> : null}
                    </div>
                  ) : null}
                </div>
              )}
              detailClassName="game-table-token-preview"
              list={tokenCards.map((tokenCard) => {
                const tokenStats = formatTokenStats(tokenCard);
                const isSelected = tokenCard.id === selectedToken.id;

                return (
                  <button
                    aria-selected={isSelected}
                    className={[
                      "game-table-token-option",
                      isSelected ? "game-table-token-option-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={tokenCard.id}
                    type="button"
                    onClick={() => setSelectedTokenId(tokenCard.id)}
                  >
                    <CardImage
                      alt={tokenCard.name}
                      className="game-table-token-option-image"
                      src={tokenCard.imageUrl}
                      fallback={<div className="game-table-token-option-image game-table-token-option-fallback">{tokenCard.name}</div>}
                    />

                    <span className="game-table-token-option-copy">
                      <strong>{tokenCard.name}</strong>
                      <span>{tokenCard.typeLine}</span>
                      {tokenStats ? <span>{tokenStats}</span> : null}
                    </span>
                  </button>
                );
              })}
              listAriaLabel="Available tokens"
              listClassName="game-table-token-list"
            />

            <label className="game-table-dialog-field">
              <span>Count</span>
              <input
                inputMode="numeric"
                max={99}
                min={1}
                type="number"
                value={countValue}
                onChange={(event) => setCountValue(event.target.value)}
              />
            </label>
          </>
        ) : null}

        <div className="game-table-dialog-actions">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button button-primary"
            disabled={!selectedToken || isLoading || Boolean(error)}
            type="button"
            onClick={() => {
              if (!selectedToken) {
                return;
              }

              onCreate(selectedToken, createCount);
            }}
          >
            Create token
          </button>
        </div>
      </section>
    </div>
  );
}
