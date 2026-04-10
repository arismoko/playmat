import type {
  CardMove,
  DeckCard,
  LibraryPosition,
  PublicCardView,
  TableView,
  ZoneName,
} from "./table";

export type ClientAction =
  | { type: "join"; playerName: string; playerId: string }
  | { type: "select-deck"; deckName: string; cards: DeckCard[] }
  | { type: "set-ready"; ready: boolean }
  | { type: "start-game" }
  | { type: "draw"; count: number; position?: LibraryPosition }
  | { type: "shuffle"; slice?: { count: number; position: LibraryPosition } }
  | {
      type: "library-to-zone";
      count: number;
      faceDown?: boolean;
      position: LibraryPosition;
      to: ZoneName;
    }
  | { type: "library-shift"; from: LibraryPosition; to: LibraryPosition }
  | { type: "set-library-flag"; enabled: boolean; flag: "always-reveal-top" | "always-look-at-top" }
  | { type: "view-zone"; zone: ZoneName; count?: number; position?: LibraryPosition; targetPlayerId?: string }
  | {
      type: "reveal-zone";
      count?: number;
      position?: LibraryPosition;
      targetPlayerId: string | "all";
      zone: ZoneName;
    }
  | {
      type: "reveal-random-card";
      targetPlayerId: string | "all";
      zone: ZoneName;
    }
  | {
      type: "reveal-cards";
      cardIds: string[];
      targetPlayerId: string | "all";
      zone: ZoneName;
    }
  | {
      type: "move-card";
      cardId: string;
      faceDown?: boolean;
      from: ZoneName;
      to: ZoneName;
      toIndex?: number;
      toPosition?: LibraryPosition;
      x?: number;
      y?: number;
    }
  | {
      type: "move-cards";
      cards: CardMove[];
      faceDown?: boolean;
      from: ZoneName;
      to: ZoneName;
      toIndex?: number;
      toPosition?: LibraryPosition;
    }
  | { type: "move-zone"; from: ZoneName; to: ZoneName; toPosition?: LibraryPosition }
  | { type: "reorder-hand"; cardId: string; toIndex: number }
  | { type: "set-hand-order"; cardIds: string[] }
  | { type: "take-mulligan"; count: number }
  | { type: "clone-card"; cardId: string; sourceOwnerPlayerId?: string; zone: ZoneName }
  | {
      type: "attach-card";
      cardId: string;
      from: ZoneName;
      targetCardId: string;
      targetOwnerPlayerId: string;
    }
  | { type: "unattach-card"; cardId: string }
  | {
      type: "toggle-card-arrow";
      cardId: string;
      sourceOwnerPlayerId?: string;
      targetCardId?: string;
      targetOwnerPlayerId: string;
      zone: ZoneName;
    }
  | { type: "set-does-not-untap"; cardId: string; doesNotUntap: boolean }
  | { type: "set-annotation"; cardId: string; annotation: string }
  | { type: "set-pt-modifier"; cardId: string; power: number; toughness: number }
  | { type: "tap-card"; cardId: string }
  | { type: "toggle-face-down"; cardId: string }
  | { type: "transform-card"; cardId: string }
  | {
      type: "create-token";
      name: string;
      count: number;
      imageUrl?: string;
      artCropUrl?: string;
      x?: number;
      y?: number;
    }
  | { type: "adjust-life"; amount: number }
  | { type: "advance-phase" }
  | { type: "pass-turn" }
  | { type: "set-counter"; cardId: string; counter: string; value: number }
  | { type: "create-player-counter"; name: string; color: string }
  | { type: "adjust-player-counter"; counterId: string; amount: number }
  | { type: "remove-player-counter"; counterId: string }
  | { type: "undo" };

export type ServerEvent =
  | { type: "joined"; playerId: string }
  | { type: "state"; state: TableView }
  | {
      type: "zone-view";
      cards: PublicCardView[];
      ownerName: string;
      ownerPlayerId: string;
      shuffleOnCloseAvailable?: boolean;
      title: string;
      zone: ZoneName;
    }
  | { type: "error"; message: string };
