// HOT-Rechner – problem reports ("Fehler melden") from the apps.
//
// POST /api/report  (JSON, field names as in docs/fehler-melden-server.md of repo hot_app)
//   200 {ok:true}  stored (and mailed if mail is configured)
//   400 malformed · 413 too large · 429 too many copies to one address today
//   The apps keep a report and retry on every other answer, so a report may arrive twice: same meldung_id = same report.
//
// Storage: KV "FLEET" (no extra namespace needed), 180 days:
//   rep:<meldung_id>          -> the report without pictures, plus status "eingegangen" and the picture keys
//   repimg:<meldung_id>:<n>   -> one picture (base64 JPEG)
// No IP address, no device id is stored.
//
// Mail (optional, via Brevo, Paris – EU): secret BREVO_API_KEY, variable REPORT_FROM (sender verified at Brevo,
// e.g. meldungen@emb500.de) and REPORT_TO (manufacturer, currently info@emb500.de; change it here, not in the apps).
// "kopie_an" = address entered in the app by the flight operations; it gets the same mail (at most 20 a day).

const TTL = 180 * 24 * 3600;
const MAX_BYTES = 8 * 1024 * 1024;
const COPY_PER_DAY = 20;
const KINDS = { wert: "Unplausibler HOT/DSHOT-Wert", abw: "Abweichung zur Papierliste", timer: "Timer-Problem",
  anzeige: "Anzeige oder Bedienung", technik: "Absturz oder technisch", idee: "Verbesserungsvorschlag" };
const IMPACTS = { keine: "Keine", papier: "Papierliste verwendet", verz: "Verzögerung", unklar: "Weiß nicht" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^@\s<>,;"]+@[^@\s<>,;"]+\.[A-Za-z]{2,}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const str = (v, max) => (v == null ? null : String(v).slice(0, max));

async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function handleReport(request, env) {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BYTES) return json({ error: "size" }, 413);
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ error: "size" }, 413);
  let b;
  try { b = JSON.parse(text); } catch { return json({ error: "body" }, 400); }

  const id = String(b.meldung_id || "").toLowerCase();
  if (b.v !== 1 || !UUID.test(id) || !(b.art in KINDS) || !(b.auswirkung in IMPACTS)) return json({ error: "input" }, 400);
  const copy = b.kopie_an ? String(b.kopie_an).trim() : null;
  if (copy && (copy.length > 120 || !EMAIL.test(copy))) return json({ error: "kopie_an" }, 400);

  const pics = (Array.isArray(b.anhaenge) ? b.anhaenge : []).slice(0, 2)
    .filter((a) => a && (a.typ === "screenshot" || a.typ === "foto") && typeof a.data === "string")
    .map((a) => ({ typ: a.typ, data: a.data }));

  const already = await env.FLEET.get("rep:" + id);
  const rec = {
    meldung_id: id,
    betreiber_id: /^[0-9a-f]{32}$/.test(String(b.betreiber_id || "")) ? b.betreiber_id : null,
    plattform: str(b.plattform, 10), app_version: str(b.app_version, 40), app_sprache: str(b.app_sprache, 8),
    daten_hot: str(b.daten_hot, 200), daten_dshot: str(b.daten_dshot, 200), geraet: str(b.geraet, 80),
    datum: /^\d{4}-\d{2}-\d{2}$/.test(String(b.datum || "")) ? b.datum : null,
    berechnung: b.berechnung && typeof b.berechnung === "object" ? {
      zusammenfassung: str(b.berechnung.zusammenfassung, 400),
      hot_min: Number.isInteger(b.berechnung.hot_min) ? b.berechnung.hot_min : null,
      hot_max: Number.isInteger(b.berechnung.hot_max) ? b.berechnung.hot_max : null,
      dshot_min: Number.isInteger(b.berechnung.dshot_min) ? b.berechnung.dshot_min : null,
      dshot_max: Number.isInteger(b.berechnung.dshot_max) ? b.berechnung.dshot_max : null,
      hinweis: str(b.berechnung.hinweis, 200),
    } : null,
    art: b.art, wert_papier: str(b.wert_papier, 40), auswirkung: b.auswirkung,
    beschreibung: str(b.beschreibung, 4000), sicherheitsereignis: b.sicherheitsereignis === true,
    kopie_an: copy, anhaenge: pics.map((p, i) => ({ typ: p.typ, key: `repimg:${id}:${i}` })),
    status: "eingegangen", eingegangen: new Date().toISOString().slice(0, 10),
  };
  // Re-sent report (app did not get the answer last time): already stored and mailed
  if (already) return json({ ok: true, duplicate: true });

  if (copy) {
    const k = `repcnt:${rec.eingegangen}:${await sha(copy.toLowerCase())}`;
    const n = Number((await env.FLEET.get(k)) || 0);
    if (n >= COPY_PER_DAY) return json({ error: "limit" }, 429);
    await env.FLEET.put(k, String(n + 1), { expirationTtl: 2 * 24 * 3600 });
  }

  for (let i = 0; i < pics.length; i++) await env.FLEET.put(`repimg:${id}:${i}`, pics[i].data, { expirationTtl: TTL });
  await env.FLEET.put("rep:" + id, JSON.stringify(rec), { expirationTtl: TTL });

  // Mail failures do not fail the report: it is stored and can be read from KV. Only the error, no report data, is logged.
  try { await mail(env, rec, pics); } catch (e) { console.error("Meldung nicht gemailt:", String(e && e.message || e)); }
  return json({ ok: true });
}

