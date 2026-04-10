import type { CardView } from "@playmat/shared/table";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  buildTableDragSourceHandlers,
  type TableDragMovePayload,
} from "./drag-source-handlers";
import type { InspectorCard } from "./inspector";
import { TableCard } from "./table-card";
import type {
  TableCardSelection,
  TableDragState,
  TableDropTarget,
  TableGrabSnapshot,
  TableInteractionController,
} from "./use-table-interaction";

type HandFanProps = {
  cards: CardView[];
  ownerPlayerId: string | null;
  interaction: TableInteractionController;
  onInspect: (entry: InspectorCard | null) => void;
  onHandDragEnd: (
    selection: TableCardSelection,
    finishedDrag: TableDragState,
    dropTarget: TableDropTarget | null,
  ) => boolean;
  onHandDragMove: (
    selection: TableCardSelection,
    position: TableDragMovePayload,
  ) => void;
  onPlayCard: (selection: TableCardSelection) => void;
  onSelectHandCard: (
    selection: TableCardSelection,
    options?: { additive: boolean },
  ) => void;
};

const HAND_CARD_BASE_OFFSET_Y = 26;
const HAND_DRAG_GAP_PRIMARY_PX = 18;
const HAND_DRAG_GAP_SECONDARY_PX = 8;
const HAND_HOVER_SCATTER_PX = 80;

type HandPose = {
  roll: number;
  scale: number;
  translateX: number;
  translateY: number;
};

function isHandShellTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest(".game-table-hand-card-shell"));
}

function calculateHandLayout(handSize: number): Array<{
  arcX: number;
  arcY: number;
  rotate: number;
  zIndex: number;
}> {
  if (handSize <= 1) {
    return [{ arcX: 0, arcY: 0, rotate: 0, zIndex: 10 }];
  }

  const totalAngle = Math.min(46, 16 + handSize * 3);
  const firstAngle = -(totalAngle / 2) + totalAngle * 0.1;
  const stepAngle = totalAngle / (handSize - 1);
  const spacing = Math.max(26, 70 - handSize * 2.4);
  const centerIndex = (handSize - 1) / 2;
  const layout = [];

  for (let index = 0; index < handSize; index += 1) {
    const angle = firstAngle + stepAngle * index;
    const centeredIndex = index - centerIndex;

    layout.push({
      arcX: Math.round(centeredIndex * spacing),
      arcY: Math.round(Math.abs(angle) * 1.45),
      rotate: Math.round(angle),
      zIndex: 10 + index,
    });
  }

  return layout;
}

function getNeighborShift(index: number, hoveredIndex: number | null): number {
  if (hoveredIndex === null || index === hoveredIndex) {
    return 0;
  }

  return Math.sign(index - hoveredIndex) * HAND_HOVER_SCATTER_PX;
}

function getHandInsertionShift(visibleIndex: number, insertionIndex: number | null): number {
  if (insertionIndex === null || visibleIndex < 0) {
    return 0;
  }

  if (visibleIndex === insertionIndex - 2) {
    return -HAND_DRAG_GAP_SECONDARY_PX;
  }

  if (visibleIndex === insertionIndex - 1) {
    return -HAND_DRAG_GAP_PRIMARY_PX;
  }

  if (visibleIndex === insertionIndex) {
    return HAND_DRAG_GAP_PRIMARY_PX;
  }

  if (visibleIndex === insertionIndex + 1) {
    return HAND_DRAG_GAP_SECONDARY_PX;
  }

  return 0;
}

