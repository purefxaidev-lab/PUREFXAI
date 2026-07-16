import { GoogleGenAI } from "@google/genai";
import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

const ALLOWED_ORIGINS = new Set([
  "https://purefxaidev-lab.github.io",
  "http://localhost:8000",
]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://purefxaidev-lab.github.io",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname !== "/token" || request.method !== "GET") return new Response("Not found", { status: 404, headers: cors });
    if (!ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403, headers: cors });
    if (!env.GEMINI_API_KEY) return new Response("Missing GEMINI_API_KEY", { status: 500, headers: cors });
    if (!env.FIREBASE_PROJECT_ID) return new Response("Missing FIREBASE_PROJECT_ID", { status: 500, headers: cors });

    const bearer = request.headers.get("Authorization") || "";
    const idToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    try {
      await jwtVerify(idToken, FIREBASE_JWKS, {
        issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
        audience: env.FIREBASE_PROJECT_ID,
        algorithms: ["RS256"],
      });
    } catch {
      return new Response("Unauthorized", { status: 401, headers: cors });
    }

    const translate = url.searchParams.get("mode") === "translate";
    const model = translate ? "gemini-3.5-live-translate-preview" : "gemini-3.1-flash-live-preview";
    const constrainedConfig = {
      sessionResumption: {},
      responseModalities: ["AUDIO"],
    };
    if (translate) constrainedConfig.translationConfig = { targetLanguageCode: "en" };

    try {
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
          liveConnectConstraints: { model, config: constrainedConfig },
          httpOptions: { apiVersion: "v1alpha" },
        },
      });
      return Response.json({ token: token.name, model, expiresIn: 1800 }, { headers: cors });
    } catch (error) {
      console.error("Gemini token error", error);
      return Response.json({ error: "Failed to create Gemini ephemeral token" }, { status: 502, headers: cors });
    }
  },
};
