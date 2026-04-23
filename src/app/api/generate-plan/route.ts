import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import { addDays, parseISO, format, subDays } from "date-fns";
import { and, between, eq } from "drizzle-orm";
import { db } from "@/db";
import { allergens, globalDishAllergens, globalDishes, menuItems, profiles } from "@/db/schema";
import { getSelectedModel, getOpenRouterApiKey } from "@/lib/app-settings";
import { UnauthorizedError, getCurrentUserId, unauthorizedResponse } from "@/lib/auth";
import { ALL_SLOTS, SLOT_LABELS, slotToMealType, type DietType, type MealType, type SlotType } from "@/lib/sanepid-brain";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MEAL_TYPES = [
  "sniadanie_kolacja",
  "drugie_sniadanie_deser",
  "obiad_zupa",
  "obiad_danie_glowne",
] as const;

const SLOT_TYPES = ALL_SLOTS;

const planSchema = z.object({
  items: z.array(
    z.object({
      date: z.string().regex(DATE_RE),
      slotType: z.enum(SLOT_TYPES as unknown as [SlotType, ...SlotType[]]),
      dishId: z.string().uuid(),
    }),
  ),
  warnings: z
    .array(z.string())
    .describe("Subiektywne ostrzeżenia dietetyczne o tym konkretnym planie (np. 'Dwa słodkie desery pod rząd', 'Brak ryby w obu ostatnich tygodniach'). Pusta tablica = bez uwag.")
    .default([]),
});

type ComplianceStatus = "ok" | "warn" | "error";

type ComplianceMetric = {
  key: string;
  label: string;
  status: ComplianceStatus;
  value: string;
  detail?: string;
};

