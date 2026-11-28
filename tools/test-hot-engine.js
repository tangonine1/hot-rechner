// Prüft public/js/hot-engine.js gegen die Golden-Testfälle der App (Python-Referenz).
// Aufruf: node tools/test-hot-engine.js <hot_data.json> <golden.json>
//   golden.json z. B. aus HOT_App: base64 -d app/src/test/resources/golden.json.gz.b64 | gunzip > golden.json
// Ohne golden.json werden die Stichproben aus hot_data.json ("selftest") geprüft.
const fs = require('fs');
const E = require('../public/js/hot-engine.js');
const data = JSON.parse(fs.readFileSync(process.argv[2] || 'public/data/hot_data-2026-08-11-2026-08-11.json', 'utf8'));
const cases = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : data.selftest;
const fluids = Object.fromEntries(data.fluids.map(f => [f.id, f]));
let n = 0, bad = 0;
for (const c of cases) {
  if (c.kind !== 'hot') continue;
  n++;
  const r = E.hot(fluids[c.fluid], c.conc, c.oat, c.cond, { adjusted: c.adj, category: c.cat });
  const e = c.expect;
  const ok = r.status === e.status && (e.min === undefined || (r.min === e.min && r.max === e.max));
  if (!ok) { bad++; if (bad < 10) console.log('FEHLER', JSON.stringify(c), '->', r.status, r.min, r.max); }
}
console.log(`${n} HOT-Fälle geprüft, ${bad} Abweichungen`);
process.exit(bad || !n ? 1 : 0);
