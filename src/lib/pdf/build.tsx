import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, between, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  allergens,
  dishIngredients,
  globalDishAllergens,
  globalDishIngredients,
  ingredientAllergens,
  menuItems,
  preparedProducts,
  profiles,
  rawIngredients,
} from "@/db/schema";
import { MenuPdf, type MenuSlot, type Variant } from "@/lib/pdf/menu-pdf";
import {
  ALL_SLOTS,
  type Dish,
  type DishIngredient,
  type MealType,
  type PreparedProduct,
  type RawIngredient,
  type SlotType,
} from "@/lib/sanepid-brain";

export async function buildMenuPdf(params: {
  userId: string;
  from: string;
  to: string;
  variant: Variant;
}): Promise<{ buffer: Buffer; filename: string }> {
  const { userId, from, to, variant } = params;

  const items = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.userId, userId), between(menuItems.date, from, to)));

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

  const ingredientsByDishId = new Map<string, DishIngredient[]>();
  if (sourceDishIds.length) {
    const globalIngs = await db
      .select({
        dishId: globalDishIngredients.globalDishId,
        name: globalDishIngredients.ingredientName,
        quantity: globalDishIngredients.quantity,
        unit: globalDishIngredients.unit,
      })
      .from(globalDishIngredients)
      .where(inArray(globalDishIngredients.globalDishId, sourceDishIds))
      .orderBy(asc(globalDishIngredients.positionOrder));
    for (const r of globalIngs) {
      const arr = ingredientsByDishId.get(r.dishId) ?? [];
      arr.push({ name: r.name, quantity: r.quantity, unit: r.unit });
      ingredientsByDishId.set(r.dishId, arr);
    }
    const userIngs = await db
      .select({
        dishId: dishIngredients.dishId,
        name: dishIngredients.ingredientName,
        quantity: dishIngredients.quantity,
        unit: dishIngredients.unit,
      })
      .from(dishIngredients)
      .where(inArray(dishIngredients.dishId, sourceDishIds))
      .orderBy(asc(dishIngredients.positionOrder));
    for (const r of userIngs) {
      const arr = ingredientsByDishId.get(r.dishId) ?? [];
      arr.push({ name: r.name, quantity: r.quantity, unit: r.unit });
      ingredientsByDishId.set(r.dishId, arr);
    }
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
      ingredients: m.sourceDishId ? (ingredientsByDishId.get(m.sourceDishId) ?? []) : [],
      preparedProducts: pps,
    };
    const dateKey = typeof m.date === "string" ? m.date.slice(0, 10) : String(m.date).slice(0, 10);
    return { date: dateKey, slotType: m.slotType as SlotType, mealType: m.mealType as MealType, dish };
  });

  const profileRow = await db
    .select({ logoUrl: profiles.logoUrl, servedSlots: profiles.servedSlots })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const logoUrl = profileRow[0]?.logoUrl ?? null;
  const servedSlotsRaw = (profileRow[0]?.servedSlots as SlotType[] | null) ?? ALL_SLOTS;
  const servedSlots = ALL_SLOTS.filter((s) => servedSlotsRaw.includes(s));

  const filteredSlots = slots.filter((s) => servedSlots.includes(s.slotType));

  const buffer = await renderToBuffer(
    <MenuPdf
      items={filteredSlots}
      variant={variant}
      from={from}
      to={to}
      logoUrl={logoUrl}
      servedSlots={servedSlots}
    />,
  );

  return {
    buffer,
    filename: `jadlospis_${variant}_${from}_${to}.pdf`,
  };
}
