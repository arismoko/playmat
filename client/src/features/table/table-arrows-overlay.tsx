import type { TableArrow } from "@playmat/shared/table";
import { useLayoutEffect, useRef, useState } from "react";

type TableArrowsOverlayProps = {
  arrows: TableArrow[];
  isDragging?: boolean;
  onDeleteArrow?: (arrow: TableArrow) => void;
  viewerPlayerId?: string | null;
  previewArrow?: {
    color: "green" | "red";
    sourceCardId: string;
    sourceFallbackX?: number;
    sourceFallbackY?: number;
    sourceOwnerPlayerId: string;
    targetCardId?: string | null;
    targetOwnerPlayerId?: string | null;
    targetX: number;
    targetY: number;
  } | null;
};

type ArrowLine = {
  arrow?: TableArrow;
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function getCardCenter(cardId: string, ownerPlayerId: string): { x: number; y: number } | null {
  const selector = `[data-table-card-owner-player-id='${ownerPlayerId}'][data-table-card-id='${cardId}']`;
  const elements = document.querySelectorAll<HTMLElement>(selector);

  if (!elements.length) {
    return null;
  }

  // Prefer the last match — during drags, the drag preview element appears after the hidden original
  const element = elements[elements.length - 1]!;
  const rect = element.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function getPlayerCenter(playerId: string): { x: number; y: number } | null {
  const element = document.querySelector<HTMLElement>(`[data-table-player-id='${playerId}']`);

  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function readArrowLines(arrows: TableArrow[]): ArrowLine[] {
  const lines: ArrowLine[] = [];

  for (const arrow of arrows) {
    const sourceCenter = getCardCenter(arrow.sourceCardId, arrow.sourceOwnerPlayerId);
    const targetCenter = arrow.targetCardId
      ? getCardCenter(arrow.targetCardId, arrow.targetOwnerPlayerId)
      : getPlayerCenter(arrow.targetOwnerPlayerId);

    if (!sourceCenter || !targetCenter) {
      continue;
    }

    lines.push({
      arrow,
      id: arrow.id,
      x1: sourceCenter.x,
      y1: sourceCenter.y,
      x2: targetCenter.x,
      y2: targetCenter.y,
    });
  }

  return lines;
}

function readPreviewArrowLine(previewArrow: NonNullable<TableArrowsOverlayProps["previewArrow"]>): ArrowLine | null {
  const sourceCenter = getCardCenter(previewArrow.sourceCardId, previewArrow.sourceOwnerPlayerId)
    ?? (typeof previewArrow.sourceFallbackX === "number" && typeof previewArrow.sourceFallbackY === "number"
      ? { x: previewArrow.sourceFallbackX, y: previewArrow.sourceFallbackY }
      : null);
  const targetCenter =
    previewArrow.targetOwnerPlayerId
      ? (previewArrow.targetCardId
          ? getCardCenter(previewArrow.targetCardId, previewArrow.targetOwnerPlayerId)
          : getPlayerCenter(previewArrow.targetOwnerPlayerId))
      : null;

  if (!sourceCenter) {
    return null;
  }

  return {
    id: `preview-${previewArrow.color}`,
    x1: sourceCenter.x,
    x2: targetCenter?.x ?? previewArrow.targetX,
    y1: sourceCenter.y,
    y2: targetCenter?.y ?? previewArrow.targetY,
  };
}

export function TableArrowsOverlay({ arrows, isDragging = false, onDeleteArrow, previewArrow = null, viewerPlayerId = null }: TableArrowsOverlayProps) {
  const [lines, setLines] = useState<ArrowLine[]>([]);
  const arrowsRef = useRef(arrows);
  const previewArrowRef = useRef(previewArrow);

  arrowsRef.current = arrows;
  previewArrowRef.current = previewArrow;

  useLayoutEffect(() => {
    const nextLines = readArrowLines(arrows);
    const previewLine = previewArrow ? readPreviewArrowLine(previewArrow) : null;
    setLines(previewLine ? [...nextLines, previewLine] : nextLines);
  }, [arrows, previewArrow]);

  useLayoutEffect(() => {
    if (!arrows.length && !previewArrow) {
      setLines([]);
      return;
    }

    const update = () => {
      const nextLines = readArrowLines(arrowsRef.current);
      const previewLine = previewArrowRef.current ? readPreviewArrowLine(previewArrowRef.current) : null;
      setLines(previewLine ? [...nextLines, previewLine] : nextLines);
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    if (previewArrow || isDragging) {
      let frameId = 0;

      const animUpdate = () => {
        update();
        frameId = window.requestAnimationFrame(animUpdate);
      };

      frameId = window.requestAnimationFrame(animUpdate);

      return () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", update);
        window.removeEventListener("scroll", update, true);
      };
    }

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [arrows.length, previewArrow, isDragging]);

  if (!lines.length) {
    return null;
  }

  const width = typeof window === "undefined" ? 0 : window.innerWidth;
  const height = typeof window === "undefined" ? 0 : window.innerHeight;

  return (
    <svg className="game-table-arrows-overlay" aria-hidden="true" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <marker id="game-table-arrowhead-green" markerHeight="7" markerUnits="strokeWidth" markerWidth="7" orient="auto" refX="6" refY="3.5">
          <path d="M0,0 L7,3.5 L0,7 z" fill="rgba(112,228,142,0.96)" />
        </marker>
        <marker id="game-table-arrowhead-red" markerHeight="7" markerUnits="strokeWidth" markerWidth="7" orient="auto" refX="6" refY="3.5">
          <path d="M0,0 L7,3.5 L0,7 z" fill="rgba(253,110,110,0.96)" />
        </marker>
      </defs>
      {lines.map((line) => {
        const isPreview = line.id.startsWith("preview-");
        const isOwn = !isPreview && line.arrow?.sourceOwnerPlayerId === viewerPlayerId;
        const isAttachPreview = isPreview && line.id.endsWith("green");
        const useGreen = isOwn || isAttachPreview || (isPreview && !isAttachPreview);
        const markerUrl = useGreen ? "url(#game-table-arrowhead-green)" : "url(#game-table-arrowhead-red)";
        const className = isPreview
          ? `game-table-arrow-line game-table-arrow-line-preview ${isAttachPreview ? "game-table-arrow-line-preview-attach" : "game-table-arrow-line-preview-arrow"}`
          : `game-table-arrow-line ${isOwn ? "game-table-arrow-line-own" : "game-table-arrow-line-other"}`;

        return (
          <g key={line.id}>
            {!isPreview && line.arrow && onDeleteArrow ? (
              <line
                className="game-table-arrow-hitline"
                x1={line.x1}
                x2={line.x2}
                y1={line.y1}
                y2={line.y2}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onDeleteArrow(line.arrow!);
                }}
              />
            ) : null}
            <line
              className={className}
              markerEnd={markerUrl}
              x1={line.x1}
              x2={line.x2}
              y1={line.y1}
              y2={line.y2}
            />
          </g>
        );
      })}
    </svg>
  );
}