function resolveHandInsertionIndex(
  cards: CardView[],
  excludeCardId: string | null,
  handLayout: Array<{ arcX: number }>,
  pointerClientX: number,
  fanElement: HTMLDivElement | null,
): number | null {
  if (!fanElement) {
    return null;
  }

  const fanRect = fanElement.getBoundingClientRect();
  const relativeX = pointerClientX - fanRect.left - fanRect.width / 2;
  let insertionIndex = 0;
  let visibleCount = 0;

  cards.forEach((card, index) => {
    if (card.id === excludeCardId) {
      return;
    }

    visibleCount += 1;

    if (relativeX > (handLayout[index]?.arcX ?? 0)) {
      insertionIndex += 1;
    }
  });

  return clamp(insertionIndex, 0, visibleCount);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createHandGrabSnapshot(
  element: HTMLElement,
  offsetParentRect: { left: number; top: number },
  pose: HandPose,
  anchorLocalX: number,
  anchorLocalY: number,
): TableGrabSnapshot {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const shellLeft = offsetParentRect.left + element.offsetLeft;
  const shellTop = offsetParentRect.top + element.offsetTop;
  const originX = width / 2;
  const originY = height;
  const radians = (pose.roll * Math.PI) / 180;
  const scaledAnchorX = (anchorLocalX - originX) * pose.scale;
  const scaledAnchorY = (anchorLocalY - originY) * pose.scale;
  const rotatedAnchorX =
    scaledAnchorX * Math.cos(radians) - scaledAnchorY * Math.sin(radians);
  const rotatedAnchorY =
    scaledAnchorX * Math.sin(radians) + scaledAnchorY * Math.cos(radians);

  return {
    anchorLocalX,
    anchorLocalY,
    anchorScreenX: shellLeft + pose.translateX + originX + rotatedAnchorX,
    anchorScreenY: shellTop + pose.translateY + originY + rotatedAnchorY,
    roll: pose.roll,
    scale: pose.scale,
  };
}

function resolveHandAnchorLocalPoint(
  event: React.PointerEvent<HTMLElement>,
  element: HTMLElement,
  offsetParentRect: { left: number; top: number },
  pose: HandPose,
): { anchorLocalX: number; anchorLocalY: number } {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const shellLeft = offsetParentRect.left + element.offsetLeft;
  const shellTop = offsetParentRect.top + element.offsetTop;
  const originX = width / 2;
  const originY = height;
  const localX = event.clientX - shellLeft;
  const localY = event.clientY - shellTop;
  const radians = (pose.roll * Math.PI) / 180;
  const translatedX = localX - pose.translateX - originX;
  const translatedY = localY - pose.translateY - originY;
  const unrotatedX = translatedX * Math.cos(-radians) - translatedY * Math.sin(-radians);
  const unrotatedY = translatedX * Math.sin(-radians) + translatedY * Math.cos(-radians);

  return {
    anchorLocalX: clamp(originX + unrotatedX / pose.scale, 0, width),
    anchorLocalY: clamp(originY + unrotatedY / pose.scale, 0, height),
  };
}

export function HandFan({
  cards,
  ownerPlayerId,
  interaction,
  onInspect,
  onHandDragEnd,
  onHandDragMove,
  onPlayCard,
  onSelectHandCard,
}: HandFanProps) {
  const HAND_HOVER_DELAY_MS = 350;
  const HAND_ARRIVAL_DURATION_MS = 250;
  const dragInsertionIndexRef = useRef<number | null>(null);
  const fanRef = useRef<HTMLDivElement | null>(null);
  const shellRefsMap = useRef(new Map<string, HTMLDivElement>());
  const arrivalCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickCardIdRef = useRef<string | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const grabActiveRef = useRef(false);
  const [grabbedCardId, setGrabbedCardId] = useState<string | null>(null);
  const [dragInsertionIndex, setDragInsertionIndex] = useState<number | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  const activeHandDragCardIds = useMemo(() => {
    if (!(interaction.dragState?.moved && interaction.dragState.zone === "hand")) {
      return new Set<string>();
    }

    return new Set(interaction.dragState.selections.map((selection) => selection.cardId));
  }, [interaction.dragState]);
  const snapbackHandCardIds = useMemo(() => {
    if (interaction.snapbackState?.zone !== "hand") {
      return new Set<string>();
    }

    return new Set(interaction.snapbackState.selections.map((selection) => selection.cardId));
  }, [interaction.snapbackState]);
  const handLayout = useMemo(() => calculateHandLayout(cards.length), [cards.length]);
  const resolvedHandLayout = useMemo(() => {
    if (activeHandDragCardIds.size === 0) {
      return handLayout;
    }

    const visibleCount = cards.length - activeHandDragCardIds.size;

    if (visibleCount <= 0) {
      return handLayout;
    }

    const reduced = calculateHandLayout(visibleCount);
    const result: typeof handLayout = [];
    let visibleIndex = 0;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];

      if (card && activeHandDragCardIds.has(card.id)) {
        result.push(handLayout[i] ?? { arcX: 0, arcY: 0, rotate: 0, zIndex: 10 + i });
      } else {
        result.push(reduced[visibleIndex] ?? { arcX: 0, arcY: 0, rotate: 0, zIndex: 10 + visibleIndex });
        visibleIndex++;
      }
    }

    return result;
  }, [cards, activeHandDragCardIds, handLayout]);
  const handGapActive = useMemo(() => {
    if (!interaction.dragState?.moved || interaction.dragState.selections.length !== 1) {
      return false;
    }

    return (
      interaction.dropTarget?.zone === "hand" &&
      interaction.dropTarget.ownerPlayerId === ownerPlayerId
    );
  }, [interaction.dragState, interaction.dropTarget, ownerPlayerId]);
  const handGapExcludeCardId = useMemo(() => {
    if (!handGapActive || interaction.dragState?.zone !== "hand") {
      return null;
    }

    return interaction.dragState.cardId;
  }, [handGapActive, interaction.dragState]);
  const handVisibleIndexById = useMemo(() => {
    const next = new Map<string, number>();

    if (!handGapActive) {
      return next;
    }

    let visibleIndex = 0;

    for (const card of cards) {
      if (card.id === handGapExcludeCardId) {
        continue;
      }

      next.set(card.id, visibleIndex);
      visibleIndex += 1;
    }

    return next;
  }, [handGapActive, handGapExcludeCardId, cards]);
  const visualHoverCardId = useMemo(() => {
    const nextCardId = grabbedCardId ?? hoveredCardId;

    if (!nextCardId || interaction.selectedCardIds.has(nextCardId)) {
      return null;
    }

    return nextCardId;
  }, [grabbedCardId, hoveredCardId, interaction.selectedCardIds]);
  const hoveredCardIndex = useMemo(
    () => cards.findIndex((card) => card.id === visualHoverCardId),
    [cards, visualHoverCardId],
  );

  useEffect(() => {
    if (!(interaction.dragState?.moved || interaction.snapbackState)) {
      return;
    }

    setGrabbedCardId(null);
    setHoveredCardId(null);
    onInspect(null);
  }, [interaction.dragState?.moved, interaction.snapbackState, onInspect]);

  useEffect(() => {
    if (!interaction.dragState && !interaction.snapbackState) {
      grabActiveRef.current = false;
      setGrabbedCardId(null);
      dragInsertionIndexRef.current = null;
      setDragInsertionIndex(null);
      suppressClickCardIdRef.current = null;
      interaction.setHandInsertionIndex(null);
    }
  }, [interaction, interaction.dragState, interaction.snapbackState]);

  useEffect(() => {
    if (!handGapActive || !interaction.dragState) {
      dragInsertionIndexRef.current = null;
      setDragInsertionIndex(null);
      interaction.setHandInsertionIndex(null);
      return;
    }

    const nextInsertionIndex = resolveHandInsertionIndex(
      cards,
      handGapExcludeCardId,
      resolvedHandLayout,
      interaction.dragState.screenX,
      fanRef.current,
    );

    dragInsertionIndexRef.current = nextInsertionIndex;
    interaction.setHandInsertionIndex(nextInsertionIndex);
    setDragInsertionIndex((currentValue) =>
      currentValue === nextInsertionIndex ? currentValue : nextInsertionIndex,
    );
  }, [
    handGapActive,
    handGapExcludeCardId,
    cards,
    resolvedHandLayout,
    interaction,
    interaction.dragState,
  ]);

  useEffect(() => {
    if (!hoveredCardId || cards.some((card) => card.id === hoveredCardId)) {
      return;
    }

    setHoveredCardId(null);
  }, [cards, hoveredCardId]);

  useLayoutEffect(() => {
    const arrival = interaction.consumeHandDropArrival();

    if (!arrival) {
      return;
    }

    const shellElement = shellRefsMap.current.get(arrival.cardId);

    if (!shellElement) {
      return;
    }

    const finalRect = shellElement.getBoundingClientRect();
    const finalCenterX = finalRect.left + finalRect.width / 2;
    const finalCenterY = finalRect.top + finalRect.height / 2;
    const deltaX = arrival.screenX - finalCenterX;
    const deltaY = arrival.screenY - finalCenterY;

    if (Math.abs(deltaX) < 2 && Math.abs(deltaY) < 2) {
      return;
    }

    // Cancel any in-flight arrival animation
    arrivalCleanupRef.current?.();

    // FLIP: set initial offset without transition
    shellElement.style.transition = "none";
    shellElement.style.setProperty("--hand-arrival-x", `${deltaX}px`);
    shellElement.style.setProperty("--hand-arrival-y", `${deltaY}px`);
    shellElement.getBoundingClientRect(); // force reflow

    // Animate to resting position
    shellElement.style.transition =
      `transform ${HAND_ARRIVAL_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity 120ms ease, filter 120ms ease`;
    shellElement.style.setProperty("--hand-arrival-x", "0px");
    shellElement.style.setProperty("--hand-arrival-y", "0px");

    const cleanup = () => {
      shellElement.style.transition = "";
      shellElement.style.removeProperty("--hand-arrival-x");
      shellElement.style.removeProperty("--hand-arrival-y");

      if (arrivalCleanupRef.current === cleanup) {
        arrivalCleanupRef.current = null;
      }
    };

    arrivalCleanupRef.current = cleanup;
    const timeoutId = window.setTimeout(cleanup, HAND_ARRIVAL_DURATION_MS + 30);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [cards, interaction]);

  if (!cards.length) {
    return (
      <section
        className={`game-table-hand game-table-hand-empty-shell${interaction.isDragging ? " game-table-hand-drag-active" : ""}`}
        data-drop-owner-player-id={ownerPlayerId ?? undefined}
        data-drop-zone="hand"
      >
        <div
          className="game-table-hand-hit"
          data-drop-owner-player-id={ownerPlayerId ?? undefined}
          data-drop-zone="hand"
        />
        <div className="game-table-hand-empty">Your hand is empty.</div>
      </section>
    );
  }

  return (
    <section
      className={`game-table-hand${interaction.isDragging ? " game-table-hand-drag-active" : ""}${interaction.dropTarget?.ownerPlayerId === ownerPlayerId && interaction.dropTarget.zone === "hand" ? " game-table-hand-drop-active" : ""}`}
      data-drop-owner-player-id={ownerPlayerId ?? undefined}
      data-drop-zone="hand"
    >
      <div
        className="game-table-hand-hit"
        data-drop-owner-player-id={ownerPlayerId ?? undefined}
        data-drop-zone="hand"
      />
      <div className="game-table-hand-fan" ref={fanRef}>
        {cards.map((card, index) => {
          if (!ownerPlayerId) {
            return null;
          }

          const resolvedLayout = resolvedHandLayout[index] ?? resolvedHandLayout[0] ?? {
            arcX: 0,
            arcY: 0,
            rotate: 0,
            zIndex: index + 10,
          };
          const isFrozenGrabPose =
            grabbedCardId === card.id &&
            interaction.dragState?.zone === "hand" &&
            interaction.dragState.cardId === card.id &&
            !interaction.dragState.moved;
          const isSelected = interaction.selectedCardIds.has(card.id);
          const isHovered =
            (hoveredCardId === card.id || isFrozenGrabPose) &&
            !interaction.snapbackState &&
            (!isSelected || isFrozenGrabPose);
          const isDragGhost = activeHandDragCardIds.has(card.id) || snapbackHandCardIds.has(card.id);
          const neighborShiftX =
            dragInsertionIndex !== null && handGapActive
              ? getHandInsertionShift(handVisibleIndexById.get(card.id) ?? -1, dragInsertionIndex)
              : getNeighborShift(index, hoveredCardIndex >= 0 ? hoveredCardIndex : null);
          const hoverLift = isHovered ? -126 : 0;
          const hoverRotate = isHovered ? -resolvedLayout.rotate : 0;
          const hoverScale = isHovered ? 2 : 1;
          const zIndex = isHovered ? 280 : resolvedLayout.zIndex;
          const selection = {
            cardId: card.id,
            initialRoll: resolvedLayout.rotate,
            ownerPlayerId,
            zone: "hand" as const,
          } satisfies TableCardSelection;

          const dragHandlers = buildTableDragSourceHandlers({
            getDragStateExtras: (event) => {
              const element = event.currentTarget;
              const offsetParent = element.offsetParent;
              const offsetParentRect =
                offsetParent instanceof HTMLElement
                  ? offsetParent.getBoundingClientRect()
                  : { left: 0, top: 0 };
              const grabPose = {
                roll: resolvedLayout.rotate + hoverRotate,
                scale: hoverScale,
                translateX: resolvedLayout.arcX + neighborShiftX,
                translateY: HAND_CARD_BASE_OFFSET_Y + resolvedLayout.arcY + hoverLift,
              };
              const restPose = {
                roll: resolvedLayout.rotate,
                scale: 1,
                translateX: resolvedLayout.arcX,
                translateY: HAND_CARD_BASE_OFFSET_Y + resolvedLayout.arcY,
              };
              const anchorLocalPoint = resolveHandAnchorLocalPoint(
                event,
                element,
                offsetParentRect,
                grabPose,
              );
              const grabSnapshot = createHandGrabSnapshot(
                element,
                offsetParentRect,
                grabPose,
                anchorLocalPoint.anchorLocalX,
                anchorLocalPoint.anchorLocalY,
              );
              const restSnapshot = createHandGrabSnapshot(
                element,
                offsetParentRect,
                restPose,
                anchorLocalPoint.anchorLocalX,
                anchorLocalPoint.anchorLocalY,
              );

              return {
                grabSnapshot,
                restSnapshot,
                offsetX: anchorLocalPoint.anchorLocalX,
                offsetY: anchorLocalPoint.anchorLocalY,
                width: element.offsetWidth,
                height: element.offsetHeight,
              };
            },
            interaction,
            onDrop: (nextSelection, finishedDrag, dropTarget) => {
              suppressClickCardIdRef.current = card.id;
              return onHandDragEnd(nextSelection, finishedDrag, dropTarget);
            },
            onMove: onHandDragMove,
            onNoMove: (nextSelection, event) => {
              onSelectHandCard(nextSelection, {
                additive: event.metaKey || event.ctrlKey,
              });
            },
            selection,
          });

          return (
            <div
              className={`game-table-hand-card-shell${isDragGhost ? " game-table-hand-card-shell-dragging" : ""}${isHovered ? " game-table-hand-card-shell-hovered" : ""}`}
              data-table-card-id={card.id}
              data-table-card-owner-player-id={ownerPlayerId}
              key={card.id}
              ref={(el) => {
                if (el) {
                  shellRefsMap.current.set(card.id, el);
                } else {
                  shellRefsMap.current.delete(card.id);
                }
              }}
              style={
                {
                  "--hand-arc-x": `${resolvedLayout.arcX}px`,
                  "--hand-arc-y": `${resolvedLayout.arcY}px`,
                  "--hand-rotate": `${resolvedLayout.rotate}deg`,
                  "--hand-hover-lift": `${hoverLift}px`,
                  "--hand-hover-rotate": `${hoverRotate}deg`,
                  "--hand-hover-scale": `${hoverScale}`,
                  "--hand-neighbor-shift-x": `${neighborShiftX}px`,
                  "--hand-z": `${zIndex}`,
                } as CSSProperties
              }
              {...dragHandlers}
              onPointerDownCapture={() => {
                if (hoverTimerRef.current !== null) {
                  window.clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = null;
                }
                grabActiveRef.current = true;
                setGrabbedCardId(card.id);
                setHoveredCardId(card.id);
              }}
              onPointerEnter={() => {
                if (interaction.isDragging) {
                  return;
                }

                if (hoverTimerRef.current !== null) {
                  window.clearTimeout(hoverTimerRef.current);
                }

                const alreadyInHand = hoveredCardId !== null;

                if (alreadyInHand) {
                  setHoveredCardId(card.id);
                } else {
                  hoverTimerRef.current = window.setTimeout(() => {
                    hoverTimerRef.current = null;
                    setHoveredCardId(card.id);
                  }, HAND_HOVER_DELAY_MS);
                }

                onInspect(null);
              }}
              onPointerMove={(event) => {
                dragHandlers.onPointerMove?.(event);

                if (!isHovered || interaction.isDragging || grabActiveRef.current) {
                  return;
                }

                const fanRect = fanRef.current?.getBoundingClientRect();

                if (!fanRect) {
                  return;
                }

                const relativeX = event.clientX - fanRect.left - fanRect.width / 2;
                let closestIdx = index;
                let closestDist = Math.abs(relativeX - resolvedLayout.arcX);

                for (let n = 0; n < cards.length; n += 1) {
                  if (n === index) {
                    continue;
                  }

                  const dist = Math.abs(relativeX - (resolvedHandLayout[n]?.arcX ?? 0));

                  if (dist < closestDist) {
                    closestIdx = n;
                    closestDist = dist;
                  }
                }

                if (closestIdx !== index) {
                  setHoveredCardId(cards[closestIdx]?.id ?? null);
                }
              }}
              onPointerLeave={(event) => {
                if (hoverTimerRef.current !== null) {
                  window.clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = null;
                }

                if (!isFrozenGrabPose && !isHandShellTarget(event.relatedTarget)) {
                  setHoveredCardId(null);
                  onInspect(null);
                }
              }}
            >
              <TableCard
                ariaLabel={`${card.name} in your hand`}
                card={card}
                className={`game-table-hand-card${isHovered ? " game-table-hand-card-hovered" : ""}`}
                priority={index < 2}
                selected={isSelected}
                onClick={(event) => {
                  if (suppressClickCardIdRef.current === card.id) {
                    suppressClickCardIdRef.current = null;
                    return;
                  }

                  if (event.detail !== 0) {
                    return;
                  }

                  if (event.metaKey || event.ctrlKey) {
                    onSelectHandCard(selection, { additive: true });
                    return;
                  }

                  onSelectHandCard(selection);
                }}
                onDoubleClick={() => onPlayCard(selection)}
                onMouseEnter={() => onInspect(null)}
                onMouseLeave={() => undefined}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
