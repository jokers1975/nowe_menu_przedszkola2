import * as React from "react";
import path from "path";
import { Document, Page, Text, View, StyleSheet, Font, Svg, Path, Circle, Image } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import type { Dish, MealType } from "@/lib/sanepid-brain";
import { EU_ALLERGENS } from "@/lib/allergens";

const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Noto Sans",
  fonts: [
    { src: path.join(FONTS_DIR, "NotoSans-Regular.ttf"), fontWeight: "normal" },
    { src: path.join(FONTS_DIR, "NotoSans-Bold.ttf"), fontWeight: "bold" },
    { src: path.join(FONTS_DIR, "NotoSans-Italic.ttf"), fontStyle: "italic" },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

const MEAL_LABEL: Record<MealType, string> = {
  sniadanie_kolacja: "Śniadanie / Kolacja",
  drugie_sniadanie_deser: "II Śniadanie / Deser",
  obiad_zupa: "Zupa",
  obiad_danie_glowne: "Danie główne",
};

const MEAL_ICON: Record<MealType, string> = {
  sniadanie_kolacja: "☀",
  drugie_sniadanie_deser: "✦",
  obiad_zupa: "◉",
  obiad_danie_glowne: "◆",
};

const MEAL_ORDER: MealType[] = [
  "sniadanie_kolacja",
  "drugie_sniadanie_deser",
  "obiad_zupa",
  "obiad_danie_glowne",
];

const PROCESSING_LABEL: Record<string, string> = {
  gotowanie: "gotowanie",
  duszenie: "duszenie",
  pieczenie: "pieczenie",
  smazenie: "smażenie",
  surowe: "surowe",
};

export type MenuSlot = {
  date: string;
  mealType: MealType;
  dish: Dish;
};

export type GroceryItem = {
  name: string;
  totalRawG: number;
  unit: string;
  allergens: number[];
};

export type Variant = "sanepid" | "parents";

const C = {
  ink: "#0f172a",
  text: "#1e293b",
  muted: "#64748b",
  subtle: "#94a3b8",
  line: "#e2e8f0",
  lineStrong: "#cbd5e1",
  surface: "#ffffff",
  surfaceAlt: "#f8fafc",
  stripe: "#f1f5f9",
  brand: "#047857",
  brandSoft: "#d1fae5",
  brandInk: "#064e3b",
  accent: "#b45309",
  accentSoft: "#fef3c7",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 32,
    fontSize: 9,
    fontFamily: "Noto Sans",
    color: C.text,
    backgroundColor: C.surface,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  headerLeft: { flexDirection: "column" },
  brand: {
    fontSize: 8,
    color: C.brand,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: "bold", color: C.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: 10, color: C.muted, marginTop: 2 },
  variantBadge: {
    fontSize: 7.5,
    color: C.brandInk,
    backgroundColor: C.brandSoft,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignSelf: "flex-end",
    fontWeight: "bold",
    letterSpacing: 0.3,
  },
  accentLine: {
    marginTop: 10,
    marginBottom: 14,
    height: 2,
    backgroundColor: C.brand,
    width: 40,
    borderRadius: 1,
  },

  table: {
    borderWidth: 0.75,
    borderColor: C.lineStrong,
    borderStyle: "solid",
    borderRadius: 4,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: C.surfaceAlt,
    borderBottomWidth: 0.75,
    borderBottomColor: C.lineStrong,
  },
  bodyRow: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderTopColor: C.line,
    borderStyle: "solid",
  },
  bodyRowAlt: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderTopColor: C.line,
    borderStyle: "solid",
    backgroundColor: C.stripe,
  },
  mealCell: {
    width: 86,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 0.75,
    borderRightColor: C.lineStrong,
    borderStyle: "solid",
  },
  mealIcon: { fontSize: 10, color: C.brand, marginBottom: 2 },
  mealLabel: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: C.ink,
    letterSpacing: 0.1,
  },
  dayCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 0.5,
    borderRightColor: C.line,
    borderStyle: "solid",
  },
  dayCellLast: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  dayHeaderWrap: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 0.5,
    borderRightColor: C.lineStrong,
    borderStyle: "solid",
  },
  dayHeaderWrapLast: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  dayHeaderDow: {
    fontSize: 8,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dayHeaderDate: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.ink,
    marginTop: 1,
  },

  dishName: { fontSize: 9, color: C.ink, fontWeight: "bold", lineHeight: 1.3 },
  ppLine: { fontSize: 7.5, color: C.text, marginTop: 3, lineHeight: 1.35 },
  ingLine: { fontSize: 7, color: C.muted, marginLeft: 8, lineHeight: 1.3 },
  empty: { color: C.subtle, fontStyle: "italic", fontSize: 8 },

  allergenPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    gap: 3,
  },
  allergenPill: {
    fontSize: 6.5,
    color: C.accent,
    backgroundColor: C.accentSoft,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    fontWeight: "bold",
  },

  sectionTitle: {
    marginTop: 18,
    marginBottom: 6,
    fontSize: 9,
    fontWeight: "bold",
    color: C.ink,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  legendGrid: { flexDirection: "row", flexWrap: "wrap" },
  legendItem: {
    width: "50%",
    flexDirection: "row",
    paddingVertical: 2,
    paddingRight: 6,
  },
  legendNumber: {
    width: 18,
    fontSize: 7.5,
    color: C.accent,
    fontWeight: "bold",
    textAlign: "right",
    marginRight: 6,
  },
  legendText: { flex: 1, fontSize: 7.5, color: C.text, lineHeight: 1.3 },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.subtle,
    borderTopWidth: 0.5,
    borderTopColor: C.line,
    paddingTop: 6,
  },
});

