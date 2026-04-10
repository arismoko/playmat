import type { PublicCardView, ZoneName } from "@playmat/shared/table";
import { useEffect, useMemo, useState } from "react";
import { CardImage } from "../../components/card-image";
import {
  lookupCardsByNames,
  type CardResult,
} from "../../lib/card-api";
import { MasterDetailPanel } from "./master-detail-panel";
import type { TableInteractionController } from "./use-table-interaction";

type ZoneViewerModalProps = {
  cards: PublicCardView[];
  interaction: TableInteractionController;
  ownerPlayerId: string;
  onClose: (options?: { shuffleOnClose: boolean }) => void;
  ownerName: string;
  readOnly: boolean;
  shuffleOnCloseAvailable?: boolean;
  title: string;
  zone: ZoneName;
};

type ZoneViewerSortMode = "pile" | "name" | "mana-value" | "type";

type ZoneViewerEntry = {
  card: PublicCardView;
  detail: CardResult | null;
  pileIndex: number;
};

type DetailMode = "card" | "text";

const SORT_OPTIONS: Array<{ label: string; value: ZoneViewerSortMode }> = [
  { label: "Pile", value: "pile" },
  { label: "Name", value: "name" },
  { label: "Mana Value", value: "mana-value" },
  { label: "Type", value: "type" },
];

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function getCardStatLine(detail: CardResult | null): string | null {
  if (!detail) {
    return null;
  }

  if (detail.power && detail.toughness) {
    return `${detail.power}/${detail.toughness}`;
  }

  if (detail.loyalty) {
    return `L${detail.loyalty}`;
  }

  if (detail.defense) {
    return `D${detail.defense}`;
  }

  return null;
}

function matchesQuery(entry: ZoneViewerEntry, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    entry.card.name,
    entry.detail?.typeLine ?? "",
    entry.detail?.oracleText ?? "",
    entry.detail?.manaCost ?? "",
  ]
    .join("\n")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function sortEntries(
  entries: ZoneViewerEntry[],
  sortMode: ZoneViewerSortMode,
  direction: "asc" | "desc",
): ZoneViewerEntry[] {
  const sorted = entries.slice().sort((left, right) => {
    switch (sortMode) {
      case "name": {
        const nameCompare = compareText(left.card.name, right.card.name);

        if (nameCompare !== 0) {
          return nameCompare;
        }

        break;
      }
      case "mana-value": {
        const manaValueCompare =
          (left.detail?.manaValue ?? Number.POSITIVE_INFINITY)
          - (right.detail?.manaValue ?? Number.POSITIVE_INFINITY);

        if (manaValueCompare !== 0) {
          return manaValueCompare;
        }

        const nameCompare = compareText(left.card.name, right.card.name);

        if (nameCompare !== 0) {
          return nameCompare;
        }

        break;
      }
      case "type": {
        const typeCompare = compareText(left.detail?.typeLine ?? "", right.detail?.typeLine ?? "");

        if (typeCompare !== 0) {
          return typeCompare;
        }

        const nameCompare = compareText(left.card.name, right.card.name);

        if (nameCompare !== 0) {
          return nameCompare;
        }

        break;
      }
      default:
        break;
    }

    return left.pileIndex - right.pileIndex;
  });

  return direction === "desc" ? sorted.reverse() : sorted;
}

