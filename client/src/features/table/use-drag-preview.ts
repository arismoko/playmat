import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type {
  TableGrabSnapshot,
  TableDragState,
  TableDropTarget,
  TableSnapbackState,
} from "./use-table-interaction";

const ROTATION_SMOOTH_TIME = 0.08;
const SNAPBACK_POSITION_SMOOTH_TIME = 0.05;
const MAX_PITCH_DEG = 7;
const MAX_ROLL_DEG = 9;
const DRAG_BASE_SCALE = 1.03;
const DRAG_MAX_SCALE_BOOST = 0.02;
const DRAG_BASE_LIFT_PX = 8;
const SNAPBACK_MAX_SCALE_BOOST = 0.01;
const MAX_LIFT_BOOST_PX = 6;
const SPEED_FOR_FULL_EFFECT = 1800;
const PITCH_PER_VELOCITY = 0.0065;
const ROLL_PER_VELOCITY = 0.0095;
const HAND_GRAB_HANDOFF_DURATION_MS = 250;
const HAND_SCALE_HANDOFF_DURATION_MS = 400;
const SNAPBACK_REST_DISTANCE = 0.75;
const SNAPBACK_REST_VELOCITY = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function easeOutCubic(x: number): number {
  return 1 - (1 - x) * (1 - x) * (1 - x);
}

function smoothstep(x: number): number {
  return x * x * (3 - 2 * x);
}

function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
): [number, number] {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;

  return [target + (change + temp) * exp, (velocity - omega * temp) * exp];
}

type PreviewMotionState = {
  x: number;
  y: number;
  xVelocity: number;
  yVelocity: number;
  pitch: number;
  roll: number;
  pitchVelocity: number;
  rollVelocity: number;
  scale: number;
  translateX: number;
  translateY: number;
  prevX: number;
  prevY: number;
  prevTime: number;
};

type ActivePreviewState =
  | { kind: "drag"; state: TableDragState }
  | { kind: "snapback"; state: TableSnapbackState };

type HandDragMetrics = {
  battlefieldScale: number;
  transitionEndY: number;
  transitionStartY: number;
};

type DragPreviewRefs = {
  previewRef: RefObject<HTMLDivElement | null>;
  cardRef: RefObject<HTMLDivElement | null>;
};

function isHandAnchoredPreview(previewState: ActivePreviewState): boolean {
  return (
    (previewState.kind === "drag" && previewState.state.zone === "hand") ||
    (previewState.kind === "snapback" && previewState.state.zone === "hand")
  );
}

function createMotionState(): PreviewMotionState {
  return {
    x: 0,
    y: 0,
    xVelocity: 0,
    yVelocity: 0,
    pitch: 0,
    roll: 0,
    pitchVelocity: 0,
    rollVelocity: 0,
    scale: 1,
    translateX: 0,
    translateY: 0,
    prevX: 0,
    prevY: 0,
    prevTime: 0,
  };
}

function getPreviewTarget(previewState: ActivePreviewState): { x: number; y: number } {
  if (previewState.kind === "snapback") {
    return {
      x: previewState.state.returnX,
      y: previewState.state.returnY,
    };
  }

  if (isHandAnchoredPreview(previewState)) {
    return {
      x: previewState.state.screenX,
      y: previewState.state.screenY,
    };
  }

  return {
    x: previewState.state.x,
    y: previewState.state.y,
  };
}

function getPreviewOrigin(previewState: ActivePreviewState): { x: number; y: number } {
  if (isHandAnchoredPreview(previewState)) {
    return {
      x: previewState.state.screenX,
      y: previewState.state.screenY,
    };
  }

  return {
    x: previewState.state.x,
    y: previewState.state.y,
  };
}

function getGrabSnapshot(previewState: ActivePreviewState): TableGrabSnapshot | null {
  if (previewState.kind !== "drag" || previewState.state.zone !== "hand") {
    return null;
  }

  return previewState.state.grabSnapshot ?? null;
}

function getSnapbackSnapshot(previewState: ActivePreviewState): TableGrabSnapshot | null {
  if (previewState.kind !== "snapback" || previewState.state.zone !== "hand") {
    return null;
  }

  return previewState.state.restSnapshot ?? null;
}

function parseCssNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readHandDragMetrics(
  previewElement: HTMLDivElement | null,
  ownerPlayerId: string,
): HandDragMetrics {
  const screenElement =
    previewElement?.closest<HTMLElement>(".game-table-screen") ??
    document.querySelector<HTMLElement>(".game-table-screen");
  const screenStyle = getComputedStyle(screenElement ?? document.documentElement);
  const battlefieldScale = parseCssNumber(
    screenStyle.getPropertyValue("--hand-drag-target-scale"),
    0.73,
  );
  const handElement = document.querySelector<HTMLElement>(
    `.game-table-hand[data-drop-owner-player-id='${ownerPlayerId}']`,
  );
  const battlefieldElement = Array.from(
    document.querySelectorAll<HTMLElement>("[data-battlefield-surface='true']"),
  ).find((element) => element.dataset.dropOwnerPlayerId === ownerPlayerId);

  if (!handElement || !battlefieldElement) {
    return {
      battlefieldScale,
      transitionEndY: window.innerHeight * 0.56,
      transitionStartY: window.innerHeight * 0.82,
    };
  }

  const handRect = handElement.getBoundingClientRect();
  const battlefieldRect = battlefieldElement.getBoundingClientRect();
  const transitionStartY = handRect.top + handRect.height * 0.56;
  const transitionEndY = battlefieldRect.bottom;

  if (transitionEndY >= transitionStartY - 16) {
    return {
      battlefieldScale,
      transitionEndY: Math.min(transitionStartY - 16, window.innerHeight * 0.56),
      transitionStartY,
    };
  }

  return {
    battlefieldScale,
    transitionEndY,
    transitionStartY,
  };
}

function getHandDragScale(
  previewState: ActivePreviewState,
  screenY: number,
  dropTarget: TableDropTarget | null,
  metrics: HandDragMetrics | null,
): number {
  if (previewState.kind !== "drag" || !metrics) {
    return 1;
  }

  const travel = Math.max(1, metrics.transitionStartY - metrics.transitionEndY);

  if (previewState.state.zone === "hand") {
    // Hand → battlefield: shrink from 1 (hand size) toward battlefieldScale
    const progress = clamp((metrics.transitionStartY - screenY) / travel, 0, 1);
    return 1 + (metrics.battlefieldScale - 1) * smoothstep(progress);
  }

  // Any zone → hand: grow from 1 (native size) toward hand size as cursor enters hand zone
  const progress = clamp((screenY - metrics.transitionEndY) / travel, 0, 1);
  const handScale = 1 / metrics.battlefieldScale;
  return 1 + (handScale - 1) * smoothstep(progress);
}