function mailText(r) {
  const c = r.berechnung;
  return [
    `Neue Meldung aus der HOT-App, ${r.datum || r.eingegangen}, App-Sprache ${(r.app_sprache || "?").toUpperCase()}.`,
    "",
    `Art: ${KINDS[r.art]}`,
    `Auswirkung: ${IMPACTS[r.auswirkung]}`,
    `App ${r.plattform || ""} ${r.app_version || ""} · ${r.geraet || ""}`,
    `Daten ${r.daten_hot || "–"} / ${r.daten_dshot || "–"}`,
    c && c.zusammenfassung ? `Berechnung: ${c.zusammenfassung}` : null,
    r.wert_papier ? `Wert laut Papierliste: ${r.wert_papier} min` : null,
    r.anhaenge.length ? `Anhänge: ${r.anhaenge.map((a) => a.typ).join(", ")} (im Anhang dieser E-Mail)` : null,
    "",
    "Beschreibung der Crew (Originalsprache):",
    r.beschreibung || "–",
    r.sicherheitsereignis ? "\nDie Crew hat ein Sicherheitsereignis angegeben. Bitte prüfen, ob eine Meldung im Occurrence Reporting des Betreibers vorliegt (VO (EU) 376/2014)." : null,
    "",
    `Meldungsnummer ${r.meldung_id.slice(0, 8)} (${r.meldung_id})`,
  ].filter((l) => l !== null).join("\n");
}

async function mail(env, r, pics) {
  if (!env.BREVO_API_KEY || !env.REPORT_FROM || !env.REPORT_TO) return;
  const subject = `[HOT-App] ${KINDS[r.art]}${r.sicherheitsereignis ? " – Sicherheitsereignis" : ""} · ${r.meldung_id.slice(0, 8)}`;
  const to = String(env.REPORT_TO).split(",").map((e) => ({ email: e.trim() })).filter((e) => e.email);
  const send = (recipients) => brevo(env, {
    to: recipients, subject, textContent: mailText(r),
    attachment: pics.length ? pics.map((p, i) => ({ name: `${p.typ}-${i + 1}.jpg`, content: p.data })) : undefined,
  });
  await send(to);
  // Separate mail for the flight operations, so they do not see the manufacturer's address and vice versa
  if (r.kopie_an) await send([{ email: r.kopie_an }]);
}

/** One mail through Brevo; throws with the HTTP status if Brevo refuses it (e.g. expired key = 401). */
async function brevo(env, msg) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: env.REPORT_FROM, name: "HOT-Rechner Meldungen" }, ...msg }),
  });
  if (!res.ok) throw new Error(`Brevo HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Monthly check (cron, 1st of the month): sends "Meldesystem läuft" to REPORT_TO. Keeps the Brevo key in use
 * (it expires after 90 days without use) and shows that mail delivery works. Result in KV "mailcheck:last";
 * a failure is also written to the Worker log (Workers → hot-rechner → Logs / wrangler tail). No personal data.
 */
export async function monthlyCheck(env) {
  const day = new Date().toISOString().slice(0, 10);
  const stored = (await env.FLEET.list({ prefix: "rep:" })).keys.length;
  let result;
  try {
    if (!env.BREVO_API_KEY || !env.REPORT_FROM || !env.REPORT_TO) throw new Error("BREVO_API_KEY, REPORT_FROM oder REPORT_TO fehlt");
    await brevo(env, {
      to: String(env.REPORT_TO).split(",").map((e) => ({ email: e.trim() })).filter((e) => e.email),
      subject: `[HOT-App] Meldesystem läuft (${day})`,
      textContent: `Monatlicher Funktionstest des Meldesystems \"Fehler melden\".\n\n` +
        `Diese Mail zeigt, dass der Server Meldungen annimmt und Mails verschicken kann. ` +
        `Sie hält außerdem den Brevo-API-Schlüssel aktiv (er verfällt nach 90 Tagen ohne Nutzung).\n\n` +
        `Gespeicherte Meldungen (letzte 180 Tage): ${stored}\n\nKommt diese Mail am 1. eines Monats nicht, ` +
        `bitte den Schlüssel bei Brevo und das Secret BREVO_API_KEY bei Cloudflare prüfen.`,
    });
    result = { day, ok: true };
  } catch (e) {
    console.error("Meldesystem-Test fehlgeschlagen:", String(e && e.message || e));
    result = { day, ok: false, error: String(e && e.message || e).slice(0, 300) };
  }
  await env.FLEET.put("mailcheck:last", JSON.stringify(result));
  return result;
}
