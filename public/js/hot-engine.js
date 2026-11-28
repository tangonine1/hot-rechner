/* HOT-Rechner – Tabellen-Nachschlagen im Browser.
 * 1:1-Übertragung von HotEngine.hot() aus der App (domain/HotEngine.kt, ios/HotCore/Engine.swift,
 * tools/reference_engine.py). Liest nur Zellen aus hot_data.json; es wird nichts geschätzt oder interpoliert.
 * Geprüft gegen die Golden-Testfälle der App (tools/test-hot-engine.js). */
(function (root) {
  'use strict';
  const NO_HOT = ['snow_heavy', 'freezing_rain_moderate_heavy'];
  const ABOVE_ZERO_ONLY = ['snow_rain_moderate', 'rain_cold_soaked'];
  const SNOW_INTENSITY = ['snow_very_light', 'snow_light', 'snow_moderate'];

  function bandContains(b, oat) {
    const minInc = b.min_inclusive !== false, maxInc = b.max_inclusive === true;
    if (b.min_c != null && (minInc ? oat < b.min_c : oat <= b.min_c)) return false;
    if (b.max_c != null && (maxInc ? oat > b.max_c : oat >= b.max_c)) return false;
    return true;
  }

  /** LOUT der Verdünnung für die Flugzeugkategorie. */
  function loutCheck(f, conc, oat, cat) {
    const byCat = (f.lout || {})[conc || '100/0'];
    if (!byCat) return { blocked: false, notTested: false, value: null };
    const v = byCat[cat];
    if (v == null) return { blocked: false, notTested: true, value: null };
    return { blocked: oat < v, notTested: false, value: v };
  }

  /**
   * status: OK | NO_HOT_CONDITION | NO_HOT_AT_OR_BELOW_ZERO | OAT_OUT_OF_RANGE | CONCENTRATION_NOT_ALLOWED |
   *         NOT_AVAILABLE | NO_HOT_BELOW_MINUS_10 | OAT_BELOW_LOUT
   * min/max in Minuten (min = stärkerer, max = schwächerer Niederschlag der Spalte).
   */
  function hot(f, conc, oat, cond, opts) {
    opts = opts || {};
    const cat = opts.category || 'high';
    const rowsAll = opts.adjusted ? (f.adj_rows || []) : f.rows;
    const notes = (opts.adjusted ? f.adj_notes : f.notes) || {};
    const res = (status, extra) => Object.assign({ status, fluid: f }, extra || {});
    if (NO_HOT.includes(cond)) return res('NO_HOT_CONDITION');
    if (ABOVE_ZERO_ONLY.includes(cond) && oat <= 0) return res('NO_HOT_AT_OR_BELOW_ZERO');
    const rows = rowsAll.filter(r => bandContains(r.oat, oat));
    if (!rows.length) return res('OAT_OUT_OF_RANGE');
    let row;
    if (f.type === 1) row = rows[0];
    else {
      row = rows.find(r => r.conc === conc);
      if (!row) return res('CONCENTRATION_NOT_ALLOWED');
    }
    let col = cond, genericSnow = false;
    if (SNOW_INTENSITY.includes(cond) && !f.columns.includes(col)) { col = 'snow'; genericSnow = true; }
    const v = row.values[col];
    if (v === undefined) return res('NO_HOT_CONDITION', { row });
    if (v === null || typeof v !== 'object') return res('NOT_AVAILABLE', { row });
    const noteText = v.note != null ? (notes[String(v.note)] || '') : '';
    if (noteText.includes('below -10') && oat < -10) return res('NO_HOT_BELOW_MINUS_10', { row });
    const l = loutCheck(f, conc, oat, cat);
    if (l.blocked) return res('OAT_BELOW_LOUT', { row, lout: l.value });
    return res('OK', { row, min: v.min, max: v.max, raw: v.raw, note: v.note, noteText,
      genericSnowColumn: genericSnow, loutNotTested: l.notTested, lout: l.value });
  }

  function fmt(m) { return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); }

  const api = { hot, fmt, bandContains, loutCheck };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HotEngine = api;
})(typeof self !== 'undefined' ? self : this);
