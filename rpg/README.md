# PUREFXAI RPG — Nexus Beasts

Playable online vertical slice for a browser-native cyber-fantasy RPG. Players enter the same realtime world, weaken and capture original Nexus Beasts, build a three-creature team, gain levels, and opt into PVP.

## Included in this slice

- Phaser 3 responsive game client
- Authoritative Node.js WebSocket server
- Realtime player and creature synchronization
- Server-side movement boundaries, combat, EXP, leveling, capture odds and PVP
- Four original capturable creature species
- Three-slot creature team
- Responsive production-style HUD
- Disconnect and automatic reconnect handling
- `/health` endpoint for hosting checks
- Gemini Live Thai voice NPC with microphone input, spoken output, barge-in and live transcripts
- Gemini 3.5 Flash typed NPC dialogue with short per-session conversation memory and live game context
- Configurable daily text-token, voice-minute and server-authoritative auto-farm budgets
- Auto-farm targets monsters only; it cannot capture creatures or engage PVP
- Server-issued short-lived Gemini ephemeral tokens; the permanent API key never reaches the browser

## Run locally

Requires Node.js 20 or later.

```bash
cd rpg
npm install
npm run server
```

In a second terminal:

```bash
cd rpg
npm run dev
```

Open the Vite URL in two browser windows to test online presence and PVP.

## Controls

- `WASD`: move
- `Space`: attack the nearest creature, or a PVP-enabled player when PVP is active
- `E`: capture a nearby creature once its HP is below 35%
- `P`: toggle PVP

## Deployment architecture

Deploy the built client to Cloudflare Pages and the Node WebSocket server to a persistent container host. Set `VITE_WS_URL` to the secure `wss://` server endpoint before building.

The current slice keeps session state in memory. The next production milestone adds PUREFXAI ID authentication, PostgreSQL persistence, inventories, durable creature collections, party matchmaking and zoned server processes.

## Gemini Live NPC

Create a fresh Gemini API key, store it only in the game server environment as `GEMINI_API_KEY`, and add the browser origin to `ALLOWED_ORIGINS`. The default model is `gemini-3.1-flash-live-preview`, which can be changed through `GEMINI_LIVE_MODEL` when another Live model is enabled for the project.

The browser requests a one-use ephemeral token from `/api/gemini/token`, captures mono PCM audio at 16 kHz, and plays the model's PCM response at 24 kHz. Do not put a permanent credential in any `VITE_*` variable or client file.

Typed NPC dialogue uses `GEMINI_TEXT_MODEL=gemini-3.5-flash` on the server. Both text and voice endpoints require the private token issued to the connected game session.

Daily defaults are 20,000 text tokens, 30 voice minutes and 120 auto-farm minutes per player. In this vertical slice counters are process memory; production persistence belongs in the PUREFXAI ID/PostgreSQL milestone.

## Original IP

All names, creatures, visuals and mechanics in this project are original PUREFXAI concepts. Do not add third-party game art, characters, maps, names or audio without a compatible license.