function dishAllergens(dish: Dish): number[] {
  if (dish.preparedProducts?.length) {
    const set = new Set<number>();
    for (const p of dish.preparedProducts) for (const i of p.rawIngredients) for (const a of i.allergens) set.add(a);
    return [...set].sort((a, b) => a - b);
  }
  return [...dish.allergens].sort((a, b) => a - b);
}

type DayColumn = {
  date: string;
  dow: string;
  dateLabel: string;
  meals: Partial<Record<MealType, Dish>>;
};

function buildColumns(items: MenuSlot[]): DayColumn[] {
  const map = new Map<string, DayColumn>();
  for (const it of items) {
    let col = map.get(it.date);
    if (!col) {
      const d = parseISO(it.date);
      col = {
        date: it.date,
        dow: format(d, "EEEE", { locale: pl }),
        dateLabel: format(d, "d MMM", { locale: pl }),
        meals: {},
      };
      map.set(it.date, col);
    }
    col.meals[it.mealType] = it.dish;
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function AllergenPills({ codes }: { codes: number[] }) {
  if (codes.length === 0) return null;
  return (
    <View style={styles.allergenPills}>
      {codes.map((c) => (
        <Text key={c} style={styles.allergenPill}>{c}</Text>
      ))}
    </View>
  );
}

function DishCellSanepid({ dish }: { dish: Dish }) {
  const pps = dish.preparedProducts ?? [];
  const codes = dishAllergens(dish);
  const flatIngredients = dish.ingredients ?? [];
  return (
    <View>
      <Text style={styles.dishName}>{dish.name}</Text>
      {pps.map((p) => (
        <View key={p.id}>
          <Text style={styles.ppLine}>
            • {p.name} — {p.weightServedG} g · {PROCESSING_LABEL[p.processingMethod] ?? p.processingMethod}
            {p.hasVegFruit ? " · warz./owoc" : ""}
          </Text>
          {p.rawIngredients.map((i) => (
            <Text key={i.id} style={styles.ingLine}>
              – {i.name} {i.rawWeightG}
              {i.unit}
              {i.allergens.length > 0 ? ` [${i.allergens.sort((a, b) => a - b).join(",")}]` : ""}
            </Text>
          ))}
        </View>
      ))}
      {pps.length === 0 && flatIngredients.length > 0 && (
        <View>
          {flatIngredients.map((i, idx) => (
            <Text key={idx} style={styles.ingLine}>
              – {i.name}
              {i.quantity !== null && i.quantity !== undefined ? ` ${i.quantity}${i.unit ?? "g"}` : ""}
            </Text>
          ))}
        </View>
      )}
      <AllergenPills codes={codes} />
    </View>
  );
}

function DishCellParents({ dish }: { dish: Dish }) {
  const codes = dishAllergens(dish);
  return (
    <View>
      <Text style={styles.dishName}>{dish.name}</Text>
      <AllergenPills codes={codes} />
    </View>
  );
}

export function MenuPdf({
  items,
  variant,
  from,
  to,
  logoUrl,
}: {
  items: MenuSlot[];
  variant: Variant;
  from: string;
  to: string;
  grocery?: GroceryItem[];
  logoUrl?: string | null;
}) {
  if (variant === "parents") {
    return <MenuPdfParents items={items} from={from} to={to} logoUrl={logoUrl ?? null} />;
  }
  return <MenuPdfSanepid items={items} from={from} to={to} />;
}

function MenuPdfSanepid({
  items,
  from,
  to,
}: {
  items: MenuSlot[];
  from: string;
  to: string;
}) {
  const columns = buildColumns(items);
  const subtitle = `${format(parseISO(from), "d MMMM", { locale: pl })} – ${format(parseISO(to), "d MMMM yyyy", { locale: pl })}`;

  return (
    <Document
      title={`Jadłospis ${from} – ${to}`}
      author="Najlepszy Catering"
      subject="Jadłospis – wersja Sanepid"
    >
      <Page
        size="A4"
        orientation={columns.length > 3 ? "landscape" : "portrait"}
        style={styles.page}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.brand}>NAJLEPSZY CATERING</Text>
            <Text style={styles.title}>Jadłospis tygodniowy</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Text style={styles.variantBadge}>WERSJA SANEPID</Text>
        </View>
        <View style={styles.accentLine} />

        <View style={styles.table}>
          <View style={styles.headerRow}>
            <View style={styles.mealCell}>
              <Text style={styles.dayHeaderDow}>Posiłek</Text>
            </View>
            {columns.map((c, i) => (
              <View
                key={c.date}
                style={i === columns.length - 1 ? styles.dayHeaderWrapLast : styles.dayHeaderWrap}
              >
                <Text style={styles.dayHeaderDow}>{c.dow}</Text>
                <Text style={styles.dayHeaderDate}>{c.dateLabel}</Text>
              </View>
            ))}
          </View>

          {MEAL_ORDER.map((mt, rowIdx) => (
            <View key={mt} style={rowIdx % 2 === 1 ? styles.bodyRowAlt : styles.bodyRow}>
              <View style={styles.mealCell}>
                <Text style={styles.mealIcon}>{MEAL_ICON[mt]}</Text>
                <Text style={styles.mealLabel}>{MEAL_LABEL[mt]}</Text>
              </View>
              {columns.map((c, i) => {
                const dish = c.meals[mt];
                const cellStyle = i === columns.length - 1 ? styles.dayCellLast : styles.dayCell;
                return (
                  <View key={c.date + mt} style={cellStyle}>
                    {dish ? <DishCellSanepid dish={dish} /> : <Text style={styles.empty}>—</Text>}
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Legenda alergenów (EU 1169/2011)</Text>
        <View style={styles.legendGrid}>
          {EU_ALLERGENS.map((a) => (
            <View key={a.number} style={styles.legendItem}>
              <Text style={styles.legendNumber}>{a.number}.</Text>
              <Text style={styles.legendText}>{a.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>Najlepszy Catering · zgodne z Sanepid i EU 1169/2011</Text>
          <Text>
            Wygenerowano {format(new Date(), "d MMM yyyy, HH:mm", { locale: pl })}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

// =========================================================================
// Parents variant — ładny szablon wzorowany na download/druk_jadlospis.png:
// różowy akcent, dni jako kolumny, lista zakupów i notatki w bocznym panelu.
// =========================================================================

const P = {
  ink: "#1e1b4b",
  text: "#334155",
  muted: "#64748b",
  subtle: "#94a3b8",
  rose: "#db2777",
  roseDeep: "#9d174d",
  roseSoft: "#fce7f3",
  roseVeryLight: "#fdf2f8",
  roseLine: "#f9a8d4",
  line: "#e5e7eb",
  panel: "#fffafc",
  accent: "#b45309",
  accentSoft: "#fef3c7",
};

// Mapa kolorów ikon alergenów (EU 1169/2011 numery 1–14) — każdy alergen
// ma własny kolor, ten sam w komórce dania i w legendzie pod spodem.
const ALLERGEN_COLOR: Record<number, string> = {
  1: "#b45309",  // gluten
  2: "#0891b2",  // skorupiaki
  3: "#eab308",  // jaja
  4: "#2563eb",  // ryby
  5: "#92400e",  // orzeszki ziemne
  6: "#65a30d",  // soja
  7: "#0ea5e9",  // mleko
  8: "#a16207",  // orzechy
  9: "#84cc16",  // seler
  10: "#dc2626", // gorczyca
  11: "#a855f7", // sezam
  12: "#64748b", // SO2 / siarczyny
  13: "#f59e0b", // łubin
  14: "#0d9488", // mięczaki
};

const parentsStyles = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingBottom: 28,
    paddingHorizontal: 24,
    fontSize: 9,
    fontFamily: "Noto Sans",
    color: P.text,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 40,
    height: 40,
    objectFit: "contain",
  },
  titleBlock: { flexDirection: "column" },
  titleKicker: {
    fontSize: 7.5,
    color: P.rose,
    fontWeight: "bold",
    letterSpacing: 2.2,
    marginBottom: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    fontStyle: "italic",
    color: P.rose,
    letterSpacing: -0.3,
  },
  weekLine: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  weekLabel: {
    fontSize: 8,
    color: P.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  weekValue: {
    fontSize: 11,
    color: P.ink,
    fontWeight: "bold",
    borderBottomWidth: 0.75,
    borderBottomColor: P.rose,
    paddingHorizontal: 4,
    paddingBottom: 1,
  },
  accentBar: {
    marginTop: 5,
    marginBottom: 6,
    height: 2,
    backgroundColor: P.rose,
    borderRadius: 2,
  },

  mealHeaderRow: {
    flexDirection: "row",
    marginBottom: 4,
    gap: 4,
  },
  mealHeaderFirst: { width: 56 },
  mealHeaderCell: {
    flex: 1,
    backgroundColor: P.roseSoft,
    borderRadius: 5,
    paddingVertical: 4,
    alignItems: "center",
  },
  mealHeaderText: {
    fontSize: 8.5,
    color: P.roseDeep,
    fontWeight: "bold",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },

  dayRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 4,
    minHeight: 58,
  },
  dayRowStripe: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 4,
    minHeight: 58,
    backgroundColor: P.roseVeryLight,
    borderRadius: 5,
    paddingVertical: 2,
    paddingRight: 2,
  },
  dayLabelCell: {
    width: 56,
    paddingTop: 6,
    paddingLeft: 4,
  },
  dayLabelDow: {
    fontSize: 9,
    fontWeight: "bold",
    fontStyle: "italic",
    color: P.rose,
    textTransform: "lowercase",
  },
  dayLabelDate: {
    fontSize: 15,
    fontWeight: "bold",
    color: P.ink,
    marginTop: 1,
    letterSpacing: -0.4,
  },
  mealCell: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: P.line,
    borderStyle: "solid",
    borderRadius: 5,
    padding: 5,
    backgroundColor: "#ffffff",
    justifyContent: "space-between",
  },
  mealDish: {
    fontSize: 9,
    color: P.ink,
    fontWeight: "bold",
    lineHeight: 1.25,
  },
  mealEmpty: {
    fontSize: 8,
    color: P.subtle,
    fontStyle: "italic",
  },
  mealAllergens: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    gap: 2,
  },
  // Ikonka alergenu — kolorowe kółko z numerem. Każdy alergen ma własny kolor
  // (ALLERGEN_COLOR) i ten sam kolor powtarza się w legendzie u dołu strony.
  allergenIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  allergenIconText: {
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: "bold",
    lineHeight: 1,
  },

  legendBand: {
    marginTop: 8,
    borderTopWidth: 0.75,
    borderTopColor: P.roseLine,
    paddingTop: 6,
  },
  legendTitle: {
    fontSize: 8,
    fontWeight: "bold",
    fontStyle: "italic",
    color: P.roseDeep,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 5,
  },
  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    width: "25%",
    paddingRight: 4,
    marginBottom: 3,
  },
  legendIconText: {
    marginLeft: 5,
    fontSize: 7.5,
    color: P.text,
    lineHeight: 1.2,
    flex: 1,
  },
  legendIconName: {
    fontWeight: "bold",
    color: P.ink,
  },

  footer: {
    position: "absolute",
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: P.subtle,
    borderTopWidth: 0.5,
    borderTopColor: P.line,
    paddingTop: 4,
  },
});

const PARENTS_MEAL_LABEL: Record<MealType, string> = {
  sniadanie_kolacja: "Śniadanie",
  drugie_sniadanie_deser: "II Śniadanie",
  obiad_zupa: "Zupa",
  obiad_danie_glowne: "Danie główne",
};

// Proste piktogramy SVG dla każdego z 14 alergenów EU 1169/2011.
// Rysowane na polu 24x24, białym konturem na kolorowym tle kółka.
function AllergenGlyph({ n, size }: { n: number; size: number }) {
  const stroke = "#ffffff";
  const sw = 1.6;
  const vb = "0 0 24 24";
  const common = { stroke, strokeWidth: sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (n) {
    case 1: // Gluten — kłos
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M12 4 L12 20" {...common} />
          <Path d="M12 7 Q9 8 8 11 Q11 10 12 8 Q13 10 16 11 Q15 8 12 7 Z" {...common} />
          <Path d="M12 11 Q9 12 8 15 Q11 14 12 12 Q13 14 16 15 Q15 12 12 11 Z" {...common} />
          <Path d="M12 15 Q9 16 8 19 Q11 18 12 16 Q13 18 16 19 Q15 16 12 15 Z" {...common} />
        </Svg>
      );
    case 2: // Skorupiaki — krab
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M7 13 Q12 8 17 13" {...common} />
          <Path d="M7 13 L5 11 M7 13 L5 14 M17 13 L19 11 M17 13 L19 14" {...common} />
          <Path d="M9 13 L8 17 M12 13 L12 18 M15 13 L16 17" {...common} />
          <Circle cx={10} cy={11} r={0.9} fill={stroke} />
          <Circle cx={14} cy={11} r={0.9} fill={stroke} />
        </Svg>
      );
    case 3: // Jaja — jajko z żółtkiem
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M12 4 Q7 6 7 14 Q7 20 12 20 Q17 20 17 14 Q17 6 12 4 Z" {...common} />
          <Circle cx={12} cy={14} r={2.5} {...common} />
        </Svg>
      );
    case 4: // Ryby
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M4 12 Q8 6 14 12 Q8 18 4 12 Z" {...common} />
          <Path d="M14 12 L20 7 L20 17 Z" {...common} />
          <Circle cx={7.5} cy={11.5} r={0.8} fill={stroke} />
        </Svg>
      );
    case 5: // Orzeszki ziemne — fistaszek
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M12 4 Q7 5 7 10 Q7 12 9 12.5 Q7 13 7 15 Q7 20 12 20 Q17 20 17 15 Q17 13 15 12.5 Q17 12 17 10 Q17 5 12 4 Z" {...common} />
          <Path d="M9 10 L9 8 M15 10 L15 8 M9 16 L9 14 M15 16 L15 14" {...common} />
        </Svg>
      );
    case 6: // Soja — strąk
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M5 16 Q8 4 19 8 Q16 20 5 16 Z" {...common} />
          <Circle cx={9} cy={12} r={1.4} {...common} />
          <Circle cx={13} cy={10} r={1.4} {...common} />
          <Circle cx={16} cy={13} r={1.4} {...common} />
        </Svg>
      );
    case 7: // Mleko — karton / kropla
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M8 5 L16 5 L16 8 L18 10 L18 20 L6 20 L6 10 L8 8 Z" {...common} />
          <Path d="M9 13 L15 13" {...common} />
        </Svg>
      );
    case 8: // Orzechy — włoski
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Circle cx={12} cy={12} r={8} {...common} />
          <Path d="M12 4 L12 20 M4 12 L20 12" {...common} />
          <Path d="M8 7 Q10 10 8 13 Q10 16 8 18" {...common} />
          <Path d="M16 7 Q14 10 16 13 Q14 16 16 18" {...common} />
        </Svg>
      );
    case 9: // Seler — łodyga z liściem
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M10 20 L10 10 M14 20 L14 10 M12 20 L12 8" {...common} />
          <Path d="M8 10 Q12 6 16 10 Z" {...common} />
          <Path d="M9 6 Q12 3 15 6" {...common} />
        </Svg>
      );
    case 10: // Gorczyca — słoik z kreseczkami
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M8 6 L16 6 L16 9 L17 10 L17 19 Q17 20 16 20 L8 20 Q7 20 7 19 L7 10 L8 9 Z" {...common} />
          <Circle cx={10} cy={14} r={0.6} fill={stroke} />
          <Circle cx={13} cy={13} r={0.6} fill={stroke} />
          <Circle cx={14} cy={16} r={0.6} fill={stroke} />
          <Circle cx={11} cy={17} r={0.6} fill={stroke} />
        </Svg>
      );
    case 11: // Sezam — ziarenka
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M7 8 Q9 6 11 8 Q9 10 7 8 Z" {...common} />
          <Path d="M13 8 Q15 6 17 8 Q15 10 13 8 Z" {...common} />
          <Path d="M7 14 Q9 12 11 14 Q9 16 7 14 Z" {...common} />
          <Path d="M13 14 Q15 12 17 14 Q15 16 13 14 Z" {...common} />
          <Path d="M10 18 Q12 16 14 18 Q12 20 10 18 Z" {...common} />
        </Svg>
      );
    case 12: // SO2 / siarczyny — „SO₂"
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Circle cx={12} cy={12} r={9} {...common} />
          <Path d="M8 10 Q8 8 10 8 Q12 8 12 10 Q12 12 10 12 Q8 12 8 14 Q8 16 10 16 Q12 16 12 14" {...common} />
          <Path d="M14 10 Q14 8 16 8 Q18 8 18 10 L18 14 Q18 16 16 16 Q14 16 14 14 Z" {...common} />
        </Svg>
      );
    case 13: // Łubin — kwiatek
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Path d="M12 20 L12 12" {...common} />
          <Circle cx={12} cy={6} r={1.5} {...common} />
          <Circle cx={10} cy={9} r={1.5} {...common} />
          <Circle cx={14} cy={9} r={1.5} {...common} />
          <Circle cx={11} cy={12} r={1.5} {...common} />
          <Path d="M9 17 L7 18 M15 17 L17 18" {...common} />
        </Svg>
      );
    case 14: // Mięczaki — muszla ślimaka
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Circle cx={13} cy={12} r={7} {...common} />
          <Circle cx={13} cy={12} r={4} {...common} />
          <Circle cx={13} cy={12} r={1.5} {...common} />
          <Path d="M6 14 L4 18 L8 18" {...common} />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox={vb}>
          <Circle cx={12} cy={12} r={9} {...common} />
        </Svg>
      );
  }
}

