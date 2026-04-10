import { createId } from "./utils";
import { formatPhaseLabel, type LogEvent, type TableState, type ZoneName } from "./table-types";

function formatZoneLabel(zone: ZoneName): string {
  switch (zone) {
    case "graveyard":
      return "graveyard";
    case "commandZone":
      return "command zone";
    case "sideboard":
      return "sideboard";
    default:
      return zone;
  }
}

function formatUndoActionLabel(actionKind: string): string {
  switch (actionKind) {
    case "draw":
      return "draw";
    case "shuffle":
      return "shuffle";
    case "library-to-zone":
      return "library move";
    case "library-shift":
      return "library reorder";
    case "move-card":
      return "move";
    case "move-cards":
      return "batch move";
    case "move-zone":
      return "zone move";
    case "reorder-hand":
      return "hand reorder";
    case "set-hand-order":
      return "hand sort";
    case "take-mulligan":
      return "mulligan";
    case "reveal-cards":
      return "card reveal";
    case "clone-card":
      return "card clone";
    case "attach-card":
      return "attachment";
    case "unattach-card":
      return "detachment";
    case "toggle-card-arrow":
      return "card arrow";
    case "set-does-not-untap":
      return "untap setting";
    case "set-annotation":
      return "annotation";
    case "set-pt-modifier":
      return "power/toughness change";
    case "tap-card":
      return "tap";
    case "toggle-face-down":
      return "face-down toggle";
    case "transform-card":
      return "transform";
    case "create-token":
      return "token creation";
    case "adjust-life":
      return "life change";
    case "set-counter":
      return "card counter change";
    case "create-player-counter":
      return "counter creation";
    case "adjust-player-counter":
      return "counter adjustment";
    case "remove-player-counter":
      return "counter removal";
    case "set-library-flag":
      return "library visibility change";
    default:
      return actionKind.replace(/-/g, " ");
  }
}

export function formatLogEvent(event: LogEvent): string {
  switch (event.kind) {
    case "join":
      return `${event.playerName} joined the table.`;
    case "deck-select":
      return `${event.playerName} selected ${event.deckName}.`;
    case "ready":
      return `${event.playerName} is ${event.ready ? "ready" : "not ready"}.`;
    case "game-start":
      return "The game has started.";
    case "draw":
      return `${event.playerName} drew ${event.count} card${event.count === 1 ? "" : "s"}.`;
    case "move-card":
      return `${event.playerName} moved ${event.cardName} from ${formatZoneLabel(event.from)} to ${formatZoneLabel(event.to)}.`;
    case "shuffle":
      return `${event.playerName} shuffled ${event.count} card${event.count === 1 ? "" : "s"}.`;
    case "move-cards":
      if (event.from === event.to && event.to === "battlefield") {
        return `${event.playerName} repositioned ${event.count} battlefield card${event.count === 1 ? "" : "s"}.`;
      }

      return `${event.playerName} moved ${event.count} card${event.count === 1 ? "" : "s"} from ${formatZoneLabel(event.from)} to ${formatZoneLabel(event.to)}.`;
    case "tap":
      return `${event.playerName} ${event.tapped ? "tapped" : "untapped"} ${event.cardName}.`;
    case "face-down":
      return `${event.playerName} turned ${event.cardName} ${event.faceDown ? "face down" : "face up"}.`;
    case "transform":
      return `${event.playerName} transformed ${event.cardName}.`;
    case "life-change":
      return `${event.playerName} ${event.amount >= 0 ? "gained" : "lost"} ${Math.abs(event.amount)} life and moved to ${event.newTotal}.`;
    case "phase-advance":
      return `${event.playerName} advanced to ${formatPhaseLabel(event.phase)}.`;
    case "pass-turn":
      return `${event.playerName} passed the turn to ${event.nextPlayerName}.`;
    case "counter-change":
      return `${event.playerName} set ${event.counter} on ${event.cardName} to ${event.value}.`;
    case "player-counter":
      return event.value === null
        ? `${event.playerName} removed ${event.counterName}.`
        : `${event.playerName} set ${event.counterName} to ${event.value}.`;
    case "undo":
      return `${event.playerName} undid their last ${formatUndoActionLabel(event.actionKind)}.`;
    case "reveal":
      return `${event.playerName} ${event.summary}.`;
    case "library-flag":
      return `${event.playerName} ${event.enabled ? "enabled" : "disabled"} ${event.flag === "always-look-at-top" ? "always look at top card" : "always reveal top card"}.`;
    case "message":
      return event.text;
    default:
      return "Table updated.";
  }
}

export function pushLog(
  state: TableState,
  event: LogEvent,
  playerId: string | null = null,
): void {
  state.log.push({
    id: createId(),
    event,
    playerId,
    createdAt: new Date().toISOString(),
  });

  if (state.log.length > 100) {
    state.log = state.log.slice(-100);
  }
}
