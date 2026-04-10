import type { ClientAction, ServerEvent } from "@playmat/shared/actions";
import {
  adjustLife,
  adjustPlayerCounter,
  advancePhase,
  canStartGame,
  createLibraryFlags,
  createPlayerCounter,
  createTokensOnBattlefield,
  createPublicCardViews,
  createEmptyZones,
  createTableState,
  cloneCardToBattlefield,
  drawCards,
  isPhase,
  loadDeck,
  moveCardsFromLibrary,
  moveCard,
  moveCards,
  moveZone,
  passTurn,
  peekCardsByIds,
  peekZoneCards,
  peekRandomZoneCards,
  projectTableView,
  pushLog,
  reorderHandCard,
  setHandOrder,
  attachCardToBattlefield,
  removePlayerCounter,
  setCardAnnotation,
  setCardDoesNotUntap,
  setLibraryFlag,
  setCardCounter,
  setCardPtModifier,
  setReadyState,
  setSelectedDeck,
  setPlayerConnected,
  shiftLibraryCard,
  shuffleZone,
  startGame,
  takeMulligan,
  toggleCardArrow,
  toggleFaceDown,
  toggleBattlefieldCard,
  transformCard,
  unattachCard,
  upsertPlayer,
  type DeckCard,
  type PlayerState,
  type TableState,
  type ZoneName,
} from "@playmat/shared/table";
import type * as Party from "partykit/server";

const STORAGE_KEY = "table-state";
const DECK_STORAGE_KEY = "selected-decks";
const MAX_UNDO_STACK_SIZE = 5;

type UndoEntry = {
  actionKind: string;
  snapshot: Pick<PlayerState, "arrows" | "counters" | "libraryFlags" | "life" | "zones">;
};

function findPlayerByName(state: TableState, name: string) {
  return Object.values(state.players).find((player) => player.name === name) ?? null;
}

function migrateStoredState(savedState: TableState): TableState {
  const nextState = savedState;

  nextState.phase = isPhase(nextState.phase)
    ? nextState.phase
    : nextState.status === "playing"
      ? "opening"
      : null;

  for (const player of Object.values(nextState.players)) {
    for (const zoneCards of Object.values(player.zones)) {
      for (const card of zoneCards) {
        if (typeof card.activeFaceIndex !== "number") {
          card.activeFaceIndex = 0;
        }
      }
    }
  }

  nextState.log = nextState.log.map((entry) => {
    const storedEntry = entry as typeof entry & {
      event?: typeof entry.event;
      text?: string;
    };

    if (storedEntry.event) {
      return storedEntry;
    }

    return {
      id: storedEntry.id,
      event: {
        kind: "message",
        text: storedEntry.text ?? "Table updated.",
      },
      playerId: storedEntry.playerId,
      createdAt: storedEntry.createdAt,
    };
  });

  for (const player of Object.values(nextState.players)) {
    player.arrows = player.arrows ?? [];
    player.counters = player.counters ?? [];
    player.libraryFlags = {
      ...createLibraryFlags(),
      ...player.libraryFlags,
    };
    player.zones = {
      ...createEmptyZones(),
      ...player.zones,
    };
  }

  return nextState;
}

function parseAction(message: string): ClientAction | null {
  try {
    const data = JSON.parse(message) as { type?: unknown };

    if (!data || typeof data.type !== "string") {
      return null;
    }

    return data as ClientAction;
  } catch {
    return null;
  }
}

function sanitizePlayerName(value: string): string {
  const trimmed = value.trim();
  return trimmed.slice(0, 24) || "Guest";
}

function sanitizeDeck(cards: DeckCard[]): DeckCard[] {
  return cards
    .filter((card) => typeof card.name === "string" && card.name.trim())
    .map((card) => ({
      name: card.name.trim(),
      count: Number.isFinite(card.count) ? card.count : 1,
      imageUrl: typeof card.imageUrl === "string" ? card.imageUrl : undefined,
      artCropUrl: typeof card.artCropUrl === "string" ? card.artCropUrl : undefined,
    }));
}