// Proste heurystyki nazwowe — globalDishes nie ma processingMethod ani kategorii,
// więc rozpoznajemy techniki i grupy produktów po słowach kluczowych w nazwie.
const RE_SMAZENIE = /smażon|panierow|frytk|kotlet\s+schabow|schabow/i;
const RE_NABIAL_NATURAL = /jogurt|kefir|twaró|twarog|twaróż|maślan|ser\s+biał|ser\s+żół|mleko/i;
const RE_PELNE_ZIARNO = /kasz|pełnoziarn|pelnoziarn|razow|owsian|gryczan|jaglan|pęczak|peczak|brązowy\s+ry|brazowy\s+ry|orkisz/i;
const RE_WEDLINA_KUPNA = /paluszki\s+rybne|parów|parówk|kabanos|mortadel|pasztetow|wędlin/i;
const RE_SLODKI = /budyń|budyn|deser|ciast|kisiel|drożdżów|drozdzow|biszkopt|pączk|paczk|kakaow|słodk|slodk/i;

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const { from, to } = (await req.json()) as { from?: string; to?: string };
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      return Response.json({ error: "from/to wymagane (YYYY-MM-DD)." }, { status: 400 });
    }

    const apiKey = await getOpenRouterApiKey();
    if (!apiKey) {
      return Response.json(
        { error: "Brak klucza OpenRouter. Wpisz go w Ustawieniach." },
        { status: 500 },
      );
    }

    // Wyczytaj sloty wydawane przez tę placówkę; domyślnie pełen zestaw.
    const profileRow = await db
      .select({ servedSlots: profiles.servedSlots })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    const servedSlotsRaw = (profileRow[0]?.servedSlots as SlotType[] | null) ?? ALL_SLOTS;
    const servedSlots = ALL_SLOTS.filter((s) => servedSlotsRaw.includes(s));
    if (servedSlots.length === 0) {
      return Response.json({ error: "Profil nie ma wybranych posiłków do wydawania." }, { status: 400 });
    }

    // ------------------------------------------------------------------
    // Katalog dań
    // ------------------------------------------------------------------
    const rows = await db
      .select({
        id: globalDishes.id,
        name: globalDishes.displayName,
        type: globalDishes.mealType,
        diet: globalDishes.dietType,
        vegFruit: globalDishes.hasVegFruit,
        allergenNumber: allergens.number,
      })
      .from(globalDishes)
      .leftJoin(globalDishAllergens, eq(globalDishAllergens.globalDishId, globalDishes.id))
      .leftJoin(allergens, eq(allergens.id, globalDishAllergens.allergenId));

    type LibraryDish = {
      id: string;
      name: string;
      type: MealType;
      diet: DietType;
      vegFruit: boolean;
      allergens: number[];
    };

    const dishMap = new Map<string, LibraryDish>();
    for (const r of rows) {
      let d = dishMap.get(r.id);
      if (!d) {
        d = {
          id: r.id,
          name: r.name,
          type: r.type as MealType,
          diet: (r.diet as DietType) ?? null,
          vegFruit: r.vegFruit ?? false,
          allergens: [],
        };
        dishMap.set(r.id, d);
      }
      if (r.allergenNumber !== null && !d.allergens.includes(r.allergenNumber)) {
        d.allergens.push(r.allergenNumber);
      }
    }

    const library = [...dishMap.values()];
    if (library.length === 0) {
      return Response.json({ error: "Baza dań pusta — zaimportuj słownik." }, { status: 400 });
    }

    const byType: Record<MealType, { id: string; name: string; diet: DietType }[]> = {
      sniadanie_kolacja: [],
      drugie_sniadanie_deser: [],
      obiad_zupa: [],
      obiad_danie_glowne: [],
    };
    for (const d of library) {
      byType[d.type].push({ id: d.id, name: d.name, diet: d.diet });
    }

    // ------------------------------------------------------------------
    // Zakres dni planu
    // ------------------------------------------------------------------
    const fromDate = parseISO(from);
    const toDate = parseISO(to);
    const dates: string[] = [];
    for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
      dates.push(format(d, "yyyy-MM-dd"));
    }

    // ------------------------------------------------------------------
    // Dekadówka: ostatnie 10 dni roboczych z menu_items użytkownika
    // (patrzymy w okno 14 dni wstecz od `from`, bo to ma pokryć 10 dni roboczych)
    // ------------------------------------------------------------------
    const historyFrom = format(subDays(fromDate, 14), "yyyy-MM-dd");
    const historyTo = format(subDays(fromDate, 1), "yyyy-MM-dd");

    const historyRows = await db
      .select({
        date: menuItems.date,
        mealType: menuItems.mealType,
        displayName: menuItems.displayName,
      })
      .from(menuItems)
      .where(
        and(
          eq(menuItems.userId, userId),
          between(menuItems.date, historyFrom, historyTo),
        ),
      );

    type HistoryRow = { date: string; mealType: MealType; name: string };
    const history: HistoryRow[] = historyRows
      .map((r) => ({
        date: typeof r.date === "string" ? r.date.slice(0, 10) : String(r.date).slice(0, 10),
        mealType: r.mealType as MealType,
        name: r.displayName,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Zwijamy historię per dzień (do promptu)
    const historyByDate = new Map<string, Partial<Record<MealType, string>>>();
    for (const h of history) {
      const bag = historyByDate.get(h.date) ?? {};
      bag[h.mealType] = h.name;
      historyByDate.set(h.date, bag);
    }
    const historyDates = [...historyByDate.keys()].sort().slice(-10); // max 10 dni roboczych
    const historyText = historyDates.length
      ? historyDates
          .map((d) => {
            const bag = historyByDate.get(d)!;
            const parts = MEAL_TYPES.map((mt) => `${mt.replace("_", " ")}: ${bag[mt] ?? "—"}`).join(" | ");
            return `${d}: ${parts}`;
          })
          .join("\n")
      : "";

    // ------------------------------------------------------------------
    // Prompt
    // ------------------------------------------------------------------
    // Katalog per slot — dwa sloty mogą dzielić tę samą pulę (np. sniadanie/kolacja).
    const usedMealTypes = new Set<MealType>(servedSlots.map(slotToMealType));
    const catalogText = servedSlots
      .map((slot) => {
        const mt = slotToMealType(slot);
        const list = byType[mt];
        const header = `${slot} (pula: ${mt}, etykieta: ${SLOT_LABELS[slot]})`;
        if (list.length === 0) return `${header}: (brak pozycji w katalogu)`;
        return `${header}:\n${list.map((d) => `- ${d.id} | ${d.name} (${d.diet ?? "—"})`).join("\n")}`;
      })
      .join("\n\n");
    const slotsList = servedSlots.join(", ");
    const poolsNote = [...usedMealTypes].join(", ");

    const modelId = await getSelectedModel();
    const openrouter = createOpenRouter({ apiKey });

    const systemPrompt = `Jesteś Ekspertem Dietetyki Dziecięcej i Systemem Kontroli Jakości dla polskiej stołówki przedszkolnej/szkolnej.

NORMY PRAWNE I MERYTORYCZNE:
- Rozporządzenie Ministra Zdrowia z 26.07.2016 o żywieniu dzieci i młodzieży
- Sanepid (HACCP) + Rozporządzenie (UE) 1169/2011 (alergeny)
- Rekomendacje IŻŻ / Narodowe Centrum Edukacji Żywieniowej / GIS

ZASADY ŻYWIENIOWE (TWARDE):
- Warzywa lub owoce w KAŻDYM posiłku; przewaga warzyw nad owocami w ciągu dnia.
- Produkty pełnoziarniste min. 1× dziennie (kasza, pełnoziarnisty chleb, owsianka, brązowy ryż, gryka, jaglanka).
- Nabiał naturalny min. 2 porcje dziennie (jogurt naturalny, kefir, twaróg, mleko) — NIE słodzone jogurty owocowe.
- Ryba morska dokładnie 1× w tygodniu w obiad_danie_glowne (nie paluszki rybne!).
- Mięso pieczone/gotowane/duszone, NIE kupne wędliny (parówki, kabanosy, pasztetowa, paluszki rybne).
- Smażenie maks. 2× w tygodniu w całym planie.
- Zero cukru w napojach. Woda jako podstawa nawodnienia.
- Brak sztucznych mieszanek przypraw (vegety typu, kostki rosołowe).
- Strączki lub wegetariańskie danie główne min. 1× w tygodniu.
- Zróżnicowanie w ciągu tygodnia: nie powtarzaj tej samej bazy białkowej dwa dni z rzędu, rotuj kasze.

CIĄGŁOŚĆ Z DEKADÓWKĄ:
- Otrzymasz menu z poprzednich 10 dni roboczych tego samego użytkownika (jeśli istnieje).
- Żadne danie z ostatnich 10 dni nie może się powtórzyć w nowym planie.
- Rotuj kasze (np. jeśli w poprzedniej dekadzie była jaglana i gryczana, teraz sięgnij po pęczak lub owsianą).
- Jeśli w poprzedniej dekadzie nie było ryby morskiej — ryba w tym tygodniu to priorytet.

WYBÓR DAŃ:
- Wybieraj WYŁĄCZNIE z podanego katalogu (UUID-y).
- Dla każdej pary (data, slot) zwróć dokładnie JEDNO danie z puli przypisanej do tego slotu.
- Sniadanie i kolacja dzielą pulę "sniadanie_kolacja" — NIE używaj tego samego dania w sniadanie i kolacja tego samego dnia i dbaj o kontrast (lżejsze wieczorem).
- II Śniadanie i podwieczorek dzielą pulę "drugie_sniadanie_deser" — też nie dubluj w obrębie jednego dnia.

RAPORTOWANIE:
- W polu "warnings" wpisz listę krótkich, subiektywnych ostrzeżeń dietetycznych o tym konkretnym planie (PO POLSKU, UPPERCASE dla ciężkich naruszeń).
  Przykłady: "DWA SŁODKIE DESERY POD RZĄD (WT-ŚR)", "BRAK RYBY W TYM I POPRZEDNIM TYGODNIU", "POWTÓRKA: ZUPA POMIDOROWA 3× W 2 TYGODNIE".
- Jeśli wszystko OK — zwróć pustą tablicę.`;

    const userPrompt = `Dni do zaplanowania: ${dates.join(", ")}
Sloty wydawane przez placówkę (zwróć po jednym daniu dla KAŻDEGO slotu KAŻDEGO dnia): ${slotsList}
Używane pule dań: ${poolsNote}

${historyText
  ? `HISTORIA — menu z poprzednich 10 dni roboczych (BIERZ POD UWAGĘ, UNIKAJ POWTÓREK):\n${historyText}\n\n`
  : `HISTORIA: brak danych z poprzednich dni (pierwsza generacja dla tego użytkownika) — zastosuj reguły żywieniowe bez kontekstu historycznego.\n\n`}Katalog dań (slot: pula → UUID | nazwa (dieta)):
${catalogText}

Dla każdej pary (data, slot) wybierz JEDNO danie z katalogu puli tego slotu i zwróć jego UUID.
Następnie wypełnij pole "warnings" krótkimi uwagami dietetycznymi, jeśli widzisz coś niepokojącego.`;

    const { object } = await generateObject({
      model: openrouter(modelId),
      schema: planSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    // ------------------------------------------------------------------
    // Mapowanie odpowiedzi AI → output
    // ------------------------------------------------------------------
    const servedSet = new Set<SlotType>(servedSlots);
    const output = object.items
      .map((it) => {
        if (!servedSet.has(it.slotType)) return null;
        const d = dishMap.get(it.dishId);
        if (!d) return null;
        const expectedPool = slotToMealType(it.slotType);
        if (d.type !== expectedPool) return null;
        return {
          date: it.date,
          slotType: it.slotType,
          mealType: expectedPool,
          dish: {
            id: d.id,
            name: d.name,
            type: d.type,
            diet: d.diet,
            vegFruit: d.vegFruit,
            allergens: [...d.allergens].sort((a, b) => a - b),
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // ------------------------------------------------------------------
    // Server-side compliance — twarde metryki z katalogu + heurystyki nazwowe
    // ------------------------------------------------------------------
    const days = new Set(output.map((o) => o.date));
    const dayCount = days.size || 1;

    let vegFruitSlots = 0;
    let daysWithoutVegFruit = 0;
    let fishMainCount = 0;
    let meatMainCount = 0;
    let legumesVegMainCount = 0;
    let smazenieCount = 0;
    let dairyNaturalCount = 0;
    let wholeGrainDays = 0;
    let bannedProcessed: string[] = [];
    const dessertByDate = new Map<string, boolean>();

    for (const date of days) {
      const daySlots = output.filter((o) => o.date === date);
      let hasVegFruitToday = false;
      let hasWholeGrainToday = false;
      let hasDessertToday = false;
      for (const s of daySlots) {
        if (s.dish.vegFruit) {
          vegFruitSlots++;
          hasVegFruitToday = true;
        }
        const n = s.dish.name;
        if (s.mealType === "obiad_danie_glowne") {
          if (s.dish.diet === "fish") fishMainCount++;
          else if (s.dish.diet === "meat") meatMainCount++;
          else if (s.dish.diet === "legumes" || s.dish.diet === "vegetarian") legumesVegMainCount++;
        }
        if (RE_SMAZENIE.test(n)) smazenieCount++;
        if (RE_NABIAL_NATURAL.test(n)) dairyNaturalCount++;
        if (RE_PELNE_ZIARNO.test(n)) hasWholeGrainToday = true;
        if (RE_WEDLINA_KUPNA.test(n)) bannedProcessed.push(n);
        if (RE_SLODKI.test(n)) hasDessertToday = true;
      }
      if (!hasVegFruitToday) daysWithoutVegFruit++;
      if (hasWholeGrainToday) wholeGrainDays++;
      dessertByDate.set(date, hasDessertToday);
    }
    bannedProcessed = [...new Set(bannedProcessed)];

    const metrics: ComplianceMetric[] = [
      {
        key: "vegFruit",
        label: "Warzywa / owoce",
        status: daysWithoutVegFruit === 0 && vegFruitSlots >= dayCount * 2 ? "ok" : daysWithoutVegFruit === 0 ? "warn" : "error",
        value: `${vegFruitSlots} porcji w ${dayCount} dni`,
        detail: daysWithoutVegFruit > 0
          ? `${daysWithoutVegFruit} dni bez warzyw/owoców`
          : vegFruitSlots < dayCount * 2
            ? "Zalecane min. 2 posiłki z warzywami/owocami dziennie"
            : "W każdym dniu min. 2 posiłki z warzywami/owocami",
      },
      {
        key: "wholeGrain",
        label: "Pełne ziarno",
        status: wholeGrainDays === dayCount ? "ok" : wholeGrainDays >= Math.ceil(dayCount / 2) ? "warn" : "error",
        value: `${wholeGrainDays}/${dayCount} dni`,
        detail: wholeGrainDays === dayCount
          ? "Obecne każdego dnia"
          : `Brakuje w ${dayCount - wholeGrainDays} dni`,
      },
      {
        key: "dairy",
        label: "Nabiał naturalny",
        status: dairyNaturalCount >= dayCount * 2 ? "ok" : dairyNaturalCount >= dayCount ? "warn" : "error",
        value: `${dairyNaturalCount} porcji w ${dayCount} dni`,
        detail: dairyNaturalCount >= dayCount * 2
          ? "Norma: ≥2 porcje/dzień spełniona"
          : "Za mało nabiału naturalnego (jogurt, kefir, twaróg, mleko)",
      },
      {
        key: "fishWeekly",
        label: "Ryba morska (1× tydz.)",
        status: fishMainCount === 1 ? "ok" : fishMainCount === 0 ? "error" : "warn",
        value: fishMainCount === 0 ? "Brak" : `${fishMainCount}× w planie`,
        detail: fishMainCount === 0
          ? "MZ 2016: ryba morska min. 1× w tygodniu"
          : fishMainCount > 1
            ? "Więcej niż raz — OK, ale zwróć uwagę na rotację białka"
            : "Dokładnie 1× — zgodne z normą",
      },
      {
        key: "smazenie",
        label: "Technika: smażenie",
        status: smazenieCount <= 2 ? "ok" : "warn",
        value: `${smazenieCount}× w planie`,
        detail: smazenieCount <= 2 ? "W granicach (≤2×/tydz.)" : "PRZEKROCZONY LIMIT — preferuj gotowanie/duszenie/pieczenie",
      },
      {
        key: "meatBalance",
        label: "Bilans mięso / ryba / strączki",
        status: meatMainCount <= 3 && legumesVegMainCount >= 1 && fishMainCount >= 1 ? "ok" : "warn",
        value: `mięso ${meatMainCount} · ryba ${fishMainCount} · strączki/veg ${legumesVegMainCount}`,
        detail: meatMainCount > 3
          ? "Za dużo mięsa (>3×/tydz.)"
          : legumesVegMainCount < 1
            ? "Brak dania strączkowego/wegetariańskiego"
            : "Bilans OK",
      },
    ];

    if (bannedProcessed.length > 0) {
      metrics.push({
        key: "processedMeat",
        label: "Zakazane przetwory (MZ 2016)",
        status: "error",
        value: `${bannedProcessed.length} pozycji`,
        detail: `Wykryto: ${bannedProcessed.join(", ")}`,
      });
    }

    const serverWarnings: string[] = [];
    // Dwa słodkie desery pod rząd
    const sortedDates = [...days].sort();
    for (let i = 1; i < sortedDates.length; i++) {
      if (dessertByDate.get(sortedDates[i]) && dessertByDate.get(sortedDates[i - 1])) {
        serverWarnings.push(`DWA SŁODKIE POSIŁKI POD RZĄD (${sortedDates[i - 1]}–${sortedDates[i]})`);
      }
    }
    // Powtórka vs historia
    const historyDishIds = new Set(
      history
        .map((h) => library.find((d) => d.name === h.name)?.id)
        .filter((x): x is string => !!x),
    );
    for (const o of output) {
      if (typeof o.dish.id === "string" && historyDishIds.has(o.dish.id)) {
        serverWarnings.push(`POWTÓRKA Z DEKADÓWKI: "${o.dish.name}" (${o.date})`);
      }
    }

    const compliance = {
      metrics,
      aiWarnings: object.warnings ?? [],
      serverWarnings,
      historyCount: history.length,
      historyDays: historyDates.length,
    };

    return Response.json({ items: output, compliance, model: modelId });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-plan error:", err);
    return Response.json(
      { error: "Błąd generowania jadłospisu.", details: message },
      { status: 500 },
    );
  }
}
