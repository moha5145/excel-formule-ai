export type ExcelThemeId = "corporate" | "emerald" | "indigo" | "minimal";

export interface ExcelThemePalette {
  id: ExcelThemeId;
  name: string;
  headerBg: string;        // Fond des en-têtes de colonnes
  headerText: string;      // Texte des en-têtes
  headerBorder: string;    // Bordure sous l'en-tête
  titleBg: string;         // Fond bandeau titre (si bandeau utilisé) ou accent
  titleText: string;       // Couleur titre
  subtitleText: string;    // Couleur sous-titre
  accent: string;          // Couleur d'accentuation (séparateur, bordure active)
  inputBg: string;         // Fond doux des cellules d'entrée modifiables
  inputBorder: string;     // Bordure des cellules d'entrée
  inputTextColor: string;  // Texte des entrées
  calcBg: string;          // Fond des cellules calculées
  calcBorder: string;      // Bordure des cellules calculées
  calcTextColor: string;   // Texte des cellules calculées
  zebraBg: string;         // Ligne alternée
  totalBg: string;         // Fond ligne de totalisation
  totalText: string;       // Texte ligne de totalisation
  totalBorder: string;     // Double bordure comptable
  cardBg: string;          // Fond des cartes de paramètres
  cardBorder: string;      // Bordure des cartes de paramètres
}

export const EXCEL_THEMES: Record<ExcelThemeId, ExcelThemePalette> = {
  corporate: {
    id: "corporate",
    name: "Corporate Navy",
    headerBg: "FF0F172A",       // Slate 900
    headerText: "FFFFFFFF",     // Blanc
    headerBorder: "FF334155",   // Slate 700
    titleBg: "FF0F172A",
    titleText: "FF0F172A",      // Titre en noir ardoise
    subtitleText: "FF64748B",   // Slate 500
    accent: "FF2563EB",         // Bleu 600
    inputBg: "FFFEFCE8",        // Ivoire très léger et élégant (au lieu du jaune canari criard)
    inputBorder: "FFFDE047",    // Bordure dorée douce
    inputTextColor: "FF0F172A",
    calcBg: "FFFFFFFF",         // Blanc pur
    calcBorder: "FFE2E8F0",     // Slate 200
    calcTextColor: "FF0F172A",
    zebraBg: "FFF8FAFC",        // Gris très pâle
    totalBg: "FFF1F5F9",        // Slate 100
    totalText: "FF0F172A",
    totalBorder: "FF0F172A",
    cardBg: "FFF8FAFC",
    cardBorder: "FFE2E8F0",
  },
  emerald: {
    id: "emerald",
    name: "Émeraude Finance",
    headerBg: "FF064E3B",       // Emerald 900
    headerText: "FFFFFFFF",
    headerBorder: "FF047857",   // Emerald 700
    titleBg: "FF064E3B",
    titleText: "FF064E3B",
    subtitleText: "FF047857",
    accent: "FF059669",         // Emerald 600
    inputBg: "FFF0FDF4",        // Vert menthe très léger
    inputBorder: "FF86EFAC",    // Vert clair
    inputTextColor: "FF064E3B",
    calcBg: "FFFFFFFF",
    calcBorder: "FFE2E8F0",
    calcTextColor: "FF064E3B",
    zebraBg: "FFF0FDF4",
    totalBg: "FFD1FAE5",        // Emerald 100
    totalText: "FF064E3B",
    totalBorder: "FF064E3B",
    cardBg: "FFF0FDF4",
    cardBorder: "FFA7F3D0",
  },
  indigo: {
    id: "indigo",
    name: "Royal Indigo",
    headerBg: "FF1E1B4B",       // Indigo 950
    headerText: "FFFFFFFF",
    headerBorder: "FF3730A3",   // Indigo 700
    titleBg: "FF1E1B4B",
    titleText: "FF1E1B4B",
    subtitleText: "FF4F46E5",
    accent: "FF6366F1",         // Indigo 500
    inputBg: "FFEEF2FF",        // Indigo 50
    inputBorder: "FFA5B4FC",    // Indigo 300
    inputTextColor: "FF1E1B4B",
    calcBg: "FFFFFFFF",
    calcBorder: "FFE2E8F0",
    calcTextColor: "FF1E1B4B",
    zebraBg: "FFF5F7FF",
    totalBg: "FFE0E7FF",        // Indigo 100
    totalText: "FF1E1B4B",
    totalBorder: "FF1E1B4B",
    cardBg: "FFEEF2FF",
    cardBorder: "FFC7D2FE",
  },
  minimal: {
    id: "minimal",
    name: "Minimal Monochrome",
    headerBg: "FF18181B",       // Zinc 900
    headerText: "FFFFFFFF",
    headerBorder: "FF3F3F46",   // Zinc 700
    titleBg: "FF18181B",
    titleText: "FF18181B",
    subtitleText: "FF71717A",   // Zinc 500
    accent: "FF71717A",
    inputBg: "FFFAFAFA",        // Zinc 50
    inputBorder: "FFD4D4D8",    // Zinc 300
    inputTextColor: "FF18181B",
    calcBg: "FFFFFFFF",
    calcBorder: "FFE4E4E7",
    calcTextColor: "FF18181B",
    zebraBg: "FFF4F4F5",        // Zinc 100
    totalBg: "FFE4E4E7",        // Zinc 200
    totalText: "FF18181B",
    totalBorder: "FF18181B",
    cardBg: "FFFAFAFA",
    cardBorder: "FFE4E4E7",
  },
};

export function getExcelTheme(themeId?: string): ExcelThemePalette {
  if (themeId && themeId in EXCEL_THEMES) {
    return EXCEL_THEMES[themeId as ExcelThemeId];
  }
  return EXCEL_THEMES.corporate;
}
