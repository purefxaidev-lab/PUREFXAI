# PUREFXAI

Production-ready one-page brand website for PUREFXAI — an independent AI studio in Bangkok.

## Features

- Responsive cinematic interface
- Canvas particle field and interactive AI core
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

## Enable PURE AI Live Voice

The animated assistant works immediately in demo mode. Live speech-to-speech uses the OpenAI Realtime API through a Cloudflare Worker so the API key is never exposed in the browser.

```bash
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put OPENAI_API_KEY
```

Copy the deployed Worker URL, append `/session`, and set it as `sessionEndpoint` in `config.js`. Never commit an API key to this repository.
