#!/usr/bin/env python3
"""Builds public/uebung/texts.js for the practice page from the app's strings.xml (4 languages).

The practice page uses exactly the wording of the app (status texts, conditions, notes, LOUT, Appendix A …),
so pilots learn the same texts they see in the app. Page-only texts (practice banner, data check, comparison)
are defined below in PAGE, also in all four languages.

Usage (from the hot-rechner folder, HOT_App checked out next to it):
    python3 tools/uebung_texts.py [../HOT_App]
"""
import json, re, sys, xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "HOT_App"
RES = APP / "app" / "src" / "main" / "res"
LANGS = {"en": "values", "de": "values-de", "fr": "values-fr", "es": "values-es"}

# Keys taken over from the app
APP_KEYS = re.compile(
    r"^(cond_|st_|rot_|cat_(low|middle|high)(_short|_vr)?$|cat_hint$|int_|at_|mode_(precip|frost|pellets)$|fluid_(t1_alu|t1_comp|t2_generic|t4_generic|aeroclear)$|"
    r"ramp_|note_|source|lout_|flaps_|appendix_a_|composite_switch$|surface_effect$|concentration$|label_(fluid|precip|pellets)$|"
    r"vis_label$|vis_10km$|night$|day$|intensity$|heavy_no_hot$|snow_helper_|dshot_(switch_hint|title|none|row_warm|row|rounded|note|ack_title|ack_text|effect)$|"
    r"no_time$|all_conditions$|t1_|fp_|enter_valid_oat$|sum_|card_(aircraft|fluid)$|weather_title$|rotation_label$|no_hot_suffix$|"
    r"result_(frost_label|at_label)$|aircraft_category$|unit_changed$)"
)

