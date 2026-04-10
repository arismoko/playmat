import type { DeckCard } from "@playmat/shared/table";
import type { DeckZone } from "./types";

type DeckZonePanelProps = {
  title: string;
  cards: DeckCard[];
  zone: DeckZone;
  coverCardName: string | null;
  onAdjust: (zone: DeckZone, cardName: string, delta: number) => void;
  onSetCover: (cardName: string) => void;
};

export function DeckZonePanel({ title, cards, zone, coverCardName, onAdjust, onSetCover }: DeckZonePanelProps) {
  const count = cards.reduce((sum, card) => sum + card.count, 0);

  return (
    <section className="db-zone">
      <header className="db-zone-header">
        <h3 className="db-zone-title">{title}</h3>
        <span className="db-zone-count">{count} cards</span>
      </header>

      <ul className="db-zone-list">
        {cards.length > 0 ? (
          cards.map((card) => (
            <li className={`db-zone-row ${coverCardName === card.name ? "is-cover" : ""}`} key={`${zone}-${card.name}`}>
              <div className="db-zone-row-info">
                <span className="db-zone-item-count">{card.count}</span>
                <span className="db-zone-item-name" title={card.name}>{card.name}</span>
              </div>
              <div className="db-zone-row-actions">
                <button className="db-zone-btn" type="button" onClick={() => onSetCover(card.name)} title="Set as Cover">★</button>
                <button className="db-zone-btn" type="button" onClick={() => onAdjust(zone, card.name, -1)}>-</button>
                <button className="db-zone-btn" type="button" onClick={() => onAdjust(zone, card.name, 1)}>+</button>
              </div>
            </li>
          ))
        ) : (
          <li className="db-zone-empty">Empty</li>
        )}
      </ul>
    </section>
  );
}
