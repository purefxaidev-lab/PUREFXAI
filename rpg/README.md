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

## Original IP

All names, creatures, visuals and mechanics in this project are original PUREFXAI concepts. Do not add third-party game art, characters, maps, names or audio without a compatible license.