export function useDragPreview(
  dragState: TableDragState | null,
  snapbackState: TableSnapbackState | null,
  dropTarget: TableDropTarget | null,
  onSnapbackComplete: () => void,
): DragPreviewRefs {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const screenYRef = useRef(0);
  const dropTargetRef = useRef<TableDropTarget | null>(dropTarget);
  const handoffStartedAtRef = useRef(0);
  const handDragMetricsRef = useRef<HandDragMetrics | null>(null);
  const snapbackTransformStartRef = useRef({ roll: 0, scale: 1, translateX: 0, translateY: 0 });
  const stateRef = useRef<PreviewMotionState>(createMotionState());
  const completionSentRef = useRef(false);
  const onSnapbackCompleteRef = useRef(onSnapbackComplete);

  const activePreviewState: ActivePreviewState | null = dragState
    ? { kind: "drag", state: dragState }
    : snapbackState
      ? { kind: "snapback", state: snapbackState }
      : null;

  useEffect(() => {
    onSnapbackCompleteRef.current = onSnapbackComplete;
  }, [onSnapbackComplete]);

  useEffect(() => {
    dropTargetRef.current = dropTarget;
  }, [dropTarget]);

  useLayoutEffect(() => {
    if (!activePreviewState) {
      return;
    }

    targetRef.current = getPreviewTarget(activePreviewState);
    screenYRef.current = activePreviewState.state.screenY;
  }, [
    activePreviewState?.kind,
    activePreviewState?.state.screenX,
    activePreviewState?.state.screenY,
    activePreviewState?.state.x,
    activePreviewState?.state.y,
  ]);

  useLayoutEffect(() => {
    if (!activePreviewState) {
      handDragMetricsRef.current = null;
      return;
    }

    handDragMetricsRef.current =
      activePreviewState.kind === "drag"
        ? readHandDragMetrics(previewRef.current, activePreviewState.state.ownerPlayerId)
        : null;
  }, [
    activePreviewState?.kind,
    activePreviewState?.state.cardId,
    activePreviewState?.state.ownerPlayerId,
    activePreviewState?.state.zone,
  ]);

  useLayoutEffect(() => {
    if (!activePreviewState) {
      return;
    }

    handoffStartedAtRef.current = performance.now();

    if (activePreviewState.kind === "snapback") {
      return;
    }

    const origin = getPreviewOrigin(activePreviewState);
    const grabSnapshot = getGrabSnapshot(activePreviewState);
    const isHandPreview = activePreviewState.kind === "drag" && activePreviewState.state.zone === "hand";
    const initialRoll = activePreviewState.kind === "drag"
      ? grabSnapshot?.roll ?? activePreviewState.state.initialRoll ?? 0
      : 0;
    const baseLift = isHandPreview ? 0 : grabSnapshot ? 0 : activePreviewState.kind === "drag" ? DRAG_BASE_LIFT_PX : 0;
    const baseScale = grabSnapshot
      ? grabSnapshot.scale
      : (activePreviewState.kind === "drag" ? DRAG_BASE_SCALE : 1) *
        getHandDragScale(
          activePreviewState,
          activePreviewState.state.screenY,
          dropTargetRef.current,
          handDragMetricsRef.current,
        );

    if (previewRef.current) {
      previewRef.current.style.transform =
        `translate3d(${origin.x.toFixed(2)}px, ${origin.y.toFixed(2)}px, 0)`;
    }

    if (cardRef.current) {
      cardRef.current.style.transformOrigin = isHandPreview && grabSnapshot
        ? `${grabSnapshot.anchorLocalX.toFixed(2)}px ${grabSnapshot.anchorLocalY.toFixed(2)}px`
        : "center center";
      cardRef.current.style.transform = isHandPreview && grabSnapshot
        ? `translate3d(${(-grabSnapshot.anchorLocalX).toFixed(2)}px, ${(-grabSnapshot.anchorLocalY).toFixed(2)}px, 0) perspective(1000px) rotateX(0deg) rotateZ(${initialRoll.toFixed(2)}deg) scale(${baseScale.toFixed(3)})`
        : `translate3d(0, ${(-baseLift).toFixed(2)}px, 0) perspective(1000px) rotateX(0deg) rotateZ(${initialRoll.toFixed(2)}deg) scale(${baseScale.toFixed(3)})`;
      cardRef.current.style.setProperty("--drag-shadow-opacity", "0.24");
      cardRef.current.style.setProperty("--drag-shadow-blur", "30px");
      cardRef.current.style.setProperty("--drag-shadow-y", "16px");
    }
  }, [activePreviewState?.kind, activePreviewState?.state.cardId]);

  useEffect(() => {
    if (!activePreviewState) {
      stateRef.current = createMotionState();
      snapbackTransformStartRef.current = {
        roll: 0,
        scale: 1,
        translateX: 0,
        translateY: 0,
      };
      completionSentRef.current = false;
      handDragMetricsRef.current = null;

      if (previewRef.current) {
        previewRef.current.style.transform = "";
      }

      if (cardRef.current) {
        cardRef.current.style.transform = "";
        cardRef.current.style.transformOrigin = "";
        cardRef.current.style.removeProperty("--drag-shadow-opacity");
        cardRef.current.style.removeProperty("--drag-shadow-blur");
        cardRef.current.style.removeProperty("--drag-shadow-y");
      }

      return;
    }

    const previewState = activePreviewState;
    const state = stateRef.current;
    const origin = getPreviewOrigin(previewState);
    const grabSnapshot = getGrabSnapshot(previewState);
    const snapbackSnapshot = getSnapbackSnapshot(previewState);
    const isHandPreview = isHandAnchoredPreview(previewState);
    state.x = origin.x;
    state.y = origin.y;

    if (previewState.kind === "drag") {
      const sizeScale = getHandDragScale(
        previewState,
        previewState.state.screenY,
        dropTargetRef.current,
        handDragMetricsRef.current,
      );
      const dragScale = DRAG_BASE_SCALE * sizeScale;

      state.pitch = 0;
      state.roll = grabSnapshot?.roll ?? previewState.state.initialRoll ?? 0;
      state.scale = grabSnapshot?.scale ?? dragScale;
      state.translateX = isHandPreview && grabSnapshot ? -grabSnapshot.anchorLocalX : 0;
      state.translateY = isHandPreview && grabSnapshot ? -grabSnapshot.anchorLocalY : -DRAG_BASE_LIFT_PX;
    } else {
      snapbackTransformStartRef.current = {
        roll: state.roll,
        scale: state.scale,
        translateX: state.translateX,
        translateY: state.translateY,
      };

      if (snapbackSnapshot) {
        state.roll = snapbackTransformStartRef.current.roll;
      }
    }
    state.prevX = state.x;
    state.prevY = state.y;
    state.prevTime = performance.now();
    state.xVelocity = 0;
    state.yVelocity = 0;
    state.pitchVelocity = 0;
    state.rollVelocity = 0;
    completionSentRef.current = false;
    targetRef.current = getPreviewTarget(previewState);
    screenYRef.current = previewState.state.screenY;

    let frameId = 0;

    function tick() {
      const now = performance.now();
      const dt = Math.min((now - state.prevTime) / 1000, 0.05);
      state.prevTime = now;

      if (dt > 0.001) {
        const grabSnapshot = getGrabSnapshot(previewState);
        const snapbackSnapshot = getSnapbackSnapshot(previewState);
        const rawHandoffProgress = grabSnapshot
          ? clamp((now - handoffStartedAtRef.current) / HAND_GRAB_HANDOFF_DURATION_MS, 0, 1)
          : 1;
        const handoffProgress = easeOutCubic(rawHandoffProgress);
        const rawScaleHandoffProgress = grabSnapshot
          ? clamp((now - handoffStartedAtRef.current) / HAND_SCALE_HANDOFF_DURATION_MS, 0, 1)
          : 1;
        const scaleHandoffProgress = smoothstep(rawScaleHandoffProgress);
        const rawSnapbackProgress = snapbackSnapshot
          ? clamp((now - handoffStartedAtRef.current) / HAND_GRAB_HANDOFF_DURATION_MS, 0, 1)
          : 1;
        const snapbackProgress = easeOutCubic(rawSnapbackProgress);
        const isHandPreview = isHandAnchoredPreview(previewState);

        if (previewState.kind === "drag") {
          state.xVelocity = 0;
          state.yVelocity = 0;
          state.x = targetRef.current.x;
          state.y = targetRef.current.y;
        } else {
          [state.x, state.xVelocity] = smoothDamp(
            state.x,
            targetRef.current.x,
            state.xVelocity,
            SNAPBACK_POSITION_SMOOTH_TIME,
            dt,
          );
          [state.y, state.yVelocity] = smoothDamp(
            state.y,
            targetRef.current.y,
            state.yVelocity,
            SNAPBACK_POSITION_SMOOTH_TIME,
            dt,
          );
        }

        const velocityX = (state.x - state.prevX) / dt;
        const velocityY = (state.y - state.prevY) / dt;
        const speed = Math.hypot(velocityX, velocityY);
        const intensity = clamp(speed / SPEED_FOR_FULL_EFFECT, 0, 1);
        const targetPitch = clamp(
          velocityY * PITCH_PER_VELOCITY,
          -MAX_PITCH_DEG,
          MAX_PITCH_DEG,
        );
        const targetRoll =
          snapbackSnapshot
            ? snapbackSnapshot.roll
            : previewState.kind === "snapback" && previewState.state.zone === "hand"
              ? previewState.state.initialRoll ?? 0
            : clamp(velocityX * ROLL_PER_VELOCITY, -MAX_ROLL_DEG, MAX_ROLL_DEG);
        const resolvedTargetRoll = grabSnapshot
          ? lerp(grabSnapshot.roll, targetRoll, handoffProgress)
          : targetRoll;

        [state.pitch, state.pitchVelocity] = smoothDamp(
          state.pitch,
          targetPitch,
          state.pitchVelocity,
          ROTATION_SMOOTH_TIME,
          dt,
        );
        [state.roll, state.rollVelocity] = smoothDamp(
          state.roll,
          resolvedTargetRoll,
          state.rollVelocity,
          ROTATION_SMOOTH_TIME,
          dt,
        );

        const sizeScale = getHandDragScale(
          previewState,
          screenYRef.current,
          dropTargetRef.current,
          handDragMetricsRef.current,
        );
        const hasDragStylePose = previewState.kind === "drag" || Boolean(snapbackSnapshot);
        const baseLift = isHandPreview ? 0 : hasDragStylePose ? DRAG_BASE_LIFT_PX : 0;
        const baseScale = (hasDragStylePose ? DRAG_BASE_SCALE : 1) * sizeScale;
        const maxScaleBoost =
          hasDragStylePose ? DRAG_MAX_SCALE_BOOST : SNAPBACK_MAX_SCALE_BOOST;
        const lift = baseLift + MAX_LIFT_BOOST_PX * intensity;
        const dragScale = baseScale + maxScaleBoost * intensity * sizeScale;
        const translateX = isHandPreview
          ? -(grabSnapshot?.anchorLocalX ?? snapbackSnapshot?.anchorLocalX ?? 0)
          : 0;
        const translateY = isHandPreview
          ? -(grabSnapshot?.anchorLocalY ?? snapbackSnapshot?.anchorLocalY ?? 0)
          : -lift;
        const scale = grabSnapshot
          ? lerp(grabSnapshot.scale, dragScale, scaleHandoffProgress)
          : snapbackSnapshot
            ? lerp(snapbackTransformStartRef.current.scale, snapbackSnapshot.scale, snapbackProgress)
            : dragScale;

        state.translateX = translateX;
        state.translateY = translateY;
        state.scale = scale;

        if (previewRef.current) {
          previewRef.current.style.transform =
            `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0)`;
        }

        if (cardRef.current) {
          const activeAnchor = grabSnapshot ?? snapbackSnapshot;

          cardRef.current.style.transformOrigin = isHandPreview && activeAnchor
            ? `${activeAnchor.anchorLocalX.toFixed(2)}px ${activeAnchor.anchorLocalY.toFixed(2)}px`
            : "center center";
          cardRef.current.style.transform = `translate3d(${state.translateX.toFixed(2)}px, ${state.translateY.toFixed(2)}px, 0) perspective(1000px) rotateX(${state.pitch.toFixed(2)}deg) rotateZ(${state.roll.toFixed(2)}deg) scale(${state.scale.toFixed(3)})`;
          cardRef.current.style.setProperty(
            "--drag-shadow-opacity",
            (0.24 + intensity * 0.18).toFixed(3),
          );
          cardRef.current.style.setProperty(
            "--drag-shadow-blur",
            `${(30 + intensity * 18).toFixed(2)}px`,
          );
          cardRef.current.style.setProperty(
            "--drag-shadow-y",
            `${(16 + intensity * 12).toFixed(2)}px`,
          );
        }

        state.prevX = state.x;
        state.prevY = state.y;

        if (
          previewState.kind === "snapback" &&
          !completionSentRef.current &&
          Math.abs(state.x - targetRef.current.x) <= SNAPBACK_REST_DISTANCE &&
          Math.abs(state.y - targetRef.current.y) <= SNAPBACK_REST_DISTANCE &&
          Math.abs(state.xVelocity) <= SNAPBACK_REST_VELOCITY &&
          Math.abs(state.yVelocity) <= SNAPBACK_REST_VELOCITY
        ) {
          completionSentRef.current = true;
          onSnapbackCompleteRef.current();
          return;
        }
      }

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [activePreviewState?.kind, activePreviewState?.state.cardId]);

  return { previewRef, cardRef };
}
