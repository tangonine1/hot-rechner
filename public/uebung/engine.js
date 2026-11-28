/*
 * HOT lookup engine for the practice page (/uebung/).
 * 1:1 port of HotEngine.kt (Android) / tools/reference_engine.py (HOT_App repo). It only looks up published
 * table values: no interpolation, no estimates. Checked against all golden test cases of the app
 * (tools/test-uebung-engine.js) and, in the browser, against the self-test sample inside the data package.
 */
(function (root) {
  "use strict";

  function inBand(oat, b) {
    var lo = b.min_c, hi = b.max_c;
    if (lo != null) {
      if (b.min_inclusive !== false) { if (oat < lo) return false; } else if (oat <= lo) return false;
    }
    if (hi != null) {
      if (b.max_inclusive === true) { if (oat > hi) return false; } else if (oat >= hi) return false;
    }
    return true;
  }

  var NO_HOT = { snow_heavy: 1, freezing_rain_moderate_heavy: 1 };
  var ABOVE_ZERO_ONLY = { snow_rain_moderate: 1, rain_cold_soaked: 1 };
  var SNOW_INTENSITY = { snow_very_light: 1, snow_light: 1, snow_moderate: 1 };
  var CONDITIONS = ["freezing_fog", "snow_freezing_fog", "snow_very_light", "snow_light", "snow_moderate",
    "snow_heavy", "freezing_drizzle", "light_freezing_rain", "freezing_rain_moderate_heavy",
    "snow_rain_moderate", "rain_cold_soaked"];
  // [lower index, upper index] into a DSHOT row without the leading temperature: s3, s4, s10, s25, f10, f25
  var DSHOT_COLS = { snow_very_light: [1, 0], snow_light: [2, 1], snow_moderate: [3, 2], snow_freezing_fog: [5, 4] };

  function parseSm(s) {
    var t = String(s).trim().replace(/,/g, ".").replace(/\s+/g, " ");
    if (!t) return null;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return parseFloat(t);
    var m = /^(?:(\d+) )?(\d+)\/(\d+)$/.exec(t);
    if (!m) return null;
    var den = parseFloat(m[3]);
    if (den === 0) return null;
    return (m[1] ? parseFloat(m[1]) : 0) + parseFloat(m[2]) / den;
  }

  function HotEngine(data) {
    this.data = data;
    this.fluids = {};
    for (var i = 0; i < data.fluids.length; i++) this.fluids[data.fluids[i].id] = data.fluids[i];
    var rows = data.snowfall.rows;
    this._smUpper = rows.map(function (r) { return r.max_m == null ? null : smFromLabel(r.label_sm); });
    var last = smFromLabel(rows[rows.length - 1].label_sm);
    this._smLastLower = last == null ? Number.MAX_VALUE : last;
  }

  function smFromLabel(l) {
    var m = /\(([^)]*)\)/.exec(l);
    var inner = m ? m[1] : l;
    return parseSm(inner.replace(/[^0-9/. ]/g, "").trim());
  }

  HotEngine.prototype.fluid = function (id) {
    var f = this.fluids[id];
    if (!f) throw new Error("unknown fluid " + id);
    return f;
  };

  /** LOUT (Tables 59-61) for dilution and aircraft category. */
  HotEngine.prototype._lout = function (f, conc, oat, cat) {
    var byCat = (f.lout || {})[conc || "100/0"];
    if (byCat == null) return { blocked: false, notTested: false, value: null };
    var v = byCat[cat];
    if (v == null) return { blocked: false, notTested: true, value: null };
    return { blocked: oat < v, notTested: false, value: v };
  };

  HotEngine.prototype.loutOf = function (fluidId, conc, cat) {
    var byCat = (this.fluid(fluidId).lout || {})[conc || "100/0"];
    return byCat == null || byCat[cat] == null ? null : byCat[cat];
  };

  /**
   * Holdover time. Returns {status, min, max, genericSnowColumn, loutNotTested, lout}; min = moderate, max = light.
   * conc is ignored for Type I. adjusted = Appendix A (flaps/slats deployed before de/anti-icing).
   */
  HotEngine.prototype.hot = function (fluidId, conc, oat, cond, adjusted, cat) {
    cat = cat || "high";
    var f = this.fluid(fluidId);
    var frows = adjusted ? (f.adj_rows || []) : f.rows;
    var fnotes = (adjusted ? f.adj_notes : f.notes) || {};
    var base = { fluid: f, genericSnowColumn: false, loutNotTested: false, lout: null, min: null, max: null };
    function res(status, extra) { var o = Object.assign({}, base, { status: status }); return Object.assign(o, extra || {}); }
    if (NO_HOT[cond]) return res("NO_HOT_CONDITION");
    if (ABOVE_ZERO_ONLY[cond] && oat <= 0) return res("NO_HOT_AT_OR_BELOW_ZERO");
    var rows = frows.filter(function (r) { return inBand(oat, r.oat); });
    if (!rows.length) return res("OAT_OUT_OF_RANGE");
    var row;
    if (f.type === 1) row = rows[0];
    else {
      row = rows.filter(function (r) { return r.conc === conc; })[0];
      if (!row) return res("CONCENTRATION_NOT_ALLOWED");
    }
    var col = cond, generic = false;
    if (SNOW_INTENSITY[cond] && f.columns.indexOf(col) < 0) { col = "snow"; generic = true; }
    var v = row.values[col];
    if (v == null) return res("NO_HOT_CONDITION");
    if (v === "N/A") return res("NOT_AVAILABLE");
    if (v.note != null && String(fnotes[String(v.note)] || "").indexOf("below -10") >= 0 && oat < -10) {
      return res("NO_HOT_BELOW_MINUS_10");
    }
    var l = this._lout(f, conc, oat, cat);
    if (l.blocked) return res("OAT_BELOW_LOUT", { lout: l.value });
    return res("OK", { min: v.min, max: v.max, genericSnowColumn: generic, loutNotTested: l.notTested, lout: l.value });
  };

  /** Active frost (Table 1 / Adj-1). fluidType 1..4; composite only for Type I. */
  HotEngine.prototype.frost = function (fluidType, conc, oat, composite, adjusted) {
    var t = adjusted ? this.data.frost_adj : this.data.frost;
    if (fluidType === 1) {
      var m1 = composite ? t.type1.composite : t.type1.aluminum;
      return { status: "OK", min: m1, max: m1, table: t };
    }
    var row = t.rows.filter(function (r) { return inBand(oat, r.oat); })[0];
    if (!row || !row.values || !Object.keys(row.values).length) return { status: "OAT_OUT_OF_RANGE", min: null, max: null, table: t };
    var v = row.values[conc];
    if (v == null) return { status: "CONCENTRATION_NOT_ALLOWED", min: null, max: null, table: t };
    var m = v[fluidType - 2];
    return { status: "OK", min: m, max: m, table: t };
  };

  /**
   * Allowance times for ice pellets / small hail (Tables 53-56). rotation: "lt100" | "100to114" | "ge115".
   * Tables 54/55: no ATs below 100 kt. Table 56 (PG): no ATs below 100 kt, columns below -10 °C none below 115 kt.
   */
  HotEngine.prototype.allowance = function (fluidId, oat, condKey, rotation, adjusted, cat) {
    cat = cat || "high";
    var f = this.fluid(fluidId);
    function r(status, extra) { return Object.assign({ status: status, minutes: null, loutNotTested: false, lout: null }, extra || {}); }
    if ((f.type !== 3 && f.type !== 4) || f.generic) return r("AT_NOT_APPLICABLE");
    if (f.allowance_validated !== true) return r("AT_NOT_VALIDATED");
    var key = f.type === 3 ? "type3" : (f.glycol === "EG" ? "type4_eg" : "type4_pg");
    if (rotation === "lt100") return r("AT_NOT_APPLICABLE_LOW_SPEED");
    var bands = this.data.allowance_bands, band = null;
    for (var k in bands) { if (inBand(oat, bands[k])) { band = k; break; } }
    if (band == null) return r("OAT_OUT_OF_RANGE");
    if (key === "type4_pg" && rotation === "100to114" && (band === "-10_to_-16" || band === "-16_to_-22")) {
      return r("AT_NOT_APPLICABLE_LOW_SPEED");
    }
    var tab = (adjusted ? this.data.allowance_adj : this.data.allowance)[key];
    var v = ((tab.values || {})[condKey] || {})[band];
    if (v == null) return r("NO_ALLOWANCE_TIME", { table: tab });
    var l = this._lout(f, "100/0", oat, cat);
    if (l.blocked) return r("OAT_BELOW_LOUT", { lout: l.value, table: tab });
    return r("OK", { minutes: v, loutNotTested: l.notTested, lout: l.value, table: tab });
  };

  /**
   * Transport Canada degree-specific HOT: row = whole °C at or below the OAT (OAT >= 1 -> "1 °C and above").
   * Returns {min, max, rowC} or null (no DSHOT for this fluid/condition/concentration/OAT).
   */
  HotEngine.prototype.dshot = function (fluidId, conc, oat, cond, adjusted) {
    var table = (this.data.dshot || {})[fluidId];
    if (!table || conc !== "100/0" || !DSHOT_COLS[cond]) return null;
    var t = Math.min(1, Math.floor(oat));
    var rows = adjusted ? (table.adj_rows || []) : (table.rows || []);
    var row = null;
    for (var i = 0; i < rows.length; i++) if (rows[i][0] === t) { row = rows[i]; break; }
    if (!row) return null;
    var c = DSHOT_COLS[cond];
    var lo = row[1 + c[0]], hi = row[1 + c[1]];
    if (lo == null || hi == null) return null;
    return { min: lo, max: hi, rowC: t };
  };

  /** Table 57 with visibility in metres. Returns "very_light" | "light" | "moderate" | "heavy". */
  HotEngine.prototype.snowIntensity = function (visM, night, oat) {
    var ci = (night ? 2 : 0) + (oat <= -1 ? 0 : 1);
    var rows = this.data.snowfall.rows;
    for (var i = 0; i < rows.length; i++) if (rows[i].max_m == null || visM <= rows[i].max_m) return rows[i].v[ci];
    return rows[rows.length - 1].v[ci];
  };

  /**
   * Table 57 in its own statute-mile column (no rounding via metres). A value between two listed values takes
   * the row of the lower listed visibility = the stronger intensity.
   */
  HotEngine.prototype.snowIntensitySm = function (sm, night, oat) {
    var ci = (night ? 2 : 0) + (oat <= -1 ? 0 : 1);
    var rows = this.data.snowfall.rows, idx = 0;
    if (sm >= this._smLastLower - 1e-9) idx = rows.length - 1;
    else {
      for (var i = 0; i < this._smUpper.length; i++) {
        var u = this._smUpper[i];
        if (u != null && u <= sm + 1e-9) idx = i;
      }
    }
    return rows[idx].v[ci];
  };

  /** Runs golden cases ({kind, …, expect}); returns the failing cases (empty = all match). */
  HotEngine.prototype.selfTest = function (cases, max) {
    max = max || Infinity;
    var fails = [];
    for (var i = 0; i < cases.length && fails.length < max; i++) {
      var ok = false;
      try { ok = this._check(cases[i]); } catch (e) { ok = false; }
      if (!ok) fails.push(cases[i]);
    }
    return fails;
  };

  function eqOpt(a, b) { return (a == null ? null : a) === (b == null ? null : b); }

  HotEngine.prototype._check = function (o) {
    var e = o.expect, r;
    switch (o.kind) {
      case "hot":
        r = this.hot(o.fluid, o.conc, o.oat, o.cond, o.adj, o.cat);
        return r.status === e.status && eqOpt(r.min, e.min) && eqOpt(r.max, e.max) &&
          r.genericSnowColumn === !!e.generic_snow_column && r.loutNotTested === !!e.lout_not_tested;
      case "allowance":
        r = this.allowance(o.fluid, o.oat, o.cond, o.rotation, o.adj, o.cat);
        return r.status === e.status && eqOpt(r.minutes, e.minutes) && r.loutNotTested === !!e.lout_not_tested;
      case "frost":
        r = this.frost(o.type, o.conc, o.oat, o.composite, o.adj);
        return r.status === e.status && eqOpt(r.min, e.min);
      case "dshot":
        r = this.dshot(o.fluid, o.conc, o.oat, o.cond, o.adj);
        if (e == null) return r == null;
        return r != null && r.min === e.min && r.max === e.max;
      case "snow":
        return this.snowIntensity(o.vis, o.night, o.oat) === e;
      default:
        return false;
    }
  };

  HotEngine.CONDITIONS = CONDITIONS;
  HotEngine.NO_HOT = NO_HOT;
  HotEngine.DSHOT_CONDS = Object.keys(DSHOT_COLS);
  HotEngine.parseSm = parseSm;
  HotEngine.inBand = inBand;

  if (typeof module !== "undefined" && module.exports) module.exports = HotEngine;
  else root.HotEngine = HotEngine;
})(typeof self !== "undefined" ? self : this);
