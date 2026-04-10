import type { ClientAction, ServerEvent } from "@playmat/shared/actions";
import { createId } from "@playmat/shared/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { PartySocket } from "partysocket";
import { useTableStore } from "../stores/table-store";

const DEFAULT_PARTYKIT_PORT = "1999";
const PLAYER_ID_KEY = "playmat.player-id";

function getDefaultPartyKitHost(): string {
  if (typeof window === "undefined") {
    return `127.0.0.1:${DEFAULT_PARTYKIT_PORT}`;
  }

  return `${window.location.hostname}:${DEFAULT_PARTYKIT_PORT}`;
}

function getDefaultPartyKitProtocol(): "ws" | "wss" {
  if (typeof window === "undefined") {
    return "ws";
  }

  return window.location.protocol === "https:" ? "wss" : "ws";
}

function getPlayerId(): string {
  const existing = sessionStorage.getItem(PLAYER_ID_KEY);

  if (existing) {
    return existing;
  }

  const next = createId();
  sessionStorage.setItem(PLAYER_ID_KEY, next);
  return next;
}

function setStoredPlayerId(playerId: string): void {
  sessionStorage.setItem(PLAYER_ID_KEY, playerId);
}

function parseServerEvent(message: string): ServerEvent | null {
  try {
    return JSON.parse(message) as ServerEvent;
  } catch {
    return null;
  }
}

export function useParty(tableId: string, playerName: string) {
  const socketRef = useRef<PartySocket | null>(null);
  const playerIdRef = useRef<string>(getPlayerId());
  const applyEvent = useTableStore((state) => state.applyEvent);
  const reset = useTableStore((state) => state.reset);
  const setConnectionState = useTableStore((state) => state.setConnectionState);
  const setError = useTableStore((state) => state.setError);

  const host = useMemo(
    () => import.meta.env.VITE_PARTYKIT_HOST ?? getDefaultPartyKitHost(),
    [],
  );
  const protocol = useMemo(() => getDefaultPartyKitProtocol(), []);

  useEffect(() => {
    reset();
    setConnectionState("connecting");

    const socket = new PartySocket({
      host,
      protocol,
      room: tableId,
    });

    socketRef.current = socket;

    socket.onopen = () => {
      setConnectionState("open");
      setError(null);
      socket.send(
        JSON.stringify({
          type: "join",
          playerName,
          playerId: playerIdRef.current,
        } satisfies ClientAction),
      );
    };

    socket.onmessage = (event) => {
      const payload = parseServerEvent(String(event.data));

      if (!payload) {
        setError("Received an invalid server event.");
        return;
      }

      if (payload.type === "joined" && payload.playerId !== playerIdRef.current) {
        playerIdRef.current = payload.playerId;
        setStoredPlayerId(payload.playerId);
      }

      applyEvent(payload);
    };

    socket.onerror = () => {
      setError("PartyKit connection failed.");
    };

    socket.onclose = () => {
      setConnectionState("closed");
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [
    applyEvent,
    host,
    protocol,
    playerName,
    reset,
    setConnectionState,
    setError,
    tableId,
  ]);

  const sendAction = useCallback(
    (action: ClientAction) => {
      const socket = socketRef.current;

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError("Connection is not ready yet.");
        return;
      }

      socket.send(JSON.stringify(action));
    },
    [setError],
  );

  return { sendAction };
}
