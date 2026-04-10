# Playmat

Cockatrice in the browser. I wanted to play Magic: The Gathering with friends without installing anything, so I built a multiplayer tabletop that runs in a tab.

## How it works

Two players join a room, pick decks, and play on a shared board. PartyKit handles the WebSocket sync, and the server is authoritative over game state, so nobody can get out of sync.

The table has library, hand, battlefield, graveyard, exile, command zone, and sideboard. Cards track their own state: tapped, face-down, counters, attachments, power/toughness modifiers. Turns move through the standard MTG phases. There's undo, a game log, life tracking, and targeting arrows between cards.

## Deck building

The deck editor lets you search cards and build lists in the browser. You can also import from plain text or Cockatrice XML. Everything saves to localStorage.

## Stack

React 19 and Vite on the frontend, PartyKit on the server (which deploys to Cloudflare Workers). Zustand for client state. Card data comes from a separate Cloudflare Workers API I built on top of Scryfall.

The repo is a monorepo: `client/`, `server/`, and `shared/` (types and game logic that both sides use).

## Running locally

```bash
npm install
npm run dev:client   # Vite on localhost:5173
npm run dev:server   # PartyKit dev server
```
