import { readFileSync, writeFileSync } from "node:fs";

const additions = {
  en: {
    translateToCurrent: "Translate to current language",
    translating: "Translating…",
    translateHint: "Translate identity model from {from} to {to}",
  },
  es: {
    translateToCurrent: "Traducir al idioma actual",
    translating: "Traduciendo…",
    translateHint: "Traducir el modelo de identidad de {from} a {to}",
  },
  fr: {
    translateToCurrent: "Traduire dans la langue actuelle",
    translating: "Traduction…",
    translateHint: "Traduire le modèle d'identité de {from} à {to}",
  },
  de: {
    translateToCurrent: "In aktuelle Sprache übersetzen",
    translating: "Übersetze…",
    translateHint: "Identitätsmodell von {from} nach {to} übersetzen",
  },
  ar: {
    translateToCurrent: "الترجمة إلى اللغة الحالية",
    translating: "جارٍ الترجمة…",
    translateHint: "ترجمة نموذج الهوية من {from} إلى {to}",
  },
  sw: {
    translateToCurrent: "Tafsiri kwa lugha ya sasa",
    translating: "Inatafsiri…",
    translateHint: "Tafsiri modeli ya utambulisho kutoka {from} hadi {to}",
  },
};

for (const [loc, keys] of Object.entries(additions)) {
  const path = `messages/${loc}.json`;
  const data = JSON.parse(readFileSync(path, "utf8"));

  if (!data.identity || !data.identity.rebuild) {
    console.log(`${loc}: identity.rebuild NOT FOUND — skipping`);
    continue;
  }

  Object.assign(data.identity.rebuild, keys);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(`${loc}: added 3 keys`);
}