export default class TableServer implements Party.Server {
  state: TableState;
  selectedDecks: Record<string, DeckCard[]>;
  connectionPlayers: Map<string, string>;
  undoStacks: Record<string, UndoEntry[]>;

  constructor(readonly room: Party.Room) {
    this.state = createTableState(room.id);
    this.selectedDecks = {};
    this.connectionPlayers = new Map();
    this.undoStacks = {};
  }

  async onStart() {
    const savedState = await this.room.storage.get<TableState>(STORAGE_KEY);
    const savedDecks = await this.room.storage.get<Record<string, DeckCard[]>>(DECK_STORAGE_KEY);

    if (savedState) {
      this.state = migrateStoredState(savedState);
    }

    if (savedDecks) {
      this.selectedDecks = savedDecks;
    }
  }

  onConnect(connection: Party.Connection) {
    void connection;
  }

  async onClose(connection: Party.Connection) {
    const playerId = this.connectionPlayers.get(connection.id);

    if (playerId) {
      this.connectionPlayers.delete(connection.id);

      const hasOtherConnection = Array.from(this.connectionPlayers.values()).includes(playerId);

      if (!hasOtherConnection) {
        setPlayerConnected(this.state, playerId, false);
      }
    }

    await this.persistAndBroadcast();
  }

  async onMessage(message: string, sender: Party.Connection) {
    const action = parseAction(message);
    let shouldPersistAndBroadcast = true;

    if (!action) {
      sender.send(JSON.stringify({ type: "error", message: "Invalid action payload." } satisfies ServerEvent));
      return;
    }

    switch (action.type) {
      case "join": {
        const sanitizedName = sanitizePlayerName(action.playerName);
        const existingById = this.state.players[action.playerId] ?? null;
        const existingByName = findPlayerByName(this.state, sanitizedName);
        const existingByNameConnected = existingByName
          ? Array.from(this.connectionPlayers.values()).includes(existingByName.id)
          : false;

        if (!existingById && existingByNameConnected) {
          sender.send(
            JSON.stringify({ type: "error", message: "That player name is already connected." } satisfies ServerEvent),
          );
          return;
        }

        if (
          !existingById &&
          !existingByName &&
          this.state.status === "playing"
        ) {
          sender.send(
            JSON.stringify({ type: "error", message: "This game is already in progress." } satisfies ServerEvent),
          );
          return;
        }

        const player = existingById
          ? upsertPlayer(this.state, action.playerId, sanitizedName)
          : existingByName
            ? upsertPlayer(this.state, existingByName.id, sanitizedName)
            : upsertPlayer(this.state, action.playerId, sanitizedName);

        this.connectionPlayers.set(sender.id, player.id);
        pushLog(this.state, { kind: "join", playerName: player.name }, player.id);
        sender.send(JSON.stringify({ type: "joined", playerId: player.id } satisfies ServerEvent));
        break;
      }

      case "select-deck": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          sender.send(JSON.stringify({ type: "error", message: "Join the room before selecting a deck." } satisfies ServerEvent));
          return;
        }

        const sanitizedDeck = sanitizeDeck(action.cards);

        if (sanitizedDeck.length === 0) {
          sender.send(JSON.stringify({ type: "error", message: "Choose a non-empty deck." } satisfies ServerEvent));
          return;
        }

        this.selectedDecks[playerId] = sanitizedDeck;
        const changed = setSelectedDeck(
          this.state,
          playerId,
          action.deckName.trim() || "Untitled deck",
          sanitizedDeck.reduce((total, card) => total + card.count, 0)
        );

        if (changed) {
          const player = this.state.players[playerId];

          if (player) {
            pushLog(
              this.state,
              {
                kind: "deck-select",
                deckName: player.selectedDeckName ?? "Untitled deck",
                playerName: player.name,
              },
              player.id,
            );
          }
        }

        break;
      }

