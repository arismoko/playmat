import { clamp } from "@playmat/shared/utils";
import type { ZoneName } from "@playmat/shared/table";
import type { TableDropTarget } from "./use-table-interaction";

type ResolveDropTargetArgs = {
  clientX: number;
  clientY: number;
  dragHeight: number;
  dragLeft: number;
  dragTop: number;
  dragWidth: number;
  ownerPlayerId: string;
};

type DropCandidate = {
  element: HTMLElement;
  ownerPlayerId: string;
  zone: ZoneName;
};

function buildBattlefieldTarget(
  candidate: DropCandidate,
  dragLeft: number,
  dragTop: number,
  fallbackWidth: number,
  fallbackHeight: number,
): TableDropTarget {
  const rect = candidate.element.getBoundingClientRect();

  // Use the dragged visual's top-left position so the committed drop
  // matches the preview the player is actually seeing.
  const sampleCard = candidate.element.querySelector<HTMLElement>(
    ".game-table-card-battlefield",
  );
  const cardWidth = sampleCard?.offsetWidth ?? fallbackWidth;
  const cardHeight = sampleCard?.offsetHeight ?? fallbackHeight;

  return {
    ownerPlayerId: candidate.ownerPlayerId,
    x: Math.round(
      clamp(
        dragLeft - rect.left,
        0,
        Math.max(0, rect.width - cardWidth),
      ),
    ),
    y: Math.round(
      clamp(
        dragTop - rect.top,
        0,
        Math.max(0, rect.height - cardHeight),
      ),
    ),
    zone: "battlefield",
  };
}

export function resolveDropTargetAtPoint({
  clientX,
  clientY,
  dragHeight,
  dragLeft,
  dragTop,
  dragWidth,
  ownerPlayerId,
}: ResolveDropTargetArgs): TableDropTarget | null {
  const targetElements = document.elementsFromPoint(clientX, clientY);
  const candidates: DropCandidate[] = [];
  const seenZones = new Set<string>();

  for (const targetElement of targetElements) {
    const dropElement = targetElement.closest<HTMLElement>("[data-drop-zone]");

    if (!dropElement) {
      continue;
    }

    const dropOwnerPlayerId = dropElement.dataset.dropOwnerPlayerId;
    const zone = dropElement.dataset.dropZone as ZoneName | undefined;

    if (!dropOwnerPlayerId || dropOwnerPlayerId !== ownerPlayerId || !zone) {
      continue;
    }

    if (seenZones.has(zone)) {
      continue;
    }

    seenZones.add(zone);
    candidates.push({ element: dropElement, ownerPlayerId: dropOwnerPlayerId, zone });
  }

  if (candidates.length === 0) {
    return null;
  }

  // When hand and battlefield overlap, prefer battlefield if the cursor
  // is within the battlefield bounds. This prevents the hand's hit area
  // from stealing drops near the bottom of the battlefield.
  if (candidates.length > 1) {
    const battlefieldCandidate = candidates.find((c) => c.zone === "battlefield");
    const handCandidate = candidates.find((c) => c.zone === "hand");

    if (battlefieldCandidate && handCandidate) {
      const bfRect = battlefieldCandidate.element.getBoundingClientRect();

      if (clientY <= bfRect.bottom) {
        return buildBattlefieldTarget(
          battlefieldCandidate,
          dragLeft,
          dragTop,
          dragWidth,
          dragHeight,
        );
      }

      return {
        ownerPlayerId: handCandidate.ownerPlayerId,
        zone: "hand",
      };
    }
  }

  // Single candidate or no overlap — use the first match.
  const resolved = candidates[0];

  if (!resolved) {
    return null;
  }

  if (resolved.zone === "battlefield") {
    return buildBattlefieldTarget(resolved, dragLeft, dragTop, dragWidth, dragHeight);
  }

  return {
    ownerPlayerId: resolved.ownerPlayerId,
    zone: resolved.zone,
  };
}
