import type { DeckCard } from "@playmat/shared/table";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CardImage } from "../../components/card-image";
import {
  deckNeedsImageHydration,
  hydrateDeckImages,
  mergeDeckCardImageMetadata,
} from "../../lib/deck-images";
import { getDefaultDeckCoverCardName, readSavedDecks, saveDeck } from "../../lib/decks";
import { searchCards, type CardResult, type CardSearchDir, type CardSearchSort } from "../../lib/card-api";
import { DeckZonePanel } from "./deck-zone-panel";
import { CardDetailsModal } from "./card-details-modal";
import {
  adjustDeckCardCount,
  buildDeckDraft,
  formatDeckText,
  resolveCoverCard,
  resolveImportedDeck,
  upsertDeckCard,
} from "./helpers";
import type { DecklistView, DeckZone } from "./types";

const SEARCH_DEBOUNCE_MS = 260;
const SEARCH_PAGE_SIZE = 18;
const SEARCH_SKELETON_COUNT = 12;

type SearchOrderOption = {
  value: string;
  label: string;
  sort: CardSearchSort;
  dir: CardSearchDir;
};

const SEARCH_ORDER_OPTIONS: SearchOrderOption[] = [
  { value: "relevance-asc", label: "Best match", sort: "relevance", dir: "asc" },
  { value: "name-asc", label: "Name A-Z", sort: "name", dir: "asc" },
  { value: "name-desc", label: "Name Z-A", sort: "name", dir: "desc" },
  { value: "mv-asc", label: "Mana value: low to high", sort: "mv", dir: "asc" },
  { value: "mv-desc", label: "Mana value: high to low", sort: "mv", dir: "desc" },
  { value: "released-desc", label: "Newest release", sort: "released", dir: "desc" },
  { value: "released-asc", label: "Oldest release", sort: "released", dir: "asc" },
];

const DEFAULT_SEARCH_ORDER: SearchOrderOption = { value: "relevance-asc", label: "Best match", sort: "relevance", dir: "asc" };

function getSearchOrderOption(value: string): SearchOrderOption {
  return SEARCH_ORDER_OPTIONS.find((option) => option.value === value) ?? DEFAULT_SEARCH_ORDER;
}

function mergeSearchResults(current: CardResult[], incoming: CardResult[]): CardResult[] {
  const byId = new Map(current.map((card) => [card.id, card]));
  for (const card of incoming) byId.set(card.id, card);
  return Array.from(byId.values());
}

