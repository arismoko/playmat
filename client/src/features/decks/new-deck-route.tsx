import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { saveDeck } from "../../lib/decks";
import { readFileAsText, resolveImportedDeck } from "./helpers";

export function NewDeckRoute() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [creationMode, setCreationMode] = useState<"menu" | "text">("menu");
  const [textImportValue, setTextImportValue] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        navigate("/decks");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const handleCreateBlank = () => {
    const savedDeck = saveDeck({
      name: "",
      cards: [],
      sideboard: [],
    });

    navigate(`/decks/${savedDeck.id}`, { replace: true });
  };

  const handleCreateFromImport = async (deckText: string) => {
    const resolvedDeck = await resolveImportedDeck(deckText);

    if (!resolvedDeck) {
      setCreateError("That deck list could not be imported.");
      return;
    }

    const savedDeck = saveDeck({
      name: resolvedDeck.name ?? "Untitled Deck",
      cards: resolvedDeck.cards,
      sideboard: resolvedDeck.sideboard,
    });

    navigate(`/decks/${savedDeck.id}`, { replace: true });
  };

  const handleSubmitTextImport = async () => {
    try {
      setSubmitting(true);
      setCreateError(null);
      await handleCreateFromImport(textImportValue);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".cod")) {
      setCreateError("Only .cod files are supported right now.");
      event.target.value = "";
      return;
    }

    try {
      setSubmitting(true);
      setCreateError(null);
      const deckText = await readFileAsText(file);
      await handleCreateFromImport(deckText);
    } catch {
      setCreateError("That .cod file could not be imported.");
    } finally {
      event.target.value = "";
      setSubmitting(false);
    }
  };

  return (
    <section className="page decks-new-page">
      <div className="decks-new-backdrop" onClick={() => navigate("/decks")} role="presentation" />

      <div className="decks-new-modal" role="dialog" aria-modal="true" aria-labelledby="decks-new-title">
        <div className="decks-new-header">
          <div>
            <h1 id="decks-new-title">New Deck</h1>
            <p>How would you like to start building?</p>
          </div>

          <button className="decks-new-close" type="button" onClick={() => navigate("/decks")} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {creationMode === "menu" ? (
          <div className="decks-new-options">
            <button className="decks-new-card decks-new-card-primary" disabled={isSubmitting} type="button" onClick={handleCreateBlank}>
              <div className="decks-new-card-content">
                <strong>Blank Canvas</strong>
                <span>Start from scratch with an empty deck in the visual editor.</span>
              </div>
            </button>

            <div className="decks-new-secondary-options">
              <button className="decks-new-card" disabled={isSubmitting} type="button" onClick={() => setCreationMode("text")}>
                <div className="decks-new-card-content">
                  <strong>Paste Text</strong>
                  <span>Import a raw deck list from your clipboard.</span>
                </div>
              </button>

              <button className="decks-new-card" disabled={isSubmitting} type="button" onClick={() => fileInputRef.current?.click()}>
                <div className="decks-new-card-content">
                  <strong>Import File</strong>
                  <span>Load a Cockatrice `.cod` deck file.</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="decks-new-text-panel">
            <textarea
              autoFocus
              className="decks-import-textarea decks-new-textarea"
              placeholder="Paste a deck list or Cockatrice XML here..."
              spellCheck={false}
              value={textImportValue}
              onChange={(event) => setTextImportValue(event.target.value)}
            />

            <div className="decks-new-text-actions">
              <button className="decks-header-button" type="button" onClick={() => setCreationMode("menu")}>
                Cancel
              </button>
              <button className="decks-header-button decks-header-button-primary" disabled={isSubmitting || !textImportValue.trim()} type="button" onClick={() => void handleSubmitTextImport()}>
                {isSubmitting ? "Importing..." : "Import Text"}
              </button>
            </div>
          </div>
        )}

        {createError ? <p className="decks-new-error">{createError}</p> : null}

        <input ref={fileInputRef} accept=".cod" hidden type="file" onChange={(event) => void handleFileChange(event)} />
      </div>
    </section>
  );
}
