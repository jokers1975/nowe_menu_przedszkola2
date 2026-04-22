import { renderToBuffer } from "@react-pdf/renderer";
import { and, between, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  allergens,
  globalDishAllergens,
  ingredientAllergens,
  menuItems,
  preparedProducts,
  profiles,
  rawIngredients,
} from "@/db/schema";
import { UnauthorizedError, getCurrentUserId, unauthorizedResponse } from "@/lib/auth";
import { MenuPdf, type MenuSlot, type Variant } from "@/lib/pdf/menu-pdf";
import type {
  Dish,
  MealType,
  PreparedProduct,
  RawIngredient,
} from "@/lib/sanepid-brain";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const variant = (req.nextUrl.searchParams.get("variant") ?? "sanepid") as Variant;

    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      return Response.json({ error: "from/to wymagane (YYYY-MM-DD)." }, { status: 400 });
    }
    if (variant !== "sanepid" && variant !== "parents") {
      return Response.json({ error: "variant musi być sanepid|parents." }, { status: 400 });
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

    const menuItemIds = items.map((i) => i.id);
    const products = menuItemIds.length
      ? await db.select().from(preparedProducts).where(inArray(preparedProducts.menuItemId, menuItemIds))
      : [];

    const productIds = products.map((p) => p.id);
    const ings = productIds.length
      ? await db.select().from(rawIngredients).where(inArray(rawIngredients.preparedProductId, productIds))
      : [];

    const ingIds = ings.map((i) => i.id);
    const ingAllergenRows = ingIds.length
      ? await db.select().from(ingredientAllergens).where(inArray(ingredientAllergens.ingredientId, ingIds))
      : [];

    const allergenRows = await db.select({ id: allergens.id, number: allergens.number }).from(allergens);
    const idToNumber = new Map<string, number>();
    for (const r of allergenRows) idToNumber.set(r.id, r.number);

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

    // Fallback alergenów z globalDishAllergens (dla dań AI bez prepared_products)
    const sourceDishIds = [...new Set(items.map((m) => m.sourceDishId).filter((x): x is string => !!x))];
    const globalAllergenRows = sourceDishIds.length
      ? await db.select().from(globalDishAllergens).where(inArray(globalDishAllergens.globalDishId, sourceDishIds))
      : [];
    const globalAllergensByDishId = new Map<string, number[]>();
    for (const row of globalAllergenRows) {
      const n = idToNumber.get(row.allergenId);
      if (n === undefined) continue;
      const arr = globalAllergensByDishId.get(row.globalDishId) ?? [];
      if (!arr.includes(n)) arr.push(n);
      globalAllergensByDishId.set(row.globalDishId, arr);
    }

    const slots: MenuSlot[] = items.map((m) => {
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
        type: m.mealType as MealType,
        diet: m.dietType,
        vegFruit,
        allergens: [...allergenSet].sort((a, b) => a - b),
        preparedProducts: pps,
      };
      const dateKey = typeof m.date === "string" ? m.date.slice(0, 10) : String(m.date).slice(0, 10);
      return { date: dateKey, mealType: m.mealType as MealType, dish };
    });

    // Pobierz logo z profilu użytkownika (jeśli ustawione)
    const profileRow = await db.select({ logoUrl: profiles.logoUrl }).from(profiles).where(eq(profiles.id, userId)).limit(1);
    const logoUrl = profileRow[0]?.logoUrl ?? null;

    const buffer = await renderToBuffer(
      <MenuPdf items={slots} variant={variant} from={from} to={to} logoUrl={logoUrl} />,
    );

    const filename = `jadlospis_${variant}_${from}_${to}.pdf`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    const message = err instanceof Error ? err.message : String(err);
    console.error("PDF export error:", err);
    return Response.json(
      { error: "Błąd generowania PDF.", details: message },
      { status: 500 },
    );
  }
}
