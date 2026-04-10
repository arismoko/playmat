import type { CardView } from "@playmat/shared/table";
import { CardImage } from "./card-image";

type CardProps = {
  card: CardView;
  className?: string;
  imagePriority?: boolean;
};

export function Card({ card, className, imagePriority = false }: CardProps) {
  const classes = ["card", card.tapped ? "card-tapped" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const cardLabel = card.faceDown ? "Face Down" : card.name;

  return (
    <article className={classes}>
      <div className="card-art">
        <CardImage
          alt={cardLabel}
          className="card-art-image"
          priority={imagePriority}
          src={card.imageUrl}
          fallback={<div className="card-fallback">{cardLabel}</div>}
        />
      </div>

      <div className="card-meta">
        <span className="card-title">{cardLabel}</span>
        <span className="card-badge">{card.tapped ? "Tapped" : "Ready"}</span>
      </div>
    </article>
  );
}
