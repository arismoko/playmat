import type { PlayerView } from "@playmat/shared/table";
import { useEffect, useRef, useState } from "react";
import type { CardResult } from "../../lib/card-api";
import type { InspectorCard } from "./inspector";
import type { TableCommandPromptState } from "./table-command-prompt";

export type TokenDialogState = {
  sourceCardName: string;
  x: number;
  y: number;
};

export type RelatedCardsDialogState = {
  canCreateTokens: boolean;
  sourceCard: CardResult;
  x?: number;
  y?: number;
};

export type TableUiState = {
  commandPrompt: TableCommandPromptState | null;
  inspectorEntry: InspectorCard | null;
  relatedCardsDialog: RelatedCardsDialogState | null;
  selectedOpponentId: string | null;
  tokenDialog: TokenDialogState | null;
  setCommandPrompt: (state: TableCommandPromptState | null) => void;
  setInspectorEntry: (entry: InspectorCard | null) => void;
  setRelatedCardsDialog: (state: RelatedCardsDialogState | null) => void;
  setTokenDialog: (state: TokenDialogState | null) => void;
  toggleSelectedOpponent: (opponentId: string) => void;
};

export function useTableUiState(otherPlayers: PlayerView[]): TableUiState {
  const [inspectorEntry, setInspectorEntry] = useState<InspectorCard | null>(null);
  const [commandPrompt, setCommandPrompt] = useState<TableCommandPromptState | null>(null);
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const [relatedCardsDialog, setRelatedCardsDialog] = useState<RelatedCardsDialogState | null>(null);
  const [tokenDialog, setTokenDialog] = useState<TokenDialogState | null>(null);
  const opponentSelectionWasManualRef = useRef(false);

  useEffect(() => {
    if (!otherPlayers.length) {
      setSelectedOpponentId(null);
      opponentSelectionWasManualRef.current = false;
      return;
    }

    setSelectedOpponentId((currentValue) => {
      if (currentValue && otherPlayers.some((player) => player.id === currentValue)) {
        return currentValue;
      }

      if (opponentSelectionWasManualRef.current) {
        return null;
      }

      return otherPlayers[0]?.id ?? null;
    });
  }, [otherPlayers]);

  function toggleSelectedOpponent(opponentId: string): void {
    opponentSelectionWasManualRef.current = true;
    setSelectedOpponentId((currentValue) => (
      currentValue === opponentId ? null : opponentId
    ));
  }

  return {
    commandPrompt,
    inspectorEntry,
    relatedCardsDialog,
    selectedOpponentId,
    tokenDialog,
    setCommandPrompt,
    setInspectorEntry,
    setRelatedCardsDialog,
    setTokenDialog,
    toggleSelectedOpponent,
  };
}