PAGE = {
    "de": {
        "page_title": "HOT-Rechner – Übung",
        "kicker": "Übung · alle Funktionen frei",
        "h1": "HOT-Rechner zum Üben",
        "lede": "Die Rechnung der App im Browser – mit allen Pro-Funktionen: Markenfluids, Type III, Allowance Times, Appendix A, LOUT und DSHOT. Zum Kennenlernen der App und zum Training.",
        "practice_banner": "<strong>Nur zur Übung – nicht für den Flugbetrieb.</strong> Für eine echte Enteisung gelten die Original-Guidelines von FAA bzw. Transport Canada, die Verfahren Ihres Betreibers und die Entscheidung des verantwortlichen Piloten. Diese Seite hat keinen METAR-Abruf, keinen Timer und kein Protokoll – das kann nur die App.",
        "loading": "Tabellen werden geladen und geprüft …",
        "data_ok": "Tabellen geprüft: {1} · SHA-256 ✓ · Selbsttest {2} von {2} Fällen ✓",
        "data_fail": "Die Tabellen konnten nicht geladen oder geprüft werden. Der Rechner bleibt gesperrt. Bitte die Seite neu laden.",
        "temp_unit": "Einheit",
        "type": "Type",
        "vis_unit": "Einheit Sicht",
        "conc_na": "bei dieser OAT nicht vorgesehen",
        "dshot_show": "DSHOT (Transport Canada) anzeigen",
        "compare_conc": "Vergleich der Konzentrationen · {1}",
        "compare_fluids": "Alle Fluids Type {1} bei diesen Bedingungen",
        "compare_hint": "Gleiche Bedingungen, nur Fluid bzw. Mischung anders. Zeile antippen übernimmt die Auswahl.",
        "col_fluid": "Fluid",
        "col_hot": "HOT",
        "col_table": "Tabelle",
        "dash": "–",
        "pro_note": "In der Übung sind alle Funktionen frei. In der App sind Markenfluids, Type III und DSHOT Teil von Pro; generische Tabellen, LOUT-Warnungen, Appendix A und der Timer bleiben dort immer gratis.",
        "get_app": "App laden",
        "iphone": "iPhone (App Store)",
        "android": "Android-Beta",
        "source_line": "Daten: {1}, {2} ({3}). DSHOT: {4}.",
        "minutes": "Min.",
        "footer": "Keine Verbindung zur FAA oder zu Transport Canada. Werte werden ohne Interpolation aus den veröffentlichten Tabellen gelesen.",
        "back": "← HOT-Rechner",
    },
    "en": {
        "page_title": "HOT Calculator – Practice",
        "kicker": "Practice · all features unlocked",
        "h1": "HOT Calculator for practice",
        "lede": "The app's calculation in your browser – with every Pro feature: brand fluids, Type III, allowance times, Appendix A, LOUT and DSHOT. To get to know the app and for training.",
        "practice_banner": "<strong>For practice only – not for operational use.</strong> For a real de-icing the original FAA or Transport Canada guidelines, your operator's procedures and the pilot in command's decision apply. This page has no METAR download, no timer and no log – only the app does.",
        "loading": "Loading and checking tables …",
        "data_ok": "Tables checked: {1} · SHA-256 ✓ · self-test {2} of {2} cases ✓",
        "data_fail": "The tables could not be loaded or checked. The calculator stays locked. Please reload the page.",
        "temp_unit": "Unit",
        "type": "Type",
        "vis_unit": "Visibility unit",
        "conc_na": "not provided at this OAT",
        "dshot_show": "Show DSHOT (Transport Canada)",
        "compare_conc": "Concentrations compared · {1}",
        "compare_fluids": "All Type {1} fluids in these conditions",
        "compare_hint": "Same conditions, only fluid or mixture differ. Tap a row to select it.",
        "col_fluid": "Fluid",
        "col_hot": "HOT",
        "col_table": "Table",
        "dash": "–",
        "pro_note": "In practice mode everything is unlocked. In the app, brand fluids, Type III and DSHOT are part of Pro; generic tables, LOUT warnings, Appendix A and the timer always stay free there.",
        "get_app": "Get the app",
        "iphone": "iPhone (App Store)",
        "android": "Android beta",
        "source_line": "Data: {1}, {2} ({3}). DSHOT: {4}.",
        "minutes": "min",
        "footer": "Not affiliated with the FAA or Transport Canada. Values are read from the published tables without interpolation.",
        "back": "← HOT Calculator",
    },
    "fr": {
        "page_title": "Calculateur HOT – Entraînement",
        "kicker": "Entraînement · toutes les fonctions",
        "h1": "Calculateur HOT pour s'entraîner",
        "lede": "Le calcul de l'app dans le navigateur – avec toutes les fonctions Pro : fluides de marque, Type III, allowance times, Appendix A, LOUT et DSHOT. Pour découvrir l'app et s'entraîner.",
        "practice_banner": "<strong>Pour l'entraînement uniquement – pas pour l'exploitation.</strong> Pour un vrai dégivrage, les guidelines originales de la FAA ou de Transports Canada, les procédures de votre exploitant et la décision du commandant de bord s'appliquent. Cette page n'a ni METAR, ni minuterie, ni journal – seule l'app les propose.",
        "loading": "Chargement et vérification des tableaux …",
        "data_ok": "Tableaux vérifiés : {1} · SHA-256 ✓ · autotest {2} sur {2} cas ✓",
        "data_fail": "Les tableaux n'ont pas pu être chargés ou vérifiés. Le calculateur reste bloqué. Veuillez recharger la page.",
        "temp_unit": "Unité",
        "type": "Type",
        "vis_unit": "Unité de visibilité",
        "conc_na": "non prévue à cette OAT",
        "dshot_show": "Afficher le DSHOT (Transports Canada)",
        "compare_conc": "Comparaison des concentrations · {1}",
        "compare_fluids": "Tous les fluides Type {1} dans ces conditions",
        "compare_hint": "Mêmes conditions, seul le fluide ou le mélange change. Touchez une ligne pour la sélectionner.",
        "col_fluid": "Fluide",
        "col_hot": "HOT",
        "col_table": "Tableau",
        "dash": "–",
        "pro_note": "En mode entraînement, tout est débloqué. Dans l'app, les fluides de marque, le Type III et le DSHOT font partie de Pro ; les tableaux génériques, les alertes LOUT, l'Appendix A et la minuterie y restent toujours gratuits.",
        "get_app": "Télécharger l'app",
        "iphone": "iPhone (App Store)",
        "android": "Bêta Android",
        "source_line": "Données : {1}, {2} ({3}). DSHOT : {4}.",
        "minutes": "min",
        "footer": "Aucun lien avec la FAA ou Transports Canada. Les valeurs sont lues dans les tableaux publiés, sans interpolation.",
        "back": "← Calculateur HOT",
    },
    "es": {
        "page_title": "Calculadora HOT – Práctica",
        "kicker": "Práctica · todas las funciones",
        "h1": "Calculadora HOT para practicar",
        "lede": "El cálculo de la app en el navegador – con todas las funciones Pro: fluidos de marca, Type III, allowance times, Appendix A, LOUT y DSHOT. Para conocer la app y para entrenar.",
        "practice_banner": "<strong>Solo para practicar – no para uso operacional.</strong> Para un deshielo real se aplican las guías originales de la FAA o de Transport Canada, los procedimientos de su operador y la decisión del piloto al mando. Esta página no tiene METAR, temporizador ni registro – solo la app.",
        "loading": "Cargando y comprobando tablas …",
        "data_ok": "Tablas comprobadas: {1} · SHA-256 ✓ · autotest {2} de {2} casos ✓",
        "data_fail": "No se pudieron cargar o comprobar las tablas. La calculadora queda bloqueada. Recargue la página.",
        "temp_unit": "Unidad",
        "type": "Type",
        "vis_unit": "Unidad de visibilidad",
        "conc_na": "no prevista a esta OAT",
        "dshot_show": "Mostrar DSHOT (Transport Canada)",
        "compare_conc": "Comparación de concentraciones · {1}",
        "compare_fluids": "Todos los fluidos Type {1} en estas condiciones",
        "compare_hint": "Mismas condiciones, solo cambia el fluido o la mezcla. Toque una fila para seleccionarla.",
        "col_fluid": "Fluido",
        "col_hot": "HOT",
        "col_table": "Tabla",
        "dash": "–",
        "pro_note": "En modo práctica todo está desbloqueado. En la app, los fluidos de marca, el Type III y el DSHOT forman parte de Pro; las tablas genéricas, los avisos LOUT, el Appendix A y el temporizador siguen siendo siempre gratuitos.",
        "get_app": "Descargar la app",
        "iphone": "iPhone (App Store)",
        "android": "Beta de Android",
        "source_line": "Datos: {1}, {2} ({3}). DSHOT: {4}.",
        "minutes": "min",
        "footer": "Sin relación con la FAA ni con Transport Canada. Los valores se leen de las tablas publicadas, sin interpolación.",
        "back": "← Calculadora HOT",
    },
}


def android_text(e):
    s = "".join(e.itertext())
    s = s.replace("\\'", "'").replace('\\"', '"').replace("\\n", "\n").replace("\\@", "@").replace("\\?", "?")
    s = re.sub(r"%(\d+)\$[sd]", r"{\1}", s)
    s = s.replace("%%", "%")
    return s


def main():
    out = {}
    for lang, folder in LANGS.items():
        root = ET.parse(RES / folder / "strings.xml").getroot()
        t = {}
        for e in root:
            n = e.get("name") or ""
            if e.tag == "string" and APP_KEYS.match(n):
                t[n] = android_text(e)
        for k, v in PAGE[lang].items():
            assert k not in t, k
            t[k] = v
        out[lang] = t
    keys = set(out["en"])
    for lang, t in out.items():
        missing = keys - set(t)
        assert not missing, (lang, sorted(missing))
    js = ("// Generated by tools/uebung_texts.py from the app's strings.xml – do not edit by hand.\n"
          "self.UEBUNG_TEXTS = " + json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True) + ";\n")
    (ROOT / "public" / "uebung" / "texts.js").write_text(js, encoding="utf-8")
    print(len(keys), "texts x", len(out), "languages")


if __name__ == "__main__":
    main()