export function DeckEditorRoute() {
  const navigate = useNavigate();
  const { id } = useParams();
  const deckTextRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRequestIdRef = useRef(0);
  const [deckName, setDeckName] = useState("");
  const [deckCards, setDeckCards] = useState<DeckCard[]>([]);
  const [sideboardCards, setSideboardCards] = useState<DeckCard[]>([]);
  const [coverCardName, setCoverCardName] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [searchOrderValue, setSearchOrderValue] = useState(DEFAULT_SEARCH_ORDER.value);
  const [searchPage, setSearchPage] = useState(1);
  const [searchResults, setSearchResults] = useState<CardResult[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [isSearching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [decklistView, setDecklistView] = useState<DecklistView>("cards");
  const [shouldFocusDeckText, setShouldFocusDeckText] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [isHydratingImages, setHydratingImages] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardResult | null>(null);
  const [savedVersion, setSavedVersion] = useState("");

  useEffect(() => {
    if (!id) { navigate("/decks", { replace: true }); return; }
    const deck = readSavedDecks().find((entry) => entry.id === id);
    if (!deck) { navigate("/decks", { replace: true }); return; }

    const draft = buildDeckDraft(deck);
    setDeckName(draft.deckName);
    setDeckCards(draft.deckCards);
    setSideboardCards(draft.sideboardCards);
    setCoverCardName(draft.coverCardName);
    setImportText(draft.importText);
    setSavedVersion(JSON.stringify(draft));
    setImportError(null);
  }, [id, navigate]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const deck = readSavedDecks().find((entry) => entry.id === id);

    if (!deck || !deckNeedsImageHydration(deck.cards, deck.sideboard)) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const hydrated = await hydrateDeckImages(deck.cards, deck.sideboard);

        if (cancelled) {
          return;
        }

        setDeckCards((current) =>
          mergeDeckCardImageMetadata(current, hydrated.cards),
        );
        setSideboardCards((current) =>
          mergeDeckCardImageMetadata(current, hydrated.sideboard),
        );
      } catch {
        // Best-effort only; the editor should still load without art.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
      setActiveSearchQuery(trimmedQuery);
      setSearchPage(1);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setActiveSearchQuery(trimmedQuery);
      setSearchPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const searchOrder = useMemo(() => getSearchOrderOption(searchOrderValue), [searchOrderValue]);

  useEffect(() => {
    const trimmedQuery = activeSearchQuery.trim();
    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setSearchHasMore(false);
      setSearchError(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    void (async () => {
      try {
        if (searchRequestIdRef.current === requestId) {
          setSearching(true);
          setSearchError(null);
        }
        const response = await searchCards(trimmedQuery, {
          signal: controller.signal,
          page: searchPage,
          pageSize: SEARCH_PAGE_SIZE,
          sort: searchOrder.sort,
          dir: searchOrder.dir,
        });
        if (searchRequestIdRef.current !== requestId) return;
        setSearchHasMore(response.meta.hasMore);
        setSearchResults((current) => (searchPage === 1 ? response.cards : mergeSearchResults(current, response.cards)));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (searchRequestIdRef.current !== requestId) return;
        if (searchPage === 1) setSearchResults([]);
        setSearchHasMore(false);
        setSearchError("Card search is unavailable right now.");
      } finally {
        if (searchRequestIdRef.current === requestId) setSearching(false);
      }
    })();
    return () => controller.abort();
  }, [activeSearchQuery, searchOrder.dir, searchOrder.sort, searchPage]);

  useEffect(() => {
    const nextCoverCard = resolveCoverCard(deckCards, sideboardCards, coverCardName);
    if (!nextCoverCard && coverCardName) {
      setCoverCardName(getDefaultDeckCoverCardName(deckCards, sideboardCards) ?? null);
    }
  }, [coverCardName, deckCards, sideboardCards]);

  useEffect(() => {
    if (decklistView === "cards") setImportText(formatDeckText(deckCards, sideboardCards));
  }, [deckCards, decklistView, sideboardCards]);

  useEffect(() => {
    if (decklistView === "text" && shouldFocusDeckText) {
      window.setTimeout(() => deckTextRef.current?.focus(), 0);
      setShouldFocusDeckText(false);
    }
  }, [decklistView, shouldFocusDeckText]);

  const mainboardCount = useMemo(() => deckCards.reduce((total, card) => total + card.count, 0), [deckCards]);
  const sideboardCount = useMemo(() => sideboardCards.reduce((total, card) => total + card.count, 0), [sideboardCards]);
  const totalCount = mainboardCount + sideboardCount;
  const deckText = useMemo(() => formatDeckText(deckCards, sideboardCards), [deckCards, sideboardCards]);
  const coverCard = useMemo(() => resolveCoverCard(deckCards, sideboardCards, coverCardName), [coverCardName, deckCards, sideboardCards]);
  
  const trimmedSearchQuery = searchQuery.trim();
  const canSearch = trimmedSearchQuery.length >= 2;
  const isLoadingFirstPage = isSearching && searchPage === 1 && searchResults.length === 0;
  const isRefreshingResults = isSearching && searchPage === 1 && searchResults.length > 0;
  const isLoadingMore = isSearching && searchPage > 1;
  const hasSearchResults = searchResults.length > 0;
  const showSearchEmptyState = !hasSearchResults && !isLoadingFirstPage;
  const visibleResultCount = searchResults.length;

  const searchStatusText = useMemo(() => {
    if (!canSearch) return "Find cards by name or syntax (e.g., t:instant mv<=2).";
    if (searchError) return searchError;
    if (isLoadingFirstPage) return "Searching...";
    if (isRefreshingResults) return `Refreshing ${visibleResultCount} cards...`;
    if (isLoadingMore) return `Loading more (${visibleResultCount} shown)...`;
    if (hasSearchResults) return `${visibleResultCount} results found ${searchHasMore ? "(more available)" : ""}`;
    return `No cards found for "${activeSearchQuery || trimmedSearchQuery}".`;
  }, [activeSearchQuery, canSearch, hasSearchResults, isLoadingFirstPage, isLoadingMore, isRefreshingResults, searchError, searchHasMore, trimmedSearchQuery, visibleResultCount]);

  const currentVersion = useMemo(
    () => JSON.stringify({ deckName, deckCards, sideboardCards, coverCardName, importText: formatDeckText(deckCards, sideboardCards) }),
    [coverCardName, deckCards, deckName, sideboardCards]
  );
  const isDirty = currentVersion !== savedVersion;

  const persistDeck = (next: { deckName: string; deckCards: DeckCard[]; sideboardCards: DeckCard[]; coverCardName: string | null }) => {
    if (!id) return null;
    const savedDeck = saveDeck({
      id,
      name: next.deckName,
      cards: next.deckCards,
      sideboard: next.sideboardCards,
      coverCardName: next.coverCardName ?? undefined,
    });
    const draft = buildDeckDraft(savedDeck);
    setSavedVersion(JSON.stringify(draft));
    return savedDeck;
  };

  useEffect(() => {
    if (!id || !isDirty) return;
    setSaving(true);
    const timeoutId = window.setTimeout(() => {
      persistDeck({ deckName, deckCards, sideboardCards, coverCardName });
      setSaving(false);
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [coverCardName, deckCards, deckName, id, isDirty, sideboardCards]);

  const handleAdjustCardCount = (zone: DeckZone, cardName: string, delta: number) => {
    if (zone === "side") {
      setSideboardCards((current) => adjustDeckCardCount(current, cardName, delta));
    } else {
      setDeckCards((current) => adjustDeckCardCount(current, cardName, delta));
    }
  };

  const handleAddSearchResult = (zone: DeckZone, card: CardResult, quantity: number) => {
    const nextCard = { name: card.name, imageUrl: card.imageUrl, artCropUrl: card.artCropUrl };

    if (zone === "side") {
      setSideboardCards((current) => {
        let next = current;
        for (let i = 0; i < quantity; i++) next = upsertDeckCard(next, nextCard);
        return next;
      });
    } else {
      setDeckCards((current) => {
        let next = current;
        for (let i = 0; i < quantity; i++) next = upsertDeckCard(next, nextCard);
        return next;
      });
    }

    setCoverCardName((current) => current ?? card.name);
  };

  const handleApplyImport = async () => {
    setHydratingImages(true);
    const resolvedDeck = await resolveImportedDeck(importText);
    if (!resolvedDeck) {
      setImportError("Invalid deck list.");
      setHydratingImages(false);
      return false;
    }
    try {
      const nextCoverCardName = resolveCoverCard(resolvedDeck.cards, resolvedDeck.sideboard, coverCardName)?.name
        ?? getDefaultDeckCoverCardName(resolvedDeck.cards, resolvedDeck.sideboard)
        ?? null;

      setImportError(resolvedDeck.warning);
      setDeckName(resolvedDeck.name ?? (deckName || "Untitled Deck"));
      setDeckCards(resolvedDeck.cards);
      setSideboardCards(resolvedDeck.sideboard);
      setCoverCardName(nextCoverCardName);
      setImportText(formatDeckText(resolvedDeck.cards, resolvedDeck.sideboard));
      return true;
    } finally {
      setHydratingImages(false);
    }
  };

  const handleDecklistViewChange = async (nextView: DecklistView) => {
    if (nextView === decklistView) return;
    if (nextView === "cards") {
      const applied = await handleApplyImport();
      if (!applied) return;
    } else {
      setShouldFocusDeckText(true);
    }
    setDecklistView(nextView);
  };

  return (
    <div className="db-layout" data-modal-open={selectedCard ? "true" : "false"}>
      {/* LEFT COLUMN: Search & Results */}
      <main className="db-main">
        <header className="db-header">
          <div className="db-header-top">
            <Link className="db-back-btn" to="/decks" title="Back to decks">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </Link>
            <div className="db-search-input-wrapper">
              <svg className="db-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input
                className="db-search-input"
                placeholder="Search the multiverse..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="db-header-bottom">
            <span className="db-status-text">{searchStatusText}</span>
            <select className="db-sort-select" value={searchOrderValue} onChange={(e) => { setSearchOrderValue(e.target.value); setSearchPage(1); }}>
              {SEARCH_ORDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </header>

        <section className="db-gallery" data-loading={isRefreshingResults || isLoadingMore}>
          {isLoadingFirstPage ? (
            <div className="db-grid db-grid-skeleton">
              {Array.from({ length: SEARCH_SKELETON_COUNT }).map((_, i) => (
                <div key={i} className="db-card-skeleton" />
              ))}
            </div>
          ) : showSearchEmptyState ? (
            <div className="db-empty-state">
              <h2 className="db-empty-title">{!canSearch ? "Explore the Catalog" : (searchError ? "Search Unavailable" : "No Matches Found")}</h2>
              <p className="db-empty-desc">{!canSearch ? "Enter a card name or filter syntax to begin." : (searchError || "Try adjusting your query or filters.")}</p>
            </div>
          ) : (
            <>
              <div className="db-grid">
                {searchResults.map((card) => (
                  <article key={card.id} className="db-card-shell">
                    <button
                      type="button"
                      className="db-card-btn"
                      onClick={(event) => {
                        event.currentTarget.blur();
                        setSelectedCard(card);
                      }}
                    >
                      <CardImage
                        alt={card.name}
                        className="db-card-image"
                        src={card.thumbnailUrl ?? card.imageUrl}
                        width={244}
                        height={340}
                        fallback={<div className="db-card-fallback">{card.name[0]}</div>}
                      />
                      <div className="db-card-overlay">
                        <span className="db-card-name">{card.name}</span>
                      </div>
                    </button>

                    <div className="db-card-actions" aria-label={`${card.name} quick actions`}>
                      <button
                        type="button"
                        className="db-card-action db-card-action-primary"
                        onClick={() => handleAddSearchResult("main", card, 1)}
                      >
                        Add Main
                      </button>
                      <button
                        type="button"
                        className="db-card-action"
                        onClick={() => handleAddSearchResult("side", card, 1)}
                      >
                        Add Side
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {searchHasMore && (
                <div className="db-pagination">
                  <button type="button" className="db-load-more" onClick={() => !isSearching && setSearchPage((p) => p + 1)} disabled={isSearching}>
                    {isLoadingMore ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* RIGHT COLUMN: Decklist */}
      <aside className="db-sidebar">
        <div className="db-sidebar-header">
          <input
            className="db-deck-name"
            placeholder="Untitled Deck"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
          />
          <div className="db-deck-meta">
             <span>{mainboardCount} Main • {sideboardCount} Side • {totalCount} Total</span>
            <span className="db-save-status">{isSaving ? "Saving..." : isDirty ? "Unsaved" : "Saved"}</span>
          </div>
        </div>

        <div className="db-view-toggle">
          <button type="button" className={`db-toggle-btn ${decklistView === "cards" ? "active" : ""}`} onClick={() => handleDecklistViewChange("cards")}>Cards</button>
          <button type="button" className={`db-toggle-btn ${decklistView === "text" ? "active" : ""}`} onClick={() => handleDecklistViewChange("text")}>Text</button>
          <button type="button" className="db-icon-btn" onClick={() => navigator.clipboard.writeText(decklistView === "text" ? importText : deckText)} title="Copy list">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>

        {coverCard ? (
          <div className="db-cover-banner">
            {coverCard.artCropUrl || coverCard.imageUrl ? (
              <CardImage
                alt={coverCard.name}
                className="db-cover-image"
                src={coverCard.artCropUrl || coverCard.imageUrl}
                width={488}
                height={680}
                fallback={<div className="db-cover-fallback">{coverCard.name.slice(0, 1)}</div>}
              />
            ) : (
              <div className="db-cover-fallback">{coverCard.name.slice(0, 1)}</div>
            )}
            <div className="db-cover-overlay">
              <span>{coverCard.name}</span>
            </div>
          </div>
        ) : null}

        <div className="db-sidebar-content">
          {decklistView === "text" ? (
            <div className="db-text-import">
              <textarea
                ref={deckTextRef}
                className="db-textarea"
                spellCheck={false}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <div className="db-text-actions">
                <button type="button" className="db-apply-btn" disabled={isHydratingImages} onClick={() => handleDecklistViewChange("cards")}>
                  {isHydratingImages ? "Applying..." : "Apply Changes"}
                </button>
                {importError && <span className="db-error">{importError}</span>}
              </div>
            </div>
          ) : (
            <div className="db-zones">
              <DeckZonePanel cards={deckCards} title="Main Deck" zone="main" coverCardName={coverCardName} onAdjust={handleAdjustCardCount} onSetCover={setCoverCardName} />
              <DeckZonePanel cards={sideboardCards} title="Sideboard" zone="side" coverCardName={coverCardName} onAdjust={handleAdjustCardCount} onSetCover={setCoverCardName} />
            </div>
          )}
        </div>
      </aside>

      <CardDetailsModal card={selectedCard} onClose={() => setSelectedCard(null)} onAdd={handleAddSearchResult} />
    </div>
  );
}