function ZoneViewerDetail({
  detailMode,
  entry,
  onDetailModeChange,
}: {
  detailMode: DetailMode;
  entry: ZoneViewerEntry | null;
  onDetailModeChange: (nextMode: DetailMode) => void;
}) {
  if (!entry) {
    return <div className="game-table-zone-viewer-detail-empty"><p>Select a card to see details.</p></div>;
  }

  const statLine = getCardStatLine(entry.detail);
  const detailImageUrl = entry.detail?.imageUrl ?? entry.card.imageUrl;
  const oracleLines = entry.detail?.oracleText
    ? entry.detail.oracleText.split("\n").map((line) => line.trim()).filter(Boolean)
    : [];

  return (
    <div className="game-table-zone-viewer-detail-content">
      <div className="game-table-detail-mode-toggle" role="tablist" aria-label="Detail mode">
        <button
          aria-selected={detailMode === "card"}
          className={[
            "game-table-detail-mode-button",
            detailMode === "card" ? "game-table-detail-mode-button-active" : "",
          ].filter(Boolean).join(" ")}
          type="button"
          onClick={() => onDetailModeChange("card")}
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
          onClick={() => onDetailModeChange("text")}
        >
          Text
        </button>
      </div>

      {detailMode === "card" ? (
        <div className="game-table-zone-viewer-detail-art game-table-zone-viewer-detail-art-full">
          <CardImage
            alt={entry.card.name}
            className="game-table-zone-viewer-detail-image"
            height={680}
            priority
            src={detailImageUrl}
            width={488}
            fallback={<div className="game-table-zone-viewer-detail-fallback">{entry.card.name}</div>}
          />
        </div>
      ) : null}

      {detailMode === "text" ? (
        <div className="game-table-zone-viewer-detail-copy">
        <div className="game-table-zone-viewer-detail-header">
          <strong className="game-table-zone-viewer-detail-name">{entry.card.name}</strong>
          {entry.detail?.manaCost ? (
            <span className="game-table-zone-viewer-detail-mana">{entry.detail.manaCost}</span>
          ) : null}
        </div>

        {entry.detail?.typeLine ? (
          <p className="game-table-zone-viewer-detail-type">{entry.detail.typeLine}</p>
        ) : null}

        <div className="game-table-zone-viewer-detail-meta">
          <span className="game-table-zone-viewer-detail-chip">#{entry.pileIndex + 1}</span>
          <span className="game-table-zone-viewer-detail-chip">
            MV {entry.detail?.manaValue ?? "-"}
          </span>
          {statLine ? <span className="game-table-zone-viewer-detail-chip">{statLine}</span> : null}
          {entry.detail?.rarity ? (
            <span className="game-table-zone-viewer-detail-chip">{entry.detail.rarity}</span>
          ) : null}
        </div>

        {entry.detail?.keywords.length ? (
          <p className="game-table-zone-viewer-detail-keywords">
            {entry.detail.keywords.join(", ")}
          </p>
        ) : null}

        {oracleLines.length ? (
          <div className="game-table-zone-viewer-detail-rules">
            {oracleLines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
          </div>
        ) : (
          <p className="game-table-zone-viewer-detail-placeholder">No oracle text.</p>
        )}

        {entry.detail?.setName ? (
          <p className="game-table-zone-viewer-detail-set">
            {entry.detail.setName}
            {entry.detail.collectorNumber ? ` · ${entry.detail.collectorNumber}` : ""}
          </p>
        ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ZoneViewerRow({
  active,
  entry,
  interaction,
  onActivate,
  ownerPlayerId,
  pileCount,
  readOnly,
  visibleCardIds,
  zone,
}: {
  active: boolean;
  entry: ZoneViewerEntry;
  interaction: TableInteractionController;
  onActivate: (cardId: string) => void;
  ownerPlayerId: string;
  pileCount: number;
  readOnly: boolean;
  visibleCardIds: string[];
  zone: ZoneName;
}) {
  const selection = {
    cardId: entry.card.id,
    ownerPlayerId,
    zone,
  };
  const isSelected = interaction.isCardSelected(selection);
  const statLine = getCardStatLine(entry.detail);
  const thumbnailUrl = entry.detail?.thumbnailUrl ?? entry.detail?.imageUrl ?? entry.card.imageUrl;

  return (
    <button
      aria-label={`${entry.card.name}, position ${entry.pileIndex + 1}`}
      className={[
        "game-table-zone-viewer-row",
        active ? "game-table-zone-viewer-row-active" : "",
        isSelected ? "game-table-zone-viewer-row-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-table-card-id={entry.card.id}
      data-table-card-owner-player-id={ownerPlayerId}
      type="button"
      onFocus={() => onActivate(entry.card.id)}
      onMouseEnter={() => onActivate(entry.card.id)}
      onClick={(event) => {
        onActivate(entry.card.id);

        if (event.metaKey || event.ctrlKey) {
          interaction.toggleCardSelection(selection);
          return;
        }

        interaction.selectCard(selection);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onActivate(entry.card.id);

        if (!interaction.isCardSelected(selection)) {
          interaction.selectCard(selection);
        }

        interaction.openContextMenu({
          ...selection,
          kind: "card",
          source: "viewer",
          viewerLayout: "list",
          viewerReadOnly: readOnly,
          viewerVisibleCardIds: visibleCardIds,
          x: event.clientX,
          y: event.clientY,
        });
      }}
    >
      <span className="game-table-zone-viewer-position">{entry.pileIndex + 1}</span>

      <span className="game-table-zone-viewer-thumbnail" aria-hidden="true">
        <CardImage
          alt={entry.card.name}
          className="game-table-zone-viewer-thumbnail-image"
          height={56}
          src={thumbnailUrl}
          width={40}
          fallback={<span className="game-table-zone-viewer-thumbnail-fallback">{entry.card.name}</span>}
        />
      </span>

      <span className="game-table-zone-viewer-primary">
        <span className="game-table-zone-viewer-name-line">
          <strong className="game-table-zone-viewer-name">{entry.card.name}</strong>
          {entry.pileIndex === 0 ? <span className="game-table-zone-viewer-badge">Top</span> : null}
          {entry.pileIndex === pileCount - 1 && pileCount > 1 ? (
            <span className="game-table-zone-viewer-badge">Bottom</span>
          ) : null}
        </span>
        <span className="game-table-zone-viewer-type">{entry.detail?.typeLine ?? "Loading type..."}</span>
      </span>

      <span className="game-table-zone-viewer-meta">
        <span className="game-table-zone-viewer-mana-value">
          MV {entry.detail?.manaValue ?? "-"}
        </span>
        {statLine ? <span className="game-table-zone-viewer-stat">{statLine}</span> : null}
      </span>
    </button>
  );
}

export function ZoneViewerModal({
  cards,
  interaction,
  ownerPlayerId,
  onClose,
  ownerName,
  readOnly,
  shuffleOnCloseAvailable = false,
  title,
  zone,
}: ZoneViewerModalProps) {
  const [detailsByCardId, setDetailsByCardId] = useState<Map<string, CardResult>>(new Map());
  const [query, setQuery] = useState("");
  const [shuffleOnClose, setShuffleOnClose] = useState(shuffleOnCloseAvailable);
  const [sortMode, setSortMode] = useState<ZoneViewerSortMode>("pile");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeCardId, setActiveCardId] = useState<string | null>(cards[0]?.id ?? null);
  const [detailMode, setDetailMode] = useState<DetailMode>("card");
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;

    setDetailsByCardId(new Map());

    void lookupCardsByNames(cards.map((card) => card.name)).then((detailsByName) => {
      if (cancelled) {
        return;
      }

      const nextDetailsByCardId = new Map<string, CardResult>();

      for (const card of cards) {
        const detail = detailsByName.get(card.name);

        if (detail) {
          nextDetailsByCardId.set(card.id, detail);
        }
      }

      setDetailsByCardId(nextDetailsByCardId);
    }).catch(() => {
      if (!cancelled) {
        setDetailsByCardId(new Map());
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cards]);

  useEffect(() => {
    setShuffleOnClose(shuffleOnCloseAvailable);
  }, [shuffleOnCloseAvailable, ownerPlayerId, title, zone]);

  useEffect(() => {
    setActiveCardId((currentActiveCardId) => {
      if (currentActiveCardId && cards.some((card) => card.id === currentActiveCardId)) {
        return currentActiveCardId;
      }

      return cards[0]?.id ?? null;
    });
  }, [cards]);

  const entries = useMemo(
    () => cards.map((card, pileIndex) => ({
      card,
      detail: detailsByCardId.get(card.id) ?? null,
      pileIndex,
    } satisfies ZoneViewerEntry)),
    [cards, detailsByCardId],
  );

  const filteredAndSortedEntries = useMemo(
    () => sortEntries(
      entries.filter((entry) => matchesQuery(entry, normalizedQuery)),
      sortMode,
      sortDirection,
    ),
    [entries, normalizedQuery, sortDirection, sortMode],
  );

  const visibleCardIds = useMemo(
    () => filteredAndSortedEntries.map((entry) => entry.card.id),
    [filteredAndSortedEntries],
  );

  useEffect(() => {
    setActiveCardId((currentActiveCardId) => {
      if (currentActiveCardId && visibleCardIds.includes(currentActiveCardId)) {
        return currentActiveCardId;
      }

      return visibleCardIds[0] ?? null;
    });
  }, [visibleCardIds]);

  const activeEntry = useMemo(
    () => filteredAndSortedEntries.find((entry) => entry.card.id === activeCardId) ?? null,
    [activeCardId, filteredAndSortedEntries],
  );

  function handleClose(): void {
    onClose({ shuffleOnClose });
  }

  function handleSelectSortMode(nextSortMode: ZoneViewerSortMode): void {
    if (nextSortMode === sortMode) {
      setSortDirection((currentDirection) => currentDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortMode(nextSortMode);
    setSortDirection("asc");
  }

  return (
    <div className="game-table-overlay" onClick={handleClose} role="presentation">
      <section
        aria-label={title}
        className="game-table-dialog game-table-zone-viewer"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="game-table-dialog-header">
          <div>
            <p className="game-table-panel-title">{zone}</p>
            <strong className="game-table-dialog-title">{title}</strong>
            <p className="game-table-dialog-meta">
              {filteredAndSortedEntries.length} of {cards.length} cards from {ownerName}
            </p>
          </div>

          <button className="button" type="button" onClick={handleClose}>
            Close
          </button>
        </header>

        <div className="game-table-zone-viewer-controls">
          <label className="game-table-dialog-field game-table-zone-viewer-search-field">
            <span>Search cards</span>
            <input
              autoFocus
              className="game-table-zone-search-input"
              placeholder="Filter by name, type, or oracle text"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="game-table-zone-viewer-sort-panel">
            <span className="game-table-zone-viewer-sort-label">Order</span>
            <div className="game-table-zone-viewer-sort-bar">
              {SORT_OPTIONS.map((option) => {
                const isActive = option.value === sortMode;

                return (
                  <button
                    className={[
                      "game-table-zone-viewer-sort-button",
                      isActive ? "game-table-zone-viewer-sort-button-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={option.value}
                    type="button"
                    onClick={() => handleSelectSortMode(option.value)}
                  >
                    <span>{option.label}</span>
                    {isActive ? (
                      <span className="game-table-zone-viewer-sort-direction">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {shuffleOnCloseAvailable ? (
          <label className="game-table-zone-viewer-toggle">
            <input
              checked={shuffleOnClose}
              type="checkbox"
              onChange={(event) => setShuffleOnClose(event.target.checked)}
            />
            <span>Shuffle library when closing</span>
          </label>
        ) : null}

        {filteredAndSortedEntries.length ? (
          <MasterDetailPanel
            detail={(
              <ZoneViewerDetail
                detailMode={detailMode}
                entry={activeEntry}
                onDetailModeChange={setDetailMode}
              />
            )}
            detailClassName="game-table-zone-viewer-detail"
            list={filteredAndSortedEntries.map((entry) => (
              <ZoneViewerRow
                active={entry.card.id === activeEntry?.card.id}
                entry={entry}
                interaction={interaction}
                key={entry.card.id}
                onActivate={setActiveCardId}
                ownerPlayerId={ownerPlayerId}
                pileCount={cards.length}
                readOnly={readOnly}
                visibleCardIds={visibleCardIds}
                zone={zone}
              />
            ))}
            listAriaLabel={title}
            listClassName="game-table-zone-viewer-list"
          />
        ) : (
          <div className="game-table-zone-viewer-empty">No cards match that search.</div>
        )}
      </section>
    </div>
  );
}
