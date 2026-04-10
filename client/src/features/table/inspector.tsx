import type { CardView } from "@playmat/shared/table";
import { useEffect, useRef, useState } from "react";
import { CardImage } from "../../components/card-image";
import { useCardDetail } from "../../lib/card-api";

export type InspectorCard = {
  card: CardView;
  locationLabel: string;
};

type InspectorProps = {
  entry: InspectorCard | null;
  suppress?: boolean;
};

const HOVER_INTENT_DELAY_MS = 350;
const CLOSE_GRACE_PERIOD_MS = 100;

export function Inspector({ entry, suppress = false }: InspectorProps) {
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [displayEntry, setDisplayEntry] = useState<InspectorCard | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [pointerX, setPointerX] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth / 2,
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  const nextEntry = entry?.card.visibility === "public" ? entry : null;
  const detailCard = useCardDetail(
    !suppress && displayEntry?.card.visibility === "public"
      ? displayEntry.card.name.trim()
      : null,
    { loadOnMiss: true },
  );

  useEffect(() => {
    return () => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
      }

      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function handlePointerMove(event: PointerEvent): void {
      setPointerX(event.clientX);
    }

    function handleResize(): void {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (suppress) {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }

      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      setIsVisible(false);
      setDisplayEntry(null);
      return;
    }

    if (!nextEntry) {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }

      if (!displayEntry || closeTimerRef.current !== null) {
        return;
      }

      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setIsVisible(false);
        setDisplayEntry(null);
      }, CLOSE_GRACE_PERIOD_MS);

      return;
    }

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (isVisible) {
      setDisplayEntry(nextEntry);
      return;
    }

    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }

    setDisplayEntry(nextEntry);

    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setDisplayEntry(nextEntry);
      setIsVisible(true);
    }, HOVER_INTENT_DELAY_MS);
  }, [displayEntry, isVisible, nextEntry, suppress]);

  const activeFaceIndex = displayEntry?.card.visibility === "public" ? displayEntry.card.activeFaceIndex : 0;
  const activeFace = detailCard?.faces[activeFaceIndex] ?? detailCard?.faces[0];
  const previewWidth = Math.min(320, Math.max(viewportWidth - 460, 0));
  const canFloatRight = viewportWidth - 296 - previewWidth >= 220;
  const side = pointerX < viewportWidth * 0.5 && canFloatRight ? "right" : "left";
  const artCard = displayEntry?.card.visibility === "public"
    ? {
        imageUrl: activeFace?.imageUrl ?? detailCard?.imageUrl ?? displayEntry.card.imageUrl,
        name: activeFace?.name ?? displayEntry.card.name,
      }
    : null;

  return (
    <aside
      aria-hidden={!isVisible}
      className={`game-table-floating-inspector game-table-floating-inspector-${side}${isVisible ? " game-table-floating-inspector-visible" : ""}`}
    >
      <div className="game-table-floating-inspector-card">
        {artCard ? (
          <CardImage
            alt={artCard.name}
            className="game-table-floating-inspector-image"
            priority
            src={artCard.imageUrl}
            fallback={<div className="game-table-floating-inspector-fallback">{artCard.name}</div>}
          />
        ) : (
          <div className="game-table-floating-inspector-fallback" />
        )}
      </div>

      {displayEntry?.locationLabel ? (
        <div className="game-table-floating-inspector-label">{displayEntry.locationLabel}</div>
      ) : null}
    </aside>
  );
}
