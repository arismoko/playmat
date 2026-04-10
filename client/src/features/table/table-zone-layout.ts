import {
  BATTLEFIELD_GRID_COLUMNS,
  BATTLEFIELD_GRID_ORIGIN_X,
  BATTLEFIELD_GRID_ORIGIN_Y,
  BATTLEFIELD_GRID_STEP_X,
  BATTLEFIELD_GRID_STEP_Y,
  type CardView,
  type PlayerView,
  type ZoneName,
} from "@playmat/shared/table";
const BATTLEFIELD_OCCUPANCY_WIDTH = 92;
const BATTLEFIELD_OCCUPANCY_HEIGHT = 112;

function boxesOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function getNextBattlefieldPosition(cards: Pick<CardView, "x" | "y">[]): {
  x: number;
  y: number;
} {
  const maxRows = Math.max(1, cards.length + 2);

  for (let row = 0; row < maxRows; row += 1) {
    for (let column = 0; column < BATTLEFIELD_GRID_COLUMNS; column += 1) {
      const x = BATTLEFIELD_GRID_ORIGIN_X + column * BATTLEFIELD_GRID_STEP_X;
      const y = BATTLEFIELD_GRID_ORIGIN_Y + row * BATTLEFIELD_GRID_STEP_Y;
      const candidateBox = {
        bottom: y + BATTLEFIELD_OCCUPANCY_HEIGHT,
        left: x,
        right: x + BATTLEFIELD_OCCUPANCY_WIDTH,
        top: y,
      };
      const isOccupied = cards.some((card) =>
        boxesOverlap(candidateBox, {
          bottom: card.y + BATTLEFIELD_OCCUPANCY_HEIGHT,
          left: card.x,
          right: card.x + BATTLEFIELD_OCCUPANCY_WIDTH,
          top: card.y,
        }),
      );

      if (!isOccupied) {
        return { x, y };
      }
    }
  }

  return {
    x: BATTLEFIELD_GRID_ORIGIN_X,
    y: BATTLEFIELD_GRID_ORIGIN_Y + maxRows * BATTLEFIELD_GRID_STEP_Y,
  };
}

export type TableZoneTone =
  | "library"
  | "graveyard"
  | "exile"
  | "commandZone"
  | "sideboard";

export type TableZoneSlot = {
  count: number;
  hidePreview: boolean;
  label: string;
  previewCard: CardView | null;
  shortLabel: string;
  tone: TableZoneTone;
  zoneName: ZoneName;
};

type TableZoneMeta = Omit<TableZoneSlot, "count" | "previewCard">;

const ZONE_META: Record<ZoneName, TableZoneMeta> = {
  library: {
    hidePreview: true,
    label: "Library",
    shortLabel: "LIB",
    tone: "library",
    zoneName: "library",
  },
  hand: {
    hidePreview: false,
    label: "Hand",
    shortLabel: "HAND",
    tone: "library",
    zoneName: "hand",
  },
  battlefield: {
    hidePreview: false,
    label: "Battlefield",
    shortLabel: "FIELD",
    tone: "library",
    zoneName: "battlefield",
  },
  graveyard: {
    hidePreview: false,
    label: "Graveyard",
    shortLabel: "GY",
    tone: "graveyard",
    zoneName: "graveyard",
  },
  exile: {
    hidePreview: false,
    label: "Exile",
    shortLabel: "EX",
    tone: "exile",
    zoneName: "exile",
  },
  commandZone: {
    hidePreview: false,
    label: "Command",
    shortLabel: "CMD",
    tone: "commandZone",
    zoneName: "commandZone",
  },
  sideboard: {
    hidePreview: false,
    label: "Sideboard",
    shortLabel: "SB",
    tone: "sideboard",
    zoneName: "sideboard",
  },
};

function buildZoneSlot(player: PlayerView, zoneName: ZoneName): TableZoneSlot {
  const meta = ZONE_META[zoneName];
  const cards = player.zones[zoneName];
  const hidePreview =
    zoneName === "library"
      ? !(player.libraryFlags.alwaysLookAtTop || player.libraryFlags.alwaysRevealTop)
      : meta.hidePreview;

  return {
    ...meta,
    count: cards.length,
    hidePreview,
    previewCard: cards[0] ?? null,
  };
}

export function getCurrentPlayerZoneLayout(player: PlayerView): {
  rightSlots: TableZoneSlot[];
} {
  return {
    rightSlots: [
      buildZoneSlot(player, "library"),
      buildZoneSlot(player, "graveyard"),
      buildZoneSlot(player, "exile"),
    ],
  };
}

export function getOpponentZoneLayout(player: PlayerView): {
  rightSlots: TableZoneSlot[];
} {
  return {
    rightSlots: [
      buildZoneSlot(player, "graveyard"),
      buildZoneSlot(player, "exile"),
      buildZoneSlot(player, "library"),
    ],
  };
}
