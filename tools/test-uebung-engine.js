#!/usr/bin/env node
// Checks public/uebung/engine.js against golden test cases of the app (tools/reference_engine.py in HOT_App).
// Usage: node tools/test-uebung-engine.js [golden.json | golden.json.gz.b64]
//   Without an argument: the self-test sample inside public/data/<package>.json.
//   Full run (≈395 000 cases): node tools/test-uebung-engine.js ../HOT_App/app/src/test/resources/golden.json.gz.b64
// Data: the package named in public/data/faa.json (same file the apps and the practice page load).
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const HotEngine = require(path.join(__dirname, "..", "public", "uebung", "engine.js"));
const pub = path.join(__dirname, "..", "public");
const manifest = JSON.parse(fs.readFileSync(path.join(pub, "data", "faa.json"), "utf8"));
const pkgFile = path.join(pub, "data", path.basename(new URL(manifest.package.url).pathname));
const raw = fs.readFileSync(pkgFile);
const sha = require("crypto").createHash("sha256").update(raw).digest("hex");
if (sha !== manifest.package.sha256) { console.error("SHA-256 mismatch:", pkgFile); process.exit(1); }
const data = JSON.parse(raw.toString("utf8"));
let cases;
const arg = process.argv[2];
if (!arg) cases = data.selftest;
else if (arg.endsWith(".b64")) cases = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(arg, "utf8"), "base64")).toString("utf8"));
else cases = JSON.parse(fs.readFileSync(arg, "utf8"));
const eng = new HotEngine(data);
const fails = eng.selfTest(cases, 20);
const kinds = {};
cases.forEach(c => kinds[c.kind] = (kinds[c.kind] || 0) + 1);
console.log(cases.length + " cases", JSON.stringify(kinds));
if (fails.length) { console.error(fails.length + "+ failures, first:"); fails.forEach(f => console.error(JSON.stringify(f))); process.exit(1); }
// Table 57 in statute miles: the same checks as MetarTest.kt in the app
const assert = require("assert");
const sm = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5];
const metres = [400, 800, 1200, 1600, 2000, 2400, 2800, 3200, 4000, 4800, 5600];
assert.strictEqual(data.snowfall.rows.length, sm.length);
sm.forEach((v, k) => [false, true].forEach(n => [-5, 0].forEach(o =>
  assert.strictEqual(eng.snowIntensitySm(v, n, o), eng.snowIntensity(metres[k], n, o), v + " SM"))));
assert.strictEqual(eng.snowIntensitySm(0.375, false, -5), "heavy");
assert.strictEqual(eng.snowIntensity(Math.trunc(0.375 * 1609.344), false, -5), "moderate");
assert.strictEqual(eng.snowIntensitySm(0.625, false, -5), eng.snowIntensitySm(0.5, false, -5));
assert.strictEqual(eng.snowIntensitySm(3.25, false, 0), eng.snowIntensitySm(3.0, false, 0));
assert.strictEqual(eng.snowIntensitySm(10, true, 0), "very_light");
assert.strictEqual(HotEngine.parseSm("1 1/4"), 1.25); assert.strictEqual(HotEngine.parseSm("2,5"), 2.5);
assert.strictEqual(HotEngine.parseSm("abc"), null);
console.log("all match (incl. Table 57 SM checks)");