function AllergenIconBadge({ n, size = 16 }: { n: number; size?: number }) {
  const color = ALLERGEN_COLOR[n] ?? P.muted;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AllergenGlyph n={n} size={size - 4} />
    </View>
  );
}

function MenuPdfParents({
  items,
  from,
  to,
  logoUrl,
}: {
  items: MenuSlot[];
  from: string;
  to: string;
  logoUrl: string | null;
}) {
  const columns = buildColumns(items);
  const weekLabel = `${format(parseISO(from), "d MMM", { locale: pl })} – ${format(parseISO(to), "d MMM yyyy", { locale: pl })}`;
  const usedAllergens = new Set<number>();
  for (const s of items) for (const a of s.dish.allergens) usedAllergens.add(a);
  const legend = EU_ALLERGENS.filter((a) => usedAllergens.has(a.number));

  return (
    <Document
      title={`Jadłospis ${from} – ${to}`}
      author="Najlepszy Catering"
      subject="Jadłospis – wersja dla rodziców"
    >
      <Page size="A4" orientation="landscape" style={parentsStyles.page}>
        <View style={parentsStyles.header}>
          <View style={parentsStyles.headerLeft}>
            {logoUrl && (
              <Image src={logoUrl} style={parentsStyles.logo} />
            )}
            <View style={parentsStyles.titleBlock}>
              <Text style={parentsStyles.titleKicker}>NAJLEPSZY CATERING</Text>
              <Text style={parentsStyles.title}>Jadłospis</Text>
            </View>
          </View>
          <View style={parentsStyles.weekLine}>
            <Text style={parentsStyles.weekLabel}>Tydzień:</Text>
            <Text style={parentsStyles.weekValue}>{weekLabel}</Text>
          </View>
        </View>
        <View style={parentsStyles.accentBar} />

        <View style={parentsStyles.mealHeaderRow}>
          <View style={parentsStyles.mealHeaderFirst} />
          {MEAL_ORDER.map((mt) => (
            <View key={mt} style={parentsStyles.mealHeaderCell}>
              <Text style={parentsStyles.mealHeaderText}>
                {PARENTS_MEAL_LABEL[mt]}
              </Text>
            </View>
          ))}
        </View>

        {columns.map((c, rowIdx) => {
          const rowStyle = rowIdx % 2 === 1 ? parentsStyles.dayRowStripe : parentsStyles.dayRow;
          return (
            <View key={c.date} style={rowStyle} wrap={false}>
              <View style={parentsStyles.dayLabelCell}>
                <Text style={parentsStyles.dayLabelDow}>{c.dow}</Text>
                <Text style={parentsStyles.dayLabelDate}>{c.dateLabel}</Text>
              </View>
              {MEAL_ORDER.map((mt) => {
                const dish = c.meals[mt];
                return (
                  <View key={mt} style={parentsStyles.mealCell}>
                    {dish ? (
                      <>
                        <Text style={parentsStyles.mealDish}>{dish.name}</Text>
                        {dish.allergens.length > 0 && (
                          <View style={parentsStyles.mealAllergens}>
                            {[...dish.allergens].sort((a, b) => a - b).map((n) => (
                              <AllergenIconBadge key={n} n={n} />
                            ))}
                          </View>
                        )}
                      </>
                    ) : (
                      <Text style={parentsStyles.mealEmpty}>—</Text>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        {legend.length > 0 && (
          <View style={parentsStyles.legendBand} wrap={false}>
            <Text style={parentsStyles.legendTitle}>
              Legenda alergenów (wg EU 1169/2011)
            </Text>
            <View style={parentsStyles.legendGrid}>
              {legend.map((a) => (
                <View key={a.number} style={parentsStyles.legendItem}>
                  <AllergenIconBadge n={a.number} />
                  <Text style={parentsStyles.legendIconText}>
                    <Text style={parentsStyles.legendIconName}>{a.name}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={parentsStyles.footer} fixed>
          <Text>Najlepszy Catering · wersja dla rodziców</Text>
          <Text>
            Wygenerowano {format(new Date(), "d MMM yyyy, HH:mm", { locale: pl })}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

