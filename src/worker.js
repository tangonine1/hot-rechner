// HOT-Rechner – counts the devices of a company licence (Firmenversion), takes problem reports from the app
// (POST /api/report, see report.js) and answers FAQ questions (POST /api/ask, see ask.js). Static files: ./public.
//
// POST /api/fleet/activate {id, device}  -> 200 {used, seats} | 409 full | 404 unknown licence
// POST /api/fleet/release  {id, device}  -> 200
//
// id     = file id derived from the company code (the code itself is never sent)
// device = random number created by the app on first use (no name, account or location)
// Storage: KV "FLEET", key "dev:<id>" -> {"<device>": lastSeenMillis}. Devices not seen for 60 days free their seat.
// Seats per licence: public/fleet/seats.json (written by tools/fleet.py publish).

import { handleAsk } from "./ask.js";
import { handleReport, monthlyCheck } from "./report.js";

const STALE = 60 * 24 * 3600 * 1000;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function seatsFor(env, id) {
  const r = await env.ASSETS.fetch(new Request("https://assets.local/fleet/seats.json"));
  if (!r.ok) return 0;
  const m = await r.json();
  return Number(m[id] || 0);
}

export default {
  // Cron (wrangler.jsonc "triggers"): monthly test mail of the problem report system
  async scheduled(event, env, ctx) {
    ctx.waitUntil(monthlyCheck(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ask") return handleAsk(request, env);
    if (url.pathname === "/api/report") return handleReport(request, env);
    if (!url.pathname.startsWith("/api/fleet/")) return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({ error: "method" }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: "body" }, 400); }
    const id = String(body.id || ""), device = String(body.device || "");
    if (!/^[0-9a-f]{32}$/.test(id) || !/^[0-9a-f-]{8,64}$/i.test(device)) return json({ error: "input" }, 400);

    const seats = await seatsFor(env, id);
    if (!seats) return json({ error: "unknown" }, 404);

    const key = "dev:" + id, now = Date.now();
    const all = (await env.FLEET.get(key, "json")) || {};
    for (const [d, t] of Object.entries(all)) if (now - t > STALE) delete all[d];

    const action = url.pathname.slice("/api/fleet/".length);
    if (action === "release") {
      delete all[device];
    } else if (action === "activate") {
      if (!(device in all) && Object.keys(all).length >= seats) {
        return json({ error: "full", used: Object.keys(all).length, seats }, 409);
      }
      all[device] = now;
    } else {
      return json({ error: "action" }, 404);
    }
    await env.FLEET.put(key, JSON.stringify(all));
    return json({ used: Object.keys(all).length, seats });
  },
};
