import type { CardView } from "@playmat/shared/table";
import type { CSSProperties, MouseEventHandler } from "react";
import { CardImage } from "../../components/card-image";
import { useCardDetail } from "../../lib/card-api";

type TableCardProps = {
  card: CardView;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onDoubleClick?: MouseEventHandler<HTMLButtonElement>;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function getCounterTotal(counters: Record<string, number>): number {
  return Object.values(counters).reduce((total, value) => total + value, 0);
}

function resolvePtLabel(
  basePower: string | undefined,
  baseToughness: string | undefined,
  modifier: { power: number; toughness: number } | undefined,
): string | null {
  const modifierPower = modifier?.power ?? 0;
  const modifierToughness = modifier?.toughness ?? 0;
  const parsedPower = Number.parseInt(basePower ?? "", 10);
  const parsedToughness = Number.parseInt(baseToughness ?? "", 10);

  if (Number.isFinite(parsedPower) && Number.isFinite(parsedToughness)) {
    return `${parsedPower + modifierPower}/${parsedToughness + modifierToughness}`;
  }

  if (modifierPower === 0 && modifierToughness === 0) {
    return null;
  }

  return `${modifierPower >= 0 ? "+" : ""}${modifierPower}/${modifierToughness >= 0 ? "+" : ""}${modifierToughness}`;
}

export function TableCard({
  card,
  ariaLabel,
  className,
  style,
  priority = false,
  selected = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}: TableCardProps) {
  const counterTotal = getCounterTotal(card.counters);
  const detailCard = useCardDetail(
    card.visibility === "public" && !card.faceDown ? card.name : null,
  );
  const activeFace = detailCard?.faces[card.activeFaceIndex] ?? detailCard?.faces[0];
  const displayName = activeFace?.name ?? card.name;
  const displayImageUrl = activeFace?.imageUrl ?? card.imageUrl;
  const ptLabel = resolvePtLabel(activeFace?.power ?? detailCard?.power, activeFace?.toughness ?? detailCard?.toughness, card.ptModifier);
  const classes = [
    "game-table-card",
    card.faceDown ? "game-table-card-facedown" : "",
    card.tapped ? "game-table-card-tapped" : "",
    selected ? "game-table-card-selected" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      aria-label={ariaLabel}
      className={classes}
      style={style}
      tabIndex={onClick || onDoubleClick ? 0 : -1}
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <CardImage
        alt={displayName}
        className="game-table-card-image"
        priority={priority}
        src={displayImageUrl}
        fallback={<div className="game-table-card-fallback">{displayName}</div>}
      />

      {counterTotal > 0 ? (
        <span className="game-table-card-counter">+{counterTotal}</span>
      ) : null}

      {ptLabel ? <span className="game-table-card-pt">{ptLabel}</span> : null}

      {card.annotation ? <span className="game-table-card-annotation">{card.annotation}</span> : null}

      {card.faceDown && card.visibility === "public" ? (
        <span className="game-table-card-facedown-badge">Face down</span>
      ) : null}
    </button>
  );
}