      case "set-ready": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          sender.send(JSON.stringify({ type: "error", message: "Join the room before readying up." } satisfies ServerEvent));
          return;
        }

        const changed = setReadyState(this.state, playerId, action.ready);

        if (!changed) {
          sender.send(JSON.stringify({ type: "error", message: "Pick a deck before readying up." } satisfies ServerEvent));
          return;
        }

        const player = this.state.players[playerId];

        if (player) {
          pushLog(
            this.state,
            { kind: "ready", playerName: player.name, ready: player.ready },
            player.id,
          );
        }
        break;
      }

      case "start-game": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId || playerId !== this.state.hostId) {
          sender.send(JSON.stringify({ type: "error", message: "Only the host can start the game." } satisfies ServerEvent));
          return;
        }

        if (!canStartGame(this.state)) {
          sender.send(JSON.stringify({ type: "error", message: "All players need decks, and guests must be ready." } satisfies ServerEvent));
          return;
        }

        for (const player of Object.values(this.state.players)) {
          if (!player.connected) {
            continue;
          }

          const selectedDeck = this.selectedDecks[player.id];

          if (!selectedDeck) {
            continue;
          }

          loadDeck(this.state, player.id, selectedDeck);
          drawCards(this.state, player.id, 7);
        }

        startGame(this.state);
        this.clearUndoStacks();
        pushLog(this.state, { kind: "game-start" }, this.state.hostId);
        break;
      }

      case "draw": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const undoEntry = this.createUndoEntry(playerId, action.type);
        const drawn = drawCards(this.state, playerId, action.count, action.position);
        const player = this.state.players[playerId];

        if (player && drawn > 0) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            { kind: "draw", count: drawn, playerName: player.name },
            player.id,
          );
        }
        break;
      }

      case "shuffle": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const undoEntry = this.createUndoEntry(playerId, action.type);
        const shuffled = shuffleZone(this.state, playerId, "library", action.slice);
        const player = this.state.players[playerId];

        if (player && shuffled > 0) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(this.state, { kind: "shuffle", count: shuffled, playerName: player.name }, player.id);
        }
        break;
      }

      case "library-to-zone": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const movedCardIds = moveCardsFromLibrary(
          this.state,
          playerId,
          action.count,
          action.position,
          action.to,
          action.faceDown,
        );

        if (player && movedCardIds.length > 0) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "move-cards",
              count: movedCardIds.length,
              from: "library",
              playerName: player.name,
              to: action.to,
            },
            player.id,
          );
        }
        break;
      }

      case "library-shift": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const shifted = shiftLibraryCard(this.state, playerId, action.from, action.to);

        if (player && shifted) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "message",
              text: `${player.name} moved the ${action.from} card of their library to the ${action.to}.`,
            },
            player.id,
          );
        }
        break;
      }

      case "set-library-flag": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const changed = setLibraryFlag(
          this.state,
          playerId,
          action.flag === "always-look-at-top" ? "alwaysLookAtTop" : "alwaysRevealTop",
          action.enabled,
        );

        if (player && changed) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "library-flag",
              enabled: action.enabled,
              flag: action.flag,
              playerName: player.name,
            },
            player.id,
          );
        }
        break;
      }

      case "view-zone": {
        const playerId = this.connectionPlayers.get(sender.id);
        const player = playerId ? this.state.players[playerId] : null;

        if (!playerId || !player) {
          return;
        }

        const targetPlayerId = action.targetPlayerId ?? playerId;
        const targetPlayer = this.state.players[targetPlayerId];

        if (!targetPlayer) {
          return;
        }

        if (targetPlayerId !== playerId && action.zone !== "graveyard" && action.zone !== "exile") {
          return;
        }

        const cards = peekZoneCards(
          this.state,
          targetPlayerId,
          action.zone,
          action.count,
          action.position,
        );

        sender.send(
          JSON.stringify({
            type: "zone-view",
            cards: createPublicCardViews(cards),
            ownerName: targetPlayer.name,
            ownerPlayerId: targetPlayer.id,
            shuffleOnCloseAvailable: targetPlayerId === playerId
              && action.zone === "library"
              && action.count === undefined
              && action.position === undefined,
            title: this.getZoneViewTitle(targetPlayer.name, action.zone, action.count, action.position),
            zone: action.zone,
          } satisfies ServerEvent),
        );
        shouldPersistAndBroadcast = false;
        break;
      }

      case "reveal-zone": {
        const playerId = this.connectionPlayers.get(sender.id);
        const player = playerId ? this.state.players[playerId] : null;

        if (!playerId || !player) {
          return;
        }

        const targetConnections = this.getZoneViewTargets(sender.id, playerId, action.targetPlayerId);

        if (targetConnections.length === 0) {
          sender.send(JSON.stringify({ type: "error", message: "No valid viewers for that command." } satisfies ServerEvent));
          shouldPersistAndBroadcast = false;
          return;
        }

        const cards = peekZoneCards(
          this.state,
          playerId,
          action.zone,
          action.count,
          action.position,
        );

        for (const connection of targetConnections) {
          connection.send(
            JSON.stringify({
              type: "zone-view",
              cards: createPublicCardViews(cards),
              ownerName: player.name,
              ownerPlayerId: player.id,
              title: this.getSharedZoneViewTitle(player.name, action.zone, action.count, action.position),
              zone: action.zone,
            } satisfies ServerEvent),
          );
        }

        pushLog(
          this.state,
          {
            kind: "reveal",
            playerName: player.name,
            summary: this.getRevealSummary(action.zone, action.count, action.position, action.targetPlayerId, targetConnections.length),
          },
          player.id,
        );
        break;
      }

      case "reveal-random-card": {
        const playerId = this.connectionPlayers.get(sender.id);
        const player = playerId ? this.state.players[playerId] : null;

        if (!playerId || !player) {
          return;
        }

        const targetConnections = this.getZoneViewTargets(sender.id, playerId, action.targetPlayerId);

        if (targetConnections.length === 0) {
          sender.send(JSON.stringify({ type: "error", message: "No valid viewers for that command." } satisfies ServerEvent));
          shouldPersistAndBroadcast = false;
          return;
        }

        const cards = peekRandomZoneCards(this.state, playerId, action.zone);

        if (cards.length === 0) {
          sender.send(JSON.stringify({ type: "error", message: `No cards in ${action.zone}.` } satisfies ServerEvent));
          shouldPersistAndBroadcast = false;
          return;
        }

        for (const connection of targetConnections) {
          connection.send(
            JSON.stringify({
              type: "zone-view",
              cards: createPublicCardViews(cards),
              ownerName: player.name,
              ownerPlayerId: player.id,
              title: this.getRandomRevealTitle(player.name, action.zone),
              zone: action.zone,
            } satisfies ServerEvent),
          );
        }

        pushLog(
          this.state,
          {
            kind: "reveal",
            playerName: player.name,
            summary: this.getRandomRevealSummary(action.zone, action.targetPlayerId, targetConnections.length),
          },
          player.id,
        );
        break;
      }

      case "move-card": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const cardName = player?.zones[action.from].find((card) => card.id === action.cardId)?.name ?? "Card";
        const undoEntry = this.createUndoEntry(playerId, action.type);

        const moved = moveCard(this.state, playerId, action.cardId, action.from, action.to, {
          x: action.x,
          y: action.y
        }, action.toIndex, {
          faceDown: action.faceDown,
          toPosition: action.toPosition,
        });

        if (player && moved) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "move-card",
              cardName,
              from: action.from,
              playerName: player.name,
              to: action.to,
            },
            player.id,
          );
        }
        break;
      }

      case "reveal-cards": {
        const playerId = this.connectionPlayers.get(sender.id);
        const player = playerId ? this.state.players[playerId] : null;

        if (!playerId || !player) {
          return;
        }

        const targetConnections = this.getZoneViewTargets(sender.id, playerId, action.targetPlayerId);

        if (targetConnections.length === 0) {
          sender.send(JSON.stringify({ type: "error", message: "No valid viewers for that command." } satisfies ServerEvent));
          shouldPersistAndBroadcast = false;
          return;
        }

        const cards = peekCardsByIds(this.state, playerId, action.zone, action.cardIds);

        if (cards.length === 0) {
          sender.send(JSON.stringify({ type: "error", message: "No valid cards selected for reveal." } satisfies ServerEvent));
          shouldPersistAndBroadcast = false;
          return;
        }

        for (const connection of targetConnections) {
          connection.send(
            JSON.stringify({
              type: "zone-view",
              cards: createPublicCardViews(cards),
              ownerName: player.name,
              ownerPlayerId: player.id,
              title: this.getCardRevealTitle(player.name, action.zone, cards.length),
              zone: action.zone,
            } satisfies ServerEvent),
          );
        }

        pushLog(
          this.state,
          {
            kind: "reveal",
            playerName: player.name,
            summary: this.getCardRevealSummary(action.zone, cards.length, action.targetPlayerId, targetConnections.length),
          },
          player.id,
        );
        break;
      }

      case "move-cards": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const movedCardIds = moveCards(
          this.state,
          playerId,
          action.cards,
          action.from,
          action.to,
          action.toIndex,
          {
            faceDown: action.faceDown,
            toPosition: action.toPosition,
          },
        );

        if (player && movedCardIds.length > 0) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "move-cards",
              count: movedCardIds.length,
              from: action.from,
              playerName: player.name,
              to: action.to,
            },
            player.id,
          );
        }
        break;
      }

      case "move-zone": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const allowedFromZones: ZoneName[] = ["graveyard", "exile", "hand"];

        if (!allowedFromZones.includes(action.from)) {
          sender.send(JSON.stringify({ type: "error", message: "Cannot bulk-move from that zone." } satisfies ServerEvent));
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const movedCardIds = moveZone(this.state, playerId, action.from, action.to, action.toPosition);

        if (player && movedCardIds.length > 0) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "move-cards",
              count: movedCardIds.length,
              from: action.from,
              playerName: player.name,
              to: action.to,
            },
            player.id,
          );
        }
        break;
      }

      case "clone-card": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const clonedCard = cloneCardToBattlefield(
          this.state,
          playerId,
          action.sourceOwnerPlayerId,
          action.cardId,
          action.zone,
        );

        if (player && clonedCard) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "message",
              text: `${player.name} cloned ${clonedCard.name}.`,
            },
            player.id,
          );
        }
        break;
      }

      case "attach-card": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const cardName = player?.zones[action.from].find((card) => card.id === action.cardId)?.name ?? "Card";
        const targetName = this.state.players[action.targetOwnerPlayerId]?.zones.battlefield.find((card) => card.id === action.targetCardId)?.name ?? "card";
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const attached = attachCardToBattlefield(
          this.state,
          playerId,
          action.cardId,
          action.from,
          action.targetOwnerPlayerId,
          action.targetCardId,
        );

        if (player && attached) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "message",
              text: `${player.name} attached ${cardName} to ${targetName}.`,
            },
            player.id,
          );
        }
        break;
      }

      case "unattach-card": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const cardName = player?.zones.battlefield.find((card) => card.id === action.cardId)?.name ?? "Card";
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const changed = unattachCard(this.state, playerId, action.cardId);

        if (player && changed) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "message",
              text: `${player.name} unattached ${cardName}.`,
            },
            player.id,
          );
        }
        break;
      }

      case "toggle-card-arrow": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const undoEntry = this.createUndoEntry(playerId, action.type);
        const changed = toggleCardArrow(
          this.state,
          playerId,
          action.sourceOwnerPlayerId,
          action.cardId,
          action.zone,
          action.targetOwnerPlayerId,
          action.targetCardId,
        );

        if (changed) {
          this.pushUndoEntry(playerId, undoEntry);
        }
        break;
      }

      case "set-does-not-untap": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const cardName = player?.zones.battlefield.find((card) => card.id === action.cardId)?.name ?? "Card";
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const changed = setCardDoesNotUntap(this.state, playerId, action.cardId, action.doesNotUntap);

        if (player && changed) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "message",
              text: `${player.name} ${action.doesNotUntap ? "disabled" : "enabled"} normal untapping for ${cardName}.`,
            },
            player.id,
          );
        }
        break;
      }

      case "set-annotation": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const cardName = player?.zones.battlefield.find((card) => card.id === action.cardId)?.name ?? "Card";
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const changed = setCardAnnotation(this.state, playerId, action.cardId, action.annotation);

        if (player && changed) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "message",
              text: `${player.name} updated the annotation on ${cardName}.`,
            },
            player.id,
          );
        }
        break;
      }

      case "set-pt-modifier": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const cardName = player?.zones.battlefield.find((card) => card.id === action.cardId)?.name ?? "Card";
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const changed = setCardPtModifier(this.state, playerId, action.cardId, action.power, action.toughness);

        if (player && changed) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "message",
              text: `${player.name} set ${cardName} to ${action.power >= 0 ? "+" : ""}${action.power}/${action.toughness >= 0 ? "+" : ""}${action.toughness}.`,
            },
            player.id,
          );
        }
        break;
      }

      case "reorder-hand": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const undoEntry = this.createUndoEntry(playerId, action.type);
        const reordered = reorderHandCard(this.state, playerId, action.cardId, action.toIndex);

        if (reordered) {
          this.pushUndoEntry(playerId, undoEntry);
        }
        break;
      }

      case "set-hand-order": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const undoEntry = this.createUndoEntry(playerId, action.type);
        const reordered = setHandOrder(this.state, playerId, action.cardIds);

        if (reordered) {
          this.pushUndoEntry(playerId, undoEntry);
        }
        break;
      }

      case "take-mulligan": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        if (this.state.status !== "playing") {
          sender.send(JSON.stringify({ type: "error", message: "Mulligans are only available during a game." } satisfies ServerEvent));
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const drawn = takeMulligan(this.state, playerId, action.count);

        if (player && drawn !== null) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "message",
              text: `${player.name} took a mulligan to ${drawn} card${drawn === 1 ? "" : "s"}.`,
            },
            player.id,
          );
        }
        break;
      }

      case "tap-card": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const undoEntry = this.createUndoEntry(playerId, action.type);
        const changed = toggleBattlefieldCard(this.state, playerId, action.cardId);
        const player = this.state.players[playerId];
        const card = player?.zones.battlefield.find((entry) => entry.id === action.cardId);

        if (player && changed && card) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "tap",
              cardName: card.name,
              playerName: player.name,
              tapped: card.tapped,
            },
            player.id,
          );
        }
        break;
      }

      case "create-token": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const createdCardIds = createTokensOnBattlefield(
          this.state,
          playerId,
          {
            artCropUrl: action.artCropUrl,
            imageUrl: action.imageUrl,
            name: action.name.trim(),
          },
          action.count,
          {
            x: action.x,
            y: action.y,
          },
        );

        if (player && createdCardIds.length > 0) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "message",
              text: `${player.name} created ${createdCardIds.length} ${action.name.trim()} token${createdCardIds.length === 1 ? "" : "s"}.`,
            },
            player.id,
          );
        }
        break;
      }

      case "transform-card": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const card = player?.zones.battlefield.find((entry) => entry.id === action.cardId);
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const changed = transformCard(this.state, playerId, action.cardId);

        if (player && card && changed) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "transform",
              cardName: card.name,
              playerName: player.name,
            },
            player.id,
          );
        }
        break;
      }

      case "toggle-face-down": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const card = player?.zones.battlefield.find((entry) => entry.id === action.cardId);
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const changed = toggleFaceDown(this.state, playerId, action.cardId);

        if (player && card && changed) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "face-down",
              cardName: card.faceDown ? "a card" : card.name,
              faceDown: card.faceDown,
              playerName: player.name,
            },
            player.id,
          );
        }
        break;
      }

      case "adjust-life": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const undoEntry = this.createUndoEntry(playerId, action.type);
        const newTotal = adjustLife(this.state, playerId, action.amount);
        const player = this.state.players[playerId];

        if (player && newTotal !== null) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "life-change",
              amount: action.amount,
              newTotal,
              playerName: player.name,
            },
            player.id,
          );
        }
        break;
      }

      case "advance-phase": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const result = advancePhase(this.state, playerId);

        if (!player || !result) {
          sender.send(
            JSON.stringify({ type: "error", message: "Only the active player can advance phases." } satisfies ServerEvent),
          );
          return;
        }

        if (result.passedTurn) {
          const nextPlayer = result.nextPlayerId
            ? this.state.players[result.nextPlayerId]
            : null;

          if (nextPlayer) {
            pushLog(
              this.state,
              {
                kind: "pass-turn",
                nextPlayerName: nextPlayer.name,
                playerName: player.name,
              },
              player.id,
            );
          }
        } else {
          pushLog(
            this.state,
            {
              kind: "phase-advance",
              phase: result.phase,
              playerName: player.name,
            },
            player.id,
          );
        }
        break;
      }

      case "pass-turn": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const nextPlayerId = passTurn(this.state, playerId);
        const nextPlayer = nextPlayerId ? this.state.players[nextPlayerId] : null;

        if (!player || !nextPlayer) {
          sender.send(
            JSON.stringify({ type: "error", message: "Only the active player can pass the turn." } satisfies ServerEvent),
          );
          return;
        }

        pushLog(
          this.state,
          {
            kind: "pass-turn",
            nextPlayerName: nextPlayer.name,
            playerName: player.name,
          },
          player.id,
        );
        break;
      }

      case "set-counter": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const card = player?.zones.battlefield.find((entry) => entry.id === action.cardId);
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const changed = setCardCounter(
          this.state,
          playerId,
          action.cardId,
          action.counter,
          action.value,
        );
        const nextValue = card?.counters[action.counter.trim()] ?? 0;

        if (player && card && changed) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "counter-change",
              cardName: card.name,
              counter: action.counter.trim(),
              playerName: player.name,
              value: nextValue,
            },
            player.id,
          );
        }
        break;
      }

      case "create-player-counter": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const counter = createPlayerCounter(this.state, playerId, action.name, action.color);

        if (player && counter) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "player-counter",
              counterName: counter.name,
              playerName: player.name,
              value: counter.value,
            },
            player.id,
          );
        }
        break;
      }

      case "adjust-player-counter": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const counter = adjustPlayerCounter(this.state, playerId, action.counterId, action.amount);

        if (player && counter) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "player-counter",
              counterName: counter.name,
              playerName: player.name,
              value: counter.value,
            },
            player.id,
          );
        }
        break;
      }

      case "remove-player-counter": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const player = this.state.players[playerId];
        const undoEntry = this.createUndoEntry(playerId, action.type);
        const counter = removePlayerCounter(this.state, playerId, action.counterId);

        if (player && counter) {
          this.pushUndoEntry(playerId, undoEntry);
          pushLog(
            this.state,
            {
              kind: "player-counter",
              counterName: counter.name,
              playerName: player.name,
              value: null,
            },
            player.id,
          );
        }
        break;
      }

      case "undo": {
        const playerId = this.connectionPlayers.get(sender.id);

        if (!playerId) {
          return;
        }

        const undoEntry = this.popUndoEntry(playerId);
        const player = this.state.players[playerId];

        if (!player || !undoEntry) {
          sender.send(JSON.stringify({ type: "error", message: "Nothing to undo yet." } satisfies ServerEvent));
          return;
        }

        this.state.players[playerId] = {
          ...player,
          arrows: undoEntry.snapshot.arrows,
          counters: undoEntry.snapshot.counters,
          libraryFlags: undoEntry.snapshot.libraryFlags,
          life: undoEntry.snapshot.life,
          zones: undoEntry.snapshot.zones,
        };
        pushLog(
          this.state,
          {
            kind: "undo",
            actionKind: undoEntry.actionKind,
            playerName: player.name,
          },
          playerId,
        );
        break;
      }

      default:
        sender.send(JSON.stringify({ type: "error", message: "Action not supported yet." } satisfies ServerEvent));
        return;
    }

    if (shouldPersistAndBroadcast) {
      await this.persistAndBroadcast();
    }
  }

  private async persistAndBroadcast() {
    await this.room.storage.put(STORAGE_KEY, this.state);
    await this.room.storage.put(DECK_STORAGE_KEY, this.selectedDecks);

    for (const connection of this.room.getConnections()) {
      const viewerPlayerId = this.connectionPlayers.get(connection.id) ?? null;
      connection.send(
        JSON.stringify({ type: "state", state: projectTableView(this.state, viewerPlayerId) } satisfies ServerEvent)
      );
    }
  }

  private getZoneViewTargets(
    senderConnectionId: string,
    ownerPlayerId: string,
    targetPlayerId: string | "all",
  ): Party.Connection[] {
    return Array.from(this.room.getConnections()).filter((connection) => {
      const connectionPlayerId = this.connectionPlayers.get(connection.id) ?? null;

      if (!connectionPlayerId || connectionPlayerId === ownerPlayerId) {
        return false;
      }

      if (targetPlayerId === "all") {
        return connection.id !== senderConnectionId;
      }

      return connectionPlayerId === targetPlayerId;
    });
  }

  private getZoneViewTitle(
    ownerName: string,
    zone: ZoneName,
    count?: number,
    position?: "top" | "bottom",
  ): string {
    const zoneLabel = zone === "library" ? "library" : zone;

    if (count && position) {
      return `${ownerName} - ${position} ${count} ${zoneLabel}`;
    }

    return `${ownerName} - ${zoneLabel}`;
  }

  private getSharedZoneViewTitle(
    ownerName: string,
    zone: ZoneName,
    count?: number,
    position?: "top" | "bottom",
  ): string {
    if (count && position) {
      return `${ownerName} revealed ${position} ${count} ${zone}`;
    }

    return `${ownerName} revealed ${zone}`;
  }

  private getRevealSummary(
    zone: ZoneName,
    count: number | undefined,
    position: "top" | "bottom" | undefined,
    targetPlayerId: string | "all",
    viewerCount: number,
  ): string {
    const targetLabel = targetPlayerId === "all"
      ? "all players"
      : `${viewerCount} player${viewerCount === 1 ? "" : "s"}`;

    if (count && position) {
      return `revealed ${position} ${count} ${zone} card${count === 1 ? "" : "s"} to ${targetLabel}`;
    }

    return `revealed ${zone} to ${targetLabel}`;
  }

  private getRandomRevealTitle(ownerName: string, zone: ZoneName): string {
    return `${ownerName} revealed a random card from ${zone}`;
  }

  private getCardRevealTitle(ownerName: string, zone: ZoneName, count: number): string {
    return `${ownerName} revealed ${count} ${zone} card${count === 1 ? "" : "s"}`;
  }

  private getRandomRevealSummary(
    zone: ZoneName,
    targetPlayerId: string | "all",
    viewerCount: number,
  ): string {
    const targetLabel = targetPlayerId === "all"
      ? "all players"
      : `${viewerCount} player${viewerCount === 1 ? "" : "s"}`;

    return `revealed a random ${zone} card to ${targetLabel}`;
  }

  private getCardRevealSummary(
    zone: ZoneName,
    count: number,
    targetPlayerId: string | "all",
    viewerCount: number,
  ): string {
    const targetLabel = targetPlayerId === "all"
      ? "all players"
      : `${viewerCount} player${viewerCount === 1 ? "" : "s"}`;

    return `revealed ${count} ${zone} card${count === 1 ? "" : "s"} to ${targetLabel}`;
  }

  private createUndoEntry(playerId: string, actionKind: string): UndoEntry | null {
    const player = this.state.players[playerId];

    if (!player) {
      return null;
    }

    return {
      actionKind,
      snapshot: structuredClone({
        arrows: player.arrows,
        counters: player.counters,
        libraryFlags: player.libraryFlags,
        life: player.life,
        zones: player.zones,
      }),
    };
  }

  private pushUndoEntry(playerId: string, entry: UndoEntry | null): void {
    if (!entry) {
      return;
    }

    const nextStack = [...(this.undoStacks[playerId] ?? []), entry];
    this.undoStacks[playerId] = nextStack.slice(-MAX_UNDO_STACK_SIZE);
  }

  private popUndoEntry(playerId: string): UndoEntry | null {
    const stack = this.undoStacks[playerId];

    if (!stack?.length) {
      return null;
    }

    const entry = stack.pop() ?? null;

    if (stack.length === 0) {
      delete this.undoStacks[playerId];
    }

    return entry;
  }

  private clearUndoStacks(): void {
    this.undoStacks = {};
  }
}

TableServer satisfies Party.Worker;
