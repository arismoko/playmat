import { formatPhaseLabel, phases, type Phase } from "@playmat/shared/table";

const phaseMeta: Record<Phase, { icon: string; shortLabel: string }> = {
  opening: { icon: "OPN", shortLabel: "Open" },
  upkeep: { icon: "UPK", shortLabel: "Upkeep" },
  draw: { icon: "DRW", shortLabel: "Draw" },
  main1: { icon: "I", shortLabel: "Main" },
  combat: { icon: "X", shortLabel: "Combat" },
  main2: { icon: "II", shortLabel: "Main 2" },
  end: { icon: "END", shortLabel: "End" },
};

type PhaseRailProps = {
  currentPhase: Phase | null;
  canAdvance: boolean;
  onAdvancePhase: () => void;
  onPassTurn: () => void;
};

export function PhaseRail({
  currentPhase,
  canAdvance,
  onAdvancePhase,
  onPassTurn,
}: PhaseRailProps) {
  return (
    <aside className="game-table-phase-rail">
      {phases.map((phase) => (
        <button
          className={`game-table-phase${currentPhase === phase ? " game-table-phase-active" : ""}`}
          disabled={!canAdvance}
          key={phase}
          type="button"
          onClick={onAdvancePhase}
        >
          <span className="game-table-phase-icon">{phaseMeta[phase].icon}</span>
          <span className="game-table-phase-name">{phaseMeta[phase].shortLabel}</span>
        </button>
      ))}

      <div className="game-table-phase-current">
        <span>Current</span>
        <strong>{formatPhaseLabel(currentPhase)}</strong>
      </div>

      <button
        className="game-table-phase-pass"
        disabled={!canAdvance}
        type="button"
        onClick={onPassTurn}
      >
        Pass turn
      </button>
    </aside>
  );
}
