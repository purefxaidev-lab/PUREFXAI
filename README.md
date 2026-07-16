# PUREFXAI

Production-ready one-page brand website for PUREFXAI — an independent AI studio in Bangkok.

## Features

- Responsive cinematic interface
- Canvas particle field and interactive AI core
- Four selectable animated anime assistants with saved preferences
- Scroll reveal, counters and magnetic interactions
- Accessible semantic structure and reduced-motion support
- Zero build step and zero JavaScript dependencies

## Run locally

Open `index.html` directly, or serve the directory:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy

Enable GitHub Pages in **Settings → Pages** and deploy from the `main` branch root.

## Enable PURE AI Gemini Live Voice

The animated assistant works immediately in demo mode. Live speech-to-speech uses short-lived Gemini ephemeral tokens minted by a Cloudflare Worker so the long-lived API key is never exposed in the browser. The UI offers two modes:

- `gemini-3.1-flash-live-preview` for general voice conversation
- `gemini-3.5-live-translate-preview` for Thai-to-English live translation

```bash
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put FIREBASE_PROJECT_ID
```

Copy the deployed Worker URL, append `/token`, and set it as `tokenEndpoint` in `config.js`. Never commit an API key to this repository.

## Authentication and database

Create a Firebase project, register a Web app, enable **Email/Password** and **Google** sign-in, then create a Firestore database. Copy the Firebase Web configuration into `config.js` and deploy `firebase/firestore.rules` in the Firebase console. The Worker verifies each Firebase ID token before issuing a Gemini ephemeral token.
