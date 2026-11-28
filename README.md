# HOT-Rechner

Webseite und Datenschutzerklärung der Android-App HOT-Rechner (Holdover-Time-Rechner):
https://hot-rechner.guido-marhenke.workers.dev/ (Datenschutz: /datenschutz/)

Privacy policy of the HOT Calculator Android app – see link above (DE / EN / FR / ES).

Hosting: Cloudflare Workers (wrangler.jsonc), Seite liegt in public/.

## Übungsseite `/uebung/`
HOT-Rechner zum Üben im Browser, mit allen Funktionen (auch Pro), deutlich als „nur zur Übung“ gekennzeichnet,
nicht verlinkt und `noindex`. Lädt dasselbe Datenpaket wie die Apps (`/data/faa.json` → Paket), prüft SHA-256 und
den Selbsttest im Paket und rechnet erst dann.
- `public/uebung/engine.js` – Rechenkern, 1:1 aus `HotEngine.kt` (HOT_App). Prüfen: `node tools/test-uebung-engine.js`
  (Stichprobe im Paket) bzw. mit `../HOT_App/app/src/test/resources/golden.json.gz.b64` (alle ≈395 000 Fälle).
- `public/uebung/texts.js` – Texte aus den `strings.xml` der App (4 Sprachen): `python3 tools/uebung_texts.py`.
