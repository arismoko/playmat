import type { ServerEvent } from "@playmat/shared/actions";
import {
  moveCardsView,
  moveCardView,
  moveZoneView,
  reorderHandCardView,
  setHandOrderView,
  type CardMove,
  type LibraryPosition,
  type TableView,
  type ZoneName,
} from "@playmat/shared/table";
import { create } from "zustand";

export type ConnectionState = "idle" | "connecting" | "open" | "closed";

type TableStore = {
  table: TableView | null;
  playerId: string | null;
  zoneView: Extract<ServerEvent, { type: "zone-view" }> | null;
  connectionState: ConnectionState;
  error: string | null;
  applyOptimisticMove: (
    playerId: string,
    cardId: string,
    from: ZoneName,
    to: ZoneName,
    position?: { x?: number; y?: number },
    toIndex?: number,
    options?: { faceDown?: boolean; toPosition?: LibraryPosition },
  ) => void;
  applyOptimisticBatchMove: (
    playerId: string,
    cards: CardMove[],
    from: ZoneName,
    to: ZoneName,
    toIndex?: number,
    options?: { faceDown?: boolean; toPosition?: LibraryPosition },
  ) => void;
  applyOptimisticMoveZone: (
    playerId: string,
    from: ZoneName,
    to: ZoneName,
    toPosition?: LibraryPosition,
  ) => void;
  applyOptimisticHandOrder: (playerId: string, cardIds: string[]) => void;
  applyOptimisticHandReorder: (playerId: string, cardId: string, toIndex: number) => void;
  applyEvent: (event: ServerEvent) => void;
  closeZoneView: () => void;
  setConnectionState: (state: ConnectionState) => void;
  setError: (message: string | null) => void;
  reset: () => void;
};

const initialState = {
  table: null,
  playerId: null,
  zoneView: null,
  connectionState: "idle" as ConnectionState,
  error: null,
};

export const useTableStore = create<TableStore>((set) => ({
  ...initialState,
  applyOptimisticMove: (playerId, cardId, from, to, position, toIndex, options) => {
    set((state) => {
      if (!state.table) {
        return state;
      }

      const nextTable = structuredClone(state.table);
      const moved = moveCardView(nextTable, playerId, cardId, from, to, position, toIndex, options);

      if (!moved) {
        return state;
      }

      return {
        ...state,
        table: nextTable,
      };
    });
  },
  applyOptimisticBatchMove: (playerId, cards, from, to, toIndex, options) => {
    set((state) => {
      if (!state.table || cards.length === 0) {
        return state;
      }

      const nextTable = structuredClone(state.table);
      const movedCardIds = moveCardsView(nextTable, playerId, cards, from, to, toIndex, options);

      if (movedCardIds.length === 0) {
        return state;
      }

      return {
        ...state,
        table: nextTable,
      };
    });
  },
  applyOptimisticMoveZone: (playerId, from, to, toPosition) => {
    set((state) => {
      if (!state.table) {
        return state;
      }

      const nextTable = structuredClone(state.table);
      const movedCardIds = moveZoneView(nextTable, playerId, from, to, toPosition);

      if (movedCardIds.length === 0) {
        return state;
      }

      return {
        ...state,
        table: nextTable,
      };
    });
  },
  applyOptimisticHandOrder: (playerId, cardIds) => {
    set((state) => {
      if (!state.table) {
        return state;
      }

      const nextTable = structuredClone(state.table);
      const changed = setHandOrderView(nextTable, playerId, cardIds);

      if (!changed) {
        return state;
      }

      return {
        ...state,
        table: nextTable,
      };
    });
  },
  applyOptimisticHandReorder: (playerId, cardId, toIndex) => {
    set((state) => {
      if (!state.table) {
        return state;
      }

      const nextTable = structuredClone(state.table);
      const reordered = reorderHandCardView(nextTable, playerId, cardId, toIndex);

      if (!reordered) {
        return state;
      }

      return {
        ...state,
        table: nextTable,
      };
    });
  },
  applyEvent: (event) => {
    set((state) => {
      switch (event.type) {
        case "joined":
          return { ...state, playerId: event.playerId };
        case "state":
          return { ...state, table: event.state, error: null };
        case "zone-view":
          return { ...state, zoneView: event, error: null };
        case "error":
          return { ...state, error: event.message };
        default:
          return state;
      }
    });
  },
  closeZoneView: () => set({ zoneView: null }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
