const ALLOWED_ORIGINS = new Set([
  "https://purefxaidev-lab.github.io",
  "http://localhost:8000",
]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://purefxaidev-lab.github.io",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname !== "/session" || request.method !== "POST") return new Response("Not found", { status: 404, headers: cors });
    if (!ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403, headers: cors });
    if (!env.OPENAI_API_KEY) return new Response("Missing OPENAI_API_KEY", { status: 500, headers: cors });

    const sdp = await request.text();
    const session = JSON.stringify({
      type: "realtime",
      model: "gpt-realtime-2.1",
      instructions: "You are PURE AI, the warm, clever female voice assistant for PUREFXAI in Bangkok. Reply naturally and concisely in Thai unless the user uses another language. Explain PUREFXAI services: AI film, generative design, intelligent products, automation, AI strategy, and Gold Intelligence. Never claim to know live market data unless a tool supplies it.",
      audio: { output: { voice: "marin" } },
    });
    const form = new FormData(); form.set("sdp", sdp); form.set("session", session);
    const openai = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "OpenAI-Safety-Identifier": "purefxai-web-visitor" },
      body: form,
    });
    const headers = new Headers(cors); headers.set("Content-Type", "application/sdp");
    return new Response(await openai.text(), { status: openai.status, headers });
  },
};
