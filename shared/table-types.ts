export const zoneNames = [
  "library",
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "commandZone",
  "sideboard",
] as const;

export type ZoneName = (typeof zoneNames)[number];

export const libraryPositions = ["top", "bottom"] as const;

export type LibraryPosition = (typeof libraryPositions)[number];

export const BATTLEFIELD_GRID_COLUMNS = 5;
export const BATTLEFIELD_GRID_ORIGIN_X = 64;
export const BATTLEFIELD_GRID_ORIGIN_Y = 64;
export const BATTLEFIELD_GRID_STEP_X = 92;
export const BATTLEFIELD_GRID_STEP_Y = 112;

export const phases = [
  "opening",
  "upkeep",
  "draw",
  "main1",
  "combat",
  "main2",
  "end",
] as const;

export type Phase = (typeof phases)[number];

export type DeckCard = {
  name: string;
  count: number;
  imageUrl?: string;
  artCropUrl?: string;
};

export type CardInstance = {
  id: string;
  name: string;
  imageUrl?: string;
  artCropUrl?: string;
  activeFaceIndex: number;
  annotation?: string;
  attachedToCardId?: string;
  attachedToOwnerPlayerId?: string;
  doesNotUntap?: boolean;
  ptModifier?: { power: number; toughness: number };
  tapped: boolean;
  faceDown: boolean;
  x: number;
  y: number;
  counters: Record<string, number>;
};

export type PublicCardView = CardInstance & {
  visibility: "public";
};

export type HiddenCardView = Omit<CardInstance, "imageUrl"> & {
  imageUrl?: undefined;
  artCropUrl?: undefined;
  name: "Hidden card";
  visibility: "hidden";
};

export type CardView = PublicCardView | HiddenCardView;

export type CardMove = {
  cardId: string;
  x?: number;
  y?: number;
};

export type TableArrow = {
  id: string;
  sourceCardId: string;
  sourceOwnerPlayerId: string;
  sourceZone: ZoneName;
  targetCardId: string | null;
  targetOwnerPlayerId: string;
};

export type PlayerZones = Record<ZoneName, CardInstance[]>;

export type PlayerCounterState = {
  id: string;
  name: string;
  color: string;
  value: number;
};

export type LibraryFlags = {
  alwaysLookAtTop: boolean;
  alwaysRevealTop: boolean;
};

export type PlayerState = {
  id: string;
  name: string;
  life: number;
  connected: boolean;
  ready: boolean;
  selectedDeckName: string | null;
  selectedDeckCardCount: number;
  arrows: TableArrow[];
  counters: PlayerCounterState[];
  libraryFlags: LibraryFlags;
  zones: PlayerZones;
};

export type TableStatus = "lobby" | "playing";

export type LogEvent =
  | { kind: "join"; playerName: string }
  | { kind: "deck-select"; playerName: string; deckName: string }
  | { kind: "ready"; playerName: string; ready: boolean }
  | { kind: "game-start" }
  | { kind: "draw"; playerName: string; count: number }
  | { kind: "shuffle"; playerName: string; count: number }
  | {
      kind: "move-card";
      playerName: string;
      cardName: string;
      from: ZoneName;
      to: ZoneName;
    }
  | {
      kind: "move-cards";
      playerName: string;
      count: number;
      from: ZoneName;
      to: ZoneName;
    }
  | { kind: "tap"; playerName: string; cardName: string; tapped: boolean }
  | { kind: "face-down"; playerName: string; cardName: string; faceDown: boolean }
  | { kind: "transform"; playerName: string; cardName: string }
  | { kind: "life-change"; playerName: string; amount: number; newTotal: number }
  | { kind: "phase-advance"; playerName: string; phase: Phase }
  | { kind: "pass-turn"; playerName: string; nextPlayerName: string }
  | {
      kind: "counter-change";
      playerName: string;
      cardName: string;
      counter: string;
      value: number;
    }
  | {
      kind: "player-counter";
      playerName: string;
      counterName: string;
      value: number | null;
    }
  | { kind: "undo"; playerName: string; actionKind: string }
  | { kind: "reveal"; playerName: string; summary: string }
  | {
      kind: "library-flag";
      playerName: string;
      flag: "always-look-at-top" | "always-reveal-top";
      enabled: boolean;
    }
  | { kind: "message"; text: string };

export type LogEntry = {
  id: string;
  event: LogEvent;
  playerId: string | null;
  createdAt: string;
};

export type TableState = {
  id: string;
  hostId: string | null;
  status: TableStatus;
  players: Record<string, PlayerState>;
  turnPlayerId: string | null;
  phase: Phase | null;
  log: LogEntry[];
};

export type PlayerView = Omit<PlayerState, "zones"> & {
  zones: Record<ZoneName, CardView[]>;
};

export type TableView = Omit<TableState, "players"> & {
  players: Record<string, PlayerView>;
};

export function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && phases.includes(value as Phase);
}

export function formatPhaseLabel(phase: Phase | null): string {
  switch (phase) {
    case "opening":
      return "Opening";
    case "upkeep":
      return "Upkeep";
    case "draw":
      return "Draw";
    case "main1":
      return "Main 1";
    case "combat":
      return "Combat";
    case "main2":
      return "Main 2";
    case "end":
      return "End";
    default:
      return "Waiting";
  }
}
