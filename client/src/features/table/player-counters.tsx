import type { PlayerCounterState } from "@playmat/shared/table";
import { useMemo, useState, type MouseEvent } from "react";

const COUNTER_COLORS = [
  "#9a4d36",
  "#b57d4d",
  "#8c8551",
  "#5b7a5a",
  "#486a73",
  "#6e5e86",
  "#8a4f6a",
  "#d0d7cf",
];

type PlayerCountersProps = {
  counters: PlayerCounterState[];
  onAdjustCounter: (counterId: string, amount: number) => void;
  onCreateCounter: (name: string, color: string) => void;
  onRemoveCounter: (counterId: string) => void;
};

export function PlayerCounters({
  counters,
  onAdjustCounter,
  onCreateCounter,
  onRemoveCounter,
}: PlayerCountersProps) {
  const [isModalOpen, setModalOpen] = useState(false);
  const [counterName, setCounterName] = useState("");
  const [selectedColor, setSelectedColor] = useState(COUNTER_COLORS[0] ?? "#9a4d36");

  const counterList = useMemo(() => counters, [counters]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCreateCounter(counterName.trim() || "Counter", selectedColor);
    setCounterName("");
    setSelectedColor(COUNTER_COLORS[0] ?? "#9a4d36");
    setModalOpen(false);
  };

  return (
    <>
      <div className="game-table-counters-bar">
        {counterList.map((counter) => (
          <button
            className="game-table-counter-circle"
            key={counter.id}
            style={{ borderLeftColor: counter.color }}
            title={`${counter.name}: left +1, right -1, middle remove`}
            type="button"
            onClick={() => onAdjustCounter(counter.id, 1)}
            onContextMenu={(event) => {
              event.preventDefault();
              onAdjustCounter(counter.id, -1);
            }}
            onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
              if (event.button !== 1) {
                return;
              }

              event.preventDefault();
              onRemoveCounter(counter.id);
            }}
          >
            <span className="game-table-counter-label">{counter.name}</span>
            <strong className="game-table-counter-value">{counter.value}</strong>
          </button>
        ))}

        <button
          className="game-table-counter-add"
          title="Create counter"
          type="button"
          onClick={() => setModalOpen(true)}
        >
          +
        </button>
      </div>

      {isModalOpen ? (
        <div className="game-table-counter-modal-overlay" onClick={() => setModalOpen(false)}>
          <form className="game-table-counter-modal" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
            <h3>Create counter</h3>
            <label htmlFor="player-counter-name">Name</label>
            <input
              autoFocus
              id="player-counter-name"
              maxLength={20}
              placeholder="Storm, Mana, Notes..."
              type="text"
              value={counterName}
              onChange={(event) => setCounterName(event.target.value)}
            />

            <label>Color</label>
            <div className="game-table-counter-colors">
              {COUNTER_COLORS.map((color) => (
                <button
                  className={`game-table-counter-color${selectedColor === color ? " game-table-counter-color-selected" : ""}`}
                  key={color}
                  style={{ background: color }}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>

            <div className="game-table-counter-modal-actions">
              <button className="button" type="button" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="button button-primary" type="submit">
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
