import { db } from "@/db";
import {
  allergens,
  globalDishAllergens,
  ingredientAllergens,
  menuItems,
  preparedProducts,
  rawIngredients,
} from "@/db/schema";
import { and, between, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { UnauthorizedError, getCurrentUserId, unauthorizedResponse } from "@/lib/auth";
import type {
  Dish,
  MealType,
  PreparedProduct,
  ProcessingMethod,
  RawIngredient,
} from "@/lib/sanepid-brain";

const VALID_MEAL_TYPES: MealType[] = [
  "sniadanie_kolacja",
  "drugie_sniadanie_deser",
  "obiad_zupa",
  "obiad_danie_glowne",
];

function isMealType(v: string | null | undefined): v is MealType {
  return typeof v === "string" && (VALID_MEAL_TYPES as string[]).includes(v);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function buildAllergenMaps(): Promise<{
  numberToId: Map<number, string>;
  idToNumber: Map<string, number>;
}> {
  const rows = await db.select({ id: allergens.id, number: allergens.number }).from(allergens);
  const numberToId = new Map<number, string>();
  const idToNumber = new Map<string, number>();
  for (const r of rows) {
    numberToId.set(r.number, r.id);
    idToNumber.set(r.id, r.number);
  }
  return { numberToId, idToNumber };
}

type MenuItemPayload = {
  date: string;
  mealType: MealType;
  dish: Dish;
};

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      return Response.json({ error: "from/to muszą być w formacie YYYY-MM-DD" }, { status: 400 });
    }

    const items = await db
      .select()
      .from(menuItems)
      .where(
        and(
          eq(menuItems.userId, userId),
          between(menuItems.date, from, to),
        ),
      );

    if (items.length === 0) return Response.json({ items: [] });

    const menuItemIds = items.map((i) => i.id);
    const products = await db
      .select()
      .from(preparedProducts)
      .where(inArray(preparedProducts.menuItemId, menuItemIds));

    const productIds = products.map((p) => p.id);
    const ings = productIds.length
      ? await db.select().from(rawIngredients).where(inArray(rawIngredients.preparedProductId, productIds))
      : [];

    const ingIds = ings.map((i) => i.id);
    const ingAllergenRows = ingIds.length
      ? await db.select().from(ingredientAllergens).where(inArray(ingredientAllergens.ingredientId, ingIds))
      : [];

    const { idToNumber } = await buildAllergenMaps();

    // Assemble tree
    const ingAllergensByIngId = new Map<string, number[]>();
    for (const row of ingAllergenRows) {
      const n = idToNumber.get(row.allergenId);
      if (n === undefined) continue;
      const arr = ingAllergensByIngId.get(row.ingredientId) ?? [];
      arr.push(n);
      ingAllergensByIngId.set(row.ingredientId, arr);
    }

    const ingsByProductId = new Map<string, RawIngredient[]>();
    for (const i of ings) {
      const arr = ingsByProductId.get(i.preparedProductId) ?? [];
      arr.push({
        id: i.id,
        name: i.ingredientName,
        rawWeightG: i.rawWeightG,
        unit: i.unit,
        allergens: (ingAllergensByIngId.get(i.id) ?? []).sort((a, b) => a - b),
      });
      ingsByProductId.set(i.preparedProductId, arr);
    }

    const productsByMenuItemId = new Map<string, PreparedProduct[]>();
    for (const p of products) {
      const arr = productsByMenuItemId.get(p.menuItemId) ?? [];
      arr.push({
        id: p.id,
        name: p.name,
        weightServedG: p.weightServedG,
        processingMethod: p.processingMethod,
        hasVegFruit: p.hasVegFruit ?? false,
        rawIngredients: ingsByProductId.get(p.id) ?? [],
      });
      productsByMenuItemId.set(p.menuItemId, arr);
    }

    // Fallback alergenów: gdy menu_item zapisany z AI/pickera nie ma prepared_products,
    // pobieramy alergeny z global_dish_allergens po menuItems.sourceDishId.
    const sourceDishIds = [...new Set(items.map((m) => m.sourceDishId).filter((x): x is string => !!x))];
    const globalAllergenRows = sourceDishIds.length
      ? await db
          .select()
          .from(globalDishAllergens)
          .where(inArray(globalDishAllergens.globalDishId, sourceDishIds))
      : [];
    const globalAllergensByDishId = new Map<string, number[]>();
    for (const row of globalAllergenRows) {
      const n = idToNumber.get(row.allergenId);
      if (n === undefined) continue;
      const arr = globalAllergensByDishId.get(row.globalDishId) ?? [];
      if (!arr.includes(n)) arr.push(n);
      globalAllergensByDishId.set(row.globalDishId, arr);
    }

    const output = items.map((m) => {
      const pps = productsByMenuItemId.get(m.id) ?? [];
      const allergenSet = new Set<number>();
      let vegFruit = false;
      for (const p of pps) {
        if (p.hasVegFruit) vegFruit = true;
        for (const ing of p.rawIngredients) for (const a of ing.allergens) allergenSet.add(a);
      }
      if (allergenSet.size === 0 && m.sourceDishId) {
        for (const n of globalAllergensByDishId.get(m.sourceDishId) ?? []) allergenSet.add(n);
      }
      const dish: Dish = {
        id: m.sourceDishId ?? m.id,
        name: m.displayName,
        type: m.mealType,
        diet: m.dietType,
        vegFruit,
        allergens: [...allergenSet].sort((a, b) => a - b),
        preparedProducts: pps,
      };
      // m.date to timestamp → normalizuj do YYYY-MM-DD żeby klient mógł filtrować po stringu.
      const dateKey = typeof m.date === "string" ? m.date.slice(0, 10) : String(m.date).slice(0, 10);
      return { date: dateKey, mealType: m.mealType, dish };
    });

    return Response.json({ items: output });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    const message = err instanceof Error ? err.message : String(err);
    console.error("GET /api/menu-items:", err);
    return Response.json({ error: "Błąd pobierania jadłospisu.", details: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = (await req.json()) as MenuItemPayload;
    const { date, mealType, dish } = body;

    if (!DATE_RE.test(date ?? "")) {
      return Response.json({ error: "Nieprawidłowy format daty." }, { status: 400 });
    }
    if (!isMealType(mealType)) {
      return Response.json({ error: "Nieprawidłowy typ posiłku." }, { status: 400 });
    }
    if (!dish?.name) {
      return Response.json({ error: "Danie musi mieć nazwę." }, { status: 400 });
    }

    const { numberToId } = await buildAllergenMaps();

    const inserted = await db.transaction(async (tx) => {
      // Remove existing row for this slot (cascade drops pps/ings/allergens)
      await tx
        .delete(menuItems)
        .where(
          and(
            eq(menuItems.userId, userId),
            eq(menuItems.date, date),
            eq(menuItems.mealType, mealType),
          ),
        );

      const [menuItemRow] = await tx
        .insert(menuItems)
        .values({
          userId,
          date,
          mealType,
          dietType: dish.diet ?? null,
          displayName: dish.name,
          sourceDishId: typeof dish.id === "string" ? dish.id : null,
        })
        .returning();

      const pps = dish.preparedProducts ?? [];

      // Fallback: dishes from picker/AI/editor don't carry preparedProducts,
      // but still have vegFruit flag + allergen numbers. Persist them via one
      // synthetic PP + one synthetic raw_ingredient so GET reconstructs them.
      if (pps.length === 0 && (dish.vegFruit || (dish.allergens && dish.allergens.length > 0))) {
        const [ppRow] = await tx
          .insert(preparedProducts)
          .values({
            menuItemId: menuItemRow.id,
            name: dish.name,
            weightServedG: 0,
            processingMethod: "surowe" as ProcessingMethod,
            hasVegFruit: dish.vegFruit ?? false,
          })
          .returning();

        const allergenNums = dish.allergens ?? [];
        if (allergenNums.length > 0) {
          const [ingRow] = await tx
            .insert(rawIngredients)
            .values({
              preparedProductId: ppRow.id,
              ingredientName: "—",
              rawWeightG: 0,
              unit: "g",
            })
            .returning();

          const allergenRows = allergenNums
            .map((n) => numberToId.get(n))
            .filter((x): x is string => !!x)
            .map((allergenId) => ({ ingredientId: ingRow.id, allergenId }));

          if (allergenRows.length) {
            await tx.insert(ingredientAllergens).values(allergenRows);
          }
        }
      }

      for (const p of pps) {
        const [ppRow] = await tx
          .insert(preparedProducts)
          .values({
            menuItemId: menuItemRow.id,
            name: p.name,
            weightServedG: p.weightServedG,
            processingMethod: p.processingMethod as ProcessingMethod,
            hasVegFruit: p.hasVegFruit,
          })
          .returning();

        for (const ing of p.rawIngredients) {
          const [ingRow] = await tx
            .insert(rawIngredients)
            .values({
              preparedProductId: ppRow.id,
              ingredientName: ing.name,
              rawWeightG: ing.rawWeightG,
              unit: ing.unit || "g",
            })
            .returning();

          const allergenRows = ing.allergens
            .map((n) => numberToId.get(n))
            .filter((x): x is string => !!x)
            .map((allergenId) => ({ ingredientId: ingRow.id, allergenId }));

          if (allergenRows.length) {
            await tx.insert(ingredientAllergens).values(allergenRows);
          }
        }
      }

      return menuItemRow;
    });

    return Response.json({ ok: true, menuItemId: inserted.id });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/menu-items:", err);
    return Response.json({ error: "Błąd zapisu posiłku.", details: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const date = req.nextUrl.searchParams.get("date");
    const mealType = req.nextUrl.searchParams.get("mealType");
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");

    // Clear-week mode
    if (from && to) {
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
        return Response.json({ error: "Nieprawidłowy format dat." }, { status: 400 });
      }
      await db
        .delete(menuItems)
        .where(
          and(
            eq(menuItems.userId, userId),
            between(menuItems.date, from, to),
          ),
        );
      return Response.json({ ok: true });
    }

    // Single-slot mode
    if (!date || !DATE_RE.test(date)) {
      return Response.json({ error: "Wymagana data YYYY-MM-DD." }, { status: 400 });
    }
    if (!isMealType(mealType)) {
      return Response.json({ error: "Nieprawidłowy typ posiłku." }, { status: 400 });
    }

    await db
      .delete(menuItems)
      .where(
        and(
          eq(menuItems.userId, userId),
          eq(menuItems.date, date),
          eq(menuItems.mealType, mealType),
        ),
      );

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    const message = err instanceof Error ? err.message : String(err);
    console.error("DELETE /api/menu-items:", err);
    return Response.json({ error: "Błąd usuwania posiłku.", details: message }, { status: 500 });
  }
}
