import { useEffect, useRef, useState } from "react";
import { CardImage } from "../../components/card-image";
import { type CardResult } from "../../lib/card-api";
import { type DeckZone } from "./types";

type CardDetailsModalProps = {
  card: CardResult | null;
  onClose: () => void;
  onAdd: (zone: DeckZone, card: CardResult, quantity: number) => void;
};

export function CardDetailsModal({ card, onClose, onAdd }: CardDetailsModalProps) {
  const [quantity, setQuantity] = useState(1);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setQuantity(1), [card]);

  useEffect(() => {
    if (!card) return;

    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [card]);

  useEffect(() => {
    if (!card) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [card, onClose]);

  if (!card) return null;

  const statLine = card.power && card.toughness ? `${card.power}/${card.toughness}` : card.loyalty ? `Loyalty ${card.loyalty}` : card.defense ? `Defense ${card.defense}` : null;
  const oracleLines = card.oracleText.split("\n").map(l => l.trim()).filter(Boolean);

  return (
    <div className="db-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="db-modal" role="dialog" aria-modal="true">
        <button ref={closeButtonRef} className="db-modal-close" type="button" onClick={onClose} aria-label="Close">✕</button>
        
        <div className="db-modal-content">
          <div className="db-modal-image-col">
            <CardImage alt={card.name} className="db-modal-img" src={card.imageUrl} width={488} height={680} priority fallback={<div className="db-modal-fallback">{card.name[0]}</div>} />
          </div>
          
          <div className="db-modal-details-col">
            <div className="db-modal-header">
              <h2 className="db-modal-title">{card.name}</h2>
              {card.manaCost && <span className="db-modal-mana">{card.manaCost}</span>}
            </div>
            <p className="db-modal-type">{card.typeLine}</p>
            
            <div className="db-modal-meta">
              {statLine && <span className="db-badge">{statLine}</span>}
              {card.setName && <span className="db-badge">{card.setName}</span>}
              {card.rarity && <span className="db-badge rarity">{card.rarity}</span>}
            </div>

            {oracleLines.length > 0 && (
              <div className="db-modal-rules">
                {oracleLines.map((line, i) => <p key={i}>{line}</p>)}
              </div>
            )}

            <div className="db-modal-actions-area">
              <div className="db-quantity-picker">
                <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1}>-</button>
                <span>{quantity}</span>
                <button type="button" onClick={() => setQuantity(Math.min(4, quantity + 1))}>+</button>
              </div>
              <div className="db-add-buttons">
                <button className="db-btn-primary" type="button" onClick={() => { onAdd("main", card, quantity); onClose(); }}>Add to Main</button>
                <button className="db-btn-secondary" type="button" onClick={() => { onAdd("side", card, quantity); onClose(); }}>Add to Side</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
